// Стрельба: снаряды, попадания, взрывы, вспышки.
// Прицел честный: снаряд летит в точку под перекрестьем, трассер виден (60 м/с — см. balance.js).
import * as THREE from "three";

export class Gun {
  constructor(scene, cameraRig) {
    this.scene = scene;
    this.rig = cameraRig;
    this.shells = [];
    this.effects = [];
    this.scorches = [];
    this.reloadUntil = 0;

    this.shellGeo = new THREE.SphereGeometry(0.13, 8, 6);
    this.shellMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });

    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._aim = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
  }

  // Точка на земле под перекрестьем
  aimPoint(camera) {
    this._ray.setFromCamera({ x: 0, y: 0 }, camera);
    if (!this._ray.ray.intersectPlane(this._plane, this._aim)) {
      // смотрим выше горизонта — цель «на горизонте»
      this._ray.ray.at(300, this._aim);
      this._aim.y = 0;
    }
    return this._aim;
  }

  tryFire(now, camera, tank) {
    if (now < this.reloadUntil) return false;
    this.reloadUntil = now + BALANCE.tank.reload * 1000;

    const aim = this.aimPoint(camera);
    const muzzle = tank.muzzleWorldPos(this._muzzle);
    const dir = this._dir.copy(aim).sub(muzzle).normalize();

    const shell = new THREE.Mesh(this.shellGeo, this.shellMat);
    shell.position.copy(muzzle);
    this.scene.add(shell);
    this.shells.push({
      mesh: shell,
      vel: dir.clone().multiplyScalar(BALANCE.tank.bulletSpeed),
      born: now,
    });

    // Вспышка у среза ствола
    const light = new THREE.PointLight(0xffc873, 60, 14, 2);
    light.position.copy(muzzle);
    this.scene.add(light);
    this.effects.push({ light, t: 0, kind: "flash" });

    tank.recoil = 0.12;
    return true;
  }

  explode(pos, scale = 1) {
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.45 * scale, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc873, transparent: true, opacity: 0.95 })
    );
    flash.position.copy(pos);

    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(1.3 * scale, 16),
      new THREE.MeshBasicMaterial({ color: 0x1a140c, transparent: true, opacity: 0.4 })
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(pos.x, 0.03, pos.z);

    this.scene.add(flash, scorch);
    this.effects.push({ flash, t: 0, kind: "boom" });
    this.scorches.push(scorch);
    if (this.scorches.length > 40) {
      const old = this.scorches.shift();
      this.scene.remove(old);
      old.geometry.dispose();
      old.material.dispose();
    }
  }

  update(now, dt, targets) {
    // Снаряды
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.mesh.position.addScaledVector(s.vel, dt);
      const p = s.mesh.position;
      let dead = false;

      if (p.y <= 0.06) {
        this.explode(p, 1);
        this.rig.shake(0.12);
        dead = true;
      } else {
        for (const tg of targets) {
          const r = tg.radius + 0.25;
          if (p.distanceToSquared(tg.pos) < r * r) {
            this.explode(p, 1.3);
            this.rig.shake(0.25);
            if (tg.onHit) tg.onHit();
            dead = true;
            break;
          }
        }
      }
      if (!dead && now - s.born > 4000) dead = true; // улетел в туман

      if (dead) {
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
      }
    }

    // Эффекты
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt / (e.kind === "flash" ? 0.08 : 0.35);
      if (e.kind === "flash") {
        e.light.intensity = 60 * Math.max(0, 1 - e.t);
        if (e.t >= 1) {
          this.scene.remove(e.light);
          this.effects.splice(i, 1);
        }
      } else {
        e.flash.scale.setScalar(1 + e.t * 4);
        e.flash.material.opacity = 0.95 * Math.max(0, 1 - e.t);
        if (e.t >= 1) {
          this.scene.remove(e.flash);
          e.flash.geometry.dispose();
          e.flash.material.dispose();
          this.effects.splice(i, 1);
        }
      }
    }
  }
}
