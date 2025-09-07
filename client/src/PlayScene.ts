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
  private birds: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private pipeGraphics!: Phaser.GameObjects.Graphics;
  private lastFlapAt = 0;
  private gameState: GameState | null = null;
  private gameOverText!: Phaser.GameObjects.Text;

  // constants
  private readonly BIRD_W = 32;
  private readonly BIRD_H = 24;
  private readonly BIRD_HALF_W = 16;
  private readonly INVINCIBLE_CHECK_TWEEN_KEY = "invincibleTween";
  preload() {
    this.load.spritesheet("bird","public/Bird.png", {
      frameWidth: 32,
      frameHeight: 24
    });
    this.load.image("pipeTop", "public/Pipe.png");
    this.load.image("pipeBottom", "public/InvertPipe.png");
  }
  create() {
    const serverUrl = (import.meta as any).env?.VITE_SERVER_URL || "http://localhost:3000";
    this.socket = io(serverUrl, { transports: ["websocket"] });

    this.pipeGraphics = this.add.graphics();

    this.anims.create({
      key: "fly",
      frames: this.anims.generateFrameNumbers("bird", { start: 0, end: 2}),
      frameRate: 10,
      repeat: -1
    });

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
      let bird = this.birds.get(p.id) as Phaser.GameObjects.Sprite;
      if (!bird) {
        bird = this.add.sprite(p.x, p.y, "bird").setOrigin(0.5);
        this.birds.set(p.id, bird);

        bird.anims.play("fly");
      } else {
        bird.setPosition(p.x, p.y);
      }

      // color based on alive
      if (!p.alive) {
        bird.setTint(0x888888);
        bird.anims.stop();
      } else {
        bird.clearTint();
        if (!bird.anims.isPlaying) {
          bird.anims.play("fly");
        }
      }

      // invincibility handling
      const nowMs = Date.now();
      const isInvincible = p.invincibleUntil && nowMs < p.invincibleUntil;
      const tweensOfBird = this.tweens.getTweensOf(bird);

      if (isInvincible) {
        // if no existing tween (or all tweens not the invincibility one), add one
        const hasInvTween = tweensOfBird.some(t => (t as any).key === this.INVINCIBLE_CHECK_TWEEN_KEY);
        if (!hasInvTween) {
          // kill other alpha tweens to avoid stacking
          tweensOfBird.forEach(t => t.stop());
          this.tweens.add({
            targets: bird,
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
        tweensOfBird.forEach(t => {
          if ((t as any).key === this.INVINCIBLE_CHECK_TWEEN_KEY) t.stop();
        });
        bird.setAlpha(1);
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
    this.children.getAll().forEach((child) => {
     if ((child as any).isPipe) child.destroy();
    });
    const topBottom = 600;

    pipes.forEach((p) => {
      const gapTop = p.gapY - p.gapHeight / 2;
      const gapBottom = p.gapY + p.gapHeight / 2;

      // top pipe 
      const topPipe = this.add.image(p.x, gapTop, "pipeTop")
        .setOrigin(0.5, 1); // titik bawah gambar di pos gap
      (topPipe as any).isPipe = true;
      // bottom pipe
      const bottomPipe = this.add.image(p.x, gapBottom, "pipeBottom")
        .setOrigin(0.5, 0); // titik atas gambar di pos gap
      (bottomPipe as any).isPipe = true;
    });
  }
}
