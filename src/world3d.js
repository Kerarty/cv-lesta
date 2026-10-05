// Мир: земля, пятна травы, декор, свет. Seed-генерация — карта одинаковая
// при каждом запуске (фича: HR увидит ту же карту, что и на скриншотах).
import * as THREE from "three";

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(scene) {
  const { width: W, depth: D } = BALANCE.world;

  // Свет: небо + солнце с тенями на всю карту
  scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x55703f, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2d9, 1.6);
  sun.position.set(60, 90, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -W / 2 - 15;
  sun.shadow.camera.right = W / 2 + 15;
  sun.shadow.camera.top = D / 2 + 15;
  sun.shadow.camera.bottom = -D / 2 - 15;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 250;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  // Земля
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ color: 0x55703f, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const rng = mulberry32(20261006);

  // Пятна травы — чтобы земля не была «резиновой»
  const patchMat = new THREE.MeshStandardMaterial({ color: 0x4c6538, roughness: 1 });
  const patchGeo = new THREE.CircleGeometry(1, 20);
  for (let i = 0; i < 60; i++) {
    const patch = new THREE.Mesh(patchGeo, patchMat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set((rng() - 0.5) * W, 0.02, (rng() - 0.5) * D);
    patch.scale.setScalar(1.5 + rng() * 4);
    scene.add(patch);
  }

  // Декор: деревья, камни, кусты
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f2f, roughness: 1, flatShading: true });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2e4a26, roughness: 1, flatShading: true });
  const canopyMat2 = new THREE.MeshStandardMaterial({ color: 0x3a5a2e, roughness: 1, flatShading: true });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8b83, roughness: 1, flatShading: true });
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x33502a, roughness: 1, flatShading: true });

  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.2, 6);
  const canopyGeo = new THREE.ConeGeometry(1.6, 3.4, 7);
  const rockGeo = new THREE.IcosahedronGeometry(0.9, 0);
  const bushGeo = new THREE.IcosahedronGeometry(0.6, 0);

  const types = ["tree", "tree", "tree", "rock", "rock", "bush"];
  const colliders = [];
  for (let i = 0; i < 70; i++) {
    const x = (rng() - 0.5) * (W - 12);
    const z = (rng() - 0.5) * (D - 12);
    const type = types[Math.floor(rng() * types.length)];
    const s = 0.8 + rng() * 0.8;

    const g = new THREE.Group();
    if (type === "tree") {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.1;
      const canopy = new THREE.Mesh(canopyGeo, rng() < 0.5 ? canopyMat : canopyMat2);
      canopy.position.y = 3.2;
      trunk.castShadow = canopy.castShadow = true;
      g.add(trunk, canopy);
    } else if (type === "rock") {
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.y = 0.5;
      rock.castShadow = rock.receiveShadow = true;
      g.add(rock);
    } else {
      const bush = new THREE.Mesh(bushGeo, bushMat);
      bush.position.y = 0.45;
      bush.castShadow = true;
      g.add(bush);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rng() * Math.PI * 2;
    g.scale.setScalar(s);
    scene.add(g);
    colliders.push({ x, z, r: (type === "tree" ? 0.6 : 0.9) * s });
  }

  return { colliders };
}
