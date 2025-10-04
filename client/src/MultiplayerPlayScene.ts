// src/MultiplayerPlayScene.ts

import Phaser from "phaser";
import { GameState, Player, Pipe } from "@shared/types"; 
import { database } from "./firebase";
import { ref, onValue, update, Unsubscribe } from "firebase/database";

export default class MultiplayerPlayScene extends Phaser.Scene {
    private roomId!: string;
    private meId!: string;
    private isHost: boolean = false;
    private roomListener: Unsubscribe | null = null;
    private birds: Map<string, Phaser.GameObjects.Sprite> = new Map();
    private gameState: GameState | null = null;
    private isReady: boolean = false;
    private gameStartTime: number = 0;
    
    // Properti UI
    private backToMenuButton!: Phaser.GameObjects.Text;
    private gameOverText!: Phaser.GameObjects.Text;
    private restartButton!: Phaser.GameObjects.Text;

    constructor() { super({ key: "MultiplayerPlayScene" }); }

    init(data: { roomId: string, playerId: string, isHost: boolean }) {
        this.roomId = data.roomId;
        this.meId = data.playerId;
        this.isHost = data.isHost;
        this.isReady = false;
        this.birds.clear();
    }

    preload() {
        this.load.spritesheet("bird","/Bird.png", { frameWidth: 32, frameHeight: 24 });
        this.load.image("pipeBottom", "/Pipe.png");
        this.load.image("pipeTop", "/InvertPipe.png");
    }

    create() {
        this.anims.create({ key: "fly", frames: this.anims.generateFrameNumbers("bird", { start: 0, end: 2}), frameRate: 10, repeat: -1 });
        this.gameStartTime = Date.now();
        
        const roomRef = ref(database, `rooms/${this.roomId}`);
        this.roomListener = onValue(roomRef, (snapshot) => {
            const state = snapshot.val();
            if (state) {
                if (!this.isReady) { this.isReady = true; }
                this.gameState = state;
                this.syncGameState(this.gameState);
            }
        });
        
        this.input.keyboard?.on("keydown-SPACE", () => this.handleInput());
        this.input.on("pointerdown", () => this.handleInput());
        
        this.add.text(10, 10, "Flappy Multiplayer — click or SPACE to flap", { fontSize: "14px", color: "#000" });
        this.gameOverText = this.add.text(400, 250, "Game Over!", { fontSize: "48px", color: "#ff0000", align: "center" }).setOrigin(0.5).setDepth(1).setVisible(false);
        this.backToMenuButton = this.add.text(400, 350, "Back to Menu", { fontSize: "24px", color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive().setVisible(false);
        this.restartButton = this.add.text(400, 300, "Restart Game", { fontSize: "24px", color: '#fff', backgroundColor: '#28a745', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive().setVisible(false);
        
        this.backToMenuButton.on('pointerdown', () => { this.cleanup(); this.scene.start('MainMenuScene'); });
        
        if (this.isHost) {
            this.restartButton.on('pointerdown', () => this.restartGame());
        }
    }

    handleInput() {
        if (this.isReady && this.gameState?.players?.[this.meId]?.alive) {
            update(ref(database, `rooms/${this.roomId}/players/${this.meId}`), { flap: true });
        }
    }
    
    update(time: number, delta: number) {
        if (!this.isHost || !this.isReady || !this.gameState || !this.gameState.players || !this.gameState.pipes) return;

        const deltaFactor = delta / 16.66;
        const players = this.gameState.players;
        const pipes = this.gameState.pipes;
        const GRAVITY = 0.4;
        const FLAP_VELOCITY = -8;
        const PIPE_SPEED = 2;

        for (const playerId in players) {
            const player = players[playerId];
            if (!player.alive) continue;

            if (player.flap) {
                player.velocityY = FLAP_VELOCITY;
                player.flap = false; 
            }
            player.velocityY += GRAVITY * deltaFactor;
            player.y += player.velocityY * deltaFactor;

            if (Date.now() > this.gameStartTime + 2000) {
                if (player.y > 600 || player.y < 0) {
                     player.alive = false;
                }
            }

            // =====================================================================
            // PERBAIKAN: Menambahkan Logika Deteksi Tabrakan
            // =====================================================================
            for (const pipe of pipes) {
                const birdHalfWidth = 16;
                const birdHalfHeight = 12;
                const pipeHalfWidth = 26; // Setengah dari lebar sprite pipa (misal: 52px)
                
                // Cek tabrakan sumbu X
                if (player.x + birdHalfWidth > pipe.x - pipeHalfWidth && player.x - birdHalfWidth < pipe.x + pipeHalfWidth) {
                    // Cek tabrakan sumbu Y (jika burung berada di dalam celah)
                    if (player.y - birdHalfHeight < pipe.gapY - pipe.gapHeight / 2 || player.y + birdHalfHeight > pipe.gapY + pipe.gapHeight / 2) {
                        player.alive = false;
                        break; // Keluar dari loop pipa jika sudah kena
                    }
                }
            }
        }

        let lastPipe = pipes[pipes.length - 1];
        for (const pipe of pipes) {
            pipe.x -= PIPE_SPEED * deltaFactor;
        }
        this.gameState.pipes = pipes.filter(p => p.x > -50);
        
        if (!lastPipe || lastPipe.x < 600) {
             this.gameState.pipes.push({ x: 900, gapY: Math.floor(Math.random() * 300) + 150, gapHeight: 150 });
        }
        
        update(ref(database, `rooms/${this.roomId}`), { 
            players: this.gameState.players,
            pipes: this.gameState.pipes
        });
    }

    syncGameState(state: GameState) {
        if (!this.isReady || !state) return;
        
        (this.children.list.filter(c => (c as any).isPipe) as Phaser.GameObjects.Image[]).forEach(c => c.destroy());
        (state.pipes || []).forEach(p => {
            const gapTop = p.gapY - p.gapHeight / 2; const gapBottom = p.gapY + p.gapHeight / 2;
            const topPipe = this.add.image(p.x, gapTop, "pipeTop").setOrigin(0.5, 1);
            const bottomPipe = this.add.image(p.x, gapBottom, "pipeBottom").setOrigin(0.5, 0);
            (topPipe as any).isPipe = true; (bottomPipe as any).isPipe = true;
        });

        if (state.players) {
            Object.values(state.players).forEach(player => {
                let bird = this.birds.get(player.id);
                if (!bird) {
                    bird = this.add.sprite(player.x, player.y, "bird").setOrigin(0.5);
                    this.birds.set(player.id, bird);
                }
                bird.setPosition(player.x, player.y);
                if (player.alive) {
                    bird.clearTint();
                    if (!bird.anims.isPlaying) bird.anims.play("fly", true);
                } else {
                    bird.setTint(0x888888);
                    bird.anims.stop();
                }
            });
        }
        
        const allPlayers = state.players ? Object.values(state.players) : [];
        const allPlayersDead = allPlayers.length > 0 && allPlayers.every(p => !p.alive);

        this.gameOverText.setVisible(allPlayersDead);
        this.backToMenuButton.setVisible(allPlayersDead);
        if (this.isHost) {
            this.restartButton.setVisible(allPlayersDead);
        }
    }
    
    private restartGame() {
        if (!this.isHost || !this.gameState) return;
        const playersToReset = this.gameState.players;
        Object.values(playersToReset).forEach(player => {
            player.x = 100; player.y = 300; player.velocityY = 0;
            player.score = 0; player.alive = true; player.flap = false;
        });
        const initialPipes = [{ x: 500, gapY: 300, gapHeight: 150 }];
        update(ref(database, `rooms/${this.roomId}`), {
            players: playersToReset,
            pipes: initialPipes
        });
        this.gameStartTime = Date.now();
    }
    
    cleanup() {
        if (this.roomListener) { this.roomListener(); this.roomListener = null; }
    }
}

