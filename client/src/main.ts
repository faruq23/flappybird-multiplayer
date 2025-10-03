// src/main.ts

import Phaser from "phaser";
import MainMenuScene from "./MainMenuScene";
import LobbyScene from "./LobbyScene";
import MultiplayerPlayScene from "./MultiplayerPlayScene";
import SinglePlayerScene from "./SinglePlayerScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "app",
  backgroundColor: "#87CEEB",
  // HAPUS BARIS INI UNTUK MENONAKTIFKAN MESIN FISIKA PHASER
  // physics: { default: "arcade" }, 
  scene: [MainMenuScene, LobbyScene, MultiplayerPlayScene, SinglePlayerScene]
};

const game = new Phaser.Game(config);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}