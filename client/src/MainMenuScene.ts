import Phaser from 'phaser';
import PlayScene from './PlayScene';

class MainMenuScene extends Phaser.Scene {
    constructor() {
        super('MainMenuScene');
    }

    create() {
        this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 100, 'Flappy Bird Multiplayer', { fontSize: '32px', color: '#fff' }).setOrigin(0.5);

        const singlePlayerButton = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'Single Player', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive();

        singlePlayerButton.on('pointerdown', () => {
            window.location.href = '/single-player';
        });

        const multiplayerButton = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 60, 'Multiplayer', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive();

        multiplayerButton.on('pointerdown', () => {
            window.location.href = '/multiplayer';
        });
    }
}

export default MainMenuScene;
