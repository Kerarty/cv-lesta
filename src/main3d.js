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

createWorld(scene);
const tank = new Tank(scene);
// GLB-модель танка; при ошибке загрузки остаётся процедурная заглушка
tank.attachModel("assets/models/Tank.glb").catch((err) =>
  console.warn("Модель танка не загрузилась:", err)
);
const rig = new CameraRig(camera);
const gun = new Gun(scene, rig);

// Цели-секции резюме: кристаллы с HP по балансу, штаб патрулирует
const targetsMgr = new ResumeTargets(scene, camera);
const targets = targetsMgr.items;

// --- Прогресс боя: XP, счётчик секций, победа ---
let xp = 0;
let destroyed = 0;
let battleStart = 0; // момент первого взятия управления
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

function showEnd(mode) {
  document.exitPointerLock?.();
  input.firing = false;
  const secs = battleStart ? Math.round((performance.now() - battleStart) / 1000) : 0;
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, "0");
  document.getElementById("endTitle").textContent = mode === "victory" ? "ПОБЕДА!" : "Контакты";
  document.getElementById("endStats").textContent = mode === "victory"
    ? `Винрейт 100% · Опыт +${xp} · Время боя ${mm}:${ss}`
    : `Винрейт ещё не заработан · Опыт +${xp}`;
  document.getElementById("endContacts").innerHTML = contactsHtml();
  endScreen.classList.add("show");
}
document.getElementById("backBtn").addEventListener("click", () => {
  endScreen.classList.remove("show");
  overlay.classList.remove("hidden"); // пауза: клик — вернуться в бой
});
document.getElementById("contactsBtn").addEventListener("click", () => showEnd("contacts"));

function applyDamage(t, dmg) {
  if (t.dead) return;
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
overlay.addEventListener("click", () => {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => enableDragMode());
  } catch {
    enableDragMode();
  }
  setTimeout(() => { if (!document.pointerLockElement) enableDragMode(); }, 400);
});
function enableDragMode() {
  dragMode = true;
  overlay.classList.add("hidden");
}
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement && !battleStart) battleStart = performance.now();
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

// --- Игровой цикл ---
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  tank.update(dt, input);
  rig.update(dt, tank.group.position);
  tank.aimToward(rig.facingYaw(), dt);

  if (input.firing) gun.tryFire(now, camera, tank);
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

// Отладочный доступ: автотесты и воспроизведение багов
window.__debug3d = { input, tank, rig, gun, api: { damage: applyDamage, targets: () => targets } };
// Сентинла для smoke-теста: страница успешно инициализировалась
window.__boot3d = true;
