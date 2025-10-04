// src/MultiplayerPlayScene.ts

import Phaser from "phaser";
import { GameState, Player } from "@shared/types"; 
import { database } from "./firebase";
import { ref, onValue, update, Unsubscribe, set, get } from "firebase/database";

export default class MultiplayerPlayScene extends Phaser.Scene {
    private roomId!: string;
    private meId!: string;
    private isHost: boolean = false;
    
    private roomListener: Unsubscribe | null = null;
    private inputsListener: Unsubscribe | null = null;

    private birds: Map<string, Phaser.GameObjects.Sprite> = new Map();
    private gameState: GameState | null = null;
    private isReady: boolean = false;
    
    private backToMenuButton!: Phaser.GameObjects.Text;
    private gameOverText!: Phaser.GameObjects.Text;
    private restartButton!: Phaser.GameObjects.Text;

    private readonly GRAVITY = 0.4;
    private readonly FLAP_VELOCITY = -8;
    private readonly PIPE_SPEED = 2;

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
        if (!this.anims.exists('fly')) {
            this.anims.create({ key: "fly", frames: this.anims.generateFrameNumbers("bird", { start: 0, end: 2}), frameRate: 10, repeat: -1 });
        }
        
        const gameStateRef = ref(database, `rooms/${this.roomId}/gameState`);
        
        // =====================================================================
        // PERBAIKAN KUNCI 1: Menghapus logika yang salah saat menerima state
        // =====================================================================
        this.roomListener = onValue(gameStateRef, (snapshot) => {
            const state = snapshot.val();
            if (state) {
                if (!this.isReady) { this.isReady = true; }
                
                // Cukup terima state dari server. Rekonsiliasi akan terjadi di syncGameState.
                this.gameState = state;
                this.syncGameState(this.gameState);
            }
        });

        if (this.isHost) {
            const inputsRef = ref(database, `rooms/${this.roomId}/inputs`);
            this.inputsListener = onValue(inputsRef, (snapshot) => {
                const inputs = snapshot.val();
                if (inputs && this.gameState && this.gameState.players) {
                    for (const playerId in inputs) {
                        if (inputs[playerId].flap && this.gameState.players[playerId]) {
                            this.gameState.players[playerId].flap = true;
                        }
                    }
                    set(inputsRef, null);
                }
            });
        }
        
        this.input.keyboard?.on("keydown-SPACE", () => this.handleInput());
        this.input.on("pointerdown", () => this.handleInput());
        
        this.add.text(10, 10, "Flappy Multiplayer — click or SPACE to flap", { fontSize: "14px", color: "#000" });
        this.gameOverText = this.add.text(400, 250, "Game Over!", { fontSize: "48px", color: "#ff0000", align: "center" }).setOrigin(0.5).setDepth(1).setVisible(false);
        this.backToMenuButton = this.add.text(400, 350, "Back to Menu", { fontSize: "24px", color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive().setVisible(false);
        this.restartButton = this.add.text(400, 300, "Restart Game", { fontSize: "24px", color: '#fff', backgroundColor: '#28a745', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive().setVisible(false);
        
        this.backToMenuButton.on('pointerdown', () => { this.cleanup(); this.scene.start('LobbyScene'); });
        if (this.isHost) { this.restartButton.on('pointerdown', () => this.restartGame()); }
    }

    handleInput() {
        if (this.isReady && this.gameState?.players?.[this.meId]?.alive) {
            const inputRef = ref(database, `rooms/${this.roomId}/inputs/${this.meId}`);
            set(inputRef, { flap: true });

            const me = this.gameState.players[this.meId];
            if (me) {
                me.velocityY = this.FLAP_VELOCITY;
            }
        }
    }
    
    update(time: number, delta: number) {
        if (!this.isReady || !this.gameState || !this.gameState.players) return;

        const deltaFactor = delta / 16.66;
        
        if (this.isHost) {
            const players = this.gameState.players;
            const pipes = this.gameState.pipes;

            for (const playerId in players) {
                const player = players[playerId];
                if (!player.alive) continue;

                if (player.flap) {
                    player.velocityY = this.FLAP_VELOCITY;
                    player.flap = false; 
                }
                player.velocityY += this.GRAVITY * deltaFactor;
                player.y += player.velocityY * deltaFactor;

                if (player.y > 600 || player.y < 0) player.alive = false;

                for (const pipe of pipes) {
                    const birdHalfWidth = 16; const birdHalfHeight = 12;
                    const pipeHalfWidth = 26;
                    if (player.x + birdHalfWidth > pipe.x - pipeHalfWidth && player.x - birdHalfWidth < pipe.x + pipeHalfWidth) {
                        if (player.y - birdHalfHeight < pipe.gapY - pipe.gapHeight / 2 || player.y + birdHalfHeight > pipe.gapY + pipe.gapHeight / 2) {
                            player.alive = false; break;
                        }
                    }
                }
            }

            let lastPipe = pipes[pipes.length - 1];
            for (const pipe of pipes) { pipe.x -= this.PIPE_SPEED * deltaFactor; }
            this.gameState.pipes = pipes.filter(p => p.x > -50);
            if (!lastPipe || lastPipe.x < 600) {
                 this.gameState.pipes.push({ x: 900, gapY: Math.floor(Math.random() * 300) + 150, gapHeight: 150 });
            }
            
            update(ref(database, `rooms/${this.roomId}/gameState`), this.gameState);

        } else {
            // Logika prediksi LOKAL untuk CLIENT
            const me = this.gameState.players[this.meId];
            
            if (me && me.alive) {
                me.velocityY += this.GRAVITY * deltaFactor;
                me.y += me.velocityY * deltaFactor;

                if (me.y > 600 || me.y < 0) me.alive = false;
                for (const pipe of this.gameState.pipes) {
                    const birdHalfWidth = 16; const birdHalfHeight = 12;
                    const pipeHalfWidth = 26;
                    if (me.x + birdHalfWidth > pipe.x - pipeHalfWidth && me.x - birdHalfWidth < pipe.x + pipeHalfWidth) {
                        if (me.y - birdHalfHeight < pipe.gapY - pipe.gapHeight / 2 || me.y + birdHalfHeight > pipe.gapY + pipe.gapHeight / 2) {
                            me.alive = false; break;
                        }
                    }
                }
            }
        }
    }

    syncGameState(state: GameState) {
        if (!this.isReady || !state) return;

        (this.children.list.filter(c => (c as any).isPipe) as Phaser.GameObjects.Image[]).forEach(c => c.destroy());
        (state.pipes || []).forEach(p => {
            const gapTop = p.gapY - p.gapHeight / 2; const gapBottom = p.gapY + p.gapHeight / 2;
            const topPipe = this.add.image(p.x, p.y, "pipeTop").setOrigin(0.5, 1).setY(gapTop);
            const bottomPipe = this.add.image(p.x, p.y, "pipeBottom").setOrigin(0.5, 0).setY(gapBottom);
            (topPipe as any).isPipe = true;
            (bottomPipe as any).isPipe = true;
        });


        if (state.players) {
            Object.values(state.players).forEach(playerFromServer => {
                let bird = this.birds.get(playerFromServer.id);
                if (!bird) {
                    bird = this.add.sprite(playerFromServer.x, playerFromServer.y, "bird").setOrigin(0.5);
                    this.birds.set(playerFromServer.id, bird);
                }
                
                // =====================================================================
                // PERBAIKAN KUNCI 2: Logika rekonsiliasi yang benar
                // =====================================================================
                if (playerFromServer.id === this.meId && !this.isHost) {
                    // Jika kita client, kita hanya mengambil status 'alive' dari server
                    // Posisi Y tetap kita kontrol secara lokal untuk kelancaran
                    const myLocalData = this.gameState!.players[this.meId];
                    if(myLocalData) {
                        myLocalData.alive = playerFromServer.alive;
                        bird.setPosition(myLocalData.x, myLocalData.y); // Gunakan posisi Y lokal
                    }
                } else {
                    // Untuk pemain lain (atau jika kita host), percaya 100% pada server
                    bird.setPosition(playerFromServer.x, playerFromServer.y);
                }

                // Update visual berdasarkan status 'alive' yang sudah disinkronkan
                const isAlive = this.gameState!.players[playerFromServer.id].alive;
                if (isAlive) {
                    bird.clearTint();
                    if (!bird.anims.isPlaying) bird.anims.play("fly", true);
                } else {
                    bird.setTint(0x888888);
                    bird.anims.stop();
                }
            });
        }
        
        const allPlayers = this.gameState!.players ? Object.values(this.gameState!.players) : [];
        const allPlayersDead = allPlayers.length > 0 && allPlayers.every(p => !p.alive);
        this.gameOverText.setVisible(allPlayersDead);
        this.backToMenuButton.setVisible(allPlayersDead);
        if (this.isHost) { this.restartButton.setVisible(allPlayersDead); }
    }
    
    private restartGame() {
        if (!this.isHost) return;
        get(ref(database, `rooms/${this.roomId}/lobbyPlayers`)).then((snapshot) => {
            if (snapshot.exists()) {
                const lobbyPlayers = snapshot.val();
                const playersToReset: Record<string, Player> = {};
                for (const playerId in lobbyPlayers) {
                    playersToReset[playerId] = {
                        ...lobbyPlayers[playerId],
                        x: 100, y: 300, velocityY: 0, score: 0,
                        alive: true, flap: false
                    };
                }
                const newGameState = { 
                    players: playersToReset, 
                    pipes: [{ x: 500, gapY: 300, gapHeight: 150 }]
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

