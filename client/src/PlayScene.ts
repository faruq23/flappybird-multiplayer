// PlayScene.ts
import Phaser from "phaser";
import { io, Socket } from "socket.io-client";

type Player = {
  id: string;
  x: number;
  y: number;
  vy: number;
  score: number;
  alive: boolean;
  invincibleUntil?: number;
};

type Pipe = { id: string; x: number; gapY: number; gapHeight: number };

type GameState = {
  players: Record<string, Player>;
  pipes: Pipe[];
  tick: number;
};

export default class PlayScene extends Phaser.Scene {
  private socket!: Socket;
  private meId: string | null = null;
  private birds: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private pipeGraphics!: Phaser.GameObjects.Graphics;
  private lastFlapAt = 0;
  private gameState: GameState | null = null;
  private gameOverText!: Phaser.GameObjects.Text;

  // constants
  private readonly BIRD_W = 32;
  private readonly BIRD_H = 24;
  private readonly BIRD_HALF_W = 16;
  private readonly INVINCIBLE_CHECK_TWEEN_KEY = "invincibleTween";

  create() {
    const serverUrl = (import.meta as any).env?.VITE_SERVER_URL || "http://localhost:3000";
    this.socket = io(serverUrl, { transports: ["websocket"] });

    this.pipeGraphics = this.add.graphics();

    this.socket.on("connect", () => {
      this.meId = this.socket.id ?? null;
    });

    this.socket.on("init", (state: GameState) => {
      this.gameState = state;
      this.syncPlayers(state.players);
      this.drawPipes(state.pipes);
    });

    this.socket.on("update", (state: GameState) => {
      this.gameState = state;
      this.syncPlayers(state.players);
      this.drawPipes(state.pipes);
    });

    this.input.on("pointerdown", () => this.handleInput());
    this.input.keyboard?.on("keydown-SPACE", () => this.handleInput());

    this.add.text(10, 10, "Flappy Multiplayer — click or SPACE to flap", {
      fontSize: "14px",
      color: "#000"
    });

    this.gameOverText = this.add.text(400, 300, "Game Over!", {
      fontSize: "32px",
      color: "#ff0000",
      align: "center"
    }).setOrigin(0.5).setVisible(false);
  }

  private handleInput() {
    if (!this.meId) return;
    const me = this.gameState?.players[this.meId];
    if (me && !me.alive) {
      return;
    }

    const now = this.time.now;
    if (now - this.lastFlapAt < 120) return; // simple rate limit
    this.lastFlapAt = now;
    this.socket.emit("input", { flap: true });
  }

  private syncPlayers(players: Record<string, Player>) {
    // create or update birds
    Object.values(players).forEach((p) => {
      let rect = this.birds.get(p.id);
      if (!rect) {
        rect = this.add.rectangle(p.x, p.y, this.BIRD_W, this.BIRD_H, 0x00aa00).setOrigin(0.5);
        this.birds.set(p.id, rect);
      } else {
        rect.setPosition(p.x, p.y);
      }

      // color based on alive
      const fill = p.alive ? 0x00aa00 : 0x888888;
      rect.setFillStyle(fill);

      // invincibility handling
      const nowMs = Date.now();
      const isInvincible = p.invincibleUntil && nowMs < p.invincibleUntil;
      const tweensOfRect = this.tweens.getTweensOf(rect);

      if (isInvincible) {
        // if no existing tween (or all tweens not the invincibility one), add one
        const hasInvTween = tweensOfRect.some(t => (t as any).key === this.INVINCIBLE_CHECK_TWEEN_KEY);
        if (!hasInvTween) {
          // kill other alpha tweens to avoid stacking
          tweensOfRect.forEach(t => t.stop());
          this.tweens.add({
            targets: rect,
            alpha: { from: 1, to: 0.4 },
            duration: 300,
            ease: 'Linear',
            yoyo: true,
            repeat: -1,
            key: this.INVINCIBLE_CHECK_TWEEN_KEY
          });
        }
      } else {
        // not invincible -> ensure any invincibility tweens are removed and alpha restored
        tweensOfRect.forEach(t => {
          if ((t as any).key === this.INVINCIBLE_CHECK_TWEEN_KEY) t.stop();
        });
        rect.setAlpha(1);
      }
    });

    // remove disconnected birds
    for (const id of Array.from(this.birds.keys())) {
      if (!players[id]) {
        this.birds.get(id)?.destroy();
        this.birds.delete(id);
      }
    }

    // show/hide game over
    if (this.meId) {
      const me = this.gameState?.players[this.meId];
      const restartButton = document.getElementById('restart-button');

      if (me && !me.alive) {
        this.gameOverText.setVisible(true);
        if (restartButton) restartButton.style.display = 'block';
      } else if (me && me.alive) {
        this.gameOverText.setVisible(false);
        if (restartButton) restartButton.style.display = 'none';
      }
    }
  }

  private drawPipes(pipes: Pipe[]) {
    this.pipeGraphics.clear();

    const pipeW = 64;
    const halfW = pipeW / 2;
    const topBottom = 600;

    pipes.forEach((p) => {
      const gapTop = p.gapY - p.gapHeight / 2;
      const gapBottom = p.gapY + p.gapHeight / 2;

      // top pipe (darker green)
      this.pipeGraphics.fillStyle(0x228B22, 1);
      this.pipeGraphics.fillRect(p.x - halfW, 0, pipeW, Math.max(0, gapTop));

      // bottom pipe
      this.pipeGraphics.fillStyle(0x228B22, 1);
      this.pipeGraphics.fillRect(p.x - halfW, gapBottom, pipeW, Math.max(0, topBottom - gapBottom));
    });
  }
}
