// Стрельба: трассеры, вспышки, дым, куски земли, воронки.
// Прицел честный: снаряд летит в точку под перекрестьем (60 м/с — см. balance.js).
import * as THREE from "three";
import { Puffs } from "./effects3d.js";

export class Gun {
  constructor(scene, cameraRig) {
    this.scene = scene;
    this.rig = cameraRig;
    this.shells = [];
    this.effects = [];
    this.scorches = [];
    this.reloadUntil = 0;

    // Трассер: вытянутая капсула, ориентированная по вектору скорости
    this.shellGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.85, 6);
    this.shellMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });

    // Дым (взрывы и выстрелы)
    this.smoke = new Puffs(scene, {
      inner: "rgba(110,100,88,0.85)",
      outer: "rgba(110,100,88,0)",
    });

    // Куски земли
    this.chunkGeo = new THREE.TetrahedronGeometry(0.16);
    this.chunkMat = new THREE.MeshStandardMaterial({
      color: 0x3d3325, roughness: 1, flatShading: true, transparent: true,
    });

    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._aim = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  // Точка на земле под перекрестьем
  aimPoint(camera) {
    this._ray.setFromCamera({ x: 0, y: 0 }, camera);
    if (!this._ray.ray.intersectPlane(this._plane, this._aim)) {
      this._ray.ray.at(300, this._aim);
      this._aim.y = 0;
    }
    return this._aim;
  }

  tryFire(now, camera, tank, aimTarget) {
    if (now < this.reloadUntil) return false;
    this.reloadUntil = now + BALANCE.tank.reload * 1000;

    // В режиме HR сюда приходит центр цели — снаряд идёт точно в кристалл.
    // Иначе — честная точка под перекрестьем.
    const aim = aimTarget ? this._aim.copy(aimTarget) : this.aimPoint(camera);
    const muzzle = tank.muzzleWorldPos(this._muzzle);

    // Снаряд летит строго вдоль ствола: по горизонтали — курс машины, по вертикали —
    // угол на точку прицела. Нос не доворачивали — снаряд ушёл мимо, как в WoT:
    // дождись, пока машина встанет на цель.
    const yaw = tank.turretWorldYaw();
    const horizDist = Math.hypot(aim.x - muzzle.x, aim.z - muzzle.z);
    const pitch = Math.atan2(aim.y - muzzle.y, horizDist);
    const dir = this._dir.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    );

    const shell = new THREE.Mesh(this.shellGeo, this.shellMat);
    shell.position.copy(muzzle);
    shell.quaternion.setFromUnitVectors(this._up, dir);
    this.scene.add(shell);
    this.shells.push({
      mesh: shell,
      vel: dir.clone().multiplyScalar(BALANCE.tank.bulletSpeed),
      born: now,
    });

    // Вспышка светом + клуб дыма + отдача и FOV-толчок
    const light = new THREE.PointLight(0xffc873, 60, 14, 2);
    light.position.copy(muzzle);
    this.scene.add(light);
    this.effects.push({ kind: "flash", light, t: 0, life: 0.08 });
    this.smoke.spawn(muzzle, { scale: 0.5, growth: 0.9, life: 0.5, rise: 0.9, opacity: 0.4 });
    tank.recoil = 0.12;
    this.rig.kick(2.5);
    return true;
  }

  explode(pos, scale = 1) {
    // Вспышка-сфера
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.45 * scale, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc873, transparent: true, opacity: 0.95 })
    );
    flash.position.copy(pos);
    this.scene.add(flash);
    this.effects.push({ kind: "boom", flash, t: 0, life: 0.3 });

    // Дым: несколько клубов, поднимаются и расплываются
    for (let i = 0; i < 5; i++) {
      const p = pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6, Math.random() * 0.3, (Math.random() - 0.5) * 0.6
      ));
      this.smoke.spawn(p, {
        scale: 0.8 * scale + Math.random() * 0.5,
        growth: 1.3,
        life: 1.0 + Math.random() * 0.5,
        rise: 1.4 + Math.random() * 0.6,
        opacity: 0.55,
      });
    }

    // Куски земли веером
    for (let i = 0; i < 8; i++) {
      const chunk = new THREE.Mesh(this.chunkGeo, this.chunkMat.clone());
      chunk.position.copy(pos);
      chunk.position.y = Math.max(pos.y, 0.1);
      this.scene.add(chunk);
      const a = Math.random() * Math.PI * 2;
      this.effects.push({
        kind: "chunk",
        mesh: chunk,
        vel: new THREE.Vector3(Math.cos(a) * (1.5 + Math.random() * 3), 3.5 + Math.random() * 3.5, Math.sin(a) * (1.5 + Math.random() * 3)),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        t: 0,
        life: 1.6,
      });
    }

    // Воронка-подпалина
    const scorch = new THREE.Mesh(
      new THREE.CircleGeometry(1.3 * scale, 16),
      new THREE.MeshBasicMaterial({ color: 0x1a140c, transparent: true, opacity: 0.4 })
    );
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(pos.x, 0.03, pos.z);
    this.scene.add(scorch);
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
          // цель — вертикальный «столб»: горизонтальная дистанция до оси
          // плюс высота полёта снаряда (кристалл висит над землёй)
          const dx = p.x - tg.pos.x, dz = p.z - tg.pos.z;
          const horiz = Math.hypot(dx, dz);
          const r = tg.radius + 0.25;
          const hTop = (tg.hitHeight ?? tg.radius * 2.4) + 0.4;
          if (horiz < r && p.y < hTop) {
            this.explode(p, 1.3);
            this.rig.shake(0.25);
            if (tg.onHit) tg.onHit();
            dead = true;
            break;
          }
        }
      }
      if (!dead && now - s.born > 4000) dead = true;

      if (dead) {
        this.scene.remove(s.mesh);
        this.shells.splice(i, 1);
      }
    }

    // Эффекты
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt / e.life;

      if (e.kind === "flash") {
        e.light.intensity = 60 * Math.max(0, 1 - e.t);
        if (e.t >= 1) {
          this.scene.remove(e.light);
          this.effects.splice(i, 1);
        }
      } else if (e.kind === "boom") {
        e.flash.scale.setScalar(1 + e.t * 4);
        e.flash.material.opacity = 0.95 * Math.max(0, 1 - e.t);
        if (e.t >= 1) {
          this.scene.remove(e.flash);
          e.flash.geometry.dispose();
          e.flash.material.dispose();
          this.effects.splice(i, 1);
        }
      } else if (e.kind === "chunk") {
        e.vel.y -= 14 * dt;
        e.mesh.position.addScaledVector(e.vel, dt);
        e.mesh.rotation.x += e.spin.x * dt;
        e.mesh.rotation.y += e.spin.y * dt;
        if (e.mesh.position.y < 0.08) {
          e.mesh.position.y = 0.08;
          e.vel.set(0, 0, 0);
          e.spin.set(0, 0, 0);
        }
        e.mesh.material.opacity = Math.max(0, 1 - Math.max(0, e.t - 0.6) / 0.4);
        if (e.t >= 1) {
          this.scene.remove(e.mesh);
          e.mesh.material.dispose();
          this.effects.splice(i, 1);
        }
      }
    }

    this.smoke.update(dt);
  }
}
