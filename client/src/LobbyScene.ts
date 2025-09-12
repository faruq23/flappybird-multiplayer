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
    private roomInput!: HTMLInputElement;
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
        // Use same domain for both frontend and backend since they're combined
        const serverUrl = (import.meta as any).env?.VITE_SERVER_URL || window.location.origin;
        this.socket = io(serverUrl, { transports: ["websocket"] });

        this.add.text(this.cameras.main.width / 2, 50, 'Multiplayer Lobby', { fontSize: '32px', color: '#fff' }).setOrigin(0.5);

        this.roomInput = document.createElement('input');
        this.roomInput.type = 'text';
        this.roomInput.placeholder = 'Enter Room ID';
        this.roomInput.style.position = 'absolute';
        this.roomInput.style.top = '100px';
        this.roomInput.style.left = `${this.cameras.main.width / 2 - 100}px`;
        this.roomInput.style.width = '200px';
        this.roomInput.style.padding = '10px';
        this.roomInput.style.fontSize = '16px';
        document.body.appendChild(this.roomInput);

        this.createRoomButton = this.add.text(this.cameras.main.width / 2, 180, 'Create Room', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive();

        this.createRoomButton.on('pointerdown', () => {
            this.socket.emit('createRoom');
        });

        this.joinRoomButton = this.add.text(this.cameras.main.width / 2, 240, 'Join Room', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive();

        this.joinRoomButton.on('pointerdown', () => {
            const roomId = this.roomInput.value.trim();
            if (roomId) {
                this.socket.emit('joinRoom', roomId);
            }
        });

        const backButton = this.add.text(10, 10, '< Back to Home', { fontSize: '18px', color: '#fff' })
            .setInteractive();
        
        // Tombol ini sudah benar, memanggil cleanup(true) untuk disconnect
        backButton.on('pointerdown', () => {
            this.cleanup(true);
            this.scene.start('MainMenuScene');
        });

        this.roomText = this.add.text(this.cameras.main.width / 2, 150, '', { fontSize: '28px', color: '#ffff00', align: 'center' }).setOrigin(0.5);
        this.playerListText = this.add.text(this.cameras.main.width / 2, 300, '', { fontSize: '20px', color: '#fff', align: 'center' }).setOrigin(0.5);

        this.startButton = this.add.text(this.cameras.main.width / 2, 450, 'Start Game', { fontSize: '24px', color: '#fff', backgroundColor: '#28a745', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive()
            .setVisible(false);

        this.startButton.on('pointerdown', () => {
            this.socket.emit('startGame', this.currentRoomId);
        });

        // Server event listeners
        this.socket.on('roomCreated', (roomId: string) => {
            this.currentRoomId = roomId;
            this.showRoomUI(roomId);
        });

        this.socket.on('init', (state: GameState) => {
            if (this.currentRoomId) { // This is the host
                Object.values(state.players).forEach(p => this.players.set(p.id, p));
            } else { // This is a joining player
                this.currentRoomId = this.roomInput.value.trim();
                Object.values(state.players).forEach(p => this.players.set(p.id, p));
                this.showRoomUI(this.currentRoomId, false);
            }
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

        // Event ini sudah benar, memanggil cleanup() (default false) agar socket tidak disconnect
        this.socket.on('gameStarted', () => {
            this.cleanup();
            this.scene.start('MultiplayerPlayScene', { socket: this.socket });
        });

        this.socket.on('roomNotFound', () => {
            const errorText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height - 50, 'Room not found!', { fontSize: '20px', color: '#ff0000' }).setOrigin(0.5);
            this.time.delayedCall(3000, () => errorText.destroy());
        });
    }

    showRoomUI(roomId: string, isHost: boolean = true) {
        this.roomInput.style.display = 'none';
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

    cleanup(disconnectSocket: boolean = false) {
        if (this.roomInput && this.roomInput.parentNode) {
            this.roomInput.parentNode.removeChild(this.roomInput);
        }
        if (disconnectSocket && this.socket.active) {
            this.socket.disconnect();
        }
    }
}

export default LobbyScene;