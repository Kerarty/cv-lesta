// BootScene — генерирует процедурные текстуры (в M4 заменим на CC0-спрайты Kenney)

class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create() {
    this.makeTextures();
    this.scene.start("Battle");
  }

  makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // --- Трава (тайл 128x128) ---
    g.fillStyle(0x55703f, 1);
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 60; i++) {
      const shade = Phaser.Math.RND.pick([0x4c6538, 0x5f7a46, 0x506a3b]);
      g.fillStyle(shade, 1);
      g.fillRect(Phaser.Math.Between(0, 125), Phaser.Math.Between(0, 125), 3, 3);
    }
    g.generateTexture("grass", 128, 128);
    g.clear();

    // --- Куст ---
    g.fillStyle(0x33502a, 1);
    g.fillCircle(14, 14, 12);
    g.fillStyle(0x3f6033, 1);
    g.fillCircle(10, 11, 6);
    g.fillCircle(18, 17, 5);
    g.generateTexture("bush", 28, 28);
    g.clear();

    // --- Камень ---
    g.fillStyle(0x8b8b83, 1);
    g.fillCircle(15, 16, 11);
    g.fillStyle(0x9c9c93, 1);
    g.fillCircle(12, 13, 7);
    g.generateTexture("rock", 30, 30);
    g.clear();

    // --- Дерево (крона) ---
    g.fillStyle(0x2e4a26, 1);
    g.fillCircle(22, 22, 20);
    g.fillStyle(0x3a5a2e, 1);
    g.fillCircle(16, 18, 9);
    g.generateTexture("tree", 44, 44);
    g.clear();

    // --- Корпус танка (нос смотрит вправо, rotation=0) ---
    g.fillStyle(0x2f2f2a, 1); // гусеницы
    g.fillRect(0, 6, 16, 52);
    g.fillRect(80, 6, 16, 52);
    g.fillStyle(0x44443c, 1); // траки
    for (let y = 10; y < 56; y += 8) {
      g.fillRect(2, y, 12, 3);
      g.fillRect(82, y, 12, 3);
    }
    g.fillStyle(0x5f6f4a, 1); // корпус
    g.fillRoundedRect(16, 4, 64, 56, 8);
    g.fillStyle(0x6d7d57, 1); // лобовая плита
    g.fillRoundedRect(64, 10, 14, 44, 4);
    g.lineStyle(2, 0x3a4430, 1);
    g.strokeRoundedRect(16, 4, 64, 56, 8);
    g.generateTexture("hull", 96, 64);
    g.clear();

    // --- Башня (центр вращения в (28, 22), ствол вправо) ---
    g.fillStyle(0x57663f, 1); // ствол
    g.fillRect(28, 18, 40, 8);
    g.fillStyle(0x44443c, 1); // дульный тормоз
    g.fillRect(62, 16, 8, 12);
    g.fillStyle(0x66764f, 1); // башня
    g.fillCircle(28, 22, 17);
    g.lineStyle(2, 0x3a4430, 1);
    g.strokeCircle(28, 22, 17);
    g.generateTexture("turret", 72, 44);
    g.clear();

    // --- Снаряд ---
    g.fillStyle(0xffd27a, 1);
    g.fillRect(0, 0, 12, 5);
    g.generateTexture("bullet", 12, 5);
    g.clear();

    // --- Искра (частица) ---
    g.fillStyle(0xffffff, 1);
    g.fillCircle(3, 3, 3);
    g.generateTexture("spark", 6, 6);
    g.destroy();
  }
}
