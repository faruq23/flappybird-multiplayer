import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { GameState, Pipe, Player } from "./types";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const TICK_MS = 50; // 20 TPS
const WORLD_WIDTH = 800;
const PIPE_SPEED = 120; // px/s
const START_X = 150;
const START_Y = 300;
const INVINCIBLE_MS = 2000;
const BIRD_HALF_W = 16;
const PIPE_W = 64;

// Konstanta untuk celah pipa (kesulitan vertikal)
const INITIAL_GAP_HEIGHT = 150;
const MIN_GAP_HEIGHT = 75;
const REDUCTION_PER_SCORE = 1;

// Konstanta untuk interval pipa (kesulitan horizontal)
const INITIAL_PIPE_EVERY_MS = 3000;
const MIN_PIPE_EVERY_MS = 1200;
const INTERVAL_REDUCTION_PER_SCORE = 25;

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

const state: GameState = {
  players: {},
  pipes: [],
  tick: 0
};

let lastPipeAt = Date.now() + 1000 - INITIAL_PIPE_EVERY_MS;

function spawnPipe(currentGapHeight: number): void {
  const gapY = 120 + Math.random() * 360;
  const pipe: Pipe = {
    id: Math.random().toString(36).slice(2),
    x: WORLD_WIDTH + 100,
    gapY,
    gapHeight: currentGapHeight,
    passedBy: {}
  };
  state.pipes.push(pipe);
}

function updatePipes(dt: number): void {
  const dx = (PIPE_SPEED * dt) / 1000;
  state.pipes.forEach((p) => (p.x -= dx));
  while (state.pipes.length && state.pipes[0].x < -100) {
    state.pipes.shift();
  }

  // --- LOGIKA KESULITAN DINAMIS ---
  const livingPlayers = Object.values(state.players).filter(p => p.alive);
  const highestScore = livingPlayers.length > 0 ? Math.max(...livingPlayers.map(p => p.score)) : 0;

  const gapReduction = highestScore * REDUCTION_PER_SCORE;
  const currentGapHeight = Math.max(MIN_GAP_HEIGHT, INITIAL_GAP_HEIGHT - gapReduction);

  const intervalReduction = highestScore * INTERVAL_REDUCTION_PER_SCORE;
  const currentPipeInterval = Math.max(MIN_PIPE_EVERY_MS, INITIAL_PIPE_EVERY_MS - intervalReduction);

  const now = Date.now();
  if (now - lastPipeAt > currentPipeInterval) {
    spawnPipe(currentGapHeight);
    lastPipeAt = now;
  }
}

function checkCollision(player: Player, pipes: Pipe[]): boolean {
  const birdHalfH = 12;
  const birdHalfW = BIRD_HALF_W;
  for (const p of pipes) {
    const inX = player.x + birdHalfW > p.x - PIPE_W / 2 && player.x - birdHalfW < p.x + PIPE_W / 2;
    if (inX) {
      const gapTop = p.gapY - p.gapHeight / 2;
      const gapBottom = p.gapY + p.gapHeight / 2;
      const topBottomOK = player.y - birdHalfH > gapTop && player.y + birdHalfH < gapBottom;
      if (!topBottomOK) return true;
    }
  }
  if (player.y - 12 < 0 || player.y + 12 > 600) return true;
  return false;
}

io.on("connection", (socket) => {
  const id = socket.id;
  console.log("connected:", id);

  const allPlayers = Object.values(state.players);
  const isGameReadyForReset = allPlayers.length === 0 || allPlayers.every(p => !p.alive);

  if (isGameReadyForReset) {
    console.log("Game world is being reset for a new session.");
    state.pipes = [];
    lastPipeAt = Date.now() + 1000 - INITIAL_PIPE_EVERY_MS;
  }

  state.players[id] = {
    id,
    x: START_X,
    y: START_Y,
    vy: 0,
    score: 0,
    alive: true,
    invincibleUntil: Date.now() + INVINCIBLE_MS
  };

  socket.emit("init", state);

  socket.on("input", (payload: { flap?: boolean }) => {
    const p = state.players[id];
    if (!p || !p.alive) return;
    if (payload?.flap) {
      p.vy = -260;
    }
  });

  socket.on("disconnect", () => {
    delete state.players[id];
    console.log("disconnected:", id);
  });
});

setInterval(() => {
  const dt = TICK_MS;
  state.tick++;

  Object.values(state.players).forEach((p) => {
    if (!p.alive) return;
    p.vy += 600 * (dt / 1000);
    p.y += p.vy * (dt / 1000);

    state.pipes.forEach((pipe) => {
      const passed = pipe.x + PIPE_W / 2 < p.x - BIRD_HALF_W;
      if (passed) {
        if (!pipe.passedBy) pipe.passedBy = {};
        if (!pipe.passedBy[p.id]) {
          pipe.passedBy[p.id] = true;
          p.score += 1;
        }
      }
    });

    if (checkCollision(p, state.pipes)) {
      if (!p.invincibleUntil || Date.now() > p.invincibleUntil) {
        p.alive = false;
      }
    }
  });

  updatePipes(dt);

  io.emit("update", state);
}, TICK_MS);

httpServer.listen(PORT, () => {
  console.log(`server on http://localhost:${PORT}`);
});