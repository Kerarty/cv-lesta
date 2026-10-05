// Tank — игрок. Движение корпусом (WASD), башня за курсором, стрельба с перезарядкой.

class Tank {
  constructor(scene, x, y) {
    this.scene = scene;

    this.hull = scene.physics.add.sprite(x, y, "hull");
    this.hull.setDepth(10);
    this.hull.setCollideWorldBounds(true);
    this.hull.body.setAllowGravity(false);

    // Центр вращения башни в текстуре — (28, 22)
    this.turret = scene.add.image(x, y, "turret");
    this.turret.setOrigin(28 / 72, 22 / 44);
    this.turret.setDepth(11);

    this.nextShotAt = 0;
  }

  update(dt, keys) {
    const fwd = (keys.W.isDown || keys.UP.isDown ? 1 : 0) -
                (keys.S.isDown || keys.DOWN.isDown ? 1 : 0);
    const turn = (keys.D.isDown || keys.RIGHT.isDown ? 1 : 0) -
                 (keys.A.isDown || keys.LEFT.isDown ? 1 : 0);

    this.hull.rotation += turn * BALANCE.tank.turnSpeed * dt;

    const speed = fwd > 0 ? BALANCE.tank.speedForward :
                  fwd < 0 ? -BALANCE.tank.speedBackward : 0;
    this.scene.physics.velocityFromRotation(this.hull.rotation, speed, this.hull.body.velocity);
  }

  aim(pointer) {
    this.turret.setPosition(this.hull.x, this.hull.y);
    this.turret.rotation = Phaser.Math.Angle.Between(
      this.hull.x, this.hull.y, pointer.worldX, pointer.worldY
    );
  }

  // Возвращает true, если выстрел произошёл
  shoot(time) {
    if (time < this.nextShotAt) return false;
    this.nextShotAt = time + BALANCE.tank.reload * 1000;

    const angle = this.turret.rotation;
    const x = this.hull.x + Math.cos(angle) * BALANCE.tank.barrelLength;
    const y = this.hull.y + Math.sin(angle) * BALANCE.tank.barrelLength;

    new Bullet(this.scene, x, y, angle);
    this.scene.muzzleFx.explode(6, x, y);
    return true;
  }
}
