// Christmas (1 to 26 December, or ?christmas): fairy lights along every house's eaves and gables, wreaths on the
// doors, lights spiralling up a handful of pines, and one fully decorated tree with baubles, tinsel, a star and presents.
import * as THREE from "three";
import { XMAS, makeRng, reduce, scene, state, onFrame } from "./core.js";
import { plots, pathDist, heightAt } from "./world.js";
import { S, shadow } from "./materials.js";
import { houses } from "./houses.js";
import { FLOOR, WH, RH, ROOF_LEN, EAVE_Y, EAVE_Z, DOOR, PORCH_POSTS } from "./building.js";
import { decid, pines, branches, barkM, treeSpots, clearInstances } from "./vegetation.js";

export function buildXmas() {
  if (!XMAS) return;
  const rnd = makeRng(1225);
  const bulbs = []; // { p: world position, c: base colour, ph: twinkle phase, sp: twinkle speed }
  const palette = ["#ff3b3b", "#ffd04a", "#3bd16f", "#4aa8ff", "#fff1d6"].map((c) => new THREE.Color(c));
  const addBulb = (p, k) => bulbs.push({ p, c: palette[k % palette.length], ph: rnd() * 6.3, sp: 1.5 + rnd() * 2 });
  // strings along the eaves and up the gable edges of each house, plus a wreath on the door
  Object.values(houses).forEach((h) => {
    const g = h.group,
      L = (x, y, z) => g.localToWorld(new THREE.Vector3(x, y, z));
    g.updateMatrixWorld();
    let k = 0;
    // just below and outside the gutters, drooping a little between the hooks
    const ex = ROOF_LEN / 2 - 0.05,
      ey = EAVE_Y - 0.06,
      ez = EAVE_Z + 0.09;
    [-1, 1].forEach((side) => {
      for (let i = 0; i <= 24; i++) {
        const x = -ex + (i / 24) * 2 * ex;
        addBulb(L(x, ey - 0.07 * Math.sin(Math.PI * ((i % 4) / 4)), side * ez), k++);
      }
    });
    // up both gable ends to the ridge
    [-1, 1].forEach((end) => {
      for (let i = 0; i <= 18; i++) {
        const z = EAVE_Z * ((2 * i) / 18 - 1);
        addBulb(L(end * (ROOF_LEN / 2 + 0.03), FLOOR + WH - 0.05 + (1 - Math.abs(z) / EAVE_Z) * (RH + 0.2), z), k++);
      }
    });
    // wound round the porch posts
    [-1, 1].forEach((s) => {
      for (let i = 0; i < 9; i++)
        addBulb(
          L(s * PORCH_POSTS.x + Math.cos(i * 1.9) * 0.08, 0.6 + i * 0.25, PORCH_POSTS.z + Math.sin(i * 1.9) * 0.08),
          k++,
        );
    });
    const wy = DOOR.y + 0.5;
    const wreath = shadow(
      new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 20), S({ color: "#1f5a2c", roughness: 0.9 })),
    );
    wreath.position.set(0, wy, DOOR.z + 0.07);
    g.add(wreath);
    const bow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), S({ color: "#c81d25" }));
    bow.scale.set(1.8, 1, 0.6);
    bow.position.set(0, wy - 0.2, DOOR.z + 0.15);
    g.add(bow);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      addBulb(L(Math.cos(a) * 0.22, wy + Math.sin(a) * 0.22, DOOR.z + 0.16), i);
    }
  });
  // find an open spot on the meadow for the big tree, away from paths and gardens
  let best = null;
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * Math.PI * 2,
      x = Math.cos(a) * 8.6,
      z = Math.sin(a) * 8.6;
    const d = Math.min(pathDist(x, z), ...plots.map((p) => Math.hypot(x - p.x, z - p.z) - 4.5));
    if (!best || d > best.d) best = { x, z, d };
  }
  const TX = best.x,
    TZ = best.z,
    TY = heightAt(TX, TZ);
  // clear forest trees standing in its way (and their winter branches)
  [decid, branches, pines].forEach((m) => clearInstances(m, (x, z) => Math.hypot(x - TX, z - TZ) < 4));
  const tree = new THREE.Group();
  tree.position.set(TX, TY - 0.05, TZ);
  scene.add(tree);
  const layers = [
    [2.4, 2.6, 2.0],
    [2.0, 2.3, 3.3],
    [1.55, 2.0, 4.45],
    [1.1, 1.7, 5.45],
    [0.62, 1.3, 6.3],
  ];
  const needles = S({ color: "#1d4a2a", roughness: 0.9 });
  tree.add(shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.2, 10).translate(0, 0.6, 0), barkM)));
  layers.forEach(([r, h, y]) => {
    const c = new THREE.ConeGeometry(r, h, 18, 3);
    const p = c.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (rnd() - 0.5) * 0.1;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    c.computeVertexNormals();
    const m = shadow(new THREE.Mesh(c, needles));
    m.position.y = y;
    tree.add(m);
  });
  const radiusAt = (y) =>
    layers.reduce((m, [r, h, c]) => {
      const b = c - h / 2;
      return y >= b && y <= b + h ? Math.max(m, r * (1 - (y - b) / h)) : m;
    }, 0);
  // baubles
  const baubleMs = ["#c81d25", "#e9b949", "#2b59c3", "#d9d9e0"].map((c) =>
    S({ color: c, metalness: 0.7, roughness: 0.22, envMapIntensity: 1.2 }),
  );
  for (let i = 0; i < 46; i++) {
    const y = 1.3 + rnd() * 5.1,
      a = rnd() * Math.PI * 2,
      r = radiusAt(y) * 0.92 + 0.05;
    const b = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.11 + rnd() * 0.05, 14, 10), baubleMs[i % 4]));
    b.position.set(Math.cos(a) * r, y - 0.12, Math.sin(a) * r);
    tree.add(b);
  }
  // gold tinsel spiralling down
  const tinselPts = [];
  for (let i = 0; i <= 200; i++) {
    const t = i / 200,
      y = 1.3 + t * 5.2,
      a = t * Math.PI * 2 * 4.5;
    const r = radiusAt(y) * 0.95 + 0.03;
    tinselPts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  tree.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tinselPts), 400, 0.035, 6),
      S({ color: "#e8c25a", metalness: 0.9, roughness: 0.3, envMapIntensity: 1.4 }),
    ),
  );
  // fairy lights spiral the other way
  tree.updateMatrixWorld();
  for (let i = 0; i < 170; i++) {
    const t = i / 170,
      y = 1.2 + t * 5.4,
      a = -t * Math.PI * 2 * 6;
    const r = radiusAt(y) * 0.98 + 0.06;
    addBulb(tree.localToWorld(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)), i);
  }
  // a glowing star on top
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2,
      r = i % 2 ? 0.17 : 0.42;
    i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const star = new THREE.Mesh(
    new THREE.ExtrudeGeometry(starShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelSize: 0.02,
      bevelThickness: 0.02,
      bevelSegments: 1,
    }).center(),
    S({ color: "#ffd65a", emissive: "#ffc53d", emissiveIntensity: 2.5, metalness: 0.5, roughness: 0.3 }),
  );
  star.position.y = 7.3;
  tree.add(star);
  // presents underneath
  [
    ["#c81d25", "#f4e9c9"],
    ["#2b59c3", "#e9b949"],
    ["#1f7a3a", "#c81d25"],
    ["#e9b949", "#c81d25"],
    ["#7b3fa0", "#f4e9c9"],
  ].forEach(([c, rb], i) => {
    const a = 0.6 + i * 1.25,
      r = 1.6 + (i % 2) * 0.5,
      sz = 0.35 + (i % 3) * 0.12,
      g = new THREE.Group();
    g.position.set(Math.cos(a) * r, sz / 2, Math.sin(a) * r);
    g.rotation.y = a * 1.7;
    tree.add(g);
    g.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), S({ color: c, roughness: 0.6 }))));
    const rm = S({ color: rb, roughness: 0.4, metalness: 0.2 });
    g.add(
      new THREE.Mesh(new THREE.BoxGeometry(sz + 0.02, sz + 0.02, 0.06), rm),
      new THREE.Mesh(new THREE.BoxGeometry(0.06, sz + 0.02, sz + 0.02), rm),
    );
    const bw = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 6, 12), rm);
    bw.position.y = sz / 2 + 0.04;
    g.add(bw);
  });
  treeSpots.push([TX, TZ]);
  // fairy lights on a handful of pines near the village
  const near = [],
    m4 = new THREE.Matrix4(),
    tp3 = new THREE.Vector3();
  for (let i = 0; i < pines.count; i++) {
    pines.getMatrixAt(i, m4);
    tp3.setFromMatrixPosition(m4);
    const r = Math.hypot(tp3.x, tp3.z);
    if (r > 7 && r < 21 && Math.hypot(tp3.x - TX, tp3.z - TZ) > 4)
      near.push({ i, r, p: tp3.clone(), s: new THREE.Vector3().setFromMatrixScale(m4).y });
  }
  near
    .sort((a, b) => a.r - b.r)
    .slice(0, 7)
    .forEach(({ p, s }, n) => {
      for (let i = 0; i < 70; i++) {
        const t = i / 70,
          y = 1.4 + t * 4.6,
          a = t * Math.PI * 2 * 5 + n;
        const r = Math.max(0.15, 1.75 * (1 - (y - 1.2) / 5.1)) + 0.1;
        addBulb(new THREE.Vector3(p.x + Math.cos(a) * r * s, p.y + y * s, p.z + Math.sin(a) * r * s), i + n);
      }
    });
  const bulbMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.055, 8, 6),
    new THREE.MeshBasicMaterial({ color: "#ffffff" }),
    bulbs.length,
  );
  bulbs.forEach((b, i) => {
    m4.makeTranslation(b.p.x, b.p.y, b.p.z);
    bulbMesh.setMatrixAt(i, m4);
    bulbMesh.setColorAt(i, b.c);
  });
  bulbMesh.frustumCulled = false;
  scene.add(bulbMesh);
  // the bulbs twinkle, brighter after dark; the star turns slowly
  const c = new THREE.Color();
  onFrame((dt, t) => {
    const boost = 1.4 + state.weather.lights * 2.6;
    bulbs.forEach((b, i) => {
      const k = reduce ? 1 : 0.6 + 0.4 * Math.sin(t * b.sp + b.ph);
      bulbMesh.setColorAt(i, c.copy(b.c).multiplyScalar(k * boost));
    });
    bulbMesh.instanceColor.needsUpdate = true;
    if (!reduce) star.rotation.y = t * 0.5;
    star.material.emissiveIntensity = 1.5 + state.weather.lights * 2.5;
  });
}
