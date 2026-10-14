// Shared foundation for the island: flags, random numbers, residents, the renderer, scene and camera,
// the shared state (season, hour, weather) and the hooks every part of the island registers with.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ================= flags ================= */
export const NOW = new Date();
// the page's query string: ?time=, ?season= and ?rain (time.js), ?moon= (sky.js), ?christmas
export const params = new URLSearchParams(location.search);
export const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const narrow = () => innerWidth < 700;
// christmas scenery: from 1 to 26 December automatically, or any time with ?christmas
export const isXmas = (d) => d.getMonth() === 11 && d.getDate() <= 26;
export const FORCE_XMAS = params.has("christmas");
export const XMAS = FORCE_XMAS || isXmas(NOW);
// a new moon (6 January 2000, 18:14 UTC): the moon's phase and the tides are counted from it
export const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

/* ================= helpers ================= */
// a small seeded generator: each part of the island draws from its own, so the island comes out the same every time
// whatever the order things are built in
export const makeRng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
// a stable pseudo-random number per (instance, purpose), used to recolour things the same way every season
export const hash01 = (i, k) => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// rises from a to b and falls again from c to d (a time window, say)
export const between = (a, b, c, d, x) => smooth(a, b, x) * (1 - smooth(c, d, x));
export const mix = (a, b, t) => a + (b - a) * t;
export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ================= residents ================= */
// one house per resident, in order around the plaza (see residents.js)
export const R = window.RESIDENTS;
export const currentResident = () => R.find((r) => r.id === location.hash.slice(1)) || null;

/* ================= renderer, scene, camera ================= */
export const canvas = document.getElementById("gl");
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(narrow() ? 1.5 : 2, devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2("#b9d4e6", 0.0032);
export const camera = new THREE.PerspectiveCamera(34, 1, 0.3, 4000);
camera.position.set(70, 52, 70);
// layer 1 holds small things (grass, flowers) that the sea's reflection skips
camera.layers.enable(1);
export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.autoRotate = !reduce;
controls.autoRotateSpeed = 0.25;
controls.minDistance = 12;
controls.maxDistance = 190;
controls.maxPolarAngle = Math.PI * 0.46;
controls.target.set(0, 2, 0);
// pan across the ground like a map instead of in the screen plane
controls.screenSpacePanning = false;
// effects that move around or only show now and then: never culled, hidden until their hooks show them
export const addFx = (o) => {
  o.frustumCulled = false;
  o.visible = false;
  scene.add(o);
  return o;
};
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.2, 0.5, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
export function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

/* ================= shared state and hooks ================= */
// season, hour, weather, tide (the sea's height), tideRising and sun (sunrise and sunset hours) are set by time.js
// weather: rain 0 to 1, snowing (rain falls as snow), snow (Christmas snowfall), lights (lamps on), gusty, snowCover
// the island's own light breeze, for when there is no real weather
export const BREEZE = Object.freeze({ x: 0.92, z: 0.39 });
// the way the wind blows (towards, on the ground plane), set with the weather by time.js; trees, grass, smoke, rain,
// leaves, clouds and the sails all follow it
export const WIND = { ...BREEZE };
// gust: how hard the wind is blowing right now, 0 to 1 (autumn gusts)
export const state = {
  season: "summer",
  hour: 12,
  tide: 0,
  tideRising: true,
  sun: { rise: 6, set: 20 },
  gust: 0,
  weather: { rain: 0, snowing: false, snow: XMAS ? 0.6 : 0, lights: 0, gusty: false, snowCover: 0 },
};
// everything the pointer can click: houses, lanterns, Sally
export const pickables = [];
// an invisible sphere around something worth pointing at (an animal, a boat), with a title and a line on what it is
// doing right now; ui.js shows them as a tip on hover or tap
export function addInfo(obj, radius, y, title, text) {
  const hit = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = y;
  hit.userData = { kind: "info", title, text };
  obj.add(hit);
  pickables.push(hit);
  return hit;
}
// each part of the island registers what it does when the season or time changes, and on every frame
const hooks = { season: [], time: [], frame: [] };
export const onSeason = (fn) => hooks.season.push(fn);
export const onTime = (fn) => hooks.time.push(fn);
export const onFrame = (fn) => hooks.frame.push(fn);
export const runHooks = (kind, ...args) => hooks[kind].forEach((fn) => fn(...args));
