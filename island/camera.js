// Moving around: camera flights to a house or back home, the slow circling until the visitor takes over,
// double-click (or double-tap) to look at a spot, arrow keys / WASD to move, Q/E to turn and +/- to zoom, and keeping the view near the island and above ground.
import * as THREE from "three";
import { reduce, narrow, camera, controls } from "./core.js";
import { COAST, heightAt, terrain } from "./world.js";

/* ================= flights ================= */
const flight = {
  t: 1,
  dur: 2.2,
  fromP: new THREE.Vector3(),
  toP: new THREE.Vector3(),
  fromT: new THREE.Vector3(),
  toT: new THREE.Vector3(),
};
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const flying = () => flight.t < 0.95;
export function flyTo(p, t) {
  flight.fromP.copy(camera.position);
  flight.fromT.copy(controls.target);
  flight.toP.copy(p);
  flight.toT.copy(t);
  flight.t = reduce ? 1 : 0;
  if (reduce) {
    camera.position.copy(p);
    controls.target.copy(t);
  }
}
// the opening view of the whole island (further back on tall phone screens)
export function home() {
  const d = narrow() ? 95 + 40 * Math.min(1.2, innerHeight / innerWidth - 1) : 92;
  return [new THREE.Vector3(1, 0.72, 1).normalize().multiplyScalar(d), new THREE.Vector3(0, narrow() ? -4 : 1, 0)];
}
export const flyHome = () => {
  const [p, t] = home();
  flyTo(p, t);
};
// a view of a house from the front, offset so the details panel does not cover it
export function flyToHouse(plot) {
  const H = new THREE.Vector3(plot.x, heightAt(plot.x, plot.z) + 2.5, plot.z),
    out = new THREE.Vector3(plot.x, 0, plot.z).normalize();
  const dir = out
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.9)
    .multiplyScalar(-1);
  const pos = H.clone()
    .add(dir.multiplyScalar(narrow() ? 30 : 21))
    .add(new THREE.Vector3(0, narrow() ? 20 : 11, 0));
  const right = new THREE.Vector3()
    .subVectors(H, pos)
    .cross(new THREE.Vector3(0, 1, 0))
    .normalize();
  const target = H.clone()
    .add(right.multiplyScalar(narrow() ? 0 : 4.5))
    .add(new THREE.Vector3(0, narrow() ? -5 : 0, 0));
  flyTo(pos.add(target).sub(H), target);
}
// the first frame starts further out and swoops in
export function startCamera() {
  const [hp] = home();
  camera.position
    .copy(hp)
    .multiplyScalar(reduce ? 1 : 1.5)
    .setY(hp.y * (reduce ? 1 : 1.8));
}

/* ================= circling ================= */
// the island circles slowly until the visitor drags, zooms, presses a key or double-clicks; "Everyone" starts it again
let userMoved = false;
const stopSpin = () => {
  userMoved = true;
  controls.autoRotate = false;
};
export function setSpin(overview) {
  if (overview) userMoved = false;
  controls.autoRotate = overview && !reduce && !userMoved;
}

/* ================= look at a spot ================= */
const ray = new THREE.Raycaster(),
  ndc = new THREE.Vector2(),
  ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  gp = new THREE.Vector3();
export function lookAtSpot(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(terrain, false)[0];
  const p = hit ? hit.point : ray.ray.intersectPlane(ground, gp);
  if (!p) return;
  const t = clampTarget(p.clone());
  const off = camera.position.clone().sub(controls.target),
    d = Math.min(Math.max(off.length(), 18), 45);
  stopSpin();
  flyTo(t.clone().add(off.setLength(d)), t);
}

/* ================= keys ================= */
// arrow keys / WASD move across the ground; ignored while a slider, button or link has focus
const held = new Set(),
  navKeys = {
    ArrowUp: "f",
    KeyW: "f",
    ArrowDown: "b",
    KeyS: "b",
    ArrowLeft: "l",
    KeyA: "l",
    ArrowRight: "r",
    KeyD: "r",
    KeyQ: "tl",
    KeyE: "tr",
    NumpadAdd: "in",
    NumpadSubtract: "out",
  };
// + and - by the character typed, wherever they sit on the keyboard
const keyOf = (e) => navKeys[e.code] || { "+": "in", "=": "in", "-": "out" }[e.key];

// keep the point we look at over the island or the sea just around it, near ground level
export function clampTarget(t) {
  const r = Math.hypot(t.x, t.z),
    max = COAST + 14;
  if (r > max) {
    t.x *= max / r;
    t.z *= max / r;
  }
  t.y = Math.min(14, Math.max(-8, t.y));
  return t;
}

export function initCamera() {
  controls.addEventListener("start", stopSpin);
  addEventListener("keydown", (e) => {
    if (!keyOf(e) || e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.("input, button, select, textarea, a"))
      return;
    held.add(keyOf(e));
    e.preventDefault();
    stopSpin();
  });
  // a key released with Shift let go first can report another character, so + and - both stop zooming
  addEventListener("keyup", (e) => {
    const k = keyOf(e);
    if (k === "in" || k === "out") {
      held.delete("in");
      held.delete("out");
    } else if (k) held.delete(k);
  });
  addEventListener("blur", () => held.clear());
}

// once per frame, before the controls update: run a flight, move with the keys, keep the view near the island
const fwd = new THREE.Vector3(),
  side = new THREE.Vector3(),
  mv = new THREE.Vector3();
export function tickCamera(dt) {
  if (flight.t < 1) {
    flight.t = Math.min(1, flight.t + dt / flight.dur);
    const k = ease(flight.t);
    camera.position.lerpVectors(flight.fromP, flight.toP, k);
    controls.target.lerpVectors(flight.fromT, flight.toT, k);
  }
  if (held.size) {
    fwd.subVectors(controls.target, camera.position).setY(0).normalize();
    side.crossVectors(fwd, camera.up).normalize();
    mv.set(0, 0, 0);
    if (held.has("f")) mv.add(fwd);
    if (held.has("b")) mv.sub(fwd);
    if (held.has("r")) mv.add(side);
    if (held.has("l")) mv.sub(side);
    if (mv.lengthSq()) {
      mv.setLength(camera.position.distanceTo(controls.target) * 0.35 * dt);
      camera.position.add(mv);
      controls.target.add(mv);
      flight.t = 1;
    }
    // turning around the target and zooming towards it, within the same limits as the mouse
    const turn = (held.has("tl") ? 1 : 0) - (held.has("tr") ? 1 : 0),
      zoom = (held.has("out") ? 1 : 0) - (held.has("in") ? 1 : 0);
    if (turn || zoom) {
      mv.subVectors(camera.position, controls.target).applyAxisAngle(camera.up, turn * 0.9 * dt);
      mv.setLength(
        THREE.MathUtils.clamp(mv.length() * (1 + zoom * 0.9 * dt), controls.minDistance, controls.maxDistance),
      );
      camera.position.copy(controls.target).add(mv);
      flight.t = 1;
    }
  }
  if (flight.t < 1) return;
  // move the camera along with a clamped target, so the view shifts rather than turns
  mv.copy(controls.target);
  clampTarget(controls.target);
  camera.position.add(mv.subVectors(controls.target, mv));
}

// once per frame, after the controls update: never below the ground or the sea, so nobody pans or turns under the island
export function keepAboveGround() {
  const floor = Math.max(heightAt(camera.position.x, camera.position.z), 0) + 1.2;
  if (camera.position.y < floor) camera.position.y = floor;
}
