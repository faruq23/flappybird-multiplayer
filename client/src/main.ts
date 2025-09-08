import Phaser from "phaser";
import MainMenuScene from "./MainMenuScene";
import LobbyScene from "./LobbyScene";
import MultiplayerPlayScene from "./MultiplayerPlayScene";
import SinglePlayerScene from "./SinglePlayerScene";

const path = window.location.pathname;

let initialScenes: any[] = [];

if (path.startsWith('/single-player')) {
  initialScenes = [SinglePlayerScene, MainMenuScene, LobbyScene, MultiplayerPlayScene];
} else if (path.startsWith('/multiplayer')) {
  initialScenes = [LobbyScene, MultiplayerPlayScene, MainMenuScene, SinglePlayerScene];
} else {
  initialScenes = [MainMenuScene, LobbyScene, MultiplayerPlayScene, SinglePlayerScene];
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "app",
  backgroundColor: "#87CEEB",
  physics: { default: "arcade" },
  scene: initialScenes
};

const game = new Phaser.Game(config);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
  });
}