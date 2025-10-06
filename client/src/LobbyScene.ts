// src/LobbyScene.ts

import Phaser from 'phaser';
import { database } from './firebase';
import { ref, set, onValue, get, update, Unsubscribe, onDisconnect, OnDisconnect } from "firebase/database";
import { Player } from '@shared/types';

class LobbyScene extends Phaser.Scene {
    private roomInput!: HTMLInputElement;
    private roomText!: Phaser.GameObjects.Text;
    private startButton!: Phaser.GameObjects.Text;
    private createRoomButton!: Phaser.GameObjects.Text;
    private joinRoomButton!: Phaser.GameObjects.Text;
    private copyButton!: Phaser.GameObjects.Text;
    private playerListText!: Phaser.GameObjects.Text;
    private currentRoomId: string = '';
    private myPlayerId: string = '';
    private players: Map<string, Player> = new Map();
    private roomListener: Unsubscribe | null = null;
    // --- PERBAIKAN 1: Tambahkan properti untuk menyimpan referensi onDisconnect ---
    private onDisconnectRef: OnDisconnect | null = null;

    private generateShortId(length: number = 5): string {
        return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
    }

    constructor() { super({ key: 'LobbyScene' }); }

    create() {
        this.myPlayerId = `player_${Math.random().toString(36).substring(2, 9)}`;
        this.add.text(this.cameras.main.width / 2, 50, 'Multiplayer Lobby', { fontSize: '32px', color: '#fff' }).setOrigin(0.5);

        this.roomInput = document.createElement('input');
        this.roomInput.type = 'text';
        this.roomInput.placeholder = 'Enter Room ID';
        this.roomInput.style.position = 'absolute';
        this.roomInput.style.width = '200px';
        this.roomInput.style.padding = '10px';
        this.roomInput.style.fontSize = '16px';
        this.roomInput.id = 'room-id-input';
        document.body.appendChild(this.roomInput);

        this.repositionInput();
        this.scale.on('resize', this.repositionInput, this);

        this.createRoomButton = this.add.text(this.cameras.main.width / 2, 180, 'Create Room', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive();
        
        this.createRoomButton.on('pointerdown', () => {
            const newRoomId = this.generateShortId();
            const newRoomRef = ref(database, `rooms/${newRoomId}`);
            
            const newPlayerLobbyData = { 
                id: this.myPlayerId, 
                name: `Player 1`, 
                playerNumber: 1 
            };
            
            set(newRoomRef, {
                roomId: newRoomId, hostId: this.myPlayerId, status: 'lobby',
                lobbyPlayers: { [this.myPlayerId]: newPlayerLobbyData }
            }).then(() => {
                this.currentRoomId = newRoomId; this.listenToRoomUpdates(newRoomId); this.showRoomUI(newRoomId, true);
            });
        });

        this.joinRoomButton = this.add.text(this.cameras.main.width / 2, 310, 'Join Room', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive();
        
        this.joinRoomButton.on('pointerdown', async () => {
            const roomId = this.roomInput.value.trim().toUpperCase();
            if (!roomId) return;
            const roomRef = ref(database, `rooms/${roomId}`);
            const snapshot = await get(roomRef);
            if (snapshot.exists()) {
                const roomData = snapshot.val();
                const numPlayers = Object.keys(roomData.lobbyPlayers || {}).length;
                
                const newPlayerNumber = numPlayers + 1;
                const playerLobbyData = { 
                    id: this.myPlayerId, 
                    name: `Player ${newPlayerNumber}`, 
                    playerNumber: newPlayerNumber 
                };

                await set(ref(database, `rooms/${roomId}/lobbyPlayers/${this.myPlayerId}`), playerLobbyData);
                this.currentRoomId = roomId; this.listenToRoomUpdates(roomId); this.showRoomUI(roomId, false);
            }
        });

        const backButton = this.add.text(10, 10, '< Back to Home', { fontSize: '18px', color: '#fff' }).setInteractive();
        backButton.on('pointerdown', () => { this.cleanup(true); window.location.href = '/'; });
        
        this.roomText = this.add.text(this.cameras.main.width / 2, 150, '', { fontSize: '28px', color: '#ffff00', align: 'center' }).setOrigin(0.5);
        this.copyButton = this.add.text(this.cameras.main.width / 2 + 150, 150, 'Copy', { fontSize: '20px', color: '#000', backgroundColor: '#fff', padding: { x: 8, y: 4 } }).setOrigin(0.5).setInteractive().setVisible(false);
        this.playerListText = this.add.text(this.cameras.main.width / 2, 300, '', { fontSize: '20px', color: '#fff', align: 'center' }).setOrigin(0.5);
        this.startButton = this.add.text(this.cameras.main.width / 2, 450, 'Start Game', { fontSize: '24px', color: '#fff', backgroundColor: '#28a745', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive().setVisible(false);

        this.startButton.on('pointerdown', () => {
            if (!this.currentRoomId) return;
            
            const initialGamePlayers: Record<string, any> = {};
            this.players.forEach(player => {
                initialGamePlayers[player.id] = {
                    ...player,
                    x: 100, y: 300, velocityY: 0, score: 0,
                    alive: true, flap: false
                };
            });

            const initialGameState = {
                players: initialGamePlayers,
                pipes: []
            };

            update(ref(database, `rooms/${this.currentRoomId}`), { 
                status: 'playing',
                gameState: initialGameState
            });
        });
    }

    private listenToRoomUpdates(roomId: string) {
        const roomRef = ref(database, `rooms/${roomId}`);
        
        // --- PERBAIKAN 2: Simpan referensi onDisconnect untuk bisa dibatalkan nanti ---
        const playerRef = ref(database, `rooms/${roomId}/lobbyPlayers/${this.myPlayerId}`);
        this.onDisconnectRef = onDisconnect(playerRef);
        this.onDisconnectRef.remove();
        
        this.roomListener = onValue(roomRef, (snapshot) => {
            if (!snapshot.exists()) { this.cleanup(true); window.location.href = '/'; return; }
            
            const roomData = snapshot.val();
            const playersData = roomData.lobbyPlayers || {};
            this.players.clear();
            Object.values(playersData).forEach((p: any) => this.players.set(p.id, p));
            this.updatePlayerListText();
            
            const isHost = roomData.hostId === this.myPlayerId;

            if (roomData.status === 'playing' && roomData.gameState) {
                this.cleanup(false);
                window.location.href = `/game?roomId=${this.currentRoomId}&playerId=${this.myPlayerId}&isHost=${isHost}`;
            }
        });
    }

    showRoomUI(roomId: string, isHost: boolean = true) {
        if(this.roomInput) this.roomInput.style.display = 'none';
        this.createRoomButton.setVisible(false);
        this.joinRoomButton.setVisible(false);
        this.roomText.setText(`Room ID: ${roomId}`);

        this.copyButton.setVisible(true);
        this.copyButton.on('pointerdown', () => {
            const textArea = document.createElement("textarea");
            textArea.value = roomId;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.copyButton.setText('Copied!');
            } catch (err) {
                console.error('Fallback: Oops, unable to copy', err);
            }
            document.body.removeChild(textArea);

            this.time.delayedCall(2000, () => {
                this.copyButton.setText('Copy');
            });
        });

        if (isHost) { this.startButton.setVisible(true); }
    }

    repositionInput() {
        const canvas = this.sys.game.canvas;
        const canvasBounds = canvas.getBoundingClientRect();
        this.roomInput.style.left = `${canvasBounds.left + (canvasBounds.width / 2) - (this.roomInput.offsetWidth / 2)}px`;
        this.roomInput.style.top = `${canvasBounds.top + (canvasBounds.height * 0.4)}px`;
    }

    updatePlayerListText() {
        const playerNames = Array.from(this.players.values())
            .sort((a, b) => (a.playerNumber || 0) - (b.playerNumber || 0))
            .map(p => p.name || `Player ${p.id.substring(0,3)}`);
            
        this.playerListText.setText('Players in room:\n' + playerNames.join('\n'));
    }

    cleanup(deletePlayerData: boolean) {
        if (this.roomInput?.parentNode) { this.roomInput.parentNode.removeChild(this.roomInput); }
        if (this.roomListener) { this.roomListener(); this.roomListener = null; }
        this.scale.off('resize', this.repositionInput, this);

        // --- PERBAIKAN 3: Batalkan perintah onDisconnect sebelum berpindah halaman ---
        if (this.onDisconnectRef) {
            this.onDisconnectRef.cancel();
            this.onDisconnectRef = null;
        }
        
        if (deletePlayerData && this.currentRoomId && this.myPlayerId) {
             set(ref(database, `rooms/${this.currentRoomId}/lobbyPlayers/${this.myPlayerId}`), null);
        }
    }
}
export default LobbyScene;

