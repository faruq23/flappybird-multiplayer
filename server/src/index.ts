import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { GameState, Pipe, Player } from '@shared/types';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const TICK_MS = 50; // 20 TPS
const WORLD_WIDTH = 800;
const PIPE_SPEED = 120; // px/s
const START_X = 150;
const START_Y = 300;
const INVINCIBLE_MS = 2000;
const BIRD_HALF_W = 16;
const PIPE_W = 64;

const INITIAL_GAP_HEIGHT = 150;
const MIN_GAP_HEIGHT = 75;
const REDUCTION_PER_SCORE = 1;

const INITIAL_PIPE_EVERY_MS = 3000;
const MIN_PIPE_EVERY_MS = 1200;
const INTERVAL_REDUCTION_PER_SCORE = 25;

const app = express();
app.use(cors());

const httpServer = createServer(app);
// Konfigurasi CORS final untuk Vercel
const io = new Server(httpServer, {
  cors: { 
    origin: "https://flappybird-multiplayer.vercel.app", // Ganti jika URL Vercel Anda berbeda
    methods: ["GET", "POST"]
  }
});

const rooms: Record<string, { state: GameState; interval: NodeJS.Timeout; lastPipeAt: number }> = {};

function spawnPipe(state: GameState): void {
  const livingPlayers = Object.values(state.players).filter(p => p.alive);
  const highestScore = livingPlayers.length > 0 ? Math.max(...livingPlayers.map(p => p.score)) : 0;
  const gapReduction = highestScore * REDUCTION_PER_SCORE;
  const currentGapHeight = Math.max(MIN_GAP_HEIGHT, INITIAL_GAP_HEIGHT - gapReduction);

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

function updatePipes(dt: number, room: { state: GameState; lastPipeAt: number }): void {
  const { state } = room;
  const dx = (PIPE_SPEED * dt) / 1000;
  state.pipes.forEach((p) => (p.x -= dx));
  while (state.pipes.length && state.pipes[0].x < -100) {
    state.pipes.shift();
  }

  const livingPlayers = Object.values(state.players).filter(p => p.alive);
  const highestScore = livingPlayers.length > 0 ? Math.max(...livingPlayers.map(p => p.score)) : 0;

  const intervalReduction = highestScore * INTERVAL_REDUCTION_PER_SCORE;
  const currentPipeInterval = Math.max(MIN_PIPE_EVERY_MS, INITIAL_PIPE_EVERY_MS - intervalReduction);

  const now = Date.now();
  if (now - room.lastPipeAt > currentPipeInterval) {
    spawnPipe(state);
    room.lastPipeAt = now;
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
  console.log("connected:", socket.id);

  const joinGame = (roomId: string) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("roomNotFound");
      return;
    }
    socket.join(roomId);
    const id = socket.id;
    const playerCount = Object.keys(room.state.players).length;
    room.state.players[id] = {
      id,
      name: `player-${playerCount + 1}`,
      x: START_X,
      y: START_Y,
      vy: 0,
      score: 0,
      alive: true,
      invincibleUntil: Date.now() + INVINCIBLE_MS
    };
    socket.emit("init", room.state); 
    socket.to(roomId).emit("playerJoined", room.state.players[id]);
  };

  socket.on("createRoom", () => {
    let roomId = Math.random().toString(36).slice(2, 8);
    while(rooms[roomId]) {
      roomId = Math.random().toString(36).slice(2, 8);
    }
    
    const newState: GameState = { players: {}, pipes: [], tick: 0, started: false };
    const newRoom = {
      state: newState,
      interval: setInterval(() => {
        if (!newRoom.state.started) return;

        const dt = TICK_MS;
        newState.tick++;
        Object.values(newState.players).forEach((p) => {
          if (!p.alive) return;
          p.vy += 600 * (dt / 1000);
          p.y += p.vy * (dt / 1000);
          newState.pipes.forEach((pipe) => {
            const passed = pipe.x + PIPE_W / 2 < p.x - BIRD_HALF_W;
            if (passed && !pipe.passedBy[p.id]) {
              pipe.passedBy[p.id] = true;
              p.score += 1;
            }
          });
          if (checkCollision(p, newState.pipes)) {
            if (!p.invincibleUntil || Date.now() > p.invincibleUntil) {
              p.alive = false;
            }
          }
        });
        updatePipes(dt, newRoom);
        io.to(roomId).emit("update", newState);
      }, TICK_MS),
      lastPipeAt: Date.now()
    };
    rooms[roomId] = newRoom;
    socket.emit("roomCreated", roomId);
    joinGame(roomId);
  });

  socket.on("joinRoom", (roomId: string) => {
    if (rooms[roomId]) {
      joinGame(roomId);
    } else {
      socket.emit("roomNotFound");
    }
  });

  socket.on("startGame", (roomId: string) => {
    const room = rooms[roomId];
    if (room) {
        console.log(`Starting game for room ${roomId}`);
        room.state.started = true;
        io.to(roomId).emit('gameStarted');
    }
  });

  socket.on("clientReady", () => {
    for (const roomId in rooms) {
      if (rooms[roomId].state.players[socket.id]) {
        console.log(`Client ${socket.id} is ready. Sending init state for room ${roomId}.`);
        socket.emit("init", rooms[roomId].state);
        break;
      }
    }
  });

  socket.on("input", (payload: { flap?: boolean }) => {
    const p = Object.values(rooms).map(r => r.state.players[socket.id]).find(p => p);
    if (!p || !p.alive) return;
    if (payload?.flap) {
      p.vy = -260;
    }
  });

  socket.on("disconnect", () => {
    console.log("disconnected:", socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.state.players[socket.id]) {
        const player = room.state.players[socket.id];
        delete room.state.players[socket.id];
        io.to(roomId).emit("playerLeft", player.id);
        if (Object.keys(room.state.players).length === 0) {
          clearInterval(room.interval);
          delete rooms[roomId];
          console.log(`Room ${roomId} is empty, cleaning up.`);
        }
        break;
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`server on http://localhost:${PORT}`);
});
