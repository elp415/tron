// TRON Light Cycles — classic DOS-style two-player game

const CELL = 4; // pixel size of each trail cell
const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const COLS = canvas.width / CELL;
const ROWS = canvas.height / CELL;

const messageEl = document.getElementById("message")!;
const score1El = document.getElementById("score1")!;
const score2El = document.getElementById("score2")!;

// Direction vectors: 0=up, 1=right, 2=down, 3=left
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

const GRID_EMPTY = 0;
const GRID_P1 = 1;
const GRID_P2 = 2;
const GRID_PELLET = 3;
const GRID_BOT = 4;

interface Player {
  x: number;
  y: number;
  dir: number;
  color: string;
  trailColor: string;
  alive: boolean;
  score: number;
  invincibleUntil: number;
}

interface Pellet {
  x: number;
  y: number;
}

interface Bot {
  x: number;
  y: number;
  dir: number;
  color: string;
  trailColor: string;
  alive: boolean;
  diedAtTick: number; // tick when it died, 0 = never died yet
}

// The grid: 0=empty, 1=p1 trail, 2=p2 trail, 3=pellet, 4=bot trail
let grid: Uint8Array;
let p1: Player;
let p2: Player;
let bot: Bot | null = null;
let pellets: Pellet[] = [];
let running = false;
let gameOver = false;
let tickInterval: number | null = null;
let tickCount = 0;
const TICK_MS = 25; // ~40 fps, fast and intense
const INVINCIBLE_TICKS = Math.round(2000 / TICK_MS); // 2 seconds
const PELLET_SPAWN_INTERVAL = Math.round(4000 / TICK_MS); // new pellet every 4s
const MAX_PELLETS = 5;
const BOT_RESPAWN_TICKS = Math.round(10000 / TICK_MS); // 10 seconds after death
const BOT_INITIAL_DELAY = Math.round(5000 / TICK_MS); // first spawn after 5s

function initGame() {
  grid = new Uint8Array(COLS * ROWS);

  p1 = {
    x: Math.floor(COLS * 0.25),
    y: Math.floor(ROWS / 2),
    dir: 1, // facing right
    color: "#0af",
    trailColor: "#068",
    alive: true,
    score: p1 ? p1.score : 0,
    invincibleUntil: 0,
  };

  p2 = {
    x: Math.floor(COLS * 0.75),
    y: Math.floor(ROWS / 2),
    dir: 3, // facing left
    color: "#f80",
    trailColor: "#840",
    alive: true,
    score: p2 ? p2.score : 0,
    invincibleUntil: 0,
  };

  // Place starting positions on the grid
  grid[p1.y * COLS + p1.x] = GRID_P1;
  grid[p2.y * COLS + p2.x] = GRID_P2;

  bot = null;
  pellets = [];
  tickCount = 0;
  gameOver = false;
  running = true;

  drawGrid();
}

// --- Pellets ---

const PELLET_SIZE = 4; // 4x4 grid cells

function spawnPellet() {
  if (pellets.length >= MAX_PELLETS) return;
  let x: number, y: number;
  let attempts = 0;
  do {
    x = Math.floor(Math.random() * (COLS - PELLET_SIZE - 4)) + 2;
    y = Math.floor(Math.random() * (ROWS - PELLET_SIZE - 4)) + 2;
    attempts++;
  } while (!isPelletAreaClear(x, y) && attempts < 200);

  if (attempts >= 200) return;

  for (let dy = 0; dy < PELLET_SIZE; dy++) {
    for (let dx = 0; dx < PELLET_SIZE; dx++) {
      grid[(y + dy) * COLS + (x + dx)] = GRID_PELLET;
    }
  }
  pellets.push({ x, y });
}

function isPelletAreaClear(x: number, y: number): boolean {
  for (let dy = 0; dy < PELLET_SIZE; dy++) {
    for (let dx = 0; dx < PELLET_SIZE; dx++) {
      if (grid[(y + dy) * COLS + (x + dx)] !== GRID_EMPTY) return false;
    }
  }
  return true;
}

function removePellet(index: number) {
  const p = pellets[index];
  for (let dy = 0; dy < PELLET_SIZE; dy++) {
    for (let dx = 0; dx < PELLET_SIZE; dx++) {
      grid[(p.y + dy) * COLS + (p.x + dx)] = GRID_EMPTY;
    }
  }
  pellets.splice(index, 1);
}

function isInvincible(player: Player): boolean {
  return player.invincibleUntil > tickCount;
}

function checkPelletPickup(player: Player, nx: number, ny: number) {
  for (let i = pellets.length - 1; i >= 0; i--) {
    const p = pellets[i];
    if (nx >= p.x && nx < p.x + PELLET_SIZE && ny >= p.y && ny < p.y + PELLET_SIZE) {
      removePellet(i);
      player.invincibleUntil = tickCount + INVINCIBLE_TICKS;
      return;
    }
  }
}

// --- Computer opponent (bot) ---

function spawnBot() {
  let x: number, y: number;
  let attempts = 0;
  do {
    x = Math.floor(Math.random() * (COLS - 20)) + 10;
    y = Math.floor(Math.random() * (ROWS - 20)) + 10;
    attempts++;
  } while (grid[y * COLS + x] !== GRID_EMPTY && attempts < 200);

  if (attempts >= 200) return;

  const dir = Math.floor(Math.random() * 4);
  bot = {
    x, y, dir,
    color: "#f0f",
    trailColor: "#506",
    alive: true,
    diedAtTick: 0,
  };
  grid[y * COLS + x] = GRID_BOT;
}

function killBot() {
  if (!bot) return;
  bot.alive = false;
  bot.diedAtTick = tickCount;
  // Trail stays on the field as an obstacle
}

function clearBotTrail() {
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === GRID_BOT) grid[i] = GRID_EMPTY;
  }
}

function botAI() {
  if (!bot || !bot.alive) return;

  // Look further ahead to make smarter decisions
  const lookAhead = 5;

  function countFreeAhead(d: number): number {
    let cx = bot!.x, cy = bot!.y;
    for (let i = 0; i < lookAhead; i++) {
      cx += DX[d];
      cy += DY[d];
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return i;
      if (grid[cy * COLS + cx] !== GRID_EMPTY && grid[cy * COLS + cx] !== GRID_PELLET) return i;
    }
    return lookAhead;
  }

  const ahead = countFreeAhead(bot.dir);
  const wantTurn = ahead < 3 || Math.random() < 0.05;

  if (wantTurn) {
    const reverse = (bot.dir + 2) % 4;
    const options: { dir: number; score: number }[] = [];
    for (let d = 0; d < 4; d++) {
      if (d === reverse) continue;
      const free = countFreeAhead(d);
      if (free > 0) options.push({ dir: d, score: free });
    }
    // Sort by most free space, with a little randomness
    options.sort((a, b) => b.score - a.score + (Math.random() - 0.5));
    if (options.length > 0) {
      bot.dir = options[0].dir;
    } else {
      // Try reverse as last resort
      if (countFreeAhead(reverse) > 0) bot.dir = reverse;
    }
  }
}

function tickBot() {
  // Handle respawning
  if (!bot) {
    if (tickCount >= BOT_INITIAL_DELAY) {
      spawnBot();
    }
    return;
  }

  if (!bot.alive) {
    // Wait 10 seconds after death, then clear trail and respawn
    if (tickCount - bot.diedAtTick >= BOT_RESPAWN_TICKS) {
      clearBotTrail();
      bot = null;
      spawnBot();
    }
    return;
  }

  // AI and movement
  botAI();
  const bnx = bot.x + DX[bot.dir];
  const bny = bot.y + DY[bot.dir];

  if (bnx < 0 || bnx >= COLS || bny < 0 || bny >= ROWS ||
      (grid[bny * COLS + bnx] !== GRID_EMPTY && grid[bny * COLS + bnx] !== GRID_PELLET)) {
    killBot();
  } else {
    bot.x = bnx;
    bot.y = bny;
    grid[bot.y * COLS + bot.x] = GRID_BOT;
  }
}

// --- Drawing ---

function drawGrid() {
  // Black background
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw subtle grid lines for that retro DOS feel
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 0.5;
  for (let x = 0; x < COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(canvas.width, y * CELL);
    ctx.stroke();
  }

  // Draw all trail cells
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v = grid[y * COLS + x];
      if (v === GRID_P1) {
        ctx.fillStyle = p1.trailColor;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      } else if (v === GRID_P2) {
        ctx.fillStyle = p2.trailColor;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      } else if (v === GRID_BOT) {
        ctx.fillStyle = "#506";
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    }
  }

  // Draw pellets — pulsing glow effect, 4x4 cells each
  const pulse = Math.sin(tickCount * 0.15) * 0.4 + 0.6;
  const pelletPx = PELLET_SIZE * CELL;
  for (const pellet of pellets) {
    const px = pellet.x * CELL;
    const py = pellet.y * CELL;
    // Outer glow
    ctx.fillStyle = `rgba(0, 255, 0, ${pulse * 0.3})`;
    ctx.fillRect(px - CELL, py - CELL, pelletPx + CELL * 2, pelletPx + CELL * 2);
    // Core
    ctx.fillStyle = `rgba(0, 255, 0, ${pulse})`;
    ctx.fillRect(px, py, pelletPx, pelletPx);
  }

  // Draw player heads — flash white when invincible
  if (p1.alive) {
    if (isInvincible(p1) && Math.floor(tickCount / 3) % 2 === 0) {
      ctx.fillStyle = "#fff";
    } else {
      ctx.fillStyle = p1.color;
    }
    ctx.fillRect(p1.x * CELL, p1.y * CELL, CELL, CELL);
  }
  if (p2.alive) {
    if (isInvincible(p2) && Math.floor(tickCount / 3) % 2 === 0) {
      ctx.fillStyle = "#fff";
    } else {
      ctx.fillStyle = p2.color;
    }
    ctx.fillRect(p2.x * CELL, p2.y * CELL, CELL, CELL);
  }
  // Draw bot head
  if (bot && bot.alive) {
    ctx.fillStyle = bot.color;
    ctx.fillRect(bot.x * CELL, bot.y * CELL, CELL, CELL);
  }
}

// --- Main game tick ---

function tick() {
  if (!running || gameOver) return;

  tickCount++;

  // Spawn pellets periodically
  if (tickCount % PELLET_SPAWN_INTERVAL === 0) {
    spawnPellet();
  }

  // Bot lifecycle
  tickBot();

  // Move players
  let p1nx = p1.x + DX[p1.dir];
  let p1ny = p1.y + DY[p1.dir];
  let p2nx = p2.x + DX[p2.dir];
  let p2ny = p2.y + DY[p2.dir];

  // Wrap around walls when invincible
  if (isInvincible(p1) && (p1nx < 0 || p1nx >= COLS || p1ny < 0 || p1ny >= ROWS)) {
    [p1nx, p1ny] = wrapCoord(p1nx, p1ny);
  }
  if (isInvincible(p2) && (p2nx < 0 || p2nx >= COLS || p2ny < 0 || p2ny >= ROWS)) {
    [p2nx, p2ny] = wrapCoord(p2nx, p2ny);
  }

  // Check pellet pickups before collision (pellets are passable)
  checkPelletPickup(p1, p1nx, p1ny);
  checkPelletPickup(p2, p2nx, p2ny);

  // Check collisions — invincible players pass through trails
  const p1Hit = isCollision(p1nx, p1ny, isInvincible(p1));
  const p2Hit = isCollision(p2nx, p2ny, isInvincible(p2));

  // Head-on collision (both moving into same cell)
  const headOn = p1nx === p2nx && p1ny === p2ny;

  if (headOn) {
    if (isInvincible(p1) && isInvincible(p2)) {
      p1.alive = false;
      p2.alive = false;
      endRound("DRAW!");
      return;
    } else if (isInvincible(p1)) {
      p2.alive = false;
      p1.score++;
      score1El.textContent = String(p1.score);
      endRound("PLAYER 1 WINS!");
      return;
    } else if (isInvincible(p2)) {
      p1.alive = false;
      p2.score++;
      score2El.textContent = String(p2.score);
      endRound("PLAYER 2 WINS!");
      return;
    } else {
      p1.alive = false;
      p2.alive = false;
      endRound("DRAW!");
      return;
    }
  }

  if (p1Hit && p2Hit) {
    p1.alive = false;
    p2.alive = false;
    endRound("DRAW!");
    return;
  }

  if (p1Hit) {
    p1.alive = false;
    p2.score++;
    score2El.textContent = String(p2.score);
    endRound("PLAYER 2 WINS!");
    return;
  }

  if (p2Hit) {
    p2.alive = false;
    p1.score++;
    score1El.textContent = String(p1.score);
    endRound("PLAYER 1 WINS!");
    return;
  }

  // Advance
  p1.x = p1nx;
  p1.y = p1ny;
  grid[p1.y * COLS + p1.x] = GRID_P1;

  p2.x = p2nx;
  p2.y = p2ny;
  grid[p2.y * COLS + p2.x] = GRID_P2;

  drawGrid();
}

function wrapCoord(x: number, y: number): [number, number] {
  return [
    ((x % COLS) + COLS) % COLS,
    ((y % ROWS) + ROWS) % ROWS,
  ];
}

function isCollision(x: number, y: number, invincible: boolean): boolean {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) {
    return !invincible;
  }
  const cell = grid[y * COLS + x];
  if (cell === GRID_EMPTY || cell === GRID_PELLET) return false;
  if (invincible) return false;
  return true;
}

function endRound(msg: string) {
  gameOver = true;
  running = false;
  if (tickInterval !== null) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  drawGrid();

  // Flash the crash site
  if (!p1.alive) {
    ctx.fillStyle = "#f00";
    ctx.fillRect(p1.x * CELL - 2, p1.y * CELL - 2, CELL + 4, CELL + 4);
  }
  if (!p2.alive) {
    ctx.fillStyle = "#f00";
    ctx.fillRect(p2.x * CELL - 2, p2.y * CELL - 2, CELL + 4, CELL + 4);
  }

}

// --- Input handling ---
let p1NextDir: number | null = null;
let p2NextDir: number | null = null;

function opposite(d: number): number {
  return (d + 2) % 4;
}

document.addEventListener("keydown", (e) => {
  // WASD — Player 1
  switch (e.key.toLowerCase()) {
    case "w": if (p1.dir !== 2) p1NextDir = 0; break;
    case "d": if (p1.dir !== 3) p1NextDir = 1; break;
    case "s": if (p1.dir !== 0) p1NextDir = 2; break;
    case "a": if (p1.dir !== 1) p1NextDir = 3; break;
  }

  // Arrow keys — Player 2
  switch (e.key) {
    case "ArrowUp":    if (p2.dir !== 2) p2NextDir = 0; e.preventDefault(); break;
    case "ArrowRight": if (p2.dir !== 3) p2NextDir = 1; e.preventDefault(); break;
    case "ArrowDown":  if (p2.dir !== 0) p2NextDir = 2; e.preventDefault(); break;
    case "ArrowLeft":  if (p2.dir !== 1) p2NextDir = 3; e.preventDefault(); break;
  }

  // Space to start/restart
  if (e.key === " ") {
    e.preventDefault();
    if (!running) {
      startGame();
    }
  }
});

function startGame() {
  initGame();
  p1NextDir = null;
  p2NextDir = null;

  tickInterval = window.setInterval(() => {
    if (p1NextDir !== null && p1NextDir !== opposite(p1.dir)) {
      p1.dir = p1NextDir;
      p1NextDir = null;
    }
    if (p2NextDir !== null && p2NextDir !== opposite(p2.dir)) {
      p2.dir = p2NextDir;
      p2NextDir = null;
    }
    tick();
  }, TICK_MS);
}

// Initial draw — show empty arena
initGame();
running = false;
drawGrid();
messageEl.textContent = "";
