// Falling weather around wherever the camera looks: rain streaks (snowflakes in winter), and spring petals
// or autumn leaves tumbling down over the village (and blown across it in the autumn gusts).
import * as THREE from "three";
import { WIND, reduce, makeRng, hash01, addFx, controls, state, onSeason, onFrame } from "./core.js";
import { heightAt } from "./world.js";
import { canvasTex, puffTex } from "./materials.js";

export function buildWeather() {
  const rnd = makeRng(91);
  /* ---------- rain and snow: one set of drops in a box that follows the camera target ---------- */
  const N = 6000,
    BOX = 36,
    TOP = 30;
  const off = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    off[k * 3] = (rnd() - 0.5) * 2 * BOX;
    off[k * 3 + 1] = rnd() * TOP;
    off[k * 3 + 2] = (rnd() - 0.5) * 2 * BOX;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 6), 3));
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.LineBasicMaterial({ color: "#c9d4de", transparent: true, opacity: 0, depthWrite: false }),
  );
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const snow = new THREE.Points(
    snowGeo,
    new THREE.PointsMaterial({
      color: "#ffffff",
      size: 0.22,
      map: puffTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  [rain, snow].forEach(addFx);
  onFrame((dt, t) => {
    const { weather } = state,
      snowing = weather.snowing,
      amt = snowing ? Math.max(weather.rain, weather.snow) : weather.rain;
    rain.visible = !snowing && amt > 0.01;
    snow.visible = snowing && amt > 0.01;
    if (amt <= 0.01) return;
    const cx = controls.target.x,
      cz = controls.target.z,
      n = Math.floor(N * amt);
    if (!snowing) {
      rain.material.opacity = 0.42 * amt;
      const p = rainGeo.attributes.position.array;
      for (let k = 0; k < n; k++) {
        if (!reduce) {
          off[k * 3 + 1] -= dt * 24;
          if (off[k * 3 + 1] < 0) off[k * 3 + 1] += TOP;
        }
        // the streaks slant with the wind: each drop came from upwind
        const y = off[k * 3 + 1],
          blown = (TOP - y) * 0.15,
          x = cx + off[k * 3] + WIND.x * blown,
          z = cz + off[k * 3 + 2] + WIND.z * blown,
          o = k * 6;
        p[o] = x;
        p[o + 1] = y;
        p[o + 2] = z;
        p[o + 3] = x - WIND.x * 0.13;
        p[o + 4] = y + 0.85;
        p[o + 5] = z - WIND.z * 0.13;
      }
      rainGeo.setDrawRange(0, n * 2);
      rainGeo.attributes.position.needsUpdate = true;
    } else {
      snow.material.opacity = 0.9 * amt;
      const p = snowGeo.attributes.position.array;
      for (let k = 0; k < n; k++) {
        if (!reduce) {
          off[k * 3 + 1] -= dt * 1.6;
          if (off[k * 3 + 1] < 0) off[k * 3 + 1] += TOP;
        }
        const o = k * 3,
          sway = reduce ? 0 : Math.sin(t * 0.8 + k) * 0.6;
        // flakes drift downwind as they fall, swaying as they go
        const drift = (TOP - off[o + 1]) * 0.4;
        p[o] = cx + off[o] + sway + WIND.x * drift;
        p[o + 1] = off[o + 1];
        p[o + 2] = cz + off[o + 2] + WIND.z * drift + Math.cos(t * 0.6 + k * 1.7) * 0.6;
      }
      snowGeo.setDrawRange(0, n);
      snowGeo.attributes.position.needsUpdate = true;
    }
  });

  /* ---------- spring petals and autumn leaves ---------- */
  const DRIFT_N = 180,
    drifting = [];
  const leafTex = canvasTex(32, 32, (x) => {
    x.fillStyle = "#ffffff";
    x.beginPath();
    x.ellipse(16, 16, 14, 8, 0.6, 0, Math.PI * 2);
    x.fill();
  });
  const driftGeo = new THREE.BufferGeometry();
  driftGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(DRIFT_N * 3), 3));
  driftGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(DRIFT_N * 3), 3));
  const drift = new THREE.Points(
    driftGeo,
    new THREE.PointsMaterial({ size: 0.22, map: leafTex, vertexColors: true, alphaTest: 0.5 }),
  );
  addFx(drift);
  // a leaf starts somewhere over the village and falls to the ground; then it starts again from the top
  function respawn(d, first) {
    const a = Math.random() * Math.PI * 2,
      r = 5 + Math.sqrt(Math.random()) * 20;
    d.x = Math.cos(a) * r;
    d.z = Math.sin(a) * r;
    d.floor = heightAt(d.x, d.z);
    d.y = d.floor + (first ? Math.random() : 1) * (5 + Math.random() * 4);
    d.ph = Math.random() * 6.3;
  }
  for (let k = 0; k < DRIFT_N; k++) {
    const d = {};
    respawn(d, true);
    drifting.push(d);
  }
  const col = new THREE.Color();
  onSeason(({ sp, au }) => {
    drift.visible = sp || au;
    const dc = driftGeo.attributes.color.array;
    for (let k = 0; k < DRIFT_N; k++) {
      const a = hash01(k, 7);
      sp ? col.setHSL(0.94 + a * 0.04, 0.6, 0.82) : col.setHSL(0.02 + a * 0.1, 0.8, 0.42);
      dc[k * 3] = col.r;
      dc[k * 3 + 1] = col.g;
      dc[k * 3 + 2] = col.b;
    }
    driftGeo.attributes.color.needsUpdate = true;
  });
  onFrame((dt, t) => {
    if (!drift.visible) return;
    const p = driftGeo.attributes.position.array;
    drifting.forEach((d, k) => {
      // autumn gusts hold the leaves up and sweep them sideways across the village
      const g = state.gust;
      const push = 0.35 + g * 5.2;
      if (!reduce) {
        d.y -= dt * 0.7 * (1 - g * 0.7);
        d.x += (Math.sin(t * 0.9 + d.ph) * 0.6 + WIND.x * push) * dt;
        d.z += (Math.cos(t * 0.7 + d.ph) * 0.5 + WIND.z * push) * dt;
        if (d.y < d.floor || Math.hypot(d.x, d.z) > 34) respawn(d, false);
      }
      p[k * 3] = d.x;
      p[k * 3 + 1] = d.y;
      p[k * 3 + 2] = d.z;
    });
    driftGeo.attributes.position.needsUpdate = true;
  });
}
