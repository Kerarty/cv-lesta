// Точка входа 3D-версии. Резюме: В БОЙ!
import * as THREE from "three";
import { createWorld } from "./world3d.js";
import { Tank } from "./tank3d.js";
import { CameraRig } from "./camera3d.js";
import { Gun } from "./shooting3d.js";

const canvas = document.getElementById("scene");
const overlay = document.getElementById("lockOverlay");
const reloadArc = document.getElementById("reloadArc");
const RING_C = 2 * Math.PI * 24;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a7c4);
scene.fog = new THREE.Fog(0x87a7c4, 70, 230);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);

createWorld(scene);
const tank = new Tank(scene);
const rig = new CameraRig(camera);
const gun = new Gun(scene, rig);

// Тестовая мишень; настоящие цели-секции резюме появятся в следующем блоке
const targets = [];
const dummy = new THREE.Mesh(
  new THREE.CylinderGeometry(1.1, 1.1, 2.4, 10),
  new THREE.MeshStandardMaterial({ color: 0xa04848, roughness: 0.9, flatShading: true })
);
dummy.position.set(25, 1.2, -18);
dummy.castShadow = true;
scene.add(dummy);
targets.push({
  pos: dummy.position,
  radius: 1.2,
  onHit: () => {
    dummy.material.emissive.setHex(0xffffff);
    setTimeout(() => dummy.material.emissive.setHex(0x000000), 120);
  },
});

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
  if (e.button === 0) input.firing = true;
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
  updateReloadRing(now);

  renderer.render(scene, camera);
});

function updateReloadRing(now) {
  const ms = BALANCE.tank.reload * 1000;
  const remain = Math.max(0, gun.reloadUntil - now);
  reloadArc.style.strokeDashoffset = String(RING_C * (remain / ms));
  reloadArc.style.stroke = remain > 0 ? "#ffd27a" : "#9be27a";
}

// Сентинла для smoke-теста: страница успешно инициализировалась
window.__boot3d = true;
