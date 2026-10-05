// Орбитальная камера из-за спины танка: мышь вращает камеру, башня доворачивается за ней.
// Плюс тряска на выстрелах/попаданиях.
import * as THREE from "three";

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;    // стартуем за кормой (танк смотрит в +Z)
    this.pitch = 0.42;     // рад, диапазон [0.12, 1.05]
    this.distance = 13;
    this.shakeAmp = 0;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  rotate(dx, dy) {
    this.yaw -= dx * 0.0026;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0022, 0.12, 1.05);
  }

  shake(amp) {
    this.shakeAmp = Math.min(this.shakeAmp + amp, 0.6);
  }

  update(dt, targetPos) {
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
    this._look.set(targetPos.x + fx * 26, 2.0, targetPos.z + fz * 26);
    this.camera.lookAt(this._look);

    if (this.shakeAmp > 0.001) {
      const s = this.shakeAmp;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.shakeAmp *= Math.exp(-6 * dt);
    }
  }

  // Куда должен доворачиваться танк: направление взгляда камеры
  facingYaw() {
    return this.yaw + Math.PI;
  }
}
