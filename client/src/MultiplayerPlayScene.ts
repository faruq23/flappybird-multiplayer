// src/MultiplayerPlayScene.ts

import Phaser from "phaser";
import { GameState, Player, Pipe } from "@shared/types"; 
import { database } from "./firebase";
import { ref, onValue, update, Unsubscribe, set, get } from "firebase/database";

export default class MultiplayerPlayScene extends Phaser.Scene {
    private roomId!: string;
    private meId!: string;
    private isHost: boolean = false;
    
    private roomListener: Unsubscribe | null = null;
    private inputsListener: Unsubscribe | null = null;

    private birds: Map<string, Phaser.GameObjects.Sprite> = new Map();
    private pipeSprites: Map<string, { top: Phaser.GameObjects.Image, bottom: Phaser.GameObjects.Image }> = new Map();
    private localGameState: GameState | null = null;
    private isReady: boolean = false;
    
    private backToMenuButton!: Phaser.GameObjects.Text;
    private gameOverText!: Phaser.GameObjects.Text;
    private restartButton!: Phaser.GameObjects.Text;

    private readonly GRAVITY = 0.3;
    private readonly FLAP_VELOCITY = -7;
    private readonly PIPE_SPEED = 1.8;

    constructor() { super({ key: "MultiplayerPlayScene" }); }

    init(data: { roomId: string, playerId: string, isHost: boolean }) {
        this.roomId = data.roomId;
        this.meId = data.playerId;
        this.isHost = data.isHost;
        this.isReady = false;
        this.birds.clear();
        this.pipeSprites.clear();
    }

    preload() {
        this.load.spritesheet("bird","/Bird.png", { frameWidth: 32, frameHeight: 24 });
        this.load.image("pipeBottom", "/Pipe.png");
        this.load.image("pipeTop", "/InvertPipe.png");
    }

    create() {
        if (!this.anims.exists('fly')) {
            this.anims.create({ key: "fly", frames: this.anims.generateFrameNumbers("bird", { start: 0, end: 2}), frameRate: 10, repeat: -1 });
        }
        
        const gameStateRef = ref(database, `rooms/${this.roomId}/gameState`);
        this.roomListener = onValue(gameStateRef, (snapshot) => {
            const serverState = snapshot.val();
            if (serverState) {
                if (!this.isReady) { 
                    this.isReady = true; 
                    this.localGameState = JSON.parse(JSON.stringify(serverState)); // Salinan pertama
                }
                this.syncFromServer(serverState);
            }
        });

        if (this.isHost) {
            const inputsRef = ref(database, `rooms/${this.roomId}/inputs`);
            this.inputsListener = onValue(inputsRef, (snapshot) => {
                const inputs = snapshot.val();
                if (inputs && this.localGameState && this.localGameState.players) {
                    for (const playerId in inputs) {
                        if (inputs[playerId].flap && this.localGameState.players[playerId]) {
                            this.localGameState.players[playerId].flap = true;
                        }
                    }
                    set(inputsRef, null);
                }
            });
        }
        
        this.input.keyboard?.on("keydown-SPACE", () => this.handleInput());
        this.input.on("pointerdown", () => this.handleInput());
        
        this.add.text(10, 10, "Flappy Multiplayer", { fontSize: "14px", color: "#000" });
        this.gameOverText = this.add.text(400, 250, "Game Over!", { fontSize: "48px", color: "#ff0000", align: "center" }).setOrigin(0.5).setDepth(1).setVisible(false);
        this.backToMenuButton = this.add.text(400, 350, "Back to Menu", { fontSize: "24px", color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive().setVisible(false);
        this.restartButton = this.add.text(400, 300, "Restart Game", { fontSize: "24px", color: '#fff', backgroundColor: '#28a745', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive().setVisible(false);
        
        this.backToMenuButton.on('pointerdown', () => { this.cleanup(); this.scene.start('LobbyScene'); });
        if (this.isHost) { this.restartButton.on('pointerdown', () => this.restartGame()); }
    }

    handleInput() {
        if (this.isReady && this.localGameState?.players?.[this.meId]?.alive) {
            const inputRef = ref(database, `rooms/${this.roomId}/inputs/${this.meId}`);
            set(inputRef, { flap: true });

            // Prediksi lokal tetap berjalan
            const me = this.localGameState.players[this.meId];
            if (me) {
                me.velocityY = this.FLAP_VELOCITY;
            }
        }
    }
    
    update(time: number, delta: number) {
        if (!this.isReady || !this.localGameState) return;

        const deltaFactor = delta / 16.66;
        const players = this.localGameState.players;
        const pipes = this.localGameState.pipes || [];

        // SEMUA client (Host dan Join) menjalankan loop simulasi ini
        for (const playerId in players) {
            const player = players[playerId];
            if (!player.alive) continue;

            // Hanya Host yang memproses 'flap' dari data. Client memprosesnya di handleInput.
            if (this.isHost && player.flap) {
                player.velocityY = this.FLAP_VELOCITY;
                player.flap = false; 
            }
            
            // Client hanya memprediksi dirinya sendiri
            if (playerId === this.meId || this.isHost) {
                player.velocityY += this.GRAVITY * deltaFactor;
                player.y += player.velocityY * deltaFactor;
            }

            // Hanya Host yang berhak mematikan pemain
            if (this.isHost) {
                if (player.y > 600 || player.y < 0) player.alive = false;
                for (const pipe of pipes) {
                    const birdHalfWidth = 16; const birdHalfHeight = 12; const pipeHalfWidth = 26;
                    if (player.x + birdHalfWidth > pipe.x - pipeHalfWidth && player.x - birdHalfWidth < pipe.x + pipeHalfWidth) {
                        if (player.y - birdHalfHeight < pipe.gapY - pipe.gapHeight / 2 || player.y + birdHalfHeight > pipe.gapY + pipe.gapHeight / 2) {
                            player.alive = false; break;
                        }
                    }
                }
            }
        }

        // SEMUA client menggerakkan pipa
        for (const pipe of pipes) { pipe.x -= this.PIPE_SPEED * deltaFactor; }
        
        // Hanya Host yang membuat dan menghapus data pipa
        if (this.isHost) {
            let lastPipe = pipes[pipes.length - 1];
            this.localGameState.pipes = pipes.filter(p => p.x > -50);
            if (!lastPipe || lastPipe.x < 600) {
                 this.localGameState.pipes.push({ 
                    id: `pipe_${Date.now()}_${Math.random()}`,
                    x: 900, gapY: Math.floor(Math.random() * 300) + 150, gapHeight: 150 
                });
            }
            update(ref(database, `rooms/${this.roomId}/gameState`), this.localGameState);
        }

        // Update visual berdasarkan state lokal yang sudah diprediksi
        this.updateSprites();
    }

    updateSprites() {
        if (!this.localGameState) return;

        Object.values(this.localGameState.players).forEach(player => {
            const bird = this.birds.get(player.id);
            if (bird) {
                bird.setPosition(player.x, player.y);
                if (player.alive) {
                    bird.clearTint();
                    if (!bird.anims.isPlaying) bird.anims.play("fly", true);
                } else {
                    bird.setTint(0x888888);
                    bird.anims.stop();
                }
            }
        });

        (this.localGameState.pipes || []).forEach(pipeData => {
            const pipePair = this.pipeSprites.get(pipeData.id);
            if (pipePair) {
                pipePair.top.x = pipeData.x;
                pipePair.bottom.x = pipeData.x;
            }
        });
        
        const allPlayers = Object.values(this.localGameState.players);
        const allPlayersDead = allPlayers.length > 0 && allPlayers.every(p => !p.alive);
        this.gameOverText.setVisible(allPlayersDead);
        this.backToMenuButton.setVisible(allPlayersDead);
        if (this.isHost) { this.restartButton.setVisible(allPlayersDead); }
    }


    syncFromServer(serverState: GameState) {
        if (!this.localGameState) return;

        const incomingPipeIds = new Set((serverState.pipes || []).map(p => p.id));
        this.pipeSprites.forEach((pipePair, pipeId) => {
            if (!incomingPipeIds.has(pipeId)) {
                pipePair.top.destroy(); pipePair.bottom.destroy(); this.pipeSprites.delete(pipeId);
            }
        });
        (serverState.pipes || []).forEach(pipeData => {
            if (!this.pipeSprites.has(pipeData.id)) {
                const gapTop = pipeData.gapY - pipeData.gapHeight / 2;
                const gapBottom = pipeData.gapY + pipeData.gapHeight / 2;
                const topPipe = this.add.image(pipeData.x, gapTop, "pipeTop").setOrigin(0.5, 1);
                const bottomPipe = this.add.image(pipeData.x, gapBottom, "pipeBottom").setOrigin(0.5, 0);
                this.pipeSprites.set(pipeData.id, { top: topPipe, bottom: bottomPipe });
            }
        });

        Object.values(serverState.players).forEach(serverPlayer => {
            if (!this.birds.has(serverPlayer.id)) {
                const bird = this.add.sprite(serverPlayer.x, serverPlayer.y, "bird").setOrigin(0.5);
                this.birds.set(serverPlayer.id, bird);
            }
            
            // Rekonsiliasi: Salin data dari server ke state lokal
            if (this.localGameState!.players[serverPlayer.id]) {
                if (serverPlayer.id !== this.meId || this.isHost) {
                    this.localGameState!.players[serverPlayer.id].x = serverPlayer.x;
                    this.localGameState!.players[serverPlayer.id].y = serverPlayer.y;
                }
                this.localGameState!.players[serverPlayer.id].alive = serverPlayer.alive;
            }
        });
    }
    
    private restartGame() {
        if (!this.isHost) return;
        get(ref(database, `rooms/${this.roomId}/lobbyPlayers`)).then((snapshot) => {
            if (snapshot.exists()) {
                const lobbyPlayers = snapshot.val();
                const playersToReset: Record<string, Player> = {};
                for (const playerId in lobbyPlayers) {
                    playersToReset[playerId] = { ...lobbyPlayers[playerId], x: 100, y: 300, velocityY: 0, score: 0, alive: true, flap: false };
                }
                const newGameState: GameState = { 
                    players: playersToReset, 
                    pipes: [{ id: `pipe_${Date.now()}`, x: 500, gapY: 300, gapHeight: 150 }]
                };
                set(ref(database, `rooms/${this.roomId}/gameState`), newGameState);
            }
        });
    }
    
    cleanup() {
        if (this.roomListener) { this.roomListener(); this.roomListener = null; }
        if (this.inputsListener) { this.inputsListener(); this.inputsListener = null; }
    }
}

