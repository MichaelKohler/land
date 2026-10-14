// Each house's garden. Every garden has the stone path, mailbox and bench in front; the boundary and back garden
// follow the resident's garden style (residents.js): a kitchen garden inside a hedge, a Mediterranean garden
// behind a limestone wall, or a family garden with a picket fence (and the children's toys on the porch).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeRng, onSeason } from "./core.js";
import { S, shadow, canvasTex, makeBench, stoneTex, mStone, mWood, mDark } from "./materials.js";
import { D, STEPS } from "./building.js";

// garden things that come and go with the seasons: { o: object, seasons: [...] }
const gardenSeasonal = [];
onSeason((S) => gardenSeasonal.forEach(({ o, seasons }) => (o.visible = seasons.includes(S.season))));
// world-space circles [x, z, radius] where no grass may grow (vegetation.js clears them)
export const grassClear = [];

const GREEN = ["spring", "summer", "autumn"];
const inGap = (a) => Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.32; // the gate, facing the plaza
// the garden styles: the boundary round the garden and what grows and stands in it
const GARDENS = {
  kitchen: { boundary: hedge, garden: kitchenGarden },
  mediterranean: { boundary: limestoneWall, garden: mediterraneanGarden },
  family: { boundary: picketFence, garden: familyGarden },
};

export function buildGarden({ g, r, i }) {
  const gr = makeRng(101 + i * 977);
  const dm = new THREE.Object3D();
  const add = (geo, m, x, y, z, seasons) => {
    const o = shadow(new THREE.Mesh(geo, m));
    o.position.set(x, y, z);
    g.add(o);
    if (seasons) gardenSeasonal.push({ o, seasons });
    return o;
  };
  const noGrass = (x, z, rad) => {
    g.updateMatrixWorld();
    const w = g.localToWorld(new THREE.Vector3(x, 0, z));
    grassClear.push([w.x, w.z, rad]);
  };
  const ctx = { g, r, gr, dm, add, noGrass };

  const style = GARDENS[r.garden];
  style?.boundary(ctx);
  // front: stepping stones up to the porch, a mailbox in the resident's colour and a bench
  for (let k = 0; k < 5; k++) {
    const sp = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.08, 9), mStone));
    sp.position.set((gr() - 0.5) * 0.25, 0.08, D / 2 + 1.55 + k * 0.62);
    g.add(sp);
  }
  const mailM = S({ color: r.color, roughness: 0.45, metalness: 0.3 });
  const mbP = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, 0.1), mWood));
  mbP.position.set(1.05, 0.52, 4.75);
  const mb = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 14, 1, false, 0, Math.PI), mailM));
  mb.rotation.z = Math.PI / 2;
  mb.rotation.y = Math.PI / 2;
  mb.position.set(1.05, 1.12, 4.75);
  const mbB = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.55), mailM));
  mbB.position.set(1.05, 1.02, 4.75);
  const bench = makeBench();
  bench.position.set(-2.2, 0, D / 2 + 1.2);
  g.add(mbP, mb, mbB, bench);
  style?.garden(ctx);
}

/* ================= boundaries ================= */
// a clipped hedge with a gap for the gate
function hedge({ g, gr }) {
  const hedgeM = S({ color: "#3f6b2a", roughness: 1 });
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    if (inGap(a)) continue;
    const b = shadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 1), hedgeM));
    b.position.set(Math.cos(a) * 4.9, 0.4, Math.sin(a) * 4.9);
    b.scale.set(1, 0.85 + gr() * 0.3, 1);
    g.add(b);
  }
}

// a low dry-stone wall of warm limestone
function limestoneWall({ gr, add }) {
  const wallM = S({ map: stoneTex, color: "#e6d6bb", roughness: 0.95 });
  for (let k = 0; k < 36; k++) {
    const a = ((k + 0.5) / 36) * Math.PI * 2;
    if (inGap(a)) continue;
    const h = 0.5 + gr() * 0.12;
    add(new THREE.BoxGeometry(0.9, h, 0.42), wallM, Math.cos(a) * 4.9, h / 2, Math.sin(a) * 4.9).rotation.y =
      Math.PI / 2 - a;
  }
}

// a white picket fence with two rails and gate posts
function picketFence({ g, dm, add }) {
  const fenceM = S({ color: "#f4f1ea", roughness: 0.7 });
  const pk = new THREE.Shape();
  pk.moveTo(-0.045, 0);
  pk.lineTo(0.045, 0);
  pk.lineTo(0.045, 0.72);
  pk.lineTo(0, 0.8);
  pk.lineTo(-0.045, 0.72);
  pk.lineTo(-0.045, 0);
  const pkG = new THREE.ExtrudeGeometry(pk, { depth: 0.03, bevelEnabled: false });
  pkG.translate(0, 0, -0.015);
  const angs = [];
  for (let k = 0; k < 100; k++) {
    const a = (k / 100) * Math.PI * 2;
    if (!inGap(a)) angs.push(a);
  }
  const pickets = shadow(new THREE.InstancedMesh(pkG, fenceM, angs.length));
  angs.forEach((a, k) => {
    dm.position.set(Math.cos(a) * 4.9, 0, Math.sin(a) * 4.9);
    dm.rotation.set(0, Math.PI / 2 - a, 0);
    dm.updateMatrix();
    pickets.setMatrixAt(k, dm.matrix);
  });
  g.add(pickets);
  const a0 = Math.PI / 2 + 0.32,
    a1 = Math.PI / 2 + Math.PI * 2 - 0.32;
  [0.22, 0.58].forEach((y) => {
    const pts = Array.from({ length: 65 }, (_, k) => {
      const a = a0 + ((a1 - a0) * k) / 64;
      return new THREE.Vector3(Math.cos(a) * 4.86, y, Math.sin(a) * 4.86);
    });
    g.add(shadow(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.025, 5), fenceM)));
  });
  [a0, a1].forEach((a) => {
    add(new THREE.BoxGeometry(0.12, 0.95, 0.12), fenceM, Math.cos(a) * 4.9, 0.47, Math.sin(a) * 4.9);
    add(new THREE.SphereGeometry(0.08, 10, 8), fenceM, Math.cos(a) * 4.9, 0.98, Math.sin(a) * 4.9);
  });
}

/* ================= kitchen garden ================= */
// vegetable beds, a small greenhouse with tomatoes, an apple tree and a watering can
// thin white bars along every edge of the greenhouse glass (lit like everything else, so they darken at night)
function frameBars(...geos) {
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0),
    bars = [];
  geos.forEach((geo) => {
    const e = new THREE.EdgesGeometry(geo).attributes.position;
    for (let k = 0; k < e.count; k += 2) {
      a.fromBufferAttribute(e, k);
      b.fromBufferAttribute(e, k + 1);
      const len = a.distanceTo(b),
        bar = new THREE.BoxGeometry(0.035, len + 0.035, 0.035);
      bar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
      bars.push(bar.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
    }
  });
  return mergeGeometries(bars);
}

function kitchenGarden({ g, gr, add, noGrass }) {
  const soilM = S({ color: "#4e3826", roughness: 1 });
  for (let k = 0; k < 3; k++) {
    const z = -D / 2 - 1.0 - k * 0.85;
    const bed = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.22, 0.6), soilM));
    bed.position.set(0, 0.11, z);
    g.add(bed);
    for (let j = 0; j < 7; j++)
      add(
        new THREE.IcosahedronGeometry(0.16 + gr() * 0.06, 1),
        S({ color: k % 2 ? "#6ea84a" : "#3e7d33" }),
        -1.1 + j * 0.37,
        0.32,
        z,
        GREEN,
      ).scale.y = 0.8;
    [-0.9, 0, 0.9].forEach((x) => noGrass(x, z, 0.5));
  }
  const glassM = S({
      color: "#d4ecf2",
      roughness: 0.05,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    frameM = S({ color: "#f2f2ee", roughness: 0.5 });
  const gh = new THREE.Group();
  gh.position.set(3.65, 0, -0.2);
  g.add(gh);
  noGrass(3.65, -0.2, 1.15);
  const ghBox = new THREE.BoxGeometry(1.3, 1.1, 1.8);
  ghBox.translate(0, 0.55, 0);
  const roofG = new THREE.BufferGeometry();
  roofG.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-0.65, 1.1, 0.9, 0, 1.6, 0.9, 0.65, 1.1, 0.9, -0.65, 1.1, -0.9, 0, 1.6, -0.9, 0.65, 1.1, -0.9],
      3,
    ),
  );
  roofG.setIndex([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 0, 2, 1, 3, 4, 5]);
  roofG.computeVertexNormals();
  gh.add(
    new THREE.Mesh(ghBox, glassM),
    new THREE.Mesh(roofG, glassM),
    shadow(new THREE.Mesh(frameBars(ghBox, roofG), frameM)),
  );
  const ghBed = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 1.5), soilM));
  ghBed.position.y = 0.12;
  gh.add(ghBed);
  const tomatoM = S({ color: "#d1352b", roughness: 0.4 });
  for (let k = 0; k < 3; k++) {
    const pl = shadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), S({ color: "#3f7a31" })));
    pl.position.set(0, 0.55, -0.5 + k * 0.5);
    pl.scale.y = 1.6;
    gh.add(pl);
    for (let j = 0; j < 4; j++) {
      const tom = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), tomatoM);
      tom.position.set((gr() - 0.5) * 0.3, 0.4 + gr() * 0.35, -0.5 + k * 0.5 + (gr() - 0.5) * 0.25);
      gh.add(tom);
      gardenSeasonal.push({ o: tom, seasons: ["summer", "autumn"] });
    }
  }
  // apple tree: leaves from spring to autumn, apples in summer and autumn
  const ax = -3.5,
    az = -2.0,
    trunkM = S({ color: "#5d4636", roughness: 0.95 });
  add(new THREE.CylinderGeometry(0.12, 0.17, 1.6, 9), trunkM, ax, 0.8, az);
  [
    [-0.5, 0.4],
    [0.45, -0.3],
    [0.1, 0.5],
  ].forEach(([dx, dz]) =>
    add(new THREE.CylinderGeometry(0.04, 0.07, 0.9, 6), trunkM, ax + dx * 0.5, 1.85, az + dz * 0.5).rotation.set(
      dz * 1.2,
      0,
      -dx * 1.2,
    ),
  );
  const leafM = S({ color: "#4f7d34", roughness: 0.9 });
  [
    [0, 2.35, 0, 1.0],
    [-0.55, 2.1, 0.3, 0.7],
    [0.5, 2.15, -0.25, 0.72],
    [0.1, 2.75, 0.1, 0.65],
  ].forEach(([dx, y, dz, s]) => add(new THREE.IcosahedronGeometry(s, 2), leafM, ax + dx, y, az + dz, GREEN));
  const appleM = S({ color: "#c7372f", roughness: 0.35 });
  for (let k = 0; k < 16; k++) {
    const th = gr() * Math.PI * 2,
      ph = 0.3 + gr() * 1.4;
    add(
      new THREE.SphereGeometry(0.07, 10, 8),
      appleM,
      ax + Math.sin(ph) * Math.cos(th),
      2.35 + Math.cos(ph) * 0.9,
      az + Math.sin(ph) * Math.sin(th),
      ["summer", "autumn"],
    );
  }
  // a green watering can by the beds
  const canM = S({ color: "#3f7d5a", roughness: 0.45, metalness: 0.3 });
  add(new THREE.CylinderGeometry(0.13, 0.15, 0.3, 14), canM, 1.75, 0.15, -2.6);
  add(new THREE.CylinderGeometry(0.02, 0.03, 0.38, 8), canM, 1.95, 0.25, -2.6).rotation.z = -0.9;
  add(new THREE.TorusGeometry(0.1, 0.018, 6, 14, Math.PI), canM, 1.75, 0.3, -2.6);
}

/* ================= Mediterranean garden ================= */
// an olive tree, lavender, lemon trees in terracotta pots and a little bistro table
function mediterraneanGarden({ g, gr, dm, add }) {
  const oliveTrunk = S({ color: "#6b5d4d", roughness: 0.95 }),
    oliveLeaf = S({ color: "#8d9c6e", roughness: 0.9 });
  const ox = -2.4,
    oz = -3.2;
  add(new THREE.CylinderGeometry(0.11, 0.2, 1.3, 9), oliveTrunk, ox, 0.62, oz).rotation.z = 0.18;
  add(new THREE.CylinderGeometry(0.08, 0.11, 0.9, 8), oliveTrunk, ox - 0.2, 1.45, oz + 0.1).rotation.set(0.2, 0, -0.35);
  add(new THREE.CylinderGeometry(0.06, 0.09, 0.8, 8), oliveTrunk, ox + 0.25, 1.4, oz - 0.15).rotation.set(
    -0.3,
    0,
    0.45,
  );
  [
    [0, 2.0, 0, 0.75],
    [-0.6, 1.85, 0.25, 0.55],
    [0.55, 1.8, -0.3, 0.55],
    [0.15, 2.3, 0.35, 0.5],
    [-0.25, 2.25, -0.4, 0.5],
  ].forEach(
    ([dx, y, dz, s]) => (add(new THREE.IcosahedronGeometry(s, 1), oliveLeaf, ox + dx, y, oz + dz).scale.y = 0.62),
  );
  // lavender: grey-green mounds with purple flower spikes in spring and summer
  const lavM = S({ color: "#7d8f6a", roughness: 1 }),
    spikes = [];
  [-3.0, -3.7].forEach((z) => {
    for (let k = 0; k < 6; k++) {
      const x = -0.3 + k * 0.48;
      add(new THREE.IcosahedronGeometry(0.22, 1), lavM, x, 0.15, z).scale.y = 0.7;
      for (let j = 0; j < 9; j++) {
        const an = gr() * Math.PI * 2,
          rr = gr() * 0.17;
        spikes.push([
          x + Math.cos(an) * rr,
          0.36 + gr() * 0.06,
          z + Math.sin(an) * rr,
          (gr() - 0.5) * 0.5,
          (gr() - 0.5) * 0.5,
        ]);
      }
    }
  });
  const spikeI = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.024, 0.17, 5),
    S({ color: "#8a6cc8", roughness: 0.8 }),
    spikes.length,
  );
  spikes.forEach(([x, y, z, rx, rz], k) => {
    dm.position.set(x, y, z);
    dm.rotation.set(rx, 0, rz);
    dm.updateMatrix();
    spikeI.setMatrixAt(k, dm.matrix);
  });
  g.add(spikeI);
  gardenSeasonal.push({ o: spikeI, seasons: ["spring", "summer"] });
  // lemon trees in terracotta pots beside the house; the lemons stay on all year
  const potM = S({ color: "#b5643c", roughness: 0.85 }),
    potG = new THREE.LatheGeometry(
      [
        [0, 0],
        [0.2, 0],
        [0.27, 0.42],
        [0.3, 0.44],
        [0.3, 0.5],
        [0, 0.5],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      18,
    );
  const lemonLeafM = S({ color: "#2f6b2a", roughness: 0.85 }),
    lemonM = S({ color: "#f2d23c", roughness: 0.4 });
  [
    [3.25, -1.5],
    [3.25, 1.1],
  ].forEach(([x, z]) => {
    add(potG, potM, x, 0, z);
    add(new THREE.CylinderGeometry(0.035, 0.05, 0.7, 6), oliveTrunk, x, 0.8, z);
    add(new THREE.IcosahedronGeometry(0.42, 2), lemonLeafM, x, 1.3, z);
    for (let k = 0; k < 9; k++) {
      const th = gr() * Math.PI * 2,
        ph = 0.5 + gr() * 1.3;
      add(
        new THREE.SphereGeometry(0.055, 8, 6),
        lemonM,
        x + Math.sin(ph) * Math.cos(th) * 0.42,
        1.3 + Math.cos(ph) * 0.42,
        z + Math.sin(ph) * Math.sin(th) * 0.42,
      ).scale.set(1, 1, 1.3);
    }
  });
  // a bistro table with two chairs in Mediterranean blue
  const bistroM = S({ color: "#2f5f8a", roughness: 0.4, metalness: 0.4 }),
    bx = -3.35,
    bz = 0.6;
  add(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 20), bistroM, bx, 0.72, bz);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), bistroM, bx, 0.36, bz);
  add(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), bistroM, bx, 0.02, bz);
  [-1, 1].forEach((s) => {
    const ch = new THREE.Group();
    ch.position.set(bx, 0, bz + s * 0.6);
    ch.rotation.y = s > 0 ? Math.PI : 0;
    g.add(ch);
    const p = (geo, x, y, z) => {
      const o = shadow(new THREE.Mesh(geo, bistroM));
      o.position.set(x, y, z);
      ch.add(o);
      return o;
    };
    p(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16), 0, 0.45, 0);
    [
      [-0.13, -0.13],
      [0.13, -0.13],
      [-0.13, 0.13],
      [0.13, 0.13],
    ].forEach(([x, z]) => p(new THREE.CylinderGeometry(0.014, 0.014, 0.45, 6), x, 0.22, z));
    p(new THREE.TorusGeometry(0.18, 0.018, 6, 16, Math.PI), 0, 0.62, -0.17);
  });
}

/* ================= family garden ================= */
// a swing set, a sandbox beside the house, a small trampoline, and the children's toys on the porch
function familyGarden(ctx) {
  const { add, noGrass } = ctx;
  const sx = -0.2,
    sz = -3.5;
  [-1.25, 1.25].forEach((x) =>
    [-1, 1].forEach(
      (s) =>
        (add(new THREE.CylinderGeometry(0.05, 0.06, 2.1, 8), mWood, sx + x, 1.0, sz + s * 0.27).rotation.x = s * 0.27),
    ),
  );
  add(new THREE.CylinderGeometry(0.06, 0.06, 2.7, 10), mWood, sx, 2.02, sz).rotation.z = Math.PI / 2;
  const ropeM = S({ color: "#c9b48a", roughness: 0.9 });
  [
    [-0.55, "#e63946"],
    [0.55, "#ffd166"],
  ].forEach(([x, c]) => {
    [-0.2, 0.2].forEach((d) => add(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 5), ropeM, sx + x + d, 1.27, sz));
    add(new THREE.BoxGeometry(0.48, 0.04, 0.2), S({ color: c, roughness: 0.6 }), sx + x, 0.5, sz);
  });
  // sandbox with a bucket, a spade and a sandcastle
  const sbx = -3.75,
    sbz = -0.6,
    sandM = S({ color: "#e6d3a3", roughness: 1 });
  noGrass(sbx, sbz, 0.95);
  [
    [0, 0.62, 1.34, 0.1],
    [0, -0.62, 1.34, 0.1],
    [0.62, 0, 0.1, 1.34],
    [-0.62, 0, 0.1, 1.34],
  ].forEach(([dx, dz, w, d]) => add(new THREE.BoxGeometry(w, 0.22, d), mWood, sbx + dx, 0.11, sbz + dz));
  add(new THREE.BoxGeometry(1.16, 0.16, 1.16), sandM, sbx, 0.08, sbz);
  add(
    new THREE.CylinderGeometry(0.11, 0.08, 0.17, 14),
    S({ color: "#e63946", roughness: 0.5 }),
    sbx + 0.25,
    0.25,
    sbz + 0.2,
  );
  add(
    new THREE.BoxGeometry(0.03, 0.32, 0.03),
    S({ color: "#2a9df4", roughness: 0.5 }),
    sbx - 0.3,
    0.3,
    sbz + 0.25,
  ).rotation.z = 0.5;
  add(new THREE.CylinderGeometry(0.17, 0.2, 0.14, 12), sandM, sbx - 0.15, 0.23, sbz - 0.2);
  add(new THREE.ConeGeometry(0.12, 0.18, 12), sandM, sbx - 0.15, 0.39, sbz - 0.2);
  // trampoline
  const tx = 2.45,
    tz = -3.0;
  noGrass(tx, tz, 0.75);
  add(new THREE.TorusGeometry(0.62, 0.07, 8, 32), S({ color: "#2a7fc1", roughness: 0.6 }), tx, 0.42, tz).rotation.x =
    Math.PI / 2;
  add(
    new THREE.CircleGeometry(0.58, 28),
    S({ color: "#1d1d1f", roughness: 0.8, side: THREE.DoubleSide }),
    tx,
    0.4,
    tz,
  ).rotation.x = -Math.PI / 2;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 6), mDark, tx + Math.cos(a) * 0.6, 0.21, tz + Math.sin(a) * 0.6);
  }
  porchToys(ctx);
}

function porchToys({ g }) {
  const toy = (geo, color, x, y, z, o = {}) => {
    const m = shadow(new THREE.Mesh(geo, S({ color, roughness: 0.55, ...o })));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const STEP = STEPS[0].top,
    LOWER = STEPS[1].top; // tops of the porch step and the lower step
  // a striped ball on the lower step
  const ballTex = canvasTex(64, 32, (x, w, h) =>
    ["#e63946", "#ffd166", "#2a9df4", "#ffffff"].forEach((c, k) => {
      x.fillStyle = c;
      x.fillRect((k * w) / 4, 0, w / 4 + 1, h);
    }),
  );
  toy(new THREE.SphereGeometry(0.13, 18, 12), "#ffffff", 0.5, LOWER + 0.13, STEPS[1].z + 0.05, {
    map: ballTex,
  }).rotation.set(0.4, 0.3, 0.2);
  // a little tower of building blocks
  ["#e63946", "#2a9df4", "#ffd166", "#06d6a0"].forEach(
    (c, k) =>
      (toy(
        new THREE.BoxGeometry(0.13, 0.13, 0.13),
        c,
        -0.55 + (k === 3 ? 0.16 : 0),
        STEP + 0.065 + (k < 3 ? k * 0.13 : 0),
        STEPS[0].z + (k === 3 ? 0.06 : 0),
      ).rotation.y = k * 0.35),
  );
  // a little teddy bear sitting on the lower step, legs out in front, arms at its sides
  const fur = "#a0703f",
    pad = "#e8d2b0",
    lx = -0.5,
    lz = STEPS[1].z - 0.05;
  toy(new THREE.SphereGeometry(0.11, 16, 12), fur, lx, LOWER + 0.1, lz).scale.set(1, 1.1, 0.9);
  toy(new THREE.SphereGeometry(0.08, 16, 12), fur, lx, LOWER + 0.27, lz + 0.02);
  toy(new THREE.SphereGeometry(0.03, 10, 8), pad, lx, LOWER + 0.26, lz + 0.09);
  toy(new THREE.SphereGeometry(0.011, 8, 6), "#2a1a12", lx, LOWER + 0.272, lz + 0.118);
  [-1, 1].forEach((s) => {
    toy(new THREE.SphereGeometry(0.03, 10, 8), fur, lx + s * 0.06, LOWER + 0.34, lz + 0.02);
    toy(new THREE.SphereGeometry(0.009, 8, 6), "#2a1a12", lx + s * 0.03, LOWER + 0.295, lz + 0.088);
    toy(new THREE.SphereGeometry(0.035, 10, 8), fur, lx + s * 0.1, LOWER + 0.12, lz + 0.03).scale.set(1, 1.5, 1);
    toy(new THREE.SphereGeometry(0.045, 12, 8), fur, lx + s * 0.06, LOWER + 0.045, lz + 0.08).scale.set(1, 0.9, 1.4);
    toy(new THREE.SphereGeometry(0.03, 10, 8), pad, lx + s * 0.06, LOWER + 0.045, lz + 0.14).scale.set(1, 1, 0.4);
  });
  // a red toy truck on the ground beside the steps
  const truck = new THREE.Group();
  truck.position.set(-1.15, 0.05, 3.15);
  truck.rotation.y = 0.5;
  g.add(truck);
  const tb = (geo, color, x, y, z) => {
    const m = shadow(new THREE.Mesh(geo, S({ color, roughness: 0.5 })));
    m.position.set(x, y, z);
    truck.add(m);
    return m;
  };
  tb(new THREE.BoxGeometry(0.22, 0.1, 0.42), "#d62828", 0, 0.1, 0);
  tb(new THREE.BoxGeometry(0.2, 0.12, 0.14), "#f1c40f", 0, 0.2, 0.12);
  [-1, 1].forEach((sx) =>
    [-1, 1].forEach(
      (sz) =>
        (tb(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), "#222222", sx * 0.12, 0.05, sz * 0.13).rotation.z =
          Math.PI / 2),
    ),
  );
}
