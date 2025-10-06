// src/MultiplayerPlayScene.ts

import Phaser from "phaser";
import { GameState, Player, Pipe } from "@shared/types"; 
import { database } from "./firebase";
import { ref, onValue, Unsubscribe, set, get } from "firebase/database";

export default class MultiplayerPlayScene extends Phaser.Scene {
    private roomId!: string;
    private meId!: string;
    private isHost: boolean = false;
    
    private roomListener: Unsubscribe | null = null;
    private inputsListener: Unsubscribe | null = null;

    private birds: Map<string, Phaser.GameObjects.Sprite> = new Map();
    private playerLabels: Map<string, Phaser.GameObjects.Text> = new Map();
    private pipeSprites: Map<string, { top: Phaser.GameObjects.Image, bottom: Phaser.GameObjects.Image }> = new Map();
    
    private backToMenuButton!: Phaser.GameObjects.Text;
    private gameOverText!: Phaser.GameObjects.Text;
    private restartButton!: Phaser.GameObjects.Text;
    private background!: Phaser.GameObjects.TileSprite;
    
    private gameState: GameState | null = null;
    private gameStarted: boolean = false;
    private gameStartTime: number = 0;

    private readonly GRAVITY = 0.3;
    private readonly FLAP_VELOCITY = -7;
    private readonly PIPE_SPEED = 1.8;

    constructor() { super({ key: "MultiplayerPlayScene" }); }

    init() {
        const params = new URLSearchParams(window.location.search);
        this.roomId = params.get('roomId') || '';
        this.meId = params.get('playerId') || '';
        this.isHost = params.get('isHost') === 'true';
        this.birds.clear();
        this.playerLabels.clear();
        this.pipeSprites.clear();
    }

    preload() {
        this.load.image("background", "Bg.png"); 
        this.load.spritesheet("bird","/Bird.png", { frameWidth: 32, frameHeight: 24 });
        this.load.spritesheet("bird2","/BirdB.png", { frameWidth: 32, frameHeight: 24 });
        this.load.image("pipeBottom", "/Pipe.png");
        this.load.image("pipeTop", "/InvertPipe.png");
    }

    create() {
        const { width, height } = this.scale;
        this.background = this.add.tileSprite(0, 0, width, height, "background");
        this.background.setOrigin(0, 0);

        if (!this.anims.exists('fly')) {
            this.anims.create({ key: "fly", frames: this.anims.generateFrameNumbers("bird", { start: 0, end: 2}), frameRate: 10, repeat: -1 });
        }
        if (!this.anims.exists('fly2')) {
            this.anims.create({ key: "fly2", frames: this.anims.generateFrameNumbers("bird2", { start: 0, end: 2}), frameRate: 10, repeat: -1 });
        }
        
        const gameStateRef = ref(database, `rooms/${this.roomId}/gameState`);
        this.roomListener = onValue(gameStateRef, (snapshot) => {
            const serverState = snapshot.val();
            if (serverState) {
                this.gameState = serverState;
                this.syncFromServer(serverState);
            }
        });

        if (this.isHost) {
            const inputsRef = ref(database, `rooms/${this.roomId}/inputs`);
            this.inputsListener = onValue(inputsRef, (snapshot) => {
                const inputs = snapshot.val();
                if (inputs) {
                    const gameStateRef = ref(database, `rooms/${this.roomId}/gameState`);
                    get(gameStateRef).then((currentSnapshot) => {
                        const gameState = currentSnapshot.val();
                        if (gameState && gameState.players) {
                            for (const playerId in inputs) {
                                if (inputs[playerId].flap && gameState.players[playerId]) {
                                    gameState.players[playerId].flap = true;
                                }
                            }
                            set(gameStateRef, gameState);
                        }
                    });
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
        
        this.backToMenuButton.on('pointerdown', () => { this.cleanup(); window.location.href = '/lobby'; });
        if (this.isHost) {
            this.restartButton.on('pointerdown', () => this.restartGame());
            this.gameStartTime = this.time.now;
            this.time.delayedCall(5000, this.startGame, [], this);
        }
    }

    startGame() {
        this.gameStarted = true;
    }

    handleInput() {
        const inputRef = ref(database, `rooms/${this.roomId}/inputs/${this.meId}`);
        set(inputRef, { flap: true });
    }
    
    update(time: number, delta: number) {
        this.background.tilePositionX += 0.5;

        if (!this.isHost || !this.gameState) return;

        const gameStateRef = ref(database, `rooms/${this.roomId}/gameState`);
        const gameState = this.gameState;
        const players = gameState.players;
        const pipes = gameState.pipes || [];
        const deltaFactor = delta / 16.66;

        for (const pipe of pipes) { pipe.x -= this.PIPE_SPEED * deltaFactor; }
        gameState.pipes = pipes.filter((p: any) => p.x > -50);

        if (this.time.now > this.gameStartTime + 4000) {
            let lastPipe = gameState.pipes[gameState.pipes.length - 1];
            if (!lastPipe || lastPipe.x < 600) {
                gameState.pipes.push({ 
                    id: `pipe_${Date.now()}_${Math.random()}`,
                    x: 900, gapY: Math.floor(Math.random() * 300) + 150, gapHeight: 150 
                });
            }
        }

        const allPlayers = Object.values(players);
        const allPlayersDead = allPlayers.length > 0 && allPlayers.every((p: any) => !p.alive);

        if (allPlayersDead) {
            set(gameStateRef, gameState);
            return;
        }

        if (this.gameStarted) {
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
                    const birdHalfWidth = 16; const birdHalfHeight = 12; const pipeHalfWidth = 26;
                    if (player.x + birdHalfWidth > pipe.x - pipeHalfWidth && player.x - birdHalfWidth < pipe.x + pipeHalfWidth) {
                        if (player.y - birdHalfHeight < pipe.gapY - pipe.gapHeight / 2 || player.y + birdHalfHeight > pipe.gapY + pipe.gapHeight / 2) {
                            player.alive = false; break;
                        }
                    }
                }
            }
        }
        set(gameStateRef, gameState);
    }

    syncFromServer(serverState: GameState) {
        const incomingPipeIds = new Set((serverState.pipes || []).map(p => p.id));
        this.pipeSprites.forEach((pipePair, pipeId) => {
            if (!incomingPipeIds.has(pipeId)) {
                pipePair.top.destroy(); pipePair.bottom.destroy(); this.pipeSprites.delete(pipeId);
            }
        });
        (serverState.pipes || []).forEach(pipeData => {
            let pipePair = this.pipeSprites.get(pipeData.id);
            if (!pipePair) {
                const gapTop = pipeData.gapY - pipeData.gapHeight / 2;
                const gapBottom = pipeData.gapY + pipeData.gapHeight / 2;
                const topPipe = this.add.image(pipeData.x, gapTop, "pipeTop").setOrigin(0.5, 1);
                const bottomPipe = this.add.image(pipeData.x, gapBottom, "pipeBottom").setOrigin(0.5, 0);
                this.pipeSprites.set(pipeData.id, { top: topPipe, bottom: bottomPipe });
            } else {
                pipePair.top.x = pipeData.x;
                pipePair.bottom.x = pipeData.x;
                pipePair.top.y = pipeData.gapY - pipeData.gapHeight / 2;
                pipePair.bottom.y = pipeData.gapY + pipeData.gapHeight / 2;
            }
        });

        const incomingPlayerIds = new Set(Object.keys(serverState.players));
        this.birds.forEach((bird, playerId) => {
            if(!incomingPlayerIds.has(playerId)) {
                bird.destroy();
                this.birds.delete(playerId);
                const label = this.playerLabels.get(playerId);
                if (label) {
                    label.destroy();
                    this.playerLabels.delete(playerId);
                }
            }
        });

        Object.values(serverState.players).forEach(serverPlayer => {
            let bird = this.birds.get(serverPlayer.id);
            let label = this.playerLabels.get(serverPlayer.id);

            if (!bird) {
                const birdSprite = serverPlayer.playerNumber === 2 ? 'bird2' : 'bird';
                bird = this.add.sprite(serverPlayer.x, serverPlayer.y, birdSprite).setOrigin(0.5);
                this.birds.set(serverPlayer.id, bird);

                label = this.add.text(serverPlayer.x, serverPlayer.y - 20, `P${serverPlayer.playerNumber}`, { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5);
                this.playerLabels.set(serverPlayer.id, label);
            }
            
            bird.setPosition(serverPlayer.x, serverPlayer.y);
            if (label) {
                label.setPosition(serverPlayer.x, serverPlayer.y - 20);
            }

            if (serverPlayer.alive) {
                bird.alpha = 1;
                if (label) label.alpha = 1;
                const animToPlay = serverPlayer.playerNumber === 2 ? 'fly2' : 'fly';
                if (!bird.anims.isPlaying || bird.anims.currentAnim?.key !== animToPlay) {
                    bird.anims.play(animToPlay, true);
                }
            } else {
                bird.alpha = 0.5;
                if (label) label.alpha = 0.5;
                bird.anims.stop();
            }
        });
        
        const allPlayers = Object.values(serverState.players);
        const allPlayersDead = allPlayers.length > 0 && allPlayers.every(p => !p.alive);
        this.gameOverText.setVisible(allPlayersDead);
        this.backToMenuButton.setVisible(allPlayersDead);
        if (this.isHost) { this.restartButton.setVisible(allPlayersDead); }
    }
    
    private restartGame() {
        if (!this.isHost || !this.gameState) return;

        this.gameStarted = false;
        this.gameStartTime = this.time.now;
        this.time.delayedCall(5000, this.startGame, [], this);

        const playersToReset: Record<string, Player> = {};
        for (const playerId in this.gameState.players) {
            const player = this.gameState.players[playerId];
            playersToReset[playerId] = { ...player, x: 100, y: 300, velocityY: 0, score: 0, alive: true, flap: false };
        }

        const newGameState: GameState = {
            ...this.gameState,
            players: playersToReset,
            pipes: []
        };

        set(ref(database, `rooms/${this.roomId}/inputs`), null);
        set(ref(database, `rooms/${this.roomId}/gameState`), newGameState);
    }
    
    cleanup() {
        if (this.roomListener) { this.roomListener(); this.roomListener = null; }
        if (this.inputsListener) { this.inputsListener(); this.inputsListener = null; }
        this.playerLabels.forEach(label => label.destroy());
        this.playerLabels.clear();
    }
}
```eof