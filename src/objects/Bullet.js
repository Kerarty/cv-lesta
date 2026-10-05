// Bullet — снаряд. Летит по прямой, исчезает на границе мира с искрами.

class Bullet extends Phaser.Physics.Arcade.Image {
  constructor(scene, x, y, angle) {
    super(scene, x, y, "bullet");

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(9).setRotation(angle);
    this.body.setAllowGravity(false);
    scene.physics.velocityFromRotation(angle, BALANCE.tank.bulletSpeed, this.body.velocity);

    this.setCollideWorldBounds(true);
    this.body.onWorldBounds = true;
  }
}
