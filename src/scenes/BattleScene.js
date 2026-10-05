// BattleScene — боевое поле: мир, декор, танк, стрельба.

class BattleScene extends Phaser.Scene {
  constructor() {
    super("Battle");
  }

  create() {
    const W = 2000;
    const H = 1500;

    this.physics.world.setBounds(0, 0, W, H);
    this.add.tileSprite(0, 0, W, H, "grass").setOrigin(0).setDepth(0);

    this.spawnDecor(W, H);

    // Частицы: вспышка у ствола и искры при исчезновении снаряда
    this.muzzleFx = this.add.particles(0, 0, "spark", {
      speed: { min: 60, max: 160 },
      lifespan: 180,
      scale: { start: 1.2, end: 0 },
      tint: [0xffe08a, 0xffb347],
      emitting: false,
    }).setDepth(30);

    this.impactFx = this.add.particles(0, 0, "spark", {
      speed: { min: 40, max: 120 },
      lifespan: 250,
      scale: { start: 1, end: 0 },
      tint: [0xcccccc, 0x999999],
      emitting: false,
    }).setDepth(30);

    // Снаряды, улетевшие за границу мира, сгорают в искрах
    this.physics.world.on("worldbounds", (body) => {
      const obj = body.gameObject;
      if (obj instanceof Bullet) {
        this.impactFx.explode(8, obj.x, obj.y);
        obj.destroy();
      }
    });

    this.tank = new Tank(this, W / 2, H / 2);

    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.startFollow(this.tank.hull, true, 0.08, 0.08);

    this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT");
    this.input.keyboard.addCapture("W,A,S,D,UP,DOWN,LEFT,RIGHT");

    this.reloadGfx = this.add.graphics().setDepth(50);
  }

  spawnDecor(W, H) {
    // Seed-генерация: карта одинаковая при каждом запуске — фича, не баг
    const rng = new Phaser.Math.RandomDataGenerator(["lesta-cv-1"]);
    const types = ["bush", "bush", "bush", "rock", "rock", "tree"];
    for (let i = 0; i < 70; i++) {
      const x = rng.between(80, W - 80);
      const y = rng.between(80, H - 80);
      const key = rng.pick(types);
      this.add.image(x, y, key)
        .setDepth(2)
        .setScale(rng.realInRange(0.8, 1.6))
        .setAngle(rng.between(0, 360))
        .setAlpha(0.95);
    }
  }

  update(time, delta) {
    const dt = delta / 1000;
    const pointer = this.input.activePointer;

    this.tank.update(dt, this.keys);
    this.tank.aim(pointer);

    if (pointer.leftButtonDown()) {
      this.tank.shoot(time);
    }

    this.drawReloadRing(pointer);
  }

  drawReloadRing(pointer) {
    this.reloadGfx.clear();

    const reloadMs = BALANCE.tank.reload * 1000;
    const remain = this.tank.nextShotAt - this.time.now;

    if (remain > 0) {
      const progress = 1 - remain / reloadMs;
      this.reloadGfx.lineStyle(3, 0xffffff, 0.85);
      this.reloadGfx.beginPath();
      this.reloadGfx.arc(pointer.worldX, pointer.worldY, 16, -Math.PI / 2, -Math.PI / 2 + progress * 2 * Math.PI);
      this.reloadGfx.strokePath();
    } else {
      this.reloadGfx.lineStyle(2, 0xffe08a, 0.9);
      this.reloadGfx.strokeCircle(pointer.worldX, pointer.worldY, 5);
    }
  }
}
