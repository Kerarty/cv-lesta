// Танк: GLB-модель (assets/models/Tank.glb, CC0) с процедурным fallback.
// Пивоты: group (движение корпуса), turret (тяжёлый привод — вращает узел ствола
// модели вокруг его шарнира), muzzle (срез ствола — ребёнок узла Tank_Gun).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Метка сборки файла танка: выводится на экран рядом с версией баланса.
// Если на экране нет этой метки — браузер держит старый tank3d.js из кэша.
export const TANK_BUILD = "turret-fix-2";

function shortestAngle(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

// Режет геометрию по предикату над центроидами треугольников.
// Переносит ВСЕ атрибуты вершин (позиции, нормали, skinIndex/skinWeight — без них
// скиннинг упадёт), с сохранением исходных типов массивов.
function splitByPred(geo, pred) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const triCount = (idx ? idx.count : pos.count) / 3;
  const attrs = Object.entries(geo.attributes);
  const inPart = {}, rest = {};

  for (let t = 0; t < triCount; t++) {
    const vis = [idx ? idx.getX(t * 3) : t * 3, idx ? idx.getX(t * 3 + 1) : t * 3 + 1, idx ? idx.getX(t * 3 + 2) : t * 3 + 2];
    const cx = (pos.getX(vis[0]) + pos.getX(vis[1]) + pos.getX(vis[2])) / 3;
    const cy = (pos.getY(vis[0]) + pos.getY(vis[1]) + pos.getY(vis[2])) / 3;
    const cz = (pos.getZ(vis[0]) + pos.getZ(vis[1]) + pos.getZ(vis[2])) / 3;
    const T = pred(cx, cy, cz) ? inPart : rest;
    for (const vi of vis) {
      for (const [name, attr] of attrs) {
        const arr = T[name] || (T[name] = []);
        for (let k = 0; k < attr.itemSize; k++) arr.push(attr.array[vi * attr.itemSize + k]);
      }
    }
  }
  const make = (T) => {
    if (!T.position) return null;
    const g = new THREE.BufferGeometry();
    for (const [name, arr] of Object.entries(T)) {
      const src = geo.attributes[name];
      g.setAttribute(name, new THREE.BufferAttribute(new src.array.constructor(arr), src.itemSize, src.normalized));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  };
  return { inPart: make(inPart), out: make(rest) };
}

export class Tank {
  constructor(scene) {
    this.group = new THREE.Group();
    this.recoil = 0;
    this.speed = 0;      // м/с, текущая продольная скорость (со знаком)
    this.turnRate = 0;   // рад/с, текущая скорость разворота корпуса
    this.turretRate = 0; // рад/с, текущая скорость привода

    // Пивот привода: в заглушке вращает башню целиком, в GLB — узел ствола
    this.turret = new THREE.Group();
    this.turret.position.set(0, 1.45, -0.2);
    this.group.add(this.turret);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.32, 3.6);
    this.turret.add(this.muzzle);
    this._turretZ0 = this.turret.position.z; // база для анимации отдачи

    this.mixer = null;
    this.trackAction = null;

    this._procMeshes = [];
    this._buildProcedural();
    scene.add(this.group);
  }

  // GLB-модель танка. При неудаче загрузки процедурная заглушка остаётся.
  async attachModel(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const model = gltf.scene;

    // В модели ствол смотрит в −X: доворачиваем к нашему «вперёд = +Z»
    model.rotation.y = Math.PI / 2;

    // Масштаб к игровой длине ~5.4 м и постановка на гусеницы
    model.updateMatrixWorld(true);
    const raw = new THREE.Box3().setFromObject(model);
    const rawSize = raw.getSize(new THREE.Vector3());
    model.scale.setScalar(5.4 / rawSize.z);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.position.y = -box.min.y;

    model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        if (o.isSkinnedMesh) o.frustumCulled = false; // скиннинг ломает bounding sphere
      }
    });

    this.group.add(model);
    this.group.updateWorldMatrix(true, true);

    let body = null;
    model.traverse((o) => { if (o.name === "Tank_body") body = o; });

    // Узел ствола — единственная отдельно качающаяся часть модели.
    // Отцепляем его от скелета и сажаем на наш пивот привода, сохранив мировую позу.
    let gun = null;
    model.traverse((o) => { if (o.name === "Tank_Gun") gun = o; });
    if (!gun) throw new Error("Tank_Gun не найден в модели");

    const hinge = gun.getWorldPosition(new THREE.Vector3());
    this.turret.position.copy(this.group.worldToLocal(hinge.clone()));
    this._turretZ0 = this.turret.position.z;
    this.turret.attach(gun);

    // БАШНЯ собирается из кусков корпуса (в исходном меше она слита с ним):
    // 1) башенная коробка — центральная зона прима Cube009_2;
    // 2) крыша со штырём — верх прима Cube009_1.
    // ВАЖНО: Cube009 — это центральный блок КОРПУСА, он остаётся на корпусе!
    this._turretParts = [];
    const addTurretPart = (src, geo) => {
      if (!geo) return;
      // кусок — SkinnedMesh со скелетом и bind-матрицами источника,
      // иначе скинненный рендер-трансформ не совпадёт и кусок уедет
      const part = new THREE.SkinnedMesh(geo, src.material);
      part.skeleton = src.skeleton;
      part.bindMatrix.copy(src.bindMatrix);
      part.bindMatrixInverse.copy(src.bindMatrixInverse);
      part.bindMode = src.bindMode;
      part.castShadow = true;
      part.frustumCulled = false;
      part.matrixWorld.copy(src.matrixWorld);
      this.turret.attach(part);
      this._turretParts.push({ mesh: part, tintName: src.name });
    };

    const cuts = [
      { name: "Cube009_2", pred: (cx, cy, cz) => cy > 2.4 && Math.abs(cx) < 3.7 && Math.abs(cz) < 3.7 },
      { name: "Cube009_1", pred: (cx, cy, cz) => cy > 4.65 },
    ];
    for (const cut of cuts) {
      const src = body?.children.find((c) => c.name === cut.name);
      if (!src) continue;
      const { inPart, out } = splitByPred(src.geometry, cut.pred);
      addTurretPart(src, inPart);
      if (out) {
        src.geometry.dispose();
        src.geometry = out;
      }
    }

    // Дуло — ребёнок узла ствола: кончик по геометрии, гарантированно едет с танком
    let gunMesh = null;
    gun.traverse((o) => { if (o.isMesh) gunMesh = o; });
    gunMesh.geometry.computeBoundingBox();
    const bb = gunMesh.geometry.boundingBox;
    this.muzzle.position.set(bb.min.x, 0, 0);
    gun.add(this.muzzle);

    // Окраска: в GLB нет UV и текстур — красим вершинными цветами
    // (тон примитива + пятна краски + грязь снизу корпуса)
    const tints = {
      Cube009: 0x7d8560,   // купол башни
      Cube009_1: 0x6e7854, // корпус и верхнее строение
      Cube009_2: 0x59644a, // надгусеничные полки, детали
      Cube009_3: 0x4a5540,
      Cube009_4: 0x3d4238,
    };
    for (const c of body.children) {
      if (tints[c.name] !== undefined) this._paint(c, tints[c.name]);
    }
    for (const p of this._turretParts) {
      this._paint(p.mesh, tints[p.tintName] ?? tints.Cube009_1);
    }
    model.traverse((o) => {
      if (o.name === "TrackMeshL" || o.name === "TrackMeshR") this._paint(o, 0x3a3a34);
    });

    // Анимация гусениц: из клипа «Forward» делаем два действия — левая и правая
    // колея, чтобы в повороте они крутились с разными скоростями (дифференциал)
    if (gltf.animations.length > 0) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, "Forward") || gltf.animations[0];
      this.mixer = new THREE.AnimationMixer(model);
      const mkSide = (side) => {
        const c = clip.clone();
        c.tracks = c.tracks.filter((tr) => new RegExp(`TankTrack\\d+${side}\\.`).test(tr.name));
        const a = this.mixer.clipAction(c);
        a.timeScale = 0;
        a.play();
        return a;
      };
      this.trackL = mkSide("L");
      this.trackR = mkSide("R");
    }

    // Убираем процедурную заглушку
    for (const m of this._procMeshes) {
      m.parent?.remove(m);
      m.geometry?.dispose();
    }
    this._procMeshes.length = 0;
  }

  _buildProcedural() {
    const add = (mesh) => { this._procMeshes.push(mesh); return mesh; };

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x5c6b46, roughness: 0.9, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x4a5739, roughness: 1, flatShading: true });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x232320, roughness: 1 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2e2e2a, roughness: 0.9, flatShading: true });
    const turretMat = new THREE.MeshStandardMaterial({ color: 0x647449, roughness: 0.9, flatShading: true });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4f5c3c, roughness: 0.8 });

    const trackGeo = new THREE.BoxGeometry(0.55, 0.85, 4.8);
    const fenderGeo = new THREE.BoxGeometry(0.85, 0.08, 4.9);
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.62, 10);
    for (const side of [-1, 1]) {
      const track = add(new THREE.Mesh(trackGeo, trackMat));
      track.position.set(side * 1.3, 0.45, 0);
      const fender = add(new THREE.Mesh(fenderGeo, darkMat));
      fender.position.set(side * 1.28, 0.93, 0);
      this.group.add(track, fender);
      for (const z of [-1.7, -0.85, 0, 0.85, 1.7]) {
        const wheel = add(new THREE.Mesh(wheelGeo, wheelMat));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 1.3, 0.36, z);
        wheel.castShadow = true;
        this.group.add(wheel);
      }
    }

    const hull = add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), hullMat));
    hull.position.y = 1.15;
    const glacis = add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 1.1), hullMat));
    glacis.position.set(0, 1.02, 2.05);
    glacis.rotation.x = 0.5;
    const rear = add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.8), hullMat));
    rear.position.set(0, 1.0, -2.15);
    rear.rotation.x = -0.4;
    [hull, glacis, rear].forEach((m) => { m.castShadow = true; this.group.add(m); });

    const base = add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.35, 10), turretMat));
    base.position.y = 0.15;
    const dome = add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.5, 10), turretMat));
    dome.position.y = 0.55;
    dome.scale.set(1.1, 1, 1.25);
    const hatch = add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.14, 8), darkMat));
    hatch.position.set(0.35, 0.85, -0.2);
    const mg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), barrelMat));
    mg.rotation.x = Math.PI / 2;
    mg.position.set(0.35, 0.95, 0.12);
    const stowage = add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.28, 0.55), darkMat));
    stowage.position.set(0, 0.5, -1.15);
    const mantlet = add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.45), turretMat));
    mantlet.position.set(0, 0.32, 1.05);
    const sleeve = add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.2, 8), barrelMat));
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.set(0, 0.32, 1.75);
    const tube = add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 1.7, 8), barrelMat));
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.32, 2.9);
    const brake = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.32, 8), barrelMat));
    brake.rotation.x = Math.PI / 2;
    brake.position.set(0, 0.32, 3.6);
    const antenna = add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.1, 4), trackMat));
    antenna.position.set(-0.7, 1.0, -0.9);
    antenna.rotation.z = 0.15;
    [base, dome, hatch, mg, stowage, mantlet, sleeve, tube, brake].forEach((m) => { m.castShadow = true; });
    this.turret.add(base, dome, hatch, mg, stowage, mantlet, sleeve, tube, brake, antenna);
  }

  // Танковая динамика с инерцией (v0.7): тяжёлый разгон, накат, торможение встречной передачей
  update(dt, input) {
    const fwd = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const t = BALANCE.tank;

    // Продольная скорость
    if (fwd > 0) {
      this.speed += (this.speed < 0 ? t.accelBrake : t.accelForward) * dt;
    } else if (fwd < 0) {
      this.speed -= (this.speed > 0 ? t.accelBrake : t.accelBackward) * dt;
    } else {
      this.speed *= Math.exp(-t.rollDecay * dt); // накат
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -t.speedBackward, t.speedForward);

    // Разворот корпуса: борт выходит в поворот плавно
    const turnTarget = turn * t.turnSpeed;
    this.turnRate += THREE.MathUtils.clamp(turnTarget - this.turnRate, -t.turnAccel * dt, t.turnAccel * dt);

    this.group.rotation.y += this.turnRate * dt;

    const dir = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
    this.group.position.addScaledVector(dir, this.speed * dt);

    // Границы мира
    const { width: W, depth: D } = BALANCE.world;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -W / 2 + 3, W / 2 - 3);
    this.group.position.z = THREE.MathUtils.clamp(this.group.position.z, -D / 2 + 3, D / 2 - 3);

    // Отдача ствола после выстрела (визуал)
    if (this.recoil > 0.001) {
      this.turret.position.z = this._turretZ0 - this.recoil;
      this.recoil *= Math.exp(-8 * dt);
    }

    // Гусеницы-дифференциал (v0.12): колея = ход ± ω×полуколея.
    // Внешняя в повороте быстрее, внутренняя медленнее, на нейтрали — врозь.
    if (this.mixer && this.trackL && this.trackR) {
      const half = BALANCE.tank.trackGauge / 2;
      this._setTrack(this.trackL, this.speed + this.turnRate * half, dt);
      this._setTrack(this.trackR, this.speed - this.turnRate * half, dt);
      this.mixer.update(dt);
    }
  }

  _setTrack(action, surfaceSpeed, dt) {
    const target = surfaceSpeed / BALANCE.tank.trackAnimSpeed;
    action.timeScale += (target - action.timeScale) * Math.min(1, 10 * dt);
  }

  // Вершинные цвета: тон примитива + шум «краски» + грязь у днища. UV в модели нет,
  // поэтому любая «текстура» делается только так.
  _paint(mesh, tint) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color(tint);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n1 = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      const f = 0.85 + 0.24 * (n1 - Math.floor(n1));
      const dirt = THREE.MathUtils.clamp((y + 0.4) / 2.2, 0.55, 1);
      colors[i * 3] = c.r * f * dirt;
      colors[i * 3 + 1] = c.g * f * dirt;
      colors[i * 3 + 2] = c.b * f * dirt;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const m = mesh.material.clone();
    m.color.setHex(0xffffff);
    m.vertexColors = true;
    m.metalness = 0.08;
    m.roughness = 0.85;
    mesh.material = m;
  }

  // desiredWorldYaw — направление взгляда камеры. Привод (v0.8) тяжёлый:
  // разгоняется плавно и тормозит заранее, чтобы не проскочить цель.
  aimToward(desiredWorldYaw, dt) {
    const t = BALANCE.tank;
    const currentWorld = this.group.rotation.y + this.turret.rotation.y;
    const err = shortestAngle(currentWorld, desiredWorldYaw);

    const brakeRate = Math.sqrt(2 * t.traverseAccel * Math.abs(err));
    const desiredRate = Math.sign(err) * Math.min(t.turretTraverse, brakeRate);

    this.turretRate += THREE.MathUtils.clamp(
      desiredRate - this.turretRate, -t.traverseAccel * dt, t.traverseAccel * dt
    );
    this.turret.rotation.y += this.turretRate * dt;
  }

  turretWorldYaw() {
    return this.group.rotation.y + this.turret.rotation.y;
  }

  muzzleWorldPos(target) {
    return this.muzzle.getWorldPosition(target);
  }
}
