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
    // --- PERUBAHAN KUNCI 1: Ganti cara kita menyimpan sprite pipa ---
    private pipeSprites: Map<string, { top: Phaser.GameObjects.Image, bottom: Phaser.GameObjects.Image }> = new Map();

    private gameState: GameState | null = null;
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
            const state = snapshot.val();
            if (state) {
                if (!this.isReady) { this.isReady = true; }
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
            const pipes = this.gameState.pipes || [];

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
                 // --- PERUBAHAN KUNCI 2: Memberi ID unik saat pipa dibuat ---
                 this.gameState.pipes.push({ 
                    id: `pipe_${Date.now()}_${Math.random()}`,
                    x: 900, 
                    gapY: Math.floor(Math.random() * 300) + 150, 
                    gapHeight: 150 
                });
            }
            
            update(ref(database, `rooms/${this.roomId}/gameState`), this.gameState);

        } else {
            const me = this.gameState.players[this.meId];
            
            if (me && me.alive) {
                me.velocityY += this.GRAVITY * deltaFactor;
                me.y += me.velocityY * deltaFactor;

                if (me.y > 600 || me.y < 0) me.alive = false;
                for (const pipe of this.gameState.pipes || []) {
                    const birdHalfWidth = 16; const birdHalfHeight = 12;
                    const pipeHalfWidth = 26;
                    if (me.x + birdHalfWidth > pipe.x - pipeHalfWidth && me.x - birdHalfWidth < pipe.x + pipeHalfWidth) {
                        if (me.y - birdHalfHeight < pipe.gapY - pipe.gapHeight / 2 || me.y + birdHalfHeight > pipe.gapY + pipe.gapHeight / 2) {
                            me.alive = false; break;
                        }
                    }
                }
            }
            
            this.pipeSprites.forEach(pipePair => {
                pipePair.top.x -= this.PIPE_SPEED * deltaFactor;
                pipePair.bottom.x -= this.PIPE_SPEED * deltaFactor;
            });
        }
    }

    syncGameState(state: GameState) {
        if (!this.isReady || !state) return;

        // =====================================================================
        // PERUBAHAN KUNCI 3: Logika sinkronisasi pipa ditulis ulang total
        // =====================================================================
        const incomingPipeIds = new Set((state.pipes || []).map(p => p.id));

        // Hapus sprite pipa yang sudah tidak ada di data Host
        this.pipeSprites.forEach((pipePair, pipeId) => {
            if (!incomingPipeIds.has(pipeId)) {
                pipePair.top.destroy();
                pipePair.bottom.destroy();
                this.pipeSprites.delete(pipeId);
            }
        });

        // Tambah atau update sprite pipa yang ada di data Host
        (state.pipes || []).forEach(pipeData => {
            let pipePair = this.pipeSprites.get(pipeData.id);
            if (!pipePair) {
                // Pipa ini baru, buat spritenya
                const gapTop = pipeData.gapY - pipeData.gapHeight / 2;
                const gapBottom = pipeData.gapY + pipeData.gapHeight / 2;
                const topPipe = this.add.image(pipeData.x, gapTop, "pipeTop").setOrigin(0.5, 1);
                const bottomPipe = this.add.image(pipeData.x, gapBottom, "pipeBottom").setOrigin(0.5, 0);
                
                this.pipeSprites.set(pipeData.id, { top: topPipe, bottom: bottomPipe });
            } else {
                // Pipa ini sudah ada, lakukan koreksi posisi dengan halus
                this.tweens.add({ targets: pipePair.top, x: pipeData.x, duration: 100, ease: 'Linear' });
                this.tweens.add({ targets: pipePair.bottom, x: pipeData.x, duration: 100, ease: 'Linear' });
            }
        });


        if (state.players) {
            Object.values(state.players).forEach(playerFromServer => {
                let bird = this.birds.get(playerFromServer.id);
                if (!bird) {
                    bird = this.add.sprite(playerFromServer.x, playerFromServer.y, "bird").setOrigin(0.5);
                    this.birds.set(playerFromServer.id, bird);
                }
                
                if (playerFromServer.id === this.meId && !this.isHost) {
                    const myLocalData = this.gameState!.players[this.meId];
                    if(myLocalData) {
                        myLocalData.alive = playerFromServer.alive;
                        bird.setPosition(myLocalData.x, myLocalData.y);
                    }
                } else {
                    bird.setPosition(playerFromServer.x, playerFromServer.y);
                }

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
                const newGameState: GameState = { 
                    players: playersToReset, 
                    pipes: [{ 
                        id: `pipe_${Date.now()}`,
                        x: 500, 
                        gapY: 300, 
                        gapHeight: 150 
                    }]
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