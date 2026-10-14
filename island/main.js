// kohler.land island: builds the island and runs it.
//
// Every part is built from its own seeded random numbers, so the island comes out the same every time; only what
// moves (Sally's strolls, the hedgehog, shooting stars, falling leaves) is left to chance. The build order only matters
// where one part needs another (noted below), and for the time hooks: the water's runs after the sky's.
import * as THREE from "three";
import { reduce, renderer, composer, controls, resize, runHooks } from "./core.js";
import { initWorld } from "./world.js";
import { initSky, updateEnv, buildClouds, buildStars, buildShootingStars, buildRainbow } from "./sky.js";
import { initWater } from "./water.js";
import { initMaterials } from "./materials.js";
import { buildHouses } from "./houses.js";
import { buildPlaza } from "./plaza.js";
import { buildCoast } from "./coast.js";
import { buildVegetation } from "./vegetation.js";
import { buildGulls, buildDucks, buildHeron, buildHedgehog } from "./wildlife.js";
import { buildBeach } from "./beach.js";
import { buildCat } from "./cat.js";
import { buildWeather } from "./weather.js";
import { buildXmas } from "./xmas.js";
import { buildInsects } from "./insects.js";
import { buildTracks } from "./tracks.js";
import { initTime, applySeason, applyTime } from "./time.js";
import { initCamera, startCamera, tickCamera, keepAboveGround } from "./camera.js";
import { initUI, route, updateOverlay } from "./ui.js";

/* ================= build ================= */
initWorld(); // noise, terrain, paths, plots
initSky();
buildClouds();
buildStars();
buildShootingStars();
buildRainbow();
initWater(); // after the sky: it reads the sun and the fog
initMaterials();
buildHouses(); // houses and gardens
buildPlaza(); // fountain, lamps, benches, teddy
buildCoast(); // distant islands, lighthouse, pier, boats
buildVegetation(); // trees, grass, flowers, boulders
buildBeach(); // parasol, lounger, fire pit (needs the trees, flowers and boulders)
buildXmas(); // clears a spot in the forest for the big tree
buildWeather();
buildCat(); // needs the teddy
buildTracks(); // Sally's footprints in the snow
buildGulls();
buildDucks();
buildHeron();
buildHedgehog(); // keeps clear of the trees
buildInsects(); // fireflies, moths, butterflies (needs the flowers, the lamps and Sally)

/* ================= start ================= */
initTime();
initCamera();
initUI();
addEventListener("resize", resize);
resize();
applySeason();
applyTime();
updateEnv();
startCamera();
route();

/* ================= loop ================= */
const clock = new THREE.Clock();
let firstFrame = true;
// the browser already stops drawing in a hidden tab; when nobody has touched the page for about a minute (3600 frames),
// draw only every other frame (everything moves by the clock, so it only gets a little less smooth). Counting frames
// rather than seconds keeps headless test renders, whose clock runs far slower than the wall clock, drawing every frame.
let idleFrames = 0,
  skip = false;
["pointerdown", "pointermove", "wheel", "keydown"].forEach((ev) =>
  addEventListener(ev, () => (idleFrames = 0), { passive: true }),
);
renderer.setAnimationLoop(() => {
  if (++idleFrames > 3600 && (skip = !skip)) return;
  const dt = Math.min(0.05, clock.getDelta()),
    t = clock.elapsedTime;
  // tt stands still when the visitor prefers reduced motion
  runHooks("frame", dt, t, reduce ? 0 : t);
  tickCamera(dt);
  controls.update();
  keepAboveGround();
  composer.render();
  updateOverlay();
  if (firstFrame) {
    firstFrame = false;
    setTimeout(() => document.getElementById("veil").classList.add("gone"), 250);
  }
});
