import Phaser from "phaser";
import PlayScene from "./PlayScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "app",
  backgroundColor: "#87CEEB",
  physics: { default: "arcade" },
  scene: [PlayScene]
};

new Phaser.Game(config);