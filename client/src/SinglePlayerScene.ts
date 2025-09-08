import Phaser from 'phaser';

type Pipe = { 
    x: number; 
    gapY: number; 
    isTop: boolean; 
    sprite: Phaser.GameObjects.Image 
};

export default class SinglePlayerScene extends Phaser.Scene {
    private bird!: Phaser.Physics.Arcade.Sprite;
    private pipes!: Phaser.GameObjects.Group;
    private isGameOver: boolean = false;
    private score: number = 0;
    private scoreText!: Phaser.GameObjects.Text;
    private gameOverText!: Phaser.GameObjects.Text;

    // Game constants
    private readonly GRAVITY = 600;
    private readonly FLAP_VELOCITY = -260;
    private readonly PIPE_SPEED = 120; // pixels per second
    private readonly PIPE_GAP_HEIGHT = 150;
    private readonly PIPE_SPAWN_INTERVAL = 2000; // ms

    private pipeSpawnTimer!: Phaser.Time.TimerEvent;

    constructor() {
        super({ key: 'SinglePlayerScene' });
    }

    preload() {
        this.load.spritesheet("bird", "/Bird.png", { frameWidth: 32, frameHeight: 24 });
        this.load.image("pipe", "/Pipe.png");
        this.load.image("pipeTop", "/InvertPipe.png");
    }

    create() {
        this.isGameOver = false;
        this.score = 0;

        // Create Bird
        this.bird = this.physics.add.sprite(150, 300, 'bird').setOrigin(0.5);
        this.bird.setGravityY(this.GRAVITY);
        this.anims.create({ key: 'fly', frames: this.anims.generateFrameNumbers('bird', { start: 0, end: 2 }), frameRate: 10, repeat: -1 });
        this.bird.anims.play('fly');

        // Create Pipes Group
        this.pipes = this.physics.add.group();

        // Pipe Spawner
        this.pipeSpawnTimer = this.time.addEvent({
            delay: this.PIPE_SPAWN_INTERVAL,
            callback: this.spawnPipePair, 
            callbackScope: this,
            loop: true
        });

        // Input Handling
        this.input.on('pointerdown', this.flap, this);
        this.input.keyboard?.on('keydown-SPACE', this.flap, this);

        // Collision Detection
        this.physics.add.collider(this.bird, this.pipes, this.endGame, undefined, this);

        // Score Text
        this.scoreText = this.add.text(10, 10, 'Score: 0', { fontSize: '24px', color: '#000' });
        
        // Home Button
        const homeButton = this.add.text(this.cameras.main.width - 10, 10, 'Back to Home', { fontSize: '18px', color: '#000' }).setOrigin(1, 0).setInteractive();
        homeButton.on('pointerdown', () => {
            window.location.href = '/';
        });

        this.gameOverText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 50, 'Game Over', { fontSize: '48px', color: '#ff0000' }).setOrigin(0.5).setVisible(false);
    }

    update(time: number, delta: number) {
        if (this.isGameOver) return;

        // Check for out of bounds
        if (this.bird.y < 0 || this.bird.y > this.cameras.main.height) {
            this.endGame();
        }

        // Pipe movement and scoring
        Phaser.Actions.IncX(this.pipes.getChildren(), -this.PIPE_SPEED * (delta / 1000));
        
        this.pipes.getChildren().forEach(pipe => {
            const pipeSprite = pipe as Phaser.GameObjects.Sprite;
            if (pipeSprite.x < this.bird.x && !pipeSprite.getData('scored')) {
                // Check if it's the bottom pipe to score only once per pair
                if (pipeSprite.getData('isBottomPipe')) {
                    this.score++;
                    this.scoreText.setText(`Score: ${this.score}`);
                }
                pipeSprite.setData('scored', true);
                // To prevent scoring again on the top pipe
                const pair = pipeSprite.getData('pair');
                if (pair) {
                  pair.setData('scored', true);
                }
            }

            if (pipeSprite.x < -50) {
                pipe.destroy();
            }
        });
    }

    flap() {
        if (this.isGameOver) return;
        this.bird.setVelocityY(this.FLAP_VELOCITY);
    }

    spawnPipePair() {
        const gapY = Phaser.Math.Between(120, 480);
        const gapTop = gapY - this.PIPE_GAP_HEIGHT / 2;
        const gapBottom = gapY + this.PIPE_GAP_HEIGHT / 2;

        const topPipe = this.pipes.create(this.cameras.main.width, gapTop, 'pipeTop').setOrigin(0.5, 1) as Phaser.Physics.Arcade.Sprite;
        (topPipe.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        
        const bottomPipe = this.pipes.create(this.cameras.main.width, gapBottom, 'pipe').setOrigin(0.5, 0) as Phaser.Physics.Arcade.Sprite;
        (bottomPipe.body as Phaser.Physics.Arcade.Body).allowGravity = false;

        // Mark for scoring
        bottomPipe.setData('isBottomPipe', true);
        topPipe.setData('pair', bottomPipe);
        bottomPipe.setData('pair', topPipe);
    }

    endGame() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        this.physics.pause();
        this.bird.anims.stop();
        this.pipeSpawnTimer.remove();
        this.gameOverText.setVisible(true);

        // Add Restart Button
        const restartButton = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 50, 'Restart', { fontSize: '32px', color: '#fff', backgroundColor: '#333', padding: {x: 10, y: 5} })
            .setOrigin(0.5)
            .setInteractive();
        
        restartButton.on('pointerdown', () => {
            this.scene.restart();
        });
    }
}
