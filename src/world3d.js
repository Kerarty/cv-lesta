// Мир: градиентное небо с солнцем, облака, текстурированная земля,
// детальный декор (деревья, «рваные» камни, кусты, трава), свет с тенями.
// Seed-генерация — карта одинаковая при каждом запуске.
import * as THREE from "three";

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Детерминированный «шум» по позиции: общие вершины смещаются одинаково, без трещин
function radialJitter(geo, amt) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    const r = (n - Math.floor(n)) * 2 - 1;
    const len = Math.hypot(x, y, z) || 1;
    const k = 1 + (r * amt) / len;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

function groundTexture(rng) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#55703f";
  g.fillRect(0, 0, 512, 512);

  // Большие мягкие пятна — неоднородность дёрна
  for (let i = 0; i < 70; i++) {
    const x = rng() * 512, y = rng() * 512, r = 25 + rng() * 70;
    const col = rng() < 0.5 ? "76,101,56" : "95,122,70";
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${col},0.30)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // Крапинки травы
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = rng() < 0.5 ? "rgba(58,80,44,0.5)" : "rgba(112,142,86,0.45)";
    g.fillRect(rng() * 512, rng() * 512, 2, 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createWorld(scene) {
  const { width: W, depth: D } = BALANCE.world;
  const rng = mulberry32(20261006);

  // --- Свет: тёплое солнце + холодное небо ---
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x51693f, 0.55));
  const sun = new THREE.DirectionalLight(0xffe3b0, 2.2);
  sun.position.set(60, 90, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -W / 2 - 15;
  sun.shadow.camera.right = W / 2 + 15;
  sun.shadow.camera.top = D / 2 + 15;
  sun.shadow.camera.bottom = -D / 2 - 15;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 260;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  // --- Небо: купол с градиентом, солнечным диском и ореолом ---
  const sunDir = sun.position.clone().normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(420, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x4f7fc0) },
        horizon: { value: new THREE.Color(0xdfe9f0) },
        sunDir: { value: sunDir },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = smoothstep(-0.05, 0.45, d.y);
          vec3 col = mix(horizon, top, h);
          float sd = max(dot(d, normalize(sunDir)), 0.0);
          float sunDisc = pow(sd, 900.0) * 1.3;
          float halo = pow(sd, 14.0) * 0.20;
          col += vec3(1.0, 0.92, 0.75) * (sunDisc + halo);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0xd6e2ea, 90, 280);

  // --- Облака: мягкие плоские спрайты ---
  const cloudTexCanvas = document.createElement("canvas");
  cloudTexCanvas.width = cloudTexCanvas.height = 64;
  const cg = cloudTexCanvas.getContext("2d");
  const cgrad = cg.createRadialGradient(32, 32, 4, 32, 32, 30);
  cgrad.addColorStop(0, "rgba(255,255,255,0.9)");
  cgrad.addColorStop(1, "rgba(255,255,255,0)");
  cg.fillStyle = cgrad;
  cg.fillRect(0, 0, 64, 64);
  const cloudTex = new THREE.CanvasTexture(cloudTexCanvas);
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.55 });
    const cloud = new THREE.Sprite(mat);
    cloud.position.set((rng() - 0.5) * 500, 75 + rng() * 45, (rng() - 0.5) * 500);
    cloud.scale.set(30 + rng() * 45, 10 + rng() * 12, 1);
    scene.add(cloud);
  }

  // --- Подложка за пределами карты: за границей — земля, а не пустота ---
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshStandardMaterial({ color: 0x4f6840, roughness: 1 })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.08;
  apron.receiveShadow = true;
  scene.add(apron);

  // --- Земля ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: groundTexture(rng), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- Материалы и геометрии декора ---
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4f2f, roughness: 1, flatShading: true });
  const spruceMats = [0x2e4a26, 0x35542a, 0x2a451f].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true })
  );
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x3d5c2e, roughness: 1, flatShading: true });
  const rockMats = [0x8b8b83, 0x9a9a90, 0x7f7f78].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true })
  );
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x33502a, roughness: 1, flatShading: true });

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 6);
  const spruceGeoLow = new THREE.ConeGeometry(1.7, 2.4, 7);
  const spruceGeoTop = new THREE.ConeGeometry(1.2, 2.0, 7);
  const canopyGeo = radialJitter(new THREE.IcosahedronGeometry(1.4, 1), 0.5);
  const rockGeos = [
    radialJitter(new THREE.IcosahedronGeometry(1.0, 1), 0.55),
    radialJitter(new THREE.IcosahedronGeometry(0.9, 1), 0.7),
    radialJitter(new THREE.IcosahedronGeometry(1.1, 1), 0.45),
  ];
  const bushGeo = radialJitter(new THREE.IcosahedronGeometry(0.65, 1), 0.4);

  const colliders = [];
  const types = ["spruce", "spruce", "spruce", "tree", "rock", "rock", "bush"];
  for (let i = 0; i < 75; i++) {
    const x = (rng() - 0.5) * (W - 12);
    const z = (rng() - 0.5) * (D - 12);
    const type = types[Math.floor(rng() * types.length)];
    const s = 0.8 + rng() * 0.8;
    const g = new THREE.Group();

    if (type === "spruce") {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.2;
      const low = new THREE.Mesh(spruceGeoLow, spruceMats[Math.floor(rng() * spruceMats.length)]);
      low.position.y = 2.6;
      const top = new THREE.Mesh(spruceGeoTop, low.material);
      top.position.y = 4.1;
      trunk.castShadow = low.castShadow = top.castShadow = true;
      g.add(trunk, low, top);
    } else if (type === "tree") {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.0;
      trunk.scale.y = 0.9;
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      canopy.position.y = 2.9;
      canopy.scale.setScalar(0.9 + rng() * 0.5);
      trunk.castShadow = canopy.castShadow = true;
      g.add(trunk, canopy);
    } else if (type === "rock") {
      const rock = new THREE.Mesh(rockGeos[Math.floor(rng() * rockGeos.length)], rockMats[Math.floor(rng() * rockMats.length)]);
      rock.position.y = 0.45;
      rock.castShadow = rock.receiveShadow = true;
      g.add(rock);
    } else {
      const n = 2 + Math.floor(rng() * 2);
      for (let j = 0; j < n; j++) {
        const bush = new THREE.Mesh(bushGeo, bushMat);
        bush.position.set((rng() - 0.5) * 0.8, 0.4, (rng() - 0.5) * 0.8);
        bush.scale.setScalar(0.7 + rng() * 0.6);
        bush.castShadow = true;
        g.add(bush);
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = rng() * Math.PI * 2;
    g.scale.setScalar(s);
    scene.add(g);
    colliders.push({ x, z, r: (type === "spruce" || type === "tree" ? 0.6 : 0.9) * s });
  }

  // --- Лес-стена по периметру: плотная полоса, скрывающая границу карты ---
  for (let i = 0; i < 260; i++) {
    const side = Math.floor(rng() * 4);
    const off = 5 + rng() * 22; // полоса за границей playable-зоны
    const along = (rng() - 0.5) * (Math.max(W, D) + 70);
    let x, z;
    if (side === 0)      { x = along; z = -D / 2 - off; }
    else if (side === 1) { x = along; z = D / 2 + off; }
    else if (side === 2) { x = -W / 2 - off; z = along; }
    else                 { x = W / 2 + off; z = along; }

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.2;
    const low = new THREE.Mesh(spruceGeoLow, spruceMats[Math.floor(rng() * spruceMats.length)]);
    low.position.y = 2.6;
    const top = new THREE.Mesh(spruceGeoTop, low.material);
    top.position.y = 4.1;
    trunk.castShadow = low.castShadow = top.castShadow = true;

    const wallTree = new THREE.Group();
    wallTree.add(trunk, low, top);
    wallTree.position.set(x, 0, z);
    wallTree.rotation.y = rng() * Math.PI * 2;
    wallTree.scale.setScalar(1.0 + rng() * 1.1);
    scene.add(wallTree);
  }

  // --- Холмы на горизонте: силуэты в дымке ---
  const hillGeo = radialJitter(new THREE.IcosahedronGeometry(1, 1), 0.35);
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x5d7549, roughness: 1, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.5;
    const dist = 200 + rng() * 70;
    const hill = new THREE.Mesh(hillGeo, hillMat);
    hill.position.set(Math.cos(a) * dist, -8, Math.sin(a) * dist);
    hill.scale.set(50 + rng() * 40, 16 + rng() * 14, 50 + rng() * 40);
    scene.add(hill);
  }

  // --- Трава: 450 кустиков одним InstancedMesh ---
  const tuftGeo = new THREE.ConeGeometry(0.05, 0.42, 4);
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 450);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sv = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < 450; i++) {
    v.set((rng() - 0.5) * (W - 6), 0.16, (rng() - 0.5) * (D - 6));
    e.set((rng() - 0.5) * 0.35, rng() * Math.PI, (rng() - 0.5) * 0.35);
    q.setFromEuler(e);
    const sc = 0.7 + rng() * 0.9;
    sv.set(sc, sc * (0.8 + rng() * 0.8), sc);
    m4.compose(v, q, sv);
    tufts.setMatrixAt(i, m4);
    col.setHSL(0.25 + rng() * 0.05, 0.35 + rng() * 0.15, 0.26 + rng() * 0.12);
    tufts.setColorAt(i, col);
  }
  tufts.instanceColor.needsUpdate = true;
  scene.add(tufts);

  return { colliders };
}
