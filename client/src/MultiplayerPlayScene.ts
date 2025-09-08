import Phaser from "phaser";
import { Socket } from "socket.io-client";
import { GameState, Player, Pipe } from "@shared/types"; // Pastikan path menggunakan alias

export default class MultiplayerPlayScene extends Phaser.Scene {
  private socket!: Socket;
  private meId: string | null = null;
  private birds: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private pipeGraphics!: Phaser.GameObjects.Graphics;
  private lastFlapAt = 0;
  private gameState: GameState | null = null;
  private gameOverText!: Phaser.GameObjects.Text;
  private backToMenuButton!: Phaser.GameObjects.Text;
  // --- PERUBAHAN 1: Tambahkan properti untuk teks penonton ---
  private spectatorText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "MultiplayerPlayScene" });
  }

  init(data: { socket: Socket }) {
    this.socket = data.socket;
  }

  private readonly INVINCIBLE_CHECK_TWEEN_KEY = "invincibleTween";

  preload() {
    this.load.spritesheet("bird","/Bird.png", {
      frameWidth: 32,
      frameHeight: 24
    });
    this.load.image("pipeBottom", "/Pipe.png");
    this.load.image("pipeTop", "/InvertPipe.png");
  }

  create() {
    this.pipeGraphics = this.add.graphics();
    this.anims.create({
      key: "fly",
      frames: this.anims.generateFrameNumbers("bird", { start: 0, end: 2}),
      frameRate: 10,
      repeat: -1
    });
    this.meId = this.socket.id ?? null;
    
    this.socket.on("init", (state: GameState) => {
      console.log("Received initial game state:", state);
      this.gameState = state;
      this.syncPlayers(state.players);
      this.drawPipes(state.pipes);
    });

    this.socket.on("update", (state: GameState) => {
      if (!this.gameState) return;
      this.gameState = state;
      this.syncPlayers(state.players);
      this.drawPipes(state.pipes);
    });

    this.input.on("pointerdown", () => this.handleInput());
    this.input.keyboard?.on("keydown-SPACE", () => this.handleInput());
    this.add.text(10, 10, "Flappy Multiplayer — click or SPACE to flap", { fontSize: "14px", color: "#000" });
    this.gameOverText = this.add.text(400, 300, "Game Over!", { fontSize: "32px", color: "#ff0000", align: "center" }).setOrigin(0.5).setVisible(false);
    this.backToMenuButton = this.add.text(400, 350, "Back to Menu", { fontSize: "24px", color: "#fff", backgroundColor: "#333", padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive().setVisible(false);
    
    this.backToMenuButton.on('pointerdown', () => {
        this.socket.disconnect();
        this.scene.start('MainMenuScene');
    });

    // --- PERUBAHAN 2: Buat objek teks untuk penonton ---
    this.spectatorText = this.add.text(400, 250, "You are eliminated!\nSpectating...", {
      fontSize: "24px",
      color: "#ffdd00",
      align: "center",
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setVisible(false);

    console.log("MultiplayerPlayScene is ready. Emitting 'clientReady'.");
    this.socket.emit("clientReady");
  }

  private handleInput() {
    if (!this.meId) return;
    const me = this.gameState?.players[this.meId];
    if (me && !me.alive) {
      return;
    }
    const now = this.time.now;
    if (now - this.lastFlapAt < 120) return;
    this.lastFlapAt = now;
    this.socket.emit("input", { flap: true });
  }

  private syncPlayers(players: Record<string, Player>) {
    // Bagian atas syncPlayers untuk update posisi burung tidak berubah
    Object.values(players).forEach((p) => {
      let bird = this.birds.get(p.id) as Phaser.GameObjects.Sprite;
      if (!bird) {
        bird = this.add.sprite(p.x, p.y, "bird").setOrigin(0.5);
        this.birds.set(p.id, bird);
        bird.anims.play("fly");
      } else {
        bird.setPosition(p.x, p.y);
      }
      if (!p.alive) {
        bird.setTint(0x888888);
        bird.anims.stop();
      } else {
        bird.clearTint();
        if (!bird.anims.isPlaying) {
          bird.anims.play("fly");
        }
      }
      const nowMs = Date.now();
      const isInvincible = p.invincibleUntil && nowMs < p.invincibleUntil;
      const tweensOfBird = this.tweens.getTweensOf(bird);
      if (isInvincible) {
        const hasInvTween = tweensOfBird.some(t => (t as any).key === this.INVINCIBLE_CHECK_TWEEN_KEY);
        if (!hasInvTween) {
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
        tweensOfBird.forEach(t => {
          if ((t as any).key === this.INVINCIBLE_CHECK_TWEEN_KEY) t.stop();
        });
        bird.setAlpha(1);
      }
    });

    for (const id of Array.from(this.birds.keys())) {
      if (!players[id]) {
        this.birds.get(id)?.destroy();
        this.birds.delete(id);
      }
    }

    // --- PERUBAHAN 3: Ganti total logika Game Over di sini ---
    if (this.meId) {
        const me = players[this.meId];
        const allPlayers = Object.values(players);
        // Cek jika semua pemain sudah mati (dan ada pemain di room)
        const areAllPlayersDead = allPlayers.length > 0 && allPlayers.every(p => !p.alive);

        if (me && !me.alive && !areAllPlayersDead) {
            // Jika SAYA mati TAPI game belum berakhir, tampilkan teks penonton
            this.spectatorText.setVisible(true);
        }

        if (areAllPlayersDead) {
            // Jika SEMUA pemain mati, baru tampilkan Game Over
            this.gameOverText.setVisible(true);
            this.backToMenuButton.setVisible(true);
            this.spectatorText.setVisible(false); // Sembunyikan teks penonton jika muncul bersamaan
        } else {
            // Jika masih ada pemain yang hidup, pastikan Game Over disembunyikan
            this.gameOverText.setVisible(false);
            this.backToMenuButton.setVisible(false);
        }
    }
    // --- AKHIR DARI BLOK PERUBAHAN ---
  }

  private drawPipes(pipes: Pipe[]) {
    // Fungsi ini tidak perlu diubah
    this.children.getAll().forEach((child) => {
     if ((child as any).isPipe) child.destroy();
    });
    pipes.forEach((p) => {
      const gapTop = p.gapY - p.gapHeight / 2;
      const gapBottom = p.gapY + p.gapHeight / 2;
      const topPipe = this.add.image(p.x, gapTop, "pipeTop").setOrigin(0.5, 1);
      (topPipe as any).isPipe = true;
      const bottomPipe = this.add.image(p.x, gapBottom, "pipeBottom").setOrigin(0.5, 0);
      (bottomPipe as any).isPipe = true;
    });
  }
}