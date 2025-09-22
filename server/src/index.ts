import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { GameState, Pipe, Player } from '@shared/types';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
const TICK_MS = 50; // 20 TPS
const WORLD_WIDTH = 800;
const PIPE_SPEED = 120; // px/s
const START_X = 150;
const START_Y = 300;
const INVINCIBLE_MS = 5000;
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

// Serve static files from client build
app.use(express.static(path.join(__dirname, '../../client/dist')));

// API health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Flappy Bird Server is running' });
});

// Serve frontend for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  }
});

const httpServer = createServer(app);
// Configuration for Replit and Vercel integration
const allowedOrigins: string[] = [
  "https://flappybird-multiplayer.vercel.app",
  "http://localhost:5001",
  "http://127.0.0.1:5001"
];

// Add Replit domain if available
if (process.env.REPLIT_DEV_DOMAIN) {
  allowedOrigins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
}

const io = new Server(httpServer, {
  cors: { 
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const rooms: Record<string, { state: GameState; hostId: string; interval: NodeJS.Timeout; lastPipeAt: number }> = {};

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

  socket.on("createRoom", () => {
    let roomId = Math.random().toString(36).slice(2, 8);
    while(rooms[roomId]) {
      roomId = Math.random().toString(36).slice(2, 8);
    }
    
    const creatorId = socket.id;
    const newState: GameState = { 
        roomId: roomId,
        hostId: creatorId,
        players: {
            [creatorId]: { // Add creator immediately
                id: creatorId,
                name: `player-1`,
                x: START_X,
                y: START_Y,
                vy: 0,
                score: 0,
                alive: true,
                invincibleUntil: Date.now() + INVINCIBLE_MS
            }
        }, 
        pipes: [], 
        tick: 0, 
        started: false 
    };

    const newRoom = {
      state: newState,
      hostId: creatorId, // Track the host
      interval: setInterval(() => {
        if (!newRoom.state.started) return;

        const dt = TICK_MS;
        newState.tick++;
        Object.values(newState.players).forEach((p) => {
          if (!p.alive) return;

          const isInvincible = p.invincibleUntil && Date.now() < p.invincibleUntil;

          if (isInvincible) {
            // While invincible, hover in place vertically
            p.vy = 0;
            p.y = START_Y;
          } else {
            // Normal gravity
            p.vy += 600 * (dt / 1000);
            p.y += p.vy * (dt / 1000);
          }

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

    socket.join(roomId);
    socket.emit("init", newState);
  });

  socket.on("joinRoom", (roomId: string) => {
    const targetRoomId = roomId.toLowerCase();
    const room = rooms[targetRoomId];
    if (!room) {
      socket.emit("roomNotFound");
      return;
    }

    socket.join(targetRoomId);
    const joinerId = socket.id;
    const playerCount = Object.keys(room.state.players).length;
    const newPlayer: Player = {
        id: joinerId,
        name: `player-${playerCount + 1}`,
        x: START_X,
        y: START_Y,
        vy: 0,
        score: 0,
        alive: true,
        invincibleUntil: Date.now() + INVINCIBLE_MS
    };
    room.state.players[joinerId] = newPlayer;
    room.state.roomId = targetRoomId; // Ensure roomId is on the state

    socket.emit("init", room.state); // Send state to joiner
    socket.to(targetRoomId).emit("playerJoined", newPlayer); // Tell others about joiner
  });

  socket.on("startGame", (roomId: string) => {
    const room = rooms[roomId];
    if (room) {
        console.log(`Starting game for room ${roomId}`);
        room.state.started = true;
        io.to(roomId).emit('gameStarted');
    }
  });

  socket.on('restartGame', (roomId: string) => {
    const room = rooms[roomId];
    // Only allow the host to restart
    if (room && room.hostId === socket.id) {
      console.log(`Restarting game for room ${roomId}`);

      // Reset all players
      Object.values(room.state.players).forEach(p => {
        p.alive = true;
        p.score = 0;
        p.x = START_X;
        p.y = START_Y;
        p.vy = 0;
        p.invincibleUntil = Date.now() + INVINCIBLE_MS;
      });

      // Clear pipes
      room.state.pipes = [];

      // Broadcast the reset state to all clients
      io.to(roomId).emit('init', room.state);
    }
  });

  socket.on('clientReady', () => {
    let roomId: string | undefined;
    for (const id in rooms) {
      if (Object.keys(rooms[id].state.players).includes(socket.id)) {
        roomId = id;
        break;
      }
    }

    if (roomId) {
      console.log(`Client ${socket.id} is ready. Sending init state for room ${roomId}.`);
      io.to(socket.id).emit('init', rooms[roomId].state);
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

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Bind to 0.0.0.0 to accept connections from any host
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`server on http://0.0.0.0:${PORT}`);
  console.log(`CORS origins set to: ${allowedOrigins.join(', ')}`);
});
