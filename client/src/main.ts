// src/main.ts
import Phaser from "phaser";
import MainMenuScene from "./MainMenuScene";
import LobbyScene from "./LobbyScene";
import MultiplayerPlayScene from "./MultiplayerPlayScene";
import SinglePlayerScene from "./SinglePlayerScene";

const routes: Record<string, typeof Phaser.Scene> = {
    '/': MainMenuScene,
    '/lobby': LobbyScene,
    '/multiplayer': MultiplayerPlayScene,
    '/singleplayer': SinglePlayerScene,
};

const path = window.location.pathname;
const scene = routes[path] || MainMenuScene;

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: "app", // ID dari div di index.html
    width: 800,
    height: 600,
    backgroundColor: "#87CEEB",
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },

    // PERBAIKAN FINAL: Mengaktifkan fisika dengan konfigurasi standar
    physics: {
        default: 'arcade',
        arcade: {
            // Anda bisa set gravitasi global di sini jika semua scene memerlukannya
            // gravity: { y: 200 }
        }
    },
    
    // Memuat scene yang sesuai dengan route
    scene: [scene]
};

// Membuat instance game baru
const game = new Phaser.Game(config);

// Fitur Hot Reload untuk development (jangan dihapus)
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        game.destroy(true);
    });
}
