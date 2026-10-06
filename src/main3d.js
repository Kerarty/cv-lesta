// Точка входа 3D-версии. Резюме: В БОЙ!
import * as THREE from "three";
import { createWorld } from "./world3d.js";
import { Tank, TANK_BUILD } from "./tank3d.js";
import { CameraRig } from "./camera3d.js";
import { Gun } from "./shooting3d.js";
import { Puffs } from "./effects3d.js";
import { ResumeTargets } from "./targets.js";

const canvas = document.getElementById("scene");
const overlay = document.getElementById("lockOverlay");
const reloadArc = document.getElementById("reloadArc");
const RING_C = 2 * Math.PI * 24;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd6e2ea);
scene.fog = new THREE.Fog(0xd6e2ea, 90, 280);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);

const world = createWorld(scene);
const tank = new Tank(scene);
// GLB-модель танка; при ошибке загрузки остаётся процедурная заглушка
tank.attachModel("assets/models/Tank.glb").catch((err) =>
  console.warn("Модель танка не загрузилась:", err)
);
const rig = new CameraRig(camera);
const gun = new Gun(scene, rig);

// Старт — в гараже: машина на разметке носом к выезду, камера за кормой
tank.resetToSpawn();
rig.resetToSpawn();

// Цели-секции резюме: кристаллы с HP по балансу, штаб патрулирует в зоне
const targetsMgr = new ResumeTargets(scene, camera);
const targets = targetsMgr.items;
const defById = Object.fromEntries(BALANCE.targets.map((d) => [d.id, d]));
const hex = (c) => `#${c.toString(16).padStart(6, "0")}`;

// --- Прогресс боя: XP, счётчик секций, победа ---
let xp = 0;
let destroyed = 0;
let battleStart = 0; // момент первого взятия управления
let shotsFired = 0;
let shotsHit = 0;
let damageDealt = 0;
let mode = BALANCE.defaultMode;
const totalTargets = BALANCE.targets.length;
const xpEl = document.getElementById("xp");
const objEl = document.getElementById("objCounter");
const feed = document.getElementById("killfeed");
const cardEl = document.getElementById("card");
const endScreen = document.getElementById("endScreen");

function updateHud() {
  xpEl.textContent = `Опыт: ${xp}`;
  objEl.textContent = `Секции: ${destroyed}/${totalTargets}`;
}

function killFeed(html) {
  const el = document.createElement("div");
  el.className = "kf";
  el.innerHTML = html;
  feed.prepend(el);
  while (feed.children.length > 4) feed.lastChild.remove();
  setTimeout(() => el.remove(), 6000);
}

let cardTimer = 0;
function showCard(id) {
  const s = RESUME.sections[id];
  if (!s) return;
  // Акцент карточки = цвет мишени = цена секции
  const color = hex(defById[id]?.color ?? 0xffd27a);
  cardEl.style.borderLeftColor = color;
  document.getElementById("cardTitle").style.color = color;
  document.getElementById("cardTitle").textContent = s.title;
  document.getElementById("cardText").textContent = s.text;
  cardEl.classList.add("show");
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => cardEl.classList.remove("show"), 14000);
}
document.getElementById("cardClose").addEventListener("click", () => {
  clearTimeout(cardTimer);
  cardEl.classList.remove("show");
});

function contactsHtml() {
  const c = RESUME.contacts;
  const row = (label, value, href) =>
    value.includes("[ЗАПОЛНИТЬ")
      ? `<div class="row"><span class="label">${label}</span>${value}</div>`
      : `<div class="row"><span class="label">${label}</span><a href="${href}" target="_blank">${value}</a></div>`;
  return (
    row("Email", c.email, `mailto:${c.email}`) +
    row("Telegram", c.telegram, `https://t.me/${c.telegram.replace("@", "")}`) +
    row("GitHub", c.github, `https://${c.github}`) +
    (c.phone && !c.phone.includes("[ЗАПОЛНИТЬ") ? row("Телефон", c.phone, `tel:${c.phone}`) : "")
  );
}

function showEnd(mode_) {
  document.exitPointerLock?.();
  input.firing = false;
  const secs = battleStart ? Math.round((performance.now() - battleStart) / 1000) : 0;
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, "0");
  const acc = shotsFired ? Math.round((shotsHit / shotsFired) * 100) : 100;
  document.getElementById("endTitle").textContent = mode_ === "victory" ? "ПОБЕДА!" : "Контакты";
  document.getElementById("endStats").innerHTML = mode_ === "victory"
    ? `Винрейт 100% · Опыт +${xp} · Время боя ${mm}:${ss}<br>` +
      `Точность ${acc}% · Урон ${damageDealt} · Знание баланса: 100%`
    : `Винрейт ещё не заработан · Опыт +${xp}`;
  document.getElementById("endContacts").innerHTML = contactsHtml();
  document.getElementById("endSign").textContent = mode_ === "victory"
    ? `Готов балансить ваши танки — ${RESUME.name} (${RESUME.role})`
    : RESUME.role;
  endScreen.classList.add("show");
}
document.getElementById("backBtn").addEventListener("click", newBattle);
document.getElementById("contactsBtn").addEventListener("click", () => showEnd("contacts"));

// «Новый бой»: полный сброс сессии — цели на местах, счётчики в ноль,
// танк снова на разметке в гараже. Без этого кнопка вела бы в пустую карту.
function newBattle() {
  endScreen.classList.remove("show");
  xp = 0;
  destroyed = 0;
  shotsFired = 0;
  shotsHit = 0;
  damageDealt = 0;
  battleStart = 0;
  targetsMgr.reset();
  for (const t of targets) t.onHit = () => applyDamage(t, BALANCE.tank.damage);
  tank.resetToSpawn();
  rig.resetToSpawn();
  feed.innerHTML = "";
  cardEl.classList.remove("show");
  updateHud();
  startBattle();
}

// Патч-ноты в ангаре: ченджлог баланса из balance.js
document.getElementById("patchNotes").innerHTML = BALANCE.patchNotes
  .map((n) => `<div class="pn-row"><span class="pn-v">${n.v}</span> — ${n.text}</div>`)
  .join("");

// Легенда ценности: цвет мишени = XP секции (рампа в balance.js)
document.getElementById("legend").innerHTML =
  BALANCE.targets
    .map((d) => {
      const title = RESUME.sections[d.id]?.title ?? d.id;
      return `<span class="lg"><i style="background:${hex(d.color)}"></i>${title} · ${d.xp}</span>`;
    })
    .join("") + `<span class="cap">цвет мишени = ценность секции, дальше = дороже</span>`;

// Режимы HR / Геймдизайнер: перезарядка и авто-наведение
function setMode(m) {
  mode = m;
  BALANCE.tank.reload = BALANCE.modes[m].reload;
  document.querySelectorAll(".mode").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === m)
  );
}
document.querySelectorAll(".mode").forEach((b) =>
  b.addEventListener("click", () => setMode(b.dataset.mode))
);
setMode(BALANCE.defaultMode);

function applyDamage(t, dmg) {
  if (t.dead) return;
  shotsHit++;
  damageDealt += Math.min(dmg, t.hp);
  t.hp -= dmg;
  t.flash();
  t.updateBar();
  if (t.hp <= 0) destroyTarget(t);
}

function destroyTarget(t) {
  t.dead = true;
  gun.explode(t.pos.clone().setY(1.2), 1.7);
  gun.smoke.spawn(t.pos.clone().setY(1.6), { scale: 2.2, growth: 2.4, life: 1.6, rise: 1.8, opacity: 0.6 });
  rig.shake(0.4);
  t.hide();
  targets.splice(targets.indexOf(t), 1);
  xp += t.xp;
  destroyed++;
  updateHud();
  killFeed(`<b>${RESUME.nickname} [CV]</b> уничтожил секцию «${t.title}» <b>+${t.xp} XP</b>`);
  showCard(t.id);
  if (destroyed === totalTargets) setTimeout(() => showEnd("victory"), 900);
}

for (const t of targets) {
  t.onHit = () => applyDamage(t, BALANCE.tank.damage);
}

// --- Ввод ---
const input = { forward: false, backward: false, left: false, right: false, firing: false };
const keyMap = {
  KeyW: "forward", ArrowUp: "forward",
  KeyS: "backward", ArrowDown: "backward",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  Space: "firing",
};
addEventListener("keydown", (e) => {
  const k = keyMap[e.code];
  if (k) { input[k] = true; e.preventDefault(); }
});
addEventListener("keyup", (e) => {
  const k = keyMap[e.code];
  if (k) input[k] = false;
});
addEventListener("mousedown", (e) => {
  // пока открыт стартовый экран/пауза — клики в интерфейс, а не выстрелы
  if (e.button === 0 && overlay.classList.contains("hidden")) input.firing = true;
});
addEventListener("mouseup", (e) => {
  if (e.button === 0) input.firing = false;
});
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement || (dragMode && e.buttons & 1)) {
    rig.rotate(e.movementX, e.movementY);
  }
});

// Pointer lock с fallback: если браузер не дал захват мыши — вращаем камеру с зажатой ЛКМ
let dragMode = false;
function startBattle() {
  endScreen.classList.remove("show");
  // Таймер боя стартует по кнопке, а не по захвату мыши: в drag-режиме
  // (pointer lock запрещён) экран победы раньше показывал «Время боя 0:00».
  if (!battleStart) battleStart = performance.now();
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => enableDragMode());
  } catch {
    enableDragMode();
  }
  setTimeout(() => { if (!document.pointerLockElement) enableDragMode(); }, 400);
}
document.getElementById("battleBtn").addEventListener("click", startBattle);
function enableDragMode() {
  dragMode = true;
  overlay.classList.add("hidden");
}
document.addEventListener("pointerlockchange", () => {
  overlay.classList.toggle("hidden", !!document.pointerLockElement || dragMode);
});
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && dragMode) {
    dragMode = false;
    overlay.classList.remove("hidden");
  }
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Пыль из-под гусениц на ходу
const dust = new Puffs(scene, {
  inner: "rgba(175,170,140,0.6)",
  outer: "rgba(175,170,140,0)",
});
let dustTimer = 0;
const dustOffset = new THREE.Vector3();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Камера не выходит сквозь стены ангара: пока она ниже крыши, держим её внутри бокса.
// Иначе на спавне камера смотрит через заднюю стену, а игрок — в кирпич.
function clampCameraToHangar(cam) {
  const H = BALANCE.map.hangar;
  const pad = 0.9;
  if (cam.position.y > H.wall) return;
  const near =
    cam.position.x > H.x0 - pad && cam.position.x < H.x1 + pad &&
    cam.position.z > H.z0 - pad && cam.position.z < H.z1 + pad;
  if (!near) return;
  cam.position.x = THREE.MathUtils.clamp(cam.position.x, H.x0 + pad, H.x1 - pad);
  cam.position.z = THREE.MathUtils.clamp(cam.position.z, H.z0 + pad, H.z1 - pad);
}

// --- Игровой цикл ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  tank.update(dt, input);
  rig.update(dt, tank.group.position);
  clampCameraToHangar(camera);
  // Крыша прячется, когда камера поднимается над ней: иначе видно изнанку
  world.roof.visible = camera.position.y < BALANCE.map.hangar.roof - 0.4;
  // Наведение: в режиме HR башня сама доворачивается на цель вблизи прицела
  let aimYaw = rig.facingYaw();
  let aimPoint = null;
  if (BALANCE.modes[mode].autoAim) {
    let bestDiff = 0.9; // конус захвата ~50°
    for (const t of targets) {
      const dx = t.pos.x - tank.group.position.x;
      const dz = t.pos.z - tank.group.position.z;
      if (Math.hypot(dx, dz) > 90) continue;
      const yawToTarget = Math.atan2(dx, dz);
      const diff = Math.atan2(Math.sin(yawToTarget - aimYaw), Math.cos(yawToTarget - aimYaw));
      if (Math.abs(diff) < bestDiff) {
        bestDiff = Math.abs(diff);
        aimYaw = yawToTarget;
        aimPoint = t.pos.clone().setY(t.radius * 1.5);
      }
    }
  }
  tank.aimToward(aimYaw, dt);

  if (input.firing && gun.tryFire(now, camera, tank, aimPoint)) shotsFired++;
  gun.update(now, dt, targets);
  targetsMgr.update(dt, now / 1000);

  // Пыль: танк едет — гусеницы поднимают пыль
  dustTimer -= dt;
  if (Math.abs(tank.speed) > 3 && dustTimer <= 0) {
    dustTimer = 0.09;
    const side = Math.random() < 0.5 ? -1.3 : 1.3;
    dustOffset.set(side, 0.25, -2.3).applyAxisAngle(Y_AXIS, tank.group.rotation.y);
    dust.spawn(tank.group.position.clone().add(dustOffset), {
      scale: 0.8, growth: 1.0, life: 0.8, rise: 0.6, opacity: 0.35, drift: 0.2,
    });
  }
  dust.update(dt);

  updateReloadRing(now);
  renderer.render(scene, camera);
});

function updateReloadRing(now) {
  const ms = BALANCE.tank.reload * 1000;
  const remain = Math.max(0, gun.reloadUntil - now);
  reloadArc.style.strokeDashoffset = String(RING_C * (remain / ms));
  reloadArc.style.stroke = remain > 0 ? "#ffd27a" : "#9be27a";
}

// Версия сборки на экране — чтобы точно знать, что браузер взял свежий код.
// TANK_BUILD живёт в самом tank3d.js: если метки нет — файл танка из кэша.
document.getElementById("ver").textContent = `сборка ${BALANCE.version} · ${TANK_BUILD}`;
document.getElementById("verOverlay").textContent = `сборка ${BALANCE.version} · ${TANK_BUILD}`;

// Отладочный доступ: автотесты и воспроизведение багов.
// scene/camera/renderer — чтобы тесты могли отрендерить кадр вручную:
// в невидимой вкладке rAF заморожен, а кадр снять надо.
window.__debug3d = { input, tank, rig, gun, world, scene, camera, renderer, canvas, targetsMgr, api: { damage: applyDamage, targets: () => targets } };
// Сентинла для smoke-теста: страница успешно инициализировалась
window.__boot3d = true;
