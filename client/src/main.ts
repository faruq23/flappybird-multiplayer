// src/main.ts

import Phaser from "phaser";
import MainMenuScene from "./MainMenuScene";
import LobbyScene from "./LobbyScene";
import MultiplayerPlayScene from "./MultiplayerPlayScene";
import SinglePlayerScene from "./SinglePlayerScene";

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: "app", // ID dari div di index.html
    width: 800,
    height: 600,
    backgroundColor: "#87CEEB",

    // PERBAIKAN FINAL: Mengaktifkan fisika dengan konfigurasi standar
    physics: {
        default: 'arcade',
        arcade: {
            // Anda bisa set gravitasi global di sini jika semua scene memerlukannya
            // gravity: { y: 200 }
        }
    },
    
    // Memuat semua scene yang ada
    scene: [MainMenuScene, LobbyScene, MultiplayerPlayScene, SinglePlayerScene]
};

// Membuat instance game baru
const game = new Phaser.Game(config);

// Fitur Hot Reload untuk development (jangan dihapus)
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        game.destroy(true);
    });
}

