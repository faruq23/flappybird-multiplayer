import Phaser from 'phaser';

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
        // Path ini sudah benar karena file gambar ada di dalam folder 'public'
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
        this.pipes = this.physics.add.group({ immovable: true });

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
        this.scoreText = this.add.text(10, 10, 'Score: 0', { fontSize: '24px', color: '#fff', stroke: '#000', strokeThickness: 4 });
        
        // Game Over Text (dibuat di awal tapi tidak terlihat)
        this.gameOverText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 50, 'Game Over', { fontSize: '48px', color: '#ff0000', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setVisible(false);
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
            const pipeSprite = pipe as Phaser.Physics.Arcade.Sprite;
            
            // Cek untuk scoring
            if (pipeSprite.x < this.bird.x && !pipeSprite.getData('scored')) {
                if (pipeSprite.getData('isBottomPipe')) {
                    this.score++;
                    this.scoreText.setText(`Score: ${this.score}`);
                }
                pipeSprite.setData('scored', true);
                const pair = pipeSprite.getData('pair');
                if (pair) {
                    pair.setData('scored', true);
                }
            }

            // Hapus pipa yang sudah keluar layar
            if (pipeSprite.x < -pipeSprite.width) {
                pipe.destroy();
            }
        });
    }

    flap() {
        if (this.isGameOver) return;
        this.bird.setVelocityY(this.FLAP_VELOCITY);
    }

    spawnPipePair() {
        const halfGap = this.PIPE_GAP_HEIGHT / 2;
        const gameHeight = this.cameras.main.height;
        const gapY = Phaser.Math.Between(halfGap + 20, gameHeight - halfGap - 20);

        const topPipe = this.pipes.create(this.cameras.main.width, gapY - halfGap, 'pipeTop').setOrigin(0.5, 1) as Phaser.Physics.Arcade.Sprite;
        const bottomPipe = this.pipes.create(this.cameras.main.width, gapY + halfGap, 'pipe').setOrigin(0.5, 0) as Phaser.Physics.Arcade.Sprite;
        
        [topPipe, bottomPipe].forEach(p => {
            (p.body as Phaser.Physics.Arcade.Body).allowGravity = false;
        });

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

        this.time.delayedCall(500, () => {
            const restartButton = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 + 50, 'Restart', { fontSize: '32px', color: '#fff', backgroundColor: '#333', padding: {x: 10, y: 5} })
                .setOrigin(0.5)
                .setInteractive();
            
            restartButton.on('pointerdown', () => {
                this.scene.restart();
            });
        });
    }
}