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
    private backToMenuButton!: Phaser.GameObjects.Text;
    private isReady: boolean = false;

    constructor() { super({ key: "MultiplayerPlayScene" }); }

    init(data: { roomId: string, playerId: string, isHost: boolean }) {
        this.roomId = data.roomId;
        this.meId = data.playerId;
        this.isHost = data.isHost;
        this.isReady = false;
    }

    preload() {
        this.load.spritesheet("bird","/Bird.png", { frameWidth: 32, frameHeight: 24 });
        this.load.image("pipeBottom", "/Pipe.png");
        this.load.image("pipeTop", "/InvertPipe.png");
    }

    create() {
        this.anims.create({ key: "fly", frames: this.anims.generateFrameNumbers("bird", { start: 0, end: 2}), frameRate: 10, repeat: -1 });
        
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
        this.backToMenuButton = this.add.text(400, 350, "Back to Menu", { fontSize: "24px", color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive().setVisible(false);
        this.backToMenuButton.on('pointerdown', () => { this.cleanup(); this.scene.start('MainMenuScene'); });
    }

    handleInput() {
        if (this.isReady && this.gameState?.players?.[this.meId]?.alive) {
            // Kirim 'event' flap sebagai boolean
            update(ref(database, `rooms/${this.roomId}/players/${this.meId}`), { flap: true });
        }
    }
    
    update() {
        if (!this.isHost || !this.isReady || !this.gameState || !this.gameState.players) return;

        const players = this.gameState.players;
        const GRAVITY = 0.5;
        const FLAP_VELOCITY = -8;

        for (const playerId in players) {
            const player = players[playerId];
            if (!player.alive) continue;

            // LOGIKA BARU YANG LEBIH SEDERHANA
            if (player.flap) {
                player.velocityY = FLAP_VELOCITY;
                player.flap = false; // Langsung reset setelah diproses
            }

            player.velocityY += GRAVITY;
            player.y += player.velocityY;

            if (player.y > 600 || player.y < 0) {
                 player.alive = false;
            }
        }
        
        update(ref(database, `rooms/${this.roomId}`), { players: this.gameState.players });
    }

    syncGameState(state: GameState) {
        // ... (fungsi ini tidak berubah dari versi sebelumnya)
        if (!this.isReady || !state) return;
        this.children.list.filter(c => (c as any).isPipe).forEach(c => c.destroy());
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
        this.backToMenuButton.setVisible(allPlayersDead);
    }
    
    cleanup() {
        if (this.roomListener) { this.roomListener(); this.roomListener = null; }
    }
}

export default MultiplayerPlayScene;