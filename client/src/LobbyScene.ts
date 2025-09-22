import Phaser from 'phaser';
import { io, Socket } from "socket.io-client";

// Define types to match server
type Player = {
    id: string;
    name: string;
};

type GameState = {
    players: Record<string, Player>;
};

class LobbyScene extends Phaser.Scene {
    private socket!: Socket;
    private roomInput!: Phaser.GameObjects.DOMElement;
    private roomText!: Phaser.GameObjects.Text;
    private startButton!: Phaser.GameObjects.Text;
    private createRoomButton!: Phaser.GameObjects.Text;
    private joinRoomButton!: Phaser.GameObjects.Text;
    private currentRoomId: string = '';
    private players: Map<string, Player> = new Map();
    private playerListText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'LobbyScene' });
    }

    create() {
        const serverUrl = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:5000';
        this.socket = io(serverUrl);

        const centerX = this.cameras.main.width / 2;

        this.add.text(centerX, 80, 'Multiplayer Lobby', { fontSize: '32px', color: '#fff' }).setOrigin(0.5);

        this.createRoomButton = this.add.text(centerX, 180, 'Create Room', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive();

        // Menggunakan Phaser.add.dom() untuk posisi yang sempurna
        this.roomInput = this.add.dom(centerX, 250).createFromHTML(
            `<input id="room-id-input" type="text" placeholder="Enter Room ID" style="width: 200px; padding: 10px; font-size: 16px; border: none; border-radius: 5px;">`
        ).setOrigin(0.5);

        this.joinRoomButton = this.add.text(centerX, 310, 'Join Room', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive();

        const backButton = this.add.text(20, 20, '< Back to Home', { fontSize: '18px', color: '#fff' }).setInteractive();

        this.roomText = this.add.text(centerX, 180, '', { fontSize: '28px', color: '#ffff00', align: 'center' }).setOrigin(0.5);
        
        this.playerListText = this.add.text(centerX, 240, '', { fontSize: '20px', color: '#fff', align: 'center', lineSpacing: 10 }).setOrigin(0.5, 0);

        this.startButton = this.add.text(centerX, this.cameras.main.height - 80, 'Start Game', { fontSize: '24px', color: '#fff', backgroundColor: '#28a745', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive()
            .setVisible(false);

        // --- Event Listeners ---
        this.createRoomButton.on('pointerdown', () => this.socket.emit('createRoom'));

        this.joinRoomButton.on('pointerdown', () => {
            const inputElement = document.getElementById('room-id-input') as HTMLInputElement;
            if (inputElement) {
                const roomId = inputElement.value.trim();
                if (roomId) {
                    this.socket.emit('joinRoom', roomId);
                    inputElement.value = '';
                }
            }
        });

        backButton.on('pointerdown', () => {
            if (this.socket.active) {
                this.socket.disconnect();
            }
            this.scene.start('MainMenuScene');
        });

        this.startButton.on('pointerdown', () => this.socket.emit('startGame', this.currentRoomId));

        // --- Server Event Listeners ---
        this.socket.on('init', (state: GameState) => {
            this.currentRoomId = state.roomId; // Set roomId from the definitive state
            this.players.clear();
            Object.values(state.players).forEach(p => this.players.set(p.id, p));

            // Determine if the current player is the host (usually the first player in the list)
            const isHost = Array.from(this.players.values())[0].id === this.socket.id;
            
            this.showRoomUI(this.currentRoomId, isHost);
            this.updatePlayerListText();
        });

        this.socket.on('playerJoined', (player: Player) => {
            this.players.set(player.id, player);
            this.updatePlayerListText();
        });

        this.socket.on('playerLeft', (playerId: string) => {
            this.players.delete(playerId);
            this.updatePlayerListText();
        });

        this.socket.on('gameStarted', () => {
            this.scene.start('MultiplayerPlayScene', { socket: this.socket });
        });

        this.socket.on('roomNotFound', () => {
            const errorText = this.add.text(centerX, this.cameras.main.height - 50, 'Room not found!', { fontSize: '20px', color: '#ff0000' }).setOrigin(0.5);
            this.time.delayedCall(3000, () => errorText.destroy());
        });
    }

    showRoomUI(roomId: string, isHost: boolean = true) {
        this.roomInput.setVisible(false);
        this.createRoomButton.setVisible(false);
        this.joinRoomButton.setVisible(false);

        this.roomText.setText(`Room ID: ${roomId}`);
        if (isHost) {
            this.startButton.setVisible(true);
        }
    }

    updatePlayerListText() {
        const playerNames = Array.from(this.players.values()).map(p => p.name);
        this.playerListText.setText('Players in room:\n' + playerNames.join('\n'));
    }
}

export default LobbyScene;