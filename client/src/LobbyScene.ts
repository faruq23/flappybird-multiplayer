// src/LobbyScene.ts

import Phaser from 'phaser';
import { database } from './firebase';
import { ref, set, onValue, get, update, Unsubscribe, onDisconnect } from "firebase/database";
import { Player } from '@shared/types';

class LobbyScene extends Phaser.Scene {
    private roomInput!: HTMLInputElement;
    private roomText!: Phaser.GameObjects.Text;
    private startButton!: Phaser.GameObjects.Text;
    private createRoomButton!: Phaser.GameObjects.Text;
    private joinRoomButton!: Phaser.GameObjects.Text;
    private playerListText!: Phaser.GameObjects.Text;
    private currentRoomId: string = '';
    private myPlayerId: string = '';
    private players: Map<string, Player> = new Map();
    private roomListener: Unsubscribe | null = null;

    private generateShortId(length: number = 5): string {
        return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
    }

    constructor() { super({ key: 'LobbyScene' }); }

    create() {
        this.myPlayerId = `player_${Math.random().toString(36).substring(2, 9)}`;
        this.add.text(this.cameras.main.width / 2, 50, 'Multiplayer Lobby', { fontSize: '32px', color: '#fff' }).setOrigin(0.5);

        this.roomInput = document.createElement('input');
        this.roomInput.type = 'text'; this.roomInput.placeholder = 'Enter Room ID';
        this.roomInput.style.position = 'absolute'; this.roomInput.style.top = '100px';
        this.roomInput.style.left = `${this.cameras.main.width / 2 - 100}px`;
        this.roomInput.style.width = '200px'; this.roomInput.style.padding = '10px'; this.roomInput.style.fontSize = '16px';
        document.body.appendChild(this.roomInput);

        this.createRoomButton = this.add.text(this.cameras.main.width / 2, 180, 'Create Room', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive();
        
        this.createRoomButton.on('pointerdown', () => {
            const newRoomId = this.generateShortId();
            const newRoomRef = ref(database, `rooms/${newRoomId}`);
            const newPlayerLobbyData = { id: this.myPlayerId, name: `Player ${Math.floor(Math.random() * 100)}` };
            set(newRoomRef, {
                roomId: newRoomId, hostId: this.myPlayerId, status: 'lobby',
                lobbyPlayers: { [this.myPlayerId]: newPlayerLobbyData }
            }).then(() => {
                this.currentRoomId = newRoomId; this.listenToRoomUpdates(newRoomId); this.showRoomUI(newRoomId, true);
            });
        });

        this.joinRoomButton = this.add.text(this.cameras.main.width / 2, 240, 'Join Room', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive();
        
        this.joinRoomButton.on('pointerdown', async () => {
            const roomId = this.roomInput.value.trim().toUpperCase();
            if (!roomId) return;
            const roomRef = ref(database, `rooms/${roomId}`);
            if ((await get(roomRef)).exists()) {
                const playerLobbyData = { id: this.myPlayerId, name: `Player ${Math.floor(Math.random() * 100)}` };
                await set(ref(database, `rooms/${roomId}/lobbyPlayers/${this.myPlayerId}`), playerLobbyData);
                this.currentRoomId = roomId; this.listenToRoomUpdates(roomId); this.showRoomUI(roomId, false);
            }
        });

        const backButton = this.add.text(10, 10, '< Back to Home', { fontSize: '18px', color: '#fff' }).setInteractive();
        backButton.on('pointerdown', () => { this.cleanup(true); this.scene.start('MainMenuScene'); });
        
        this.roomText = this.add.text(this.cameras.main.width / 2, 150, '', { fontSize: '28px', color: '#ffff00', align: 'center' }).setOrigin(0.5);
        this.playerListText = this.add.text(this.cameras.main.width / 2, 300, '', { fontSize: '20px', color: '#fff', align: 'center' }).setOrigin(0.5);
        this.startButton = this.add.text(this.cameras.main.width / 2, 450, 'Start Game', { fontSize: '24px', color: '#fff', backgroundColor: '#28a745', padding: { x: 10, y: 5 } }).setOrigin(0.5).setInteractive().setVisible(false);

        // Host membuat GameState awal yang lengkap saat menekan start
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
                pipes: [{ x: 500, gapY: 300, gapHeight: 150 }]
            };

            update(ref(database, `rooms/${this.currentRoomId}`), { 
                status: 'playing',
                gameState: initialGameState
            });
        });
    }

    private listenToRoomUpdates(roomId: string) {
        const roomRef = ref(database, `rooms/${roomId}`);
        onDisconnect(ref(database, `rooms/${roomId}/lobbyPlayers/${this.myPlayerId}`)).remove();
        
        this.roomListener = onValue(roomRef, (snapshot) => {
            if (!snapshot.exists()) { this.cleanup(true); this.scene.start('MainMenuScene'); return; }
            
            const roomData = snapshot.val();
            const playersData = roomData.lobbyPlayers || {};
            this.players.clear();
            Object.values(playersData).forEach((p: any) => this.players.set(p.id, p));
            this.updatePlayerListText();
            
            const isHost = roomData.hostId === this.myPlayerId;

            // Hanya pindah scene jika status 'playing' DAN gameState sudah ada
            if (roomData.status === 'playing' && roomData.gameState) {
                this.cleanup(false);
                this.scene.start('MultiplayerPlayScene', { roomId: this.currentRoomId, playerId: this.myPlayerId, isHost: isHost });
            }
        });
    }

    showRoomUI(roomId: string, isHost: boolean = true) {
        if(this.roomInput) this.roomInput.style.display = 'none';
        this.createRoomButton.setVisible(false);
        this.joinRoomButton.setVisible(false);
        this.roomText.setText(`Room ID: ${roomId}`);
        if (isHost) { this.startButton.setVisible(true); }
    }

    updatePlayerListText() {
        const playerNames = Array.from(this.players.values()).map(p => p.name || `Player ${p.id.substring(0,3)}`);
        this.playerListText.setText('Players in room:\n' + playerNames.join('\n'));
    }

    cleanup(deletePlayerData: boolean) {
        if (this.roomInput?.parentNode) { this.roomInput.parentNode.removeChild(this.roomInput); }
        if (this.roomListener) { this.roomListener(); this.roomListener = null; }
        
        if (deletePlayerData && this.currentRoomId && this.myPlayerId) {
             set(ref(database, `rooms/${this.currentRoomId}/lobbyPlayers/${this.myPlayerId}`), null);
        }
    }
}
export default LobbyScene;