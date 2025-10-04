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

    // --- Konstanta fisika sekarang bisa diakses semua ---
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
        this.roomListener = onValue(gameStateRef, (snapshot) => {
            const state = snapshot.val();
            if (state) {
                if (!this.isReady) { this.isReady = true; }
                
                if (!this.isHost && this.gameState) {
                    const myPlayerData = this.gameState.players[this.meId];
                    this.gameState = state;
                    if (myPlayerData) {
                        this.gameState.players[this.meId] = myPlayerData;
                    }
                } else {
                    this.gameState = state;
                }

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
            // Logika HOST (mengontrol seluruh permainan)
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
            // Logika CLIENT (prediksi lokal untuk diri sendiri DAN pipa)
            const me = this.gameState.players[this.meId];
            const pipes = this.gameState.pipes;

            if (me && me.alive) {
                me.velocityY += this.GRAVITY * deltaFactor;
                me.y += me.velocityY * deltaFactor;

                const myBirdSprite = this.birds.get(this.meId);
                if (myBirdSprite) {
                    myBirdSprite.setPosition(me.x, me.y);
                }

                // --- PERUBAHAN KUNCI 1: Client melakukan deteksi tabrakan LOKAL ---
                if (me.y > 600 || me.y < 0) me.alive = false;
                for (const pipe of pipes) {
                    const birdHalfWidth = 16; const birdHalfHeight = 12;
                    const pipeHalfWidth = 26;
                    if (me.x + birdHalfWidth > pipe.x - pipeHalfWidth && me.x - birdHalfWidth < pipe.x + pipeHalfWidth) {
                        if (me.y - birdHalfHeight < pipe.gapY - pipe.gapHeight / 2 || me.y + birdHalfHeight > pipe.gapY + pipe.gapHeight / 2) {
                            me.alive = false; break;
                        }
                    }
                }
            }

            // --- PERUBAHAN KUNCI 2: Client juga menggerakkan pipa secara LOKAL ---
            if (pipes) {
                for (const pipe of pipes) {
                    pipe.x -= this.PIPE_SPEED * deltaFactor;
                }
            }
        }
    }

    syncGameState(state: GameState) {
        if (!this.isReady || !state) return;

        // --- PERUBAHAN KUNCI 3: Pipa sekarang juga direkonsiliasi ---
        // Client sudah menggerakkan pipa secara lokal, ini hanya untuk koreksi.
        // Kita tidak menghapus & membuat ulang semua sprite, tapi hanya memindahkan.
        const pipeSprites = this.children.list.filter(c => (c as any).isPipe) as Phaser.GameObjects.Image[];
        (state.pipes || []).forEach((pipeData, index) => {
            if (pipeSprites[index * 2] && pipeSprites[index * 2 + 1]) {
                const topPipe = pipeSprites[index * 2];
                const bottomPipe = pipeSprites[index * 2 + 1];
                // Koreksi posisi pipa dengan halus
                this.tweens.add({ targets: topPipe, x: pipeData.x, duration: 100 });
                this.tweens.add({ targets: bottomPipe, x: pipeData.x, duration: 100 });
            } else {
                 // Jika pipa belum ada, buat baru (biasanya hanya di awal)
                const gapTop = pipeData.gapY - pipeData.gapHeight / 2;
                const gapBottom = pipeData.gapY + pipeData.gapHeight / 2;
                const topPipe = this.add.image(pipeData.x, gapTop, "pipeTop").setOrigin(0.5, 1);
                const bottomPipe = this.add.image(pipeData.x, gapBottom, "pipeBottom").setOrigin(0.5, 0);
                (topPipe as any).isPipe = true;
                (bottomPipe as any).isPipe = true;
            }
        });
        
        // Hapus sprite pipa yang sudah tidak ada di state dari Host
        if(pipeSprites.length > (state.pipes || []).length * 2) {
            for(let i = (state.pipes || []).length * 2; i < pipeSprites.length; i++) {
                pipeSprites[i].destroy();
            }
        }


        if (state.players) {
            Object.values(state.players).forEach(player => {
                if (player.id === this.meId && !this.isHost) {
                    const myLocalData = this.gameState!.players[this.meId];
                    if (myLocalData) {
                       myLocalData.x = player.x;
                       // Jika host bilang kita mati, kita mati.
                       if (myLocalData.alive && !player.alive) {
                           myLocalData.alive = false;
                       }
                    }
                }

                let bird = this.birds.get(player.id);
                if (!bird) {
                    bird = this.add.sprite(player.x, player.y, "bird").setOrigin(0.5);
                    this.birds.set(player.id, bird);
                }
                
                if (player.id !== this.meId || this.isHost) {
                   // Gunakan tween untuk menghaluskan koreksi posisi pemain lain
                   this.tweens.add({ targets: bird, x: player.x, y: player.y, duration: 100 });
                }

                if (player.alive) {
                    bird.clearTint();
                    if (!bird.anims.isPlaying) bird.anims.play("fly", true);
                } else {
                    bird.setTint(0x888888);
                    bird.anims.stop();
                }
            });
        }
        
        // Logika Game Over tetap sama, tapi sekarang akan ter-trigger dengan benar di client
        const allPlayers = this.gameState!.players ? Object.values(this.gameState!.players) : [];
        const allPlayersDead = allPlayers.length > 0 && allPlayers.every(p => !p.alive);
        this.gameOverText.setVisible(allPlayersDead);
        this.backToMenuButton.setVisible(allPlayersDead);
        if (this.isHost) { this.restartButton.setVisible(allPlayersDead); }
    }
    
    private restartGame() {
        // ... (Fungsi ini tidak berubah)
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

