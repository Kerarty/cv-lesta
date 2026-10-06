// Цели-секции резюме: кристалл на базовом кольце, HP-бар, у движущегося штаба — патруль.
// Данные (hp/xp/radius/color) и координаты — из BALANCE, тексты и заголовки — из RESUME.
import * as THREE from "three";

export class ResumeTargets {
  constructor(scene, camera) {
    this.camera = camera;
    this.all = [];   // все цели, включая уничтоженные (для «Нового боя»)
    this.items = []; // живые цели: по ним считаем авто-наведение и попадания
    for (const def of BALANCE.targets) {
      const t = this.make(def, scene);
      this.all.push(t);
      this.items.push(t);
    }
  }

  make(def, scene) {
    const cfg = RESUME.sections[def.id] || {};
    // Цвет мишени = её цена (рампа в balance.js). Заголовок секции — из контента.
    const color = new THREE.Color(def.color ?? 0xd9534f);
    const anchor = BALANCE.map.targets[def.id] ?? [0, 0];

    const group = new THREE.Group();
    group.position.set(anchor[0], 0, anchor[1]);

    // Кристалл-секция
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(def.radius * 0.9, 0),
      new THREE.MeshStandardMaterial({
        color, roughness: 0.45, metalness: 0.15,
        emissive: color, emissiveIntensity: 0.3, flatShading: true,
      })
    );
    crystal.position.y = def.radius * 1.5;
    crystal.castShadow = true;
    group.add(crystal);

    // Базовое кольцо — «точка захвата»
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(def.radius, 0.12, 8, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);

    // HP-бар: подложка + заполняемая полоса (пивот полосы — левый край)
    const bar = new THREE.Group();
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 0.36),
      new THREE.MeshBasicMaterial({ color: 0x14110a, transparent: true, opacity: 0.75 })
    );
    const fillGeo = new THREE.PlaneGeometry(3.2, 0.26);
    fillGeo.translate(1.6, 0, 0);
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x9be27a }));
    fill.position.set(-1.6, 0, 0.01);
    bar.add(back, fill);
    bar.position.y = def.radius * 1.5 + def.radius * 0.9 + 0.55;
    group.add(bar);

    // Подпись дистанции: сколько метров до спавна — читаемо на полигоне
    const dist = Math.round(Math.hypot(anchor[0] - BALANCE.map.spawn.x, anchor[1] - BALANCE.map.spawn.z));
    const tag = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.tagTexture(`${dist} м · ${def.xp} XP`), depthWrite: false, transparent: true })
    );
    tag.scale.set(4.8, 1.2, 1);
    tag.position.y = def.radius * 1.5 + def.radius * 0.9 + 2.1;
    group.add(tag);

    scene.add(group);

    const t = {
      id: def.id,
      title: cfg.title ?? def.id,
      xp: def.xp,
      hp: def.hp,
      maxHp: def.hp,
      radius: def.radius,
      moving: !!def.moving,
      anchor: [anchor[0], anchor[1]],
      phase: Math.random() * 6.28,
      group, crystal, bar, fill,
      pos: group.position, // живая ссылка: снаряды бьют по актуальной позиции
      dead: false,
      onHit: null, // назначит main3d

      flash() {
        crystal.material.emissiveIntensity = 1.4;
        setTimeout(() => { crystal.material.emissiveIntensity = 0.3; }, 90);
      },
      updateBar() {
        const f = Math.max(this.hp, 0) / this.maxHp;
        fill.scale.x = Math.max(f, 0.001);
        fill.material.color.setHex(f > 0.5 ? 0x9be27a : f > 0.25 ? 0xffd27a : 0xe27a7a);
      },
      hide() {
        group.visible = false;
      },
      respawn() {
        this.hp = this.maxHp;
        this.dead = false;
        this.group.visible = true;
        this.group.position.set(this.anchor[0], 0, this.anchor[1]);
        this.updateBar();
      },
    };
    return t;
  }

  // Табличка «64 м · 500 XP» над мишенью: дистанция и цена — как на полигоне
  tagTexture(text) {
    if (!this._tagCache) this._tagCache = new Map();
    if (this._tagCache.has(text)) return this._tagCache.get(text);
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "rgba(12,15,10,0.72)";
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = "rgba(255,210,122,0.55)";
    g.lineWidth = 2;
    g.strokeRect(1, 1, 254, 62);
    g.fillStyle = "#ffd27a";
    g.font = "bold 26px Consolas, monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._tagCache.set(text, tex);
    return tex;
  }

  // «Новый бой»: все цели живы и на местах, живые снова в items
  reset() {
    this.items.length = 0;
    for (const t of this.all) {
      t.respawn();
      this.items.push(t);
    }
  }

  update(dt, time) {
    for (const t of this.all) {
      if (t.dead) continue;
      t.crystal.rotation.y += dt * 0.8;
      t.crystal.position.y = t.radius * 1.5 + Math.sin(time * 1.5 + t.phase) * 0.18;
      t.bar.quaternion.copy(this.camera.quaternion); // HP-бар всегда лицом к камере
      if (t.moving) {
        // ШТАБ патрулирует внутри зоны мишеней — за бруствер не выходит
        t.group.position.x = t.anchor[0] + Math.sin(time * 0.22 + t.phase) * 2.5;
        t.group.position.z = t.anchor[1] + Math.cos(time * 0.16 + t.phase) * 5;
      }
    }
  }
}