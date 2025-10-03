// src/MainMenuScene.ts

import Phaser from 'phaser';

class MainMenuScene extends Phaser.Scene {
    constructor() {
        super('MainMenuScene');
    }

    create() {
        this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 100, 'Flappy Bird Multiplayer', { fontSize: '32px', color: '#fff' }).setOrigin(0.5);

        // Tombol Single Player (jika Anda ingin mengembangkannya nanti)
        const singlePlayerButton = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'Single Player', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive();

        singlePlayerButton.on('pointerdown', () => {
            // Ganti dengan scene single player Anda jika ada
            // this.scene.start('SinglePlayerScene'); 
        });

        const multiplayerButton = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 60, 'Multiplayer', { fontSize: '24px', color: '#fff', backgroundColor: '#333', padding: { x: 10, y: 5 } })
            .setOrigin(0.5)
            .setInteractive();

        // PERBAIKAN: Gunakan this.scene.start() untuk pindah scene, bukan refresh halaman
        multiplayerButton.on('pointerdown', () => {
            this.scene.start('LobbyScene');
        });
    }
}

export default MainMenuScene;