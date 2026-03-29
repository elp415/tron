// TRON Light Cycles — two-player game, first to 10 wins

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
const GRID_DIMMER = 4;

const WINS_NEEDED = 10;

interface Player {
  x: number;
  y: number;
  dir: number;
  color: string;
  trailColor: string;
  alive: boolean;
  score: number;
  invincibleUntil: number;
  dimUntil: number;
}

interface Pellet {
  x: number;
  y: number;
  type: "invincible" | "dimmer";
}

let grid: Uint8Array;
let p1: Player;
let p2: Player;
let pellets: Pellet[] = [];
let running = false;
let gameOver = false;
let matchOver = false;
let tickInterval: number | null = null;
let tickCount = 0;
const TICK_MS = 18;
const INVINCIBLE_TICKS = Math.round(2000 / TICK_MS);
const PELLET_SPAWN_INTERVAL = Math.round(4000 / TICK_MS);
const MAX_PELLETS = 5;
const DIMMER_TICKS = Math.round(4000 / TICK_MS);
const DIMMER_SPAWN_INTERVAL = Math.round(6000 / TICK_MS);
const MAX_DIMMER_PELLETS = 3;

function initGame() {
  grid = new Uint8Array(COLS * ROWS);

  p1 = {
    x: Math.floor(COLS * 0.25),
    y: Math.floor(ROWS / 2),
    dir: 1,
    color: "#0af",
    trailColor: "#0af",
    alive: true,
    score: p1 ? p1.score : 0,
    invincibleUntil: 0,
    dimUntil: 0,
  };

  p2 = {
    x: Math.floor(COLS * 0.75),
    y: Math.floor(ROWS / 2),
    dir: 3,
    color: "#f80",
    trailColor: "#f80",
    alive: true,
    score: p2 ? p2.score : 0,
    invincibleUntil: 0,
    dimUntil: 0,
  };

  grid[p1.y * COLS + p1.x] = GRID_P1;
  grid[p2.y * COLS + p2.x] = GRID_P2;

  pellets = [];
  tickCount = 0;
  gameOver = false;
  running = true;

  drawGrid();
}

// --- Pellets ---

const PELLET_SIZE = 4;

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
  pellets.push({ x, y, type: "invincible" });
}

function spawnDimmerPellet() {
  const dimmerCount = pellets.filter(p => p.type === "dimmer").length;
  if (dimmerCount >= MAX_DIMMER_PELLETS) return;
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
      grid[(y + dy) * COLS + (x + dx)] = GRID_DIMMER;
    }
  }
  pellets.push({ x, y, type: "dimmer" });
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
      const cell = grid[(p.y + dy) * COLS + (p.x + dx)];
      if (cell === GRID_PELLET || cell === GRID_DIMMER) {
        grid[(p.y + dy) * COLS + (p.x + dx)] = GRID_EMPTY;
      }
    }
  }
  pellets.splice(index, 1);
}

function isInvincible(player: Player): boolean {
  return player.invincibleUntil > tickCount;
}

function isDimmed(player: Player): boolean {
  return player.dimUntil > tickCount;
}

function dimAlpha(player: Player): number {
  if (!isDimmed(player)) return 1;
  const remaining = player.dimUntil - tickCount;
  const total = DIMMER_TICKS;
  return 0.15 + 0.85 * (1 - remaining / total);
}

function checkPelletPickup(player: Player, nx: number, ny: number) {
  for (let i = pellets.length - 1; i >= 0; i--) {
    const p = pellets[i];
    if (nx >= p.x && nx < p.x + PELLET_SIZE && ny >= p.y && ny < p.y + PELLET_SIZE) {
      if (p.type === "dimmer") {
        player.dimUntil = tickCount + DIMMER_TICKS;
      } else {
        player.invincibleUntil = tickCount + INVINCIBLE_TICKS;
      }
      removePellet(i);
      return;
    }
  }
}

// --- Drawing ---

function drawGrid() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v = grid[y * COLS + x];
      if (v === GRID_P1) {
        ctx.globalAlpha = dimAlpha(p1);
        ctx.fillStyle = p1.trailColor;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        ctx.globalAlpha = 1;
      } else if (v === GRID_P2) {
        ctx.globalAlpha = dimAlpha(p2);
        ctx.fillStyle = p2.trailColor;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        ctx.globalAlpha = 1;
      }
    }
  }

  const pulse = Math.sin(tickCount * 0.15) * 0.4 + 0.6;
  const pelletPx = PELLET_SIZE * CELL;
  for (const pellet of pellets) {
    const px = pellet.x * CELL;
    const py = pellet.y * CELL;
    if (pellet.type === "dimmer") {
      ctx.fillStyle = `rgba(128, 0, 255, ${pulse * 0.3})`;
      ctx.fillRect(px - CELL, py - CELL, pelletPx + CELL * 2, pelletPx + CELL * 2);
      ctx.fillStyle = `rgba(128, 0, 255, ${pulse})`;
      ctx.fillRect(px, py, pelletPx, pelletPx);
    } else {
      ctx.fillStyle = `rgba(0, 255, 0, ${pulse * 0.3})`;
      ctx.fillRect(px - CELL, py - CELL, pelletPx + CELL * 2, pelletPx + CELL * 2);
      ctx.fillStyle = `rgba(0, 255, 0, ${pulse})`;
      ctx.fillRect(px, py, pelletPx, pelletPx);
    }
  }

  for (const p of [p1, p2]) {
    if (p.alive) {
      ctx.globalAlpha = dimAlpha(p);
      if (isInvincible(p) && Math.floor(tickCount / 3) % 2 === 0) {
        ctx.fillStyle = "#fff";
      } else {
        ctx.fillStyle = p.color;
      }
      ctx.fillRect(p.x * CELL, p.y * CELL, CELL, CELL);
      ctx.globalAlpha = 1;
    }
  }
}

// --- Graffiti victory screen ---

function drawGraffitiWinScreen(winner: Player, playerNum: number) {
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, W, H);

  // Spray paint splatters
  const colors = ["#f00", "#0f0", "#00f", "#ff0", "#f0f", "#0ff", "#f80", "#80f"];
  for (let i = 0; i < 120; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const r = Math.random() * 40 + 5;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const c = colors[Math.floor(Math.random() * colors.length)];
    grad.addColorStop(0, c);
    grad.addColorStop(0.4, c + "88");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  // Spray dots
  for (let i = 0; i < 500; i++) {
    const cx = Math.random() * W;
    const cy = Math.random() * H;
    const r = Math.random() * 3 + 1;
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)] + "99";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Drip lines
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.5;
    const len = Math.random() * 80 + 30;
    const c = colors[Math.floor(Math.random() * colors.length)];
    ctx.strokeStyle = c + "77";
    ctx.lineWidth = Math.random() * 3 + 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 10, y + len);
    ctx.stroke();
  }

  const text = "YOU WIN!";
  const name = `PLAYER ${playerNum}`;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = "bold 72px 'Courier New', monospace";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#000";
  ctx.strokeText(text, W / 2 + 3, H / 2 - 30 + 3);
  ctx.fillStyle = winner.color;
  ctx.fillText(text, W / 2, H / 2 - 30);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fff";
  ctx.strokeText(text, W / 2 - 1, H / 2 - 31);

  ctx.font = "bold 36px 'Courier New', monospace";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#000";
  ctx.strokeText(name, W / 2 + 2, H / 2 + 30 + 2);
  ctx.fillStyle = winner.color;
  ctx.fillText(name, W / 2, H / 2 + 30);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#fff";
  ctx.strokeText(name, W / 2 - 1, H / 2 + 29);

  ctx.font = "bold 20px 'Courier New', monospace";
  ctx.fillStyle = "#fff";
  ctx.fillText(`${winner.score} WINS`, W / 2, H / 2 + 80);

  ctx.font = "16px 'Courier New', monospace";
  ctx.fillStyle = "#888";
  ctx.fillText("PRESS SPACE FOR NEW MATCH", W / 2, H - 30);

  ctx.restore();
}

// --- Main game tick ---

function tick() {
  if (!running || gameOver) return;

  tickCount++;

  if (tickCount % PELLET_SPAWN_INTERVAL === 0) {
    spawnPellet();
  }
  if (tickCount % DIMMER_SPAWN_INTERVAL === 0) {
    spawnDimmerPellet();
  }

  // Move players
  let p1nx = p1.x + DX[p1.dir];
  let p1ny = p1.y + DY[p1.dir];
  let p2nx = p2.x + DX[p2.dir];
  let p2ny = p2.y + DY[p2.dir];

  if (isInvincible(p1) && (p1nx < 0 || p1nx >= COLS || p1ny < 0 || p1ny >= ROWS)) {
    [p1nx, p1ny] = wrapCoord(p1nx, p1ny);
  }
  if (isInvincible(p2) && (p2nx < 0 || p2nx >= COLS || p2ny < 0 || p2ny >= ROWS)) {
    [p2nx, p2ny] = wrapCoord(p2nx, p2ny);
  }

  checkPelletPickup(p1, p1nx, p1ny);
  checkPelletPickup(p2, p2nx, p2ny);

  const p1Hit = isCollision(p1nx, p1ny, isInvincible(p1));
  const p2Hit = isCollision(p2nx, p2ny, isInvincible(p2));

  const headOn = p1nx === p2nx && p1ny === p2ny;

  if (headOn) {
    if (isInvincible(p1) && !isInvincible(p2)) {
      p2.alive = false;
      awardWin(p1, 1);
      return;
    } else if (isInvincible(p2) && !isInvincible(p1)) {
      p1.alive = false;
      awardWin(p2, 2);
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
    awardWin(p2, 2);
    return;
  }

  if (p2Hit) {
    p2.alive = false;
    awardWin(p1, 1);
    return;
  }

  p1.x = p1nx;
  p1.y = p1ny;
  grid[p1.y * COLS + p1.x] = GRID_P1;

  p2.x = p2nx;
  p2.y = p2ny;
  grid[p2.y * COLS + p2.x] = GRID_P2;

  drawGrid();
}

function awardWin(winner: Player, playerNum: number) {
  winner.score++;
  score1El.textContent = String(p1.score);
  score2El.textContent = String(p2.score);

  if (winner.score >= WINS_NEEDED) {
    gameOver = true;
    running = false;
    matchOver = true;
    if (tickInterval !== null) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    drawGraffitiWinScreen(winner, playerNum);
    return;
  }

  endRound(`PLAYER ${playerNum} WINS!`);
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
  if (cell === GRID_EMPTY || cell === GRID_PELLET || cell === GRID_DIMMER) return false;
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

  for (const p of [p1, p2]) {
    if (!p.alive) {
      ctx.fillStyle = "#f00";
      ctx.fillRect(p.x * CELL - 2, p.y * CELL - 2, CELL + 4, CELL + 4);
    }
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
      if (matchOver) {
        p1.score = 0;
        p2.score = 0;
        score1El.textContent = "0";
        score2El.textContent = "0";
        matchOver = false;
      }
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

// Initial draw
initGame();
running = false;
drawGrid();
messageEl.textContent = "";
