// Танк: корпус + башня с ограниченной скоростью привода (стат v0.5).
// Низкополигональные примитивы; на этапе полировки можно заменить на CC0-модель.
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

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x5f6f4a, roughness: 0.9, flatShading: true });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x2f2f2a, roughness: 1 });
    const turretMat = new THREE.MeshStandardMaterial({ color: 0x66764f, roughness: 0.9, flatShading: true });
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x57663f, roughness: 0.8 });

    // Гусеницы (нос корпуса смотрит в +Z)
    const trackGeo = new THREE.BoxGeometry(0.8, 0.9, 4.6);
    const trackL = new THREE.Mesh(trackGeo, trackMat);
    trackL.position.set(-1.3, 0.45, 0);
    const trackR = trackL.clone();
    trackR.position.x = 1.3;

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 4.2), hullMat);
    hull.position.y = 1.05;

    // Лобовая плита упрощённо — наклонная пластина спереди
    const glacis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.0), hullMat);
    glacis.position.set(0, 0.85, 2.0);
    glacis.rotation.x = 0.45;

    [trackL, trackR, hull, glacis].forEach((m) => { m.castShadow = true; this.group.add(m); });

    // Башня: вращается независимо от корпуса с ограничением привода
    this.turret = new THREE.Group();
    this.turret.position.set(0, 1.45, -0.2);

    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.6, 10), turretMat);
    dome.position.y = 0.3;
    const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), turretMat);
    mantlet.position.set(0, 0.3, 0.95);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.2, 8), barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.32, 2.6);
    dome.castShadow = mantlet.castShadow = barrel.castShadow = true;

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.32, 3.6); // = BALANCE.tank.barrelLength от центра корпуса

    this.turret.add(dome, mantlet, barrel, this.muzzle);
    this.group.add(this.turret);
    scene.add(this.group);
  }

  // Танковая динамика с инерцией (v0.6): разгон, накат, торможение встречной передачей
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
