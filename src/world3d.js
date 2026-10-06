// Мир v0.14 «стрельбище»: градиентное небо с солнцем, облака, земля,
// дороги гаража, зона мишеней за бруствером, 3D-гараж со спавном,
// плотный лес по периметру (инстансинг), декор. Seed-генерация — карта
// одинаковая при каждом запуске.
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

// Полотно дороги: асфальт с бордюрными линиями и осевой штриховкой.
// X канваса = вдоль дороги, Y = поперёк.
function roadTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const rng = mulberry32(90210);
  g.fillStyle = "#4a4d54";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1600; i++) {
    const v = 58 + Math.floor(rng() * 62);
    g.fillStyle = `rgba(${v},${v},${v + 6},0.22)`;
    g.fillRect(rng() * 128, rng() * 128, 2, 2);
  }
  g.fillStyle = "rgba(212,206,176,0.5)";
  g.fillRect(0, 5, 128, 3);
  g.fillRect(0, 120, 128, 3);
  g.fillStyle = "rgba(226,214,150,0.75)";
  g.fillRect(0, 61, 64, 6); // осевая: 4 м штрих / 4 м пробел при тайле 8 м
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Земля зоны мишеней: глина с колеёй и разбросанным песком
function rangeTexture(rng) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#9a7857";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const x = rng() * 256, y = rng() * 256, r = 18 + rng() * 46;
    const col = rng() < 0.5 ? "146,114,84" : "170,140,106";
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${col},0.35)`);
    grad.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = rng() < 0.5 ? "rgba(96,74,52,0.35)" : "rgba(198,172,138,0.3)";
    g.fillRect(rng() * 256, rng() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 9);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Табличка на столбике: «10м», «20м»… — метки дистанции на стрельбище
function labelTexture(text) {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#ffd27a";
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = "#1a1f16";
  g.font = "bold 42px Consolas, monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Расстояние от точки до отрезка на плоскости XZ — для проверки «занято» зон
function pointSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function createWorld(scene) {
  const { width: W, depth: D } = BALANCE.world;
  const M = BALANCE.map;
  const rng = mulberry32(20261006);

  // Зоны, свободные от декора: полотно дорог, ангар, зона мишеней.
  // Иначе дерево встаёт на дорогу, а куст — прямо в линию огня.
  function isReserved(x, z) {
    const half = M.roadWidth / 2 + 1.6;
    for (const r of M.roads) {
      if (pointSegDist(x, z, r.ax, r.az, r.bx, r.bz) < half) return true;
    }
    const H = M.hangar;
    if (x > H.x0 - 3 && x < H.x1 + 3 && z > H.z0 - 3 && z < H.z1 + 3) return true;
    const G = M.range;
    if (x > G.x0 - 2.5 && x < G.x1 + 2 && z > G.z0 - 2.5 && z < G.z1 + 2) return true;
    return false;
  }

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
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x8e8e86, roughness: 1, flatShading: true });
  const yellowMat = new THREE.MeshStandardMaterial({ color: 0xd8b24a, roughness: 0.9 });

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

  // =======================================================================
  // ДОРОГИ (синие на эскизе) — полотно 9 м с осевой разметкой
  // =======================================================================
  const roadBase = roadTexture();
  const roadLen = (r) => Math.hypot(r.bx - r.ax, r.bz - r.az);
  for (const r of M.roads) {
    const len = roadLen(r);
    const tex = roadBase.clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(len / 8)), 1); // тайл = 8 м: 4 м штрих / 4 м пробел
    // Поворот в XZ запекаем в геометрию: у Euler (x=-90°, y=θ) мировая ось
    // наклоняется, и полотно встаёт вертикально. После bake — только поворот вокруг Y.
    const geo = new THREE.PlaneGeometry(len, M.roadWidth);
    geo.rotateX(-Math.PI / 2);
    const road = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    );
    road.rotation.y = -Math.atan2(r.bz - r.az, r.bx - r.ax);
    road.position.set((r.ax + r.bx) / 2, 0.03, (r.az + r.bz) / 2);
    road.receiveShadow = true;
    scene.add(road);
  }

  // =======================================================================
  // ЗОНА МИШЕНЕЙ (красная на эскизе) — глина + бетонный бруствер с тыла
  // =======================================================================
  const G = M.range;
  const rangePatch = new THREE.Mesh(
    new THREE.PlaneGeometry(G.x1 - G.x0, G.z1 - G.z0),
    new THREE.MeshStandardMaterial({ map: rangeTexture(rng), roughness: 1 })
  );
  rangePatch.rotation.x = -Math.PI / 2;
  rangePatch.position.set((G.x0 + G.x1) / 2, 0.02, (G.z0 + G.z1) / 2);
  rangePatch.receiveShadow = true;
  scene.add(rangePatch);

  // Бруствер: запад, север и юг. Восток открыт к стрелковой линии (дорога A).
  const bermH = 0.7, bermT = 1.0;
  const berms = [
    { w: bermT, d: G.z1 - G.z0 + bermT, x: G.x0, z: (G.z0 + G.z1) / 2 },
    { w: G.x1 - G.x0 + bermT, d: bermT, x: (G.x0 + G.x1) / 2, z: G.z0 },
    { w: G.x1 - G.x0 + bermT, d: bermT, x: (G.x0 + G.x1) / 2, z: G.z1 },
  ];
  for (const b of berms) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(b.w, bermH, b.d), concreteMat);
    slab.position.set(b.x, bermH / 2, b.z);
    slab.castShadow = slab.receiveShadow = true;
    scene.add(slab);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.1, 0.12, b.d + 0.1), yellowMat);
    cap.position.set(b.x, bermH + 0.06, b.z);
    cap.castShadow = true;
    scene.add(cap);
  }

  // Метки дистанции от стрелковой линии (дорога A, x = −22) вдоль южного края зоны
  for (const d of [10, 20, 30]) {
    const x = M.roads[1].ax - d;
    const z = G.z1 + 3;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.6, 0.22), concreteMat);
    post.position.set(x, 0.8, z);
    post.castShadow = true;
    scene.add(post);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.65),
      new THREE.MeshBasicMaterial({ map: labelTexture(`${d}м`), side: THREE.DoubleSide })
    );
    plate.position.set(x, 1.5, z);
    plate.rotation.y = Math.PI / 2; // лицом к дороге (+X)
    scene.add(plate);
  }

  // =======================================================================
  // ГАРАЖ (чёрный на эскизе) — спавн игрока, выезд на запад
  // =======================================================================
  const H = M.hangar;
  const hangarGroup = new THREE.Group();
  scene.add(hangarGroup);
  const wallT = 0.8;

  const box = (w, h, d, x, y, z, mat, cast = true, recv = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = recv;
    hangarGroup.add(m);
    return m;
  };

  const hangarW = H.x1 - H.x0, hangarD = H.z1 - H.z0;
  const cx = (H.x0 + H.x1) / 2, cz = (H.z0 + H.z1) / 2;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x6a6f63, roughness: 1, flatShading: true });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x76766e, roughness: 1 });

  // Пол: плита утоплена в землю, верх на уровне грунта — танк не «висит»
  box(hangarW + wallT, 0.24, hangarD + wallT, cx, -0.1, cz, slabMat, false, true);

  // Стены: восток, север, юг — целиком; запад — простенок между двумя выездами
  box(wallT, H.wall, hangarD + wallT, H.x1, H.wall / 2, cz, wallMat);
  box(hangarW + wallT, H.wall, wallT, cx, H.wall / 2, H.z0, wallMat);
  box(hangarW + wallT, H.wall, wallT, cx, H.wall / 2, H.z1, wallMat);
  box(wallT, H.wall, 5, H.x0, H.wall / 2, 1.5, wallMat); // простенок: z −1…4

  // Перемычка над выездами — ворота читаются как ворота
  box(wallT, H.wall - 6.2, hangarD + wallT, H.x0, 6.2 + (H.wall - 6.2) / 2, cz, wallMat);

  // Крыша (прячется, когда камера поднимается выше — см. main3d)
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(hangarW + 1.2, 0.6, hangarD + 1.2),
    new THREE.MeshStandardMaterial({ color: 0x565b51, roughness: 1 })
  );
  roof.position.set(cx, H.roof, cz);
  roof.castShadow = true;
  roof.receiveShadow = true;
  hangarGroup.add(roof);

  // Жёлтые балки над выездами: «сюда выезжают»
  box(0.9, 0.5, 12.5, H.x0, 6.0, (H.z0 + -1) / 2, yellowMat);
  box(0.9, 0.5, 11.5, H.x0, 6.0, (4 + H.z1) / 2, yellowMat);

  // Стропила под крышей — гараж читается объёмным, а не коробкой
  for (let i = 0; i < 4; i++) {
    const z = H.z0 + 4 + (i * (hangarD - 8)) / 3;
    box(hangarW - 1, 0.45, 0.45, cx, H.wall - 0.4, z, wallMat, false, false);
  }

  // Свет внутри: солнце сюда не достаёт, без ламп интерьер чёрный
  const garageLight = new THREE.PointLight(0xffeccf, 520, 70, 2);
  garageLight.position.set(cx + 2, H.wall - 1.4, cz);
  hangarGroup.add(garageLight);
  for (let i = 0; i < 3; i++) {
    const z = H.z0 + 5 + (i * (hangarD - 10)) / 2;
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.16, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xfff0cf })
    );
    lamp.position.set(cx + 2, H.wall - 0.8, z);
    hangarGroup.add(lamp);
  }

  // Место постановки: жёлтая разметка под танком на спавне
  const bay = { w: 3.2, d: 7.2 };
  const bayLine = (w, d, x, z) =>
    box(w, 0.06, d, M.spawn.x + x, 0.04, M.spawn.z + z, yellowMat, false, true);
  bayLine(bay.w, 0.14, 0, -(bay.d / 2 - 0.07));
  bayLine(bay.w, 0.14, 0, bay.d / 2 - 0.07);
  bayLine(0.14, bay.d, -(bay.w / 2 - 0.07), 0);
  bayLine(0.14, bay.d, bay.w / 2 - 0.07, 0);

  // Хозблок: бочки, ящики, верстак — масштаб и «жилой» гараж
  const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.05, 10);
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x7d5a3a, roughness: 1, flatShading: true });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x8a7146, roughness: 1, flatShading: true });
  for (const [bx, bz] of [[H.x1 - 2.5, H.z0 + 3], [H.x1 - 3.4, H.z0 + 3.6], [H.x1 - 2.6, H.z1 - 3]]) {
    const barrel = new THREE.Mesh(barrelGeo, rustMat);
    barrel.position.set(bx, 0.53, bz);
    barrel.castShadow = barrel.receiveShadow = true;
    hangarGroup.add(barrel);
  }
  for (const [bx, bz, s] of [[H.x1 - 4, H.z1 - 4.5, 1.1], [H.x1 - 6.2, H.z1 - 4, 0.9]]) {
    box(1.4 * s, 1.0 * s, 1.4 * s, bx, 0.5 * s, bz, crateMat);
  }
  box(4.5, 0.16, 1.1, H.x1 - 3, 1.05, cz, crateMat); // верстак
  box(4.5, 1.0, 0.12, H.x1 - 3, 1.6, cz + 0.5, wallMat); // стена за верстаком

  // =======================================================================
  // ДЕКОР (75 объектов, вразброс) — мимо дорог, ангара и зоны мишеней
  // =======================================================================
  const colliders = [];
  const types = ["spruce", "spruce", "spruce", "tree", "rock", "rock", "bush"];
  for (let i = 0, placed = 0; i < 260 && placed < 75; i++) {
    const x = (rng() - 0.5) * (W - 12);
    const z = (rng() - 0.5) * (D - 12);
    if (isReserved(x, z)) continue;
    placed++;
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

  // =======================================================================
  // ЛЕС ПО ПЕРИМЕТРУ: два ряда + кустарник, всё через InstancedMesh
  // (560 деревьев × 3 меша = 1680 draw call — нельзя; инстансинг даёт 7 мешей)
  // =======================================================================
  const trunkM = [];
  const lowM = [[], [], []];
  const topM = [[], [], []];
  const brushM = [];
  const _e = new THREE.Euler();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const put = (arr, x, y, z, ry, sc) => {
    _e.set(0, ry, 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    _s.setScalar(sc);
    arr.push(new THREE.Matrix4().compose(_p, _q, _s));
  };

  const placeTree = (offMin, offMax, sMin, sMax) => {
    const side = Math.floor(rng() * 4);
    const off = offMin + rng() * (offMax - offMin);
    const along = (rng() - 0.5) * (Math.max(W, D) + 130);
    let x, z;
    if (side === 0)      { x = along; z = -D / 2 - off; }
    else if (side === 1) { x = along; z = D / 2 + off; }
    else if (side === 2) { x = -W / 2 - off; z = along; }
    else                 { x = W / 2 + off; z = along; }
    const sc = sMin + rng() * (sMax - sMin);
    const ry = rng() * Math.PI * 2;
    put(trunkM, x, 1.2 * sc, z, ry, sc);
    const v = Math.floor(rng() * 3);
    put(lowM[v], x, 2.6 * sc, z, ry, sc);
    put(topM[v], x, 4.1 * sc, z, ry, sc);
  };

  for (let i = 0; i < 330; i++) placeTree(5, 16, 0.9, 1.5);  // ближний ряд
  for (let i = 0; i < 250; i++) placeTree(17, 34, 1.5, 2.7); // дальний ряд
  for (let i = 0; i < 240; i++) {
    const side = Math.floor(rng() * 4);
    const off = 4 + rng() * 20;
    const along = (rng() - 0.5) * (Math.max(W, D) + 110);
    let x, z;
    if (side === 0)      { x = along; z = -D / 2 - off; }
    else if (side === 1) { x = along; z = D / 2 + off; }
    else if (side === 2) { x = -W / 2 - off; z = along; }
    else                 { x = W / 2 + off; z = along; }
    const sc = 0.8 + rng() * 1.2;
    put(brushM, x, 0.45 * sc, z, rng() * Math.PI * 2, sc);
  }

  const instanced = (geo, mat, mats) => {
    if (!mats.length) return;
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.frustumCulled = false; // bounding sphere не пересчитывается — рисуем всегда
    scene.add(im);
  };
  instanced(trunkGeo, trunkMat, trunkM);
  for (let v = 0; v < 3; v++) {
    instanced(spruceGeoLow, spruceMats[v], lowM[v]);
    instanced(spruceGeoTop, spruceMats[v], topM[v]);
  }
  instanced(bushGeo, bushMat, brushM);

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

  // --- Трава: кустики одним InstancedMesh, тоже мимо дорог и построек ---
  const tuftGeo = new THREE.ConeGeometry(0.05, 0.42, 4);
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const TUFT_MAX = 450;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFT_MAX);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let tuftCount = 0;
  for (let i = 0; i < TUFT_MAX * 3 && tuftCount < TUFT_MAX; i++) {
    const x = (rng() - 0.5) * (W - 6);
    const z = (rng() - 0.5) * (D - 6);
    if (isReserved(x, z)) continue;
    _e.set((rng() - 0.5) * 0.35, rng() * Math.PI, (rng() - 0.5) * 0.35);
    _q.setFromEuler(_e);
    _p.set(x, 0.16, z);
    const sc = 0.7 + rng() * 0.9;
    _s.set(sc, sc * (0.8 + rng() * 0.8), sc);
    tufts.setMatrixAt(tuftCount, m4.compose(_p, _q, _s));
    col.setHSL(0.25 + rng() * 0.05, 0.35 + rng() * 0.15, 0.26 + rng() * 0.12);
    tufts.setColorAt(tuftCount, col);
    tuftCount++;
  }
  tufts.count = tuftCount;
  tufts.instanceMatrix.needsUpdate = true;
  if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
  scene.add(tufts);

  return { colliders, roof, garageLight };
}