import Phaser from 'phaser';
import { io, Socket } from "socket.io-client";

class LobbyScene extends Phaser.Scene {
    private socket!: Socket;
    private roomInput!: HTMLInputElement;
    private roomText!: Phaser.GameObjects.Text;
    private startButton!: Phaser.GameObjects.Text;
    private createRoomButton!: Phaser.GameObjects.Text;
    private joinRoomButton!: Phaser.GameObjects.Text;
    private currentRoomId: string = '';

    constructor() {
        super({ key: 'LobbyScene' });
    }

    create() {
        const serverUrl = (import.meta as any).env?.VITE_SERVER_URL || "http://localhost:3000";
        this.socket = io(serverUrl, { transports: ["websocket"] });

        this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 150, 'Multiplayer Lobby', { fontSize: '32px', color: '#fff' }).setOrigin(0.5);

        this.roomInput = document.createElement('input');
        this.roomInput.type = 'text';
        this.roomInput.placeholder = 'Enter Room ID';
        this.roomInput.style.position = 'absolute';
        this.roomInput.style.top = `${this.cameras.main.height / 2 - 25}px`;
        this.roomInput.style.left = `${this.cameras.main.width / 2 - 100}px`;
        this.roomInput.style.width = '200px';
        this.roomInput.style.padding = '10px';
        this.roomInput.style.fontSize = '16px';
        document.body.appendChild(this.roomInput);

        this.createRoomButton = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 50, 'Create Room', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive();

        this.createRoomButton.on('pointerdown', () => {
            this.socket.emit('createRoom');
        });

        this.joinRoomButton = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 110, 'Join Room', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } })
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
        
        backButton.on('pointerdown', () => {
            this.cleanup();
            window.location.href = '/';
        });

        this.roomText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, '', { fontSize: '28px', color: '#ffff00', align: 'center' }).setOrigin(0.5);

        this.startButton = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 60, 'Start Game', { fontSize: '24px', color: '#fff', backgroundColor: '#28a745', padding: { x: 10, y: 5 } })
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

        this.socket.on('init', () => {
            if (this.currentRoomId) return; // This is the host, already handled by roomCreated
            this.currentRoomId = this.roomInput.value.trim();
            this.showRoomUI(this.currentRoomId, false);
            this.roomText.setText(`Joined Room: ${this.currentRoomId}\nWaiting for host...`);
        });

        this.socket.on('gameStarted', () => {
            this.cleanup();
            this.scene.start('MultiplayerPlayScene', { socket: this.socket });
        });

        this.socket.on('roomNotFound', () => {
            const errorText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height - 50, 'Room not found!', { fontSize: '20px', color: '#ff0000' }).setOrigin(0.5);
            this.time.delayedCall(3000, () => errorText.destroy());
        });

        this.events.on('shutdown', this.cleanup, this);
    }

    showRoomUI(roomId: string, isHost: boolean = true) {
        this.roomInput.style.display = 'none';
        this.createRoomButton.setVisible(false);
        this.joinRoomButton.setVisible(false);

        this.roomText.setText(`Room ID: ${roomId}\n(Share with a friend)`);
        if (isHost) {
            this.startButton.setVisible(true);
        }
    }

    cleanup() {
        if (this.roomInput && this.roomInput.parentNode) {
            this.roomInput.parentNode.removeChild(this.roomInput);
        }
        if (this.socket.active && !this.scene.isSleeping('MultiplayerPlayScene')) {
            this.socket.disconnect();
        }
    }
}

export default LobbyScene;
