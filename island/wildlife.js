// Animals: herring gulls circling over the island, a mallard pair with four ducklings paddling in the shallows,
// a grey heron fishing by the pier, and a hedgehog snuffling across the meadow from dusk.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeRng, reduce, scene, state, addInfo, onSeason, onTime, onFrame } from "./core.js";
import { PIER_A, coastAt, plots, heightAt } from "./world.js";
import { S, shadow } from "./materials.js";
import { treeSpots } from "./vegetation.js";

/* ================= gulls ================= */
// white body and head, yellow beak, pale grey wings with black tips; the wings bend at the wrist
export function buildGulls() {
  const rnd = makeRng(97);
  const gullM = S({ color: "#f4f4f2", roughness: 0.7 }),
    gullTailM = S({ color: "#f4f4f2", roughness: 0.7, side: THREE.DoubleSide });
  const wingM = S({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }),
    beakM = S({ color: "#e8b923", roughness: 0.45 }),
    eyeM = S({ color: "#151515", roughness: 0.2 });
  // a flat wing panel from [x, z(, black)] points; points marked black colour the wingtip
  const wingGeo = (pts) => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z))));
    g.rotateX(Math.PI / 2);
    const grey = new THREE.Color("#a9b2ba"),
      black = new THREE.Color("#1d1d1f"),
      p = g.attributes.position,
      c = [];
    for (let i = 0; i < p.count; i++) {
      const k = pts.find(([x, z]) => Math.abs(x - p.getX(i)) < 1e-4 && Math.abs(z - p.getZ(i)) < 1e-4)?.[2]
        ? black
        : grey;
      c.push(k.r, k.g, k.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    return g;
  };
  const innerWingG = wingGeo([
    [0, 0.13],
    [0.45, 0.1],
    [0.45, -0.12],
    [0, -0.19],
  ]);
  const outerWingG = wingGeo([
    [0, 0.1],
    [0.3, 0.07],
    [0.36, 0.06, 1],
    [0.56, -0.03, 1],
    [0.46, -0.12, 1],
    [0.33, -0.12, 1],
    [0.27, -0.12],
    [0, -0.12],
  ]);
  const bodyG = new THREE.SphereGeometry(0.1, 18, 12),
    headG = new THREE.SphereGeometry(0.068, 16, 12),
    beakG = new THREE.ConeGeometry(0.017, 0.09, 8),
    eyeG = new THREE.SphereGeometry(0.011, 8, 6);
  const tailG = new THREE.ShapeGeometry(
    new THREE.Shape(
      [
        [-0.07, -0.18],
        [0.07, -0.18],
        [0.11, -0.36],
        [-0.11, -0.36],
      ].map(([x, z]) => new THREE.Vector2(x, z)),
    ),
  );
  tailG.rotateX(Math.PI / 2);
  const gulls = [];
  for (let k = 0; k < 7; k++) {
    const b = new THREE.Group();
    // a wing is an inner panel with the outer panel hinged at the wrist; the right wing is the left one mirrored
    const wing = () => {
      const w = new THREE.Group(),
        o = new THREE.Group();
      w.position.set(0.05, 0.03, 0.03);
      w.add(new THREE.Mesh(innerWingG, wingM));
      o.position.x = 0.45;
      o.add(new THREE.Mesh(outerWingG, wingM));
      w.add(o);
      b.add(w);
      return [w, o];
    };
    const [l, lo] = wing(),
      [r, ro] = wing();
    r.scale.x = -1;
    r.position.x = -0.05;
    const body = new THREE.Mesh(bodyG, gullM);
    body.scale.set(0.9, 0.85, 2.4);
    const head = new THREE.Mesh(headG, gullM);
    head.position.set(0, 0.05, 0.25);
    const beak = new THREE.Mesh(beakG, beakM);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.035, 0.345);
    [-1, 1].forEach((s) => {
      const e = new THREE.Mesh(eyeG, eyeM);
      e.position.set(s * 0.045, 0.07, 0.29);
      b.add(e);
    });
    b.add(body, head, beak, new THREE.Mesh(tailG, gullTailM));
    b.userData = { l, r, lo, ro, rad: 18 + rnd() * 16, y: 12 + rnd() * 8, sp: 0.1 + rnd() * 0.08, ph: rnd() * 6 };
    scene.add(b);
    gulls.push(b);
  }
  // each circles at its own radius and height; stretches of gliding between bursts of flapping
  onFrame((dt, t, tt) =>
    gulls.forEach((b) => {
      const u = b.userData,
        a = tt * u.sp + u.ph;
      b.position.set(Math.cos(a) * u.rad, u.y + Math.sin(tt * 0.5 + u.ph) * 1.2, Math.sin(a) * u.rad);
      b.rotation.set(0, -a, Math.sin(tt * 0.5 + u.ph) * 0.2);
      const f = reduce
        ? 0.12
        : Math.sin(t * 5 + u.ph) * 0.5 * (0.25 + 0.75 * Math.max(0, Math.sin(t * 0.35 + u.ph * 3))) + 0.08;
      u.l.rotation.z = f;
      u.r.rotation.z = -f;
      u.lo.rotation.z = u.ro.rotation.z = (f - 0.08) * 0.6 - 0.05;
    }),
  );
}

/* ================= ducks ================= */
function makeDuck(kind) {
  const g = new THREE.Group();
  const bodyC = { drake: "#9a968e", hen: "#8a6a47", chick: "#dcbc52" }[kind],
    headC = { drake: "#1d5a36", hen: "#7a5a3a", chick: "#e6ca62" }[kind];
  const m = (geo, color, x, y, z) => {
    const o = shadow(new THREE.Mesh(geo, S({ color, roughness: 0.8 })));
    o.position.set(x, y, z);
    g.add(o);
    return o;
  };
  m(new THREE.SphereGeometry(0.16, 16, 12), bodyC, 0, 0.05, 0).scale.set(1, 0.72, 1.55);
  m(new THREE.ConeGeometry(0.07, 0.16, 8), kind === "drake" ? "#2a2a2a" : bodyC, 0, 0.1, -0.25).rotation.x = -2.1;
  m(new THREE.CylinderGeometry(0.045, 0.06, 0.14, 10), headC, 0, 0.17, 0.15).rotation.x = 0.35;
  m(new THREE.SphereGeometry(0.075, 14, 10), headC, 0, 0.26, 0.19);
  m(
    new THREE.SphereGeometry(0.04, 10, 8),
    kind === "drake" ? "#e2c23a" : kind === "hen" ? "#d98a2b" : "#c98a3a",
    0,
    0.245,
    0.27,
  ).scale.set(0.9, 0.35, 1.7);
  [-1, 1].forEach((s) => m(new THREE.SphereGeometry(0.012, 6, 6), "#111111", s * 0.05, 0.275, 0.22));
  if (kind === "drake") {
    // white neck ring and chestnut breast
    m(new THREE.TorusGeometry(0.05, 0.01, 6, 16), "#f4f4f0", 0, 0.205, 0.165).rotation.x = Math.PI / 2 + 0.35;
    m(new THREE.SphereGeometry(0.1, 12, 10), "#6b3a26", 0, 0.08, 0.16).scale.set(1, 0.85, 0.9);
  }
  g.scale.setScalar(kind === "chick" ? 0.65 : 1.3);
  return g;
}

export function buildDucks() {
  // an elliptical loop in the shallows past the pier: centre, along-shore and out-to-sea directions
  const duckA = PIER_A + 0.75;
  const centre = new THREE.Vector2(Math.cos(duckA), Math.sin(duckA)).multiplyScalar(coastAt(duckA) + 5.5);
  const along = new THREE.Vector2(-Math.sin(duckA), Math.cos(duckA)),
    out = new THREE.Vector2(Math.cos(duckA), Math.sin(duckA));
  const at = (u, v) =>
    v.set(
      centre.x + along.x * Math.cos(u) * 5 + out.x * Math.sin(u) * 2,
      centre.y + along.y * Math.cos(u) * 5 + out.y * Math.sin(u) * 2,
    );
  // the hen leads her ducklings in a line, the drake keeps a little ahead
  const ducks = ["hen", "chick", "chick", "chick", "chick", "drake"].map((kind, k) => {
    const d = makeDuck(kind);
    // three ripple rings each: a ring starts at the duck and stays there, spreading and fading as she swims on
    const wakes = [0, 1, 2].map((j) => {
      const w = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.25, 28),
        new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }),
      );
      w.rotation.x = -Math.PI / 2;
      w.userData.ph = 1;
      scene.add(w);
      return w;
    });
    scene.add(d);
    const names = { hen: "Mallard duck", drake: "Mallard drake", chick: "Duckling" };
    addInfo(d, kind === "chick" ? 0.3 : 0.45, 0.15, names[kind], () =>
      state.weather.lights > 0.5
        ? "Bobbing on the water by the pier for the night"
        : kind === "chick"
          ? "Paddling hard to keep up with mum"
          : "Paddling along the shore with the family",
    );
    return { d, wakes, k, chick: kind === "chick", lag: kind === "drake" ? -0.45 : k * 0.085 + (k ? 0.04 : 0) };
  });
  const pA = new THREE.Vector2(),
    pB = new THREE.Vector2();
  onFrame((dt, t, tt) =>
    ducks.forEach(({ d, wakes, k, chick, lag }) => {
      const u = tt * 0.055 - lag;
      at(u, pA);
      at(u + 0.01, pB);
      const side = chick ? Math.sin(tt * 0.7 + k * 1.3) * 0.12 : 0;
      d.position.set(pA.x + out.x * side, state.tide + Math.sin(tt * 2.1 + k) * 0.015, pA.y + out.y * side);
      d.rotation.set(
        Math.sin(tt * 1.7 + k) * 0.04,
        Math.atan2(pB.x - pA.x, pB.y - pA.y) + Math.sin(tt * 0.9 + k) * 0.12,
        0,
      );
      wakes.forEach((w, j) => {
        const ph = (tt * 0.45 + k * 0.37 + j / 3) % 1;
        if (ph < w.userData.ph) w.position.set(d.position.x, state.tide + 0.02, d.position.z);
        w.userData.ph = ph;
        w.scale.setScalar((chick ? 0.6 : 1) * (1 + ph * 3));
        w.material.opacity = reduce ? 0 : (1 - ph) * 0.28;
      });
    }),
  );
}

/* ================= heron ================= */
// a grey heron standing in the shallows beside the pier, now and then stabbing down at a fish
export function buildHeron() {
  const greyM = S({ color: "#8d949b", roughness: 0.85 }),
    darkM = S({ color: "#5f666d", roughness: 0.85 }),
    paleM = S({ color: "#e4e6e7", roughness: 0.8 });
  const blackM = S({ color: "#1b1b1d", roughness: 0.6 }),
    billM = S({ color: "#d9a441", roughness: 0.5 }),
    legM = S({ color: "#9c8b5a", roughness: 0.7 });
  const heron = new THREE.Group();
  addInfo(heron, 0.7, 0.7, "Grey heron", () =>
    state.weather.lights > 0.5
      ? "Dozing on one leg in the shallows"
      : "Standing stock-still in the shallows, waiting for a fish",
  );
  const m = (geo, mat, x, y, z, parent = heron) => {
    const o = shadow(new THREE.Mesh(geo, mat));
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  // body tilted nose-up, folded darker wings along its sides, a short tail
  const body = m(new THREE.SphereGeometry(0.16, 18, 12), greyM, 0, 0.66, 0);
  body.scale.set(0.75, 0.8, 1.55);
  body.rotation.x = -0.35;
  [-1, 1].forEach((s) => {
    const w = m(new THREE.SphereGeometry(0.15, 14, 10), darkM, s * 0.085, 0.68, -0.04);
    w.scale.set(0.3, 0.6, 1.45);
    w.rotation.x = -0.3;
  });
  m(new THREE.ConeGeometry(0.06, 0.16, 8), darkM, 0, 0.58, -0.27).rotation.x = -2.0;
  // long thin legs, half in the water
  [-1, 1].forEach((s) => m(new THREE.CylinderGeometry(0.011, 0.011, 0.6, 6), legM, s * 0.05, 0.27, 0));
  // an S-shaped neck that pivots at the shoulder, with the head, black crest stripe and dagger bill on top
  const neck = new THREE.Group();
  neck.position.set(0, 0.74, 0.17);
  heron.add(neck);
  const curve = new THREE.CatmullRomCurve3(
    [
      [0, 0, 0],
      [0, 0.12, 0.06],
      [0, 0.2, -0.02],
      [0, 0.3, 0.04],
    ].map((p) => new THREE.Vector3(...p)),
  );
  m(new THREE.TubeGeometry(curve, 20, 0.032, 8), paleM, 0, 0, 0, neck);
  const head = new THREE.Group();
  head.position.set(0, 0.32, 0.05);
  neck.add(head);
  m(new THREE.SphereGeometry(0.048, 14, 10), paleM, 0, 0, 0, head).scale.set(0.85, 0.9, 1.2);
  m(new THREE.ConeGeometry(0.016, 0.19, 8), billM, 0, -0.01, 0.14, head).rotation.x = Math.PI / 2;
  m(new THREE.ConeGeometry(0.01, 0.14, 5), blackM, 0, 0.02, -0.09, head).rotation.x = -Math.PI / 2 - 0.3;
  [-1, 1].forEach((s) => m(new THREE.SphereGeometry(0.008, 6, 6), blackM, s * 0.035, 0.012, 0.03, head));
  // in the shallows on the far side of the pier from the moored boat, facing out to sea
  const a = PIER_A - 0.16;
  let r = coastAt(a) - 4;
  while (r < coastAt(a) + 8 && heightAt(Math.cos(a) * r, Math.sin(a) * r) > -0.25) r += 0.1;
  heron.position.set(Math.cos(a) * r, Math.max(-0.3, heightAt(Math.cos(a) * r, Math.sin(a) * r)), Math.sin(a) * r);
  heron.rotation.y = Math.atan2(Math.cos(a), Math.sin(a)) + 0.6;
  heron.scale.setScalar(1.5);
  heron.name = "heron";
  scene.add(heron);
  // mostly still and watchful; every so often the neck lunges down to the water and slowly rises again
  onFrame((dt, t, tt) => {
    const c = (tt + 4) % 13,
      strike = c < 0.35 ? c / 0.35 : c < 0.9 ? 1 : c < 2.4 ? 1 - (c - 0.9) / 1.5 : 0;
    neck.rotation.x = strike * 1.7 + Math.sin(tt * 0.4) * 0.04;
    neck.rotation.y = (1 - strike) * Math.sin(tt * 0.23) * 0.5;
    head.rotation.x = strike * 0.6;
  });
}

/* ================= hedgehog ================= */
// a hedgehog that comes out from dusk until early morning (not in winter: it hibernates) and snuffles from spot
// to spot across the meadow, stopping to sniff the grass
function makeHedgehog() {
  const hr = makeRng(7331),
    hog = new THREE.Group();
  const furM = S({ color: "#8a6a4a", roughness: 0.95 }),
    faceM = S({ color: "#b89676", roughness: 0.9 }),
    blackM = S({ color: "#141210", roughness: 0.4 });
  const body = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), furM));
  body.position.y = 0.1;
  body.scale.set(0.85, 0.62, 1.15);
  hog.add(body);
  // spines all over the back, pointing backwards, dark at the root and cream at the tip
  const spines = [],
    q = new THREE.Quaternion(),
    n = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0),
    dark = new THREE.Color("#3a2c22"),
    tip = new THREE.Color("#d8c7a8");
  for (let k = 0; k < 260; k++) {
    n.set(hr() * 2 - 1, hr() * 1.1 - 0.1, hr() * 2 - 1);
    if (n.lengthSq() > 1 || n.lengthSq() < 0.05 || n.z > 0.45) {
      k--;
      continue;
    }
    n.normalize();
    const p = new THREE.Vector3(n.x * 0.16 * 0.85, 0.1 + n.y * 0.16 * 0.62, n.z * 0.16 * 1.15);
    const cone = new THREE.ConeGeometry(0.011, 0.085, 4);
    cone.translate(0, 0.04, 0);
    q.setFromUnitVectors(
      up,
      n
        .clone()
        .add(new THREE.Vector3(0, 0.25, -0.9))
        .normalize(),
    );
    cone.applyQuaternion(q);
    cone.translate(p.x, p.y, p.z);
    const pos = cone.attributes.position,
      col = [];
    for (let i = 0; i < pos.count; i++) {
      const c = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).distanceTo(p) > 0.05 ? tip : dark;
      col.push(c.r, c.g, c.b);
    }
    cone.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    spines.push(cone);
  }
  hog.add(shadow(new THREE.Mesh(mergeGeometries(spines), S({ vertexColors: true, roughness: 0.8 }))));
  // a pointed snout with a black nose, bead eyes and small round ears
  const head = new THREE.Group();
  head.position.set(0, 0.09, 0.15);
  hog.add(head);
  const snout = shadow(new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 12), faceM));
  snout.rotation.x = Math.PI / 2;
  snout.position.z = 0.05;
  head.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), blackM);
  nose.position.set(0, 0, 0.125);
  head.add(nose);
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), blackM);
    eye.position.set(s * 0.035, 0.03, 0.03);
    head.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), faceM);
    ear.position.set(s * 0.05, 0.05, -0.01);
    ear.scale.z = 0.5;
    head.add(ear);
  });
  // four short legs that patter while it walks
  const legs = [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ].map(([sx, sz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.07, 6), faceM);
    leg.geometry.translate(0, -0.035, 0);
    leg.position.set(sx * 0.07, 0.06, sz * 0.08);
    hog.add(leg);
    return leg;
  });
  hog.userData = { head, legs };
  hog.scale.setScalar(1.3);
  return hog;
}

export function buildHedgehog() {
  const hog = makeHedgehog();
  hog.name = "hedgehog";
  addInfo(hog, 0.4, 0.15, "Hedgehog", () => "Out after dark, snuffling for beetles and snails");
  hog.visible = false;
  scene.add(hog);
  // a spot out on the meadow, clear of the houses, the trees, the fountain and the beach
  const spot = (v) => {
    for (let k = 0; k < 50; k++) {
      const a = Math.random() * Math.PI * 2,
        r = 5 + Math.random() * 15,
        x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      if (
        heightAt(x, z) < 1.1 ||
        plots.some((p) => Math.hypot(x - p.x, z - p.z) < 6.5) ||
        treeSpots.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 1.3)
      )
        continue;
      return v.set(x, 0, z);
    }
    return v.set(8, 0, 0);
  };
  const pos = spot(new THREE.Vector3()),
    goal = spot(new THREE.Vector3()),
    dir = new THREE.Vector3();
  let sniff = 0,
    walk = 0,
    gait = 0,
    awake = false;
  onSeason(({ wi }) => (awake = !wi));
  onTime(({ dark }) => (hog.visible = awake && dark > 0.3));
  onFrame((dt, t, tt) => {
    if (!hog.visible) return;
    const { head, legs } = hog.userData;
    if (!reduce) {
      if (sniff > 0) {
        sniff -= dt;
        if (sniff <= 0) spot(goal);
      } else {
        dir.subVectors(goal, pos).setY(0);
        const d = dir.length();
        if (d < 0.1) sniff = 2 + Math.random() * 4;
        else {
          pos.addScaledVector(dir, Math.min(1, (0.32 * dt) / d));
          let dy = Math.atan2(dir.x, dir.z) - hog.rotation.y;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          hog.rotation.y += dy * Math.min(1, dt * 3);
        }
      }
    }
    walk += ((sniff > 0 || reduce ? 0 : 1) - walk) * Math.min(1, dt * 5);
    gait += dt * walk * 16;
    hog.position.set(pos.x, heightAt(pos.x, pos.z) - 0.01 + Math.abs(Math.sin(gait)) * 0.008, pos.z);
    legs.forEach((l, k) => (l.rotation.x = Math.sin(gait + (k === 0 || k === 3 ? 0 : Math.PI)) * 0.6 * walk));
    // nose down to the grass while it sniffs
    head.rotation.x = (1 - walk) * (0.35 + Math.sin(tt * 6) * 0.08);
    head.rotation.y = (1 - walk) * Math.sin(tt * 0.9) * 0.4;
  });
}
