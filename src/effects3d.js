// Общие эффекты: мягкие спрайты (дым, пыль) на канвас-текстурах.
// Используется стрельбой (дым взрывов) и движением (пыль из-под гусениц).
import * as THREE from "three";

function softCircleTexture(inner, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Puffs {
  constructor(scene, { inner = "rgba(255,255,255,0.9)", outer = "rgba(255,255,255,0)" } = {}) {
    this.scene = scene;
    this.items = [];
    this.texture = softCircleTexture(inner, outer);
  }

  spawn(pos, { scale = 1, growth = 1.6, life = 1.0, rise = 1.2, opacity = 0.65, drift = 0.4 } = {}) {
    const mat = new THREE.SpriteMaterial({
      map: this.texture, transparent: true, depthWrite: false, opacity,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.setScalar(scale);
    this.scene.add(s);
    this.items.push({
      s, t: 0, life, growth, rise, opacity,
      vx: (Math.random() - 0.5) * drift,
      vz: (Math.random() - 0.5) * drift,
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.t += dt / p.life;
      if (p.t >= 1) {
        this.scene.remove(p.s);
        p.s.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      p.s.scale.addScalar(p.growth * dt);
      p.s.position.y += p.rise * dt;
      p.s.position.x += p.vx * dt;
      p.s.position.z += p.vz * dt;
      p.s.material.opacity = p.opacity * (1 - p.t);
    }
  }
}
