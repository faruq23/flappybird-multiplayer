// src/MultiplayerPlayScene.ts (VERSI TES DIAGNOSTIK)

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
        // Input tidak melakukan apa-apa di mode tes ini
    }
    
    // =====================================================================
    // FUNGSI UPDATE YANG DIUBAH TOTAL UNTUK TES
    // =====================================================================
    update() {
        if (!this.isHost || !this.isReady || !this.gameState || !this.gameState.players) return;

        // Ambil state pemain saat ini
        const players = this.gameState.players;

        // LOGIKA TES: Alih-alih fisika, kita hanya gerakkan burung ke kanan
        for (const playerId in players) {
            const player = players[playerId];
            
            // Jaga agar pemain selalu 'hidup' untuk tes ini
            player.alive = true; 
            
            // Gerakkan burung ke kanan secara perlahan
            player.x += 0.5;

            // Jika keluar layar, reset posisinya
            if (player.x > 820) {
                player.x = -20;
            }
        }
        
        // Kirim state baru yang sederhana ini ke Firebase
        update(ref(database, `rooms/${this.roomId}`), { players: this.gameState.players });
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
        this.backToMenuButton.setVisible(allPlayersDead);
    }
    
    cleanup() {
        if (this.roomListener) { this.roomListener(); this.roomListener = null; }
    }
}