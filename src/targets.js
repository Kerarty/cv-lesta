// Цели-секции резюме: кристалл на базовом кольце, HP-бар, у движущегося штаба — патруль.
// Данные (hp/xp/radius/id) берутся из BALANCE.targets, тексты и цвета — из RESUME.sections.
import * as THREE from "three";

// Якоря расстановки: от ближней (дешёвой) к дальней (штаб) — маршрут по карте
const ANCHORS = {
  education: [24, -16],
  about: [-28, 18],
  skills: [50, -28],
  projects: [-54, 36],
  experience: [64, 20],
  hq: [72, -46],
};

export class ResumeTargets {
  constructor(scene, camera) {
    this.camera = camera;
    this.items = [];
    for (const def of BALANCE.targets) {
      this.items.push(this.make(def, scene));
    }
  }

  make(def, scene) {
    const cfg = RESUME.sections[def.id] || {};
    const color = new THREE.Color(cfg.color ?? "#d9534f");
    const anchor = ANCHORS[def.id] ?? [0, 0];

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
    };
    return t;
  }

  update(dt, time) {
    for (const t of this.items) {
      if (t.dead) continue;
      t.crystal.rotation.y += dt * 0.8;
      t.crystal.position.y = t.radius * 1.5 + Math.sin(time * 1.5 + t.phase) * 0.18;
      t.bar.quaternion.copy(this.camera.quaternion); // HP-бар всегда лицом к камере
      if (t.moving) {
        // ШТАБ патрулирует вокруг якоря
        t.group.position.x = t.anchor[0] + Math.cos(time * 0.22 + t.phase) * 7;
        t.group.position.z = t.anchor[1] + Math.sin(time * 0.22 + t.phase) * 7;
      }
    }
  }
}
