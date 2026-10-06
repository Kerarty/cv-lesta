// Орбитальная камера из-за спины танка: мышь вращает камеру, башня доворачивается за ней.
// Плюс тряска на выстрелах/попаданиях.
import * as THREE from "three";

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    // targetYaw/targetPitch — куда тянет мышь; yaw/pitch — сглаженные реальные значения
    this.targetYaw = Math.PI;  // стартуем за кормой (танк смотрит в +Z)
    this.targetPitch = 0.42;   // рад, диапазон [0.12, 1.05]
    this.yaw = this.targetYaw;
    this.pitch = this.targetPitch;
    this.distance = 13;
    this.shakeAmp = 0;
    this.fovBoost = 0; // FOV-толчок при выстреле
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  // Стартовая поза камеры: за кормой танка на спавне в гараре
  resetToSpawn() {
    this.yaw = this.targetYaw = BALANCE.map.spawn.yaw - Math.PI;
    this.pitch = this.targetPitch = 0.42;
    this.shakeAmp = 0;
    this.fovBoost = 0;
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
  }

  rotate(dx, dy) {
    this.targetYaw -= dx * 0.0026;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * 0.0022, 0.12, 1.05);
  }

  shake(amp) {
    this.shakeAmp = Math.min(this.shakeAmp + amp, 0.6);
  }

  kick(deg) {
    this.fovBoost = Math.min(this.fovBoost + deg, 6);
  }

  update(dt, targetPos) {
    // Камера догоняет мышь, а не повторяет её дёрганый след (экспоненциальное сглаживание)
    const k = 1 - Math.exp(-13 * dt);
    this.yaw += Math.atan2(Math.sin(this.targetYaw - this.yaw), Math.cos(this.targetYaw - this.yaw)) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;

    const hd = this.distance * Math.cos(this.pitch);
    const y = this.distance * Math.sin(this.pitch) + 1.6;
    this._pos.set(
      targetPos.x + Math.sin(this.yaw) * hd,
      y,
      targetPos.z + Math.cos(this.yaw) * hd
    );
    // Экспоненциальное сглаживание — камера «догоняет» танк, а не приклеена к нему
    this.camera.position.lerp(this._pos, 1 - Math.exp(-10 * dt));

    // Смотрим не на танк, а «за горизонт» над ним — иначе перекрестье
    // указывает в собственный корпус, и снаряды летят себе под гусеницы
    const fx = Math.sin(this.yaw + Math.PI);
    const fz = Math.cos(this.yaw + Math.PI);
    this._look.set(targetPos.x + fx * 18, 2.4, targetPos.z + fz * 18);
    this.camera.lookAt(this._look);

    if (this.shakeAmp > 0.001) {
      const s = this.shakeAmp;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shakeAmp *= Math.exp(-6 * dt);
    }

    // FOV-толчок: короткое «сжатие» картинки при выстреле
    if (this.fovBoost > 0.01) {
      this.camera.fov = 60 + this.fovBoost;
      this.camera.updateProjectionMatrix();
      this.fovBoost *= Math.exp(-7 * dt);
    } else if (this.camera.fov !== 60) {
      this.camera.fov = 60;
      this.camera.updateProjectionMatrix();
    }
  }

  // Куда должен доворачиваться танк: направление взгляда камеры
  facingYaw() {
    return this.yaw + Math.PI;
  }
}
