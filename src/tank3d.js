// Танк: детализированная low-poly модель из примитивов (катки, полки, башня
// с люком и стеллажом, ствол с термокожухом и дульным тормозом, антенна).
// Пивоты сохранены: group (корпус), turret (привод), muzzle (срез ствола).
import * as THREE from "three";

function shortestAngle(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export class Tank {
  constructor(scene) {
    this.group = new THREE.Group();
    this.recoil = 0;
    this.speed = 0;      // м/с, текущая продольная скорость (со знаком)
    this.turnRate = 0;   // рад/с, текущая скорость разворота корпуса

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x5c6b46, roughness: 0.9, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x4a5739, roughness: 1, flatShading: true });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x232320, roughness: 1 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x2e2e2a, roughness: 0.9, flatShading: true });
    const turretMat = new THREE.MeshStandardMaterial({ color: 0x647449, roughness: 0.9, flatShading: true });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4f5c3c, roughness: 0.8 });

    // --- Ходовая: гусеничные короба, катки, надгусеничные полки ---
    const trackGeo = new THREE.BoxGeometry(0.55, 0.85, 4.8);
    const fenderGeo = new THREE.BoxGeometry(0.85, 0.08, 4.9);
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.62, 10);
    for (const side of [-1, 1]) {
      const track = new THREE.Mesh(trackGeo, trackMat);
      track.position.set(side * 1.3, 0.45, 0);
      const fender = new THREE.Mesh(fenderGeo, darkMat);
      fender.position.set(side * 1.28, 0.93, 0);
      this.group.add(track, fender);
      for (const z of [-1.7, -0.85, 0, 0.85, 1.7]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 1.3, 0.36, z);
        wheel.castShadow = true;
        this.group.add(wheel);
      }
    }

    // --- Корпус (нос в +Z): плита, лобовой скос, кормовой скос ---
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), hullMat);
    hull.position.y = 1.15;
    const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 1.1), hullMat);
    glacis.position.set(0, 1.02, 2.05);
    glacis.rotation.x = 0.5;
    const rear = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.8), hullMat);
    rear.position.set(0, 1.0, -2.15);
    rear.rotation.x = -0.4;
    [hull, glacis, rear].forEach((m) => { m.castShadow = true; this.group.add(m); });

    // --- Башня ---
    this.turret = new THREE.Group();
    this.turret.position.set(0, 1.45, -0.2);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, 0.35, 10), turretMat);
    base.position.y = 0.15;
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.5, 10), turretMat);
    dome.position.y = 0.55;
    dome.scale.set(1.1, 1, 1.25); // вытянута вперёд, как у классических башен
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.14, 8), darkMat);
    hatch.position.set(0.35, 0.85, -0.2);
    const mg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), barrelMat);
    mg.rotation.x = Math.PI / 2;
    mg.position.set(0.35, 0.95, 0.12);
    const stowage = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.28, 0.55), darkMat);
    stowage.position.set(0, 0.5, -1.15);
    const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.45), turretMat);
    mantlet.position.set(0, 0.32, 1.05);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.2, 8), barrelMat);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.set(0, 0.32, 1.75);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 1.7, 8), barrelMat);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.32, 2.9);
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.32, 8), barrelMat);
    brake.rotation.x = Math.PI / 2;
    brake.position.set(0, 0.32, 3.6);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1.1, 4), trackMat);
    antenna.position.set(-0.7, 1.0, -0.9);
    antenna.rotation.z = 0.15;

    [base, dome, hatch, mg, stowage, mantlet, sleeve, tube, brake].forEach((m) => { m.castShadow = true; });
    this.turret.add(base, dome, hatch, mg, stowage, mantlet, sleeve, tube, brake, antenna);

    // Срез ствола: 3.6 по башне − 0.2 смещения башни = barrelLength (3.4 м) от центра корпуса
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.32, 3.6);

    this.group.add(this.turret);
    scene.add(this.group);
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
      this.turret.position.z = -0.2 - this.recoil;
      this.recoil *= Math.exp(-8 * dt);
    }
  }

  // desiredWorldYaw — направление взгляда камеры; привод башни ограничивает скорость доворота
  aimToward(desiredWorldYaw, dt) {
    const currentWorld = this.group.rotation.y + this.turret.rotation.y;
    const err = shortestAngle(currentWorld, desiredWorldYaw);
    const step = THREE.MathUtils.clamp(err, -BALANCE.tank.turretTraverse * dt, BALANCE.tank.turretTraverse * dt);
    this.turret.rotation.y += step;
  }

  muzzleWorldPos(target) {
    return this.muzzle.getWorldPosition(target);
  }
}
