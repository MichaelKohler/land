// Insects: fireflies blinking over the meadow on summer nights, moths around the street lamps, and butterflies
// visiting the wildflowers on fine spring and summer days (one of them now and then leads Sally on a chase).
import * as THREE from "three";
import { reduce, makeRng, scene, addFx, onSeason, onTime, onFrame } from "./core.js";
import { plots, heightAt } from "./world.js";
import { canvasTex, radial } from "./materials.js";
import { flowers, instancePositions } from "./vegetation.js";
import { lampSpots } from "./plaza.js";
import { cat, catChase } from "./cat.js";

export function buildInsects() {
  fireflies();
  moths();
  butterflies();
}

// a soft round dot of light
const dotTex = radial(32, [
  [0, "rgba(255,255,255,1)"],
  [0.3, "rgba(255,255,255,0.6)"],
  [1, "rgba(255,255,255,0)"],
]);

/* ================= fireflies ================= */
function fireflies() {
  const fr = makeRng(8123),
    N = 90,
    flies = [];
  // spread over the meadow, keeping off the houses and the beach
  while (flies.length < N) {
    const a = fr() * Math.PI * 2,
      r = 5 + fr() * 17,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    if (heightAt(x, z) < 1 || plots.some((p) => Math.hypot(x - p.x, z - p.z) < 4)) continue;
    flies.push({
      x,
      z,
      y: heightAt(x, z) + 0.4 + fr() * 1.2,
      ph: fr() * 6.3,
      f: 0.8 + fr() * 0.8,
      blink: 0.6 + fr() * 0.9,
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.42,
      map: dotTex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  addFx(points);
  let summer = false,
    amt = 0;
  onSeason(({ su }) => (summer = su));
  onTime(({ dark, rain }) => {
    amt = summer ? Math.min(1, dark * 1.5) * (1 - rain) : 0;
    points.visible = amt > 0.01;
  });
  // each one drifts in a slow loop around its spot and lights up in short pulses
  const place = (t, still) => {
    const p = geo.attributes.position.array,
      c = geo.attributes.color.array;
    flies.forEach((f, k) => {
      const u = t * f.f * 0.3 + f.ph;
      p[k * 3] = f.x + Math.sin(u) * 0.9;
      p[k * 3 + 1] = f.y + Math.sin(u * 1.7) * 0.3;
      p[k * 3 + 2] = f.z + Math.cos(u * 0.8) * 0.9;
      const b = (still ? 0.6 : Math.pow(Math.max(0, Math.sin(t * f.blink * 2 + f.ph * 3)), 6)) * amt;
      c[k * 3] = 0.75 * b;
      c[k * 3 + 1] = 1.0 * b;
      c[k * 3 + 2] = 0.3 * b;
    });
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  onFrame((dt, t, tt) => {
    if (points.visible) place(tt, reduce);
  });
}

/* ================= moths ================= */
function moths() {
  const mr = makeRng(8461),
    PER = 4,
    N = lampSpots.length * PER,
    ms = [];
  for (let k = 0; k < N; k++)
    ms.push({ lamp: lampSpots[Math.floor(k / PER)], ph: mr() * 6.3, f: 0.9 + mr() * 0.9, r: 0.35 + mr() * 0.35 });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 0.12, map: dotTex, color: "#e9e0cf", transparent: true, depthWrite: false }),
  );
  addFx(points);
  let winter = false;
  onSeason(({ wi }) => (winter = wi));
  onTime(({ lightsOn, rain }) => (points.visible = !winter && lightsOn > 0.3 && rain < 0.3));
  // they circle the lamp head in wobbly loops, darting in and out
  const place = (t) => {
    const p = geo.attributes.position.array;
    ms.forEach((m, k) => {
      const u = t * m.f * 2.2 + m.ph,
        r = m.r * (0.8 + 0.3 * Math.sin(t * 3.1 + m.ph));
      p[k * 3] = m.lamp.x + Math.cos(u) * r + Math.sin(t * 13 + m.ph) * 0.04;
      p[k * 3 + 1] = m.lamp.y - 0.05 + Math.sin(u * 1.3) * 0.25 + Math.sin(t * 11 + m.ph) * 0.03;
      p[k * 3 + 2] = m.lamp.z + Math.sin(u) * r;
    });
    geo.attributes.position.needsUpdate = true;
  };
  place(0);
  onFrame((dt, t, tt) => {
    if (points.visible && !reduce) place(tt);
  });
}

/* ================= butterflies ================= */
// a butterfly: two pairs of wings in one shape, tinted per species, on a slim dark body
const wingTex = canvasTex(64, 64, (x, w, h) => {
  x.fillStyle = "#ffffff";
  x.beginPath();
  x.ellipse(30, 22, 28, 18, -0.35, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.ellipse(24, 46, 18, 14, 0.4, 0, Math.PI * 2);
  x.fill();
  // darker wingtips and a spot on each wing
  x.globalCompositeOperation = "source-atop";
  x.fillStyle = "rgba(30,24,20,0.85)";
  x.beginPath();
  x.ellipse(52, 12, 12, 9, -0.35, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.arc(32, 22, 4, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "rgba(30,24,20,0.35)";
  x.fillRect(0, 0, 5, h);
});
const SPECIES = ["#f7f5ee", "#f2dd5a", "#e8792b", "#7fa8e8", "#f7f5ee", "#f2dd5a"];

function makeButterfly(color) {
  const b = new THREE.Group(),
    m = new THREE.MeshStandardMaterial({ map: wingTex, color, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  // each wing is hinged along the body (the z axis); the right one is the left one mirrored
  const wingG = new THREE.PlaneGeometry(0.16, 0.16);
  wingG.rotateX(Math.PI / 2);
  wingG.translate(0.08, 0, 0);
  const l = new THREE.Mesh(wingG, m),
    r = new THREE.Mesh(wingG, m);
  r.scale.x = -1;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.008, 0.07, 4, 6),
    new THREE.MeshStandardMaterial({ color: "#2a221c", roughness: 0.8 }),
  );
  body.rotation.x = Math.PI / 2;
  b.add(l, r, body);
  b.userData = { l, r };
  b.name = "butterfly";
  return b;
}

function butterflies() {
  const br = makeRng(8803),
    N = 8,
    flock = [];
  for (let k = 0; k < N; k++) {
    const b = makeButterfly(SPECIES[k % SPECIES.length]);
    b.visible = false;
    scene.add(b);
    flock.push({
      b,
      pos: new THREE.Vector3(),
      goal: new THREE.Vector3(),
      perch: 0,
      timer: 0,
      ph: br() * 6.3,
      init: false,
    });
  }
  let spots = [],
    out = false;
  // flowers are only out in spring and summer (a fifth in autumn); butterflies only on fine days in spring and summer
  let fair = false;
  onSeason(({ sp, su }) => {
    fair = sp || su;
    spots = instancePositions(flowers).filter(([x, z]) => x || z);
  });
  onTime(({ dl, rain }) => {
    out = fair && dl > 0.3 && rain < 0.1 && spots.length > 0;
    flock.forEach((f) => (f.b.visible = out));
  });
  const pickFlower = (f) => {
    const [x, z] = spots[Math.floor(Math.random() * spots.length)];
    f.goal.set(x, heightAt(x, z) + 0.6, z);
  };
  const ahead = new THREE.Vector3(),
    dir = new THREE.Vector3();
  onFrame((dt, t, tt) => {
    if (!out) return;
    const chase = catChase();
    flock.forEach((f, k) => {
      const u = f.b.userData;
      if (!f.init) {
        pickFlower(f);
        f.pos.copy(f.goal);
        f.perch = Math.random() * 3;
        f.init = true;
      }
      if (reduce) {
        f.b.position.copy(f.pos);
        u.l.rotation.z = 0.5;
        u.r.rotation.z = -0.5;
        return;
      }
      let speed = 0.9,
        flap = 1;
      if (k === 0 && chase) {
        // fluttering just ahead of Sally's nose and a little above it
        ahead.set(Math.sin(cat.rotation.y), 0, Math.cos(cat.rotation.y)).multiplyScalar(0.7);
        f.goal
          .copy(chase)
          .add(ahead)
          .add(dir.set(Math.sin(tt * 2.3) * 0.25, 0.35 + Math.sin(tt * 3.1) * 0.15, Math.cos(tt * 1.9) * 0.2));
        f.perch = 0;
        speed = 2.2;
      } else if (f.perch > 0) {
        // resting on a flower, opening and closing its wings slowly
        f.perch -= dt;
        flap = 0;
        if (f.perch <= 0) {
          pickFlower(f);
          f.timer = 0;
        }
      } else if (f.pos.distanceTo(f.goal) < 0.12) {
        f.perch = 1.5 + Math.random() * 4;
      }
      // flight: heads for the goal with a bobbing, zigzag flutter
      if (flap) {
        dir.subVectors(f.goal, f.pos);
        const d = dir.length();
        if (d > 0.001) f.pos.addScaledVector(dir, Math.min(1, (speed * dt) / d));
        f.pos.x += Math.sin(tt * 7 + f.ph) * 0.3 * dt;
        f.pos.y += Math.sin(tt * 9 + f.ph * 2) * 0.4 * dt;
        f.pos.z += Math.cos(tt * 6 + f.ph) * 0.3 * dt;
        if (d > 0.05) f.b.rotation.y = Math.atan2(dir.x, dir.z);
      }
      f.b.position.copy(f.pos);
      const a = flap ? 0.15 + Math.sin(tt * 22 + f.ph) * 0.95 : 1.1 + Math.sin(tt * 1.5 + f.ph) * 0.3;
      u.l.rotation.z = a;
      u.r.rotation.z = -a;
    });
  });
}
