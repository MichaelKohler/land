// The beach that faces the opening view: a parasol and sun lounger (not in winter), and in summer
// a fire pit with a grill a little inland, out in the open.
import * as THREE from "three";
import { WIND, makeRng, reduce, scene, state, onSeason, onFrame } from "./core.js";
import { coastAt, heightAt, pathDist, blobGeo, vnoise, pierBase } from "./world.js";
import { S, shadow, canvasTex, puffTex, sprite } from "./materials.js";
import { treeSpots, rocks, grass, flowers, rockM, clearInstances, instancePositions } from "./vegetation.js";

export function buildBeach() {
  const { a, lounge, fire } = findSpots();
  const seaYaw = Math.PI / 2 - a; // turns a group's +z towards the sea
  const P = (an, r) => new THREE.Vector3(Math.cos(an) * r, 0, Math.sin(an) * r);
  // no grass blades or stray flowers poking up through the pit and its log seats
  [grass, flowers].forEach((m) => clearInstances(m, (x, z) => Math.hypot(x - fire.x, z - fire.z) < 2.1));

  /* ---------- parasol and lounger ---------- */
  const beachSet = new THREE.Group();
  // parasol: striped canopy on a white pole, tilted a little
  const stripeTex = canvasTex(256, 8, (x, w, h) => {
    for (let k = 0; k < 8; k++) {
      x.fillStyle = k % 2 ? "#f7f3ea" : "#e94f37";
      x.fillRect((k * w) / 8, 0, w / 8 + 1, h);
    }
  });
  const poleM = S({ color: "#f4f1ea", roughness: 0.5 });
  const para = new THREE.Group();
  para.position.copy(lounge).add(P(a + Math.PI / 2, 0.9));
  para.position.y = heightAt(para.position.x, para.position.z) - 0.25;
  para.rotation.set(0.12, seaYaw, 0);
  beachSet.add(para);
  const pp = (geo, m, y) => {
    const o = shadow(new THREE.Mesh(geo, m));
    o.position.y = y;
    para.add(o);
    return o;
  };
  pp(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), poleM, 1.3);
  pp(
    new THREE.ConeGeometry(1.35, 0.5, 16, 1, true),
    S({ map: stripeTex, roughness: 0.8, side: THREE.DoubleSide }),
    2.5,
  );
  pp(new THREE.SphereGeometry(0.06, 10, 8), poleM, 2.78);
  // fringe around the rim
  const fringeM = ["#e94f37", "#f7f3ea"].map((c) => S({ color: c, roughness: 0.8, side: THREE.DoubleSide }));
  for (let k = 0; k < 16; k++) {
    const an = (k / 16) * Math.PI * 2 + Math.PI / 16,
      f = pp(new THREE.ConeGeometry(0.09, 0.14, 3), fringeM[k % 2], 2.18);
    f.position.x = Math.cos(an) * 1.3;
    f.position.z = Math.sin(an) * 1.3;
    f.rotation.x = Math.PI;
  }
  // sun lounger with a striped towel; the head end faces inland, the feet face the sea
  const bed = new THREE.Group();
  bed.position.copy(lounge);
  bed.position.y = heightAt(lounge.x, lounge.z);
  bed.rotation.y = seaYaw;
  beachSet.add(bed);
  const bp = (geo, m, x, y, z) => {
    const o = shadow(new THREE.Mesh(geo, m));
    o.position.set(x, y, z);
    bed.add(o);
    return o;
  };
  const frameM = S({ color: "#f4f1ea", roughness: 0.5 }),
    slatM = S({ color: "#b98a5a", roughness: 0.75 });
  [-0.3, 0.3].forEach((x) => {
    bp(new THREE.BoxGeometry(0.05, 0.05, 1.3), frameM, x, 0.32, 0.25);
    [-0.35, 0.8].forEach((z) => bp(new THREE.BoxGeometry(0.05, 0.32, 0.05), frameM, x, 0.16, z));
  });
  bp(new THREE.BoxGeometry(0.58, 0.04, 1.3), slatM, 0, 0.36, 0.25);
  bp(new THREE.BoxGeometry(0.58, 0.04, 0.7), slatM, 0, 0.58, -0.68).rotation.x = 0.75;
  const towelM = S({
    map: canvasTex(8, 128, (x, w, h) => {
      for (let k = 0; k < 10; k++) {
        x.fillStyle = k % 2 ? "#ffffff" : "#2a8fd0";
        x.fillRect(0, (k * h) / 10, w, h / 10 + 1);
      }
    }),
    roughness: 1,
  });
  bp(new THREE.BoxGeometry(0.5, 0.02, 1.2), towelM, 0, 0.39, 0.25);
  bp(new THREE.BoxGeometry(0.5, 0.02, 0.6), towelM, 0, 0.61, -0.66).rotation.x = 0.75;
  // flip-flops in the sand
  const flipM = S({ color: "#ffd166", roughness: 0.7 });
  [-0.12, 0.12].forEach((x, k) => {
    const ff = bp(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), flipM, 0.62 + x, 0.03, 1.1 + k * 0.05);
    ff.scale.z = 2.2;
    ff.rotation.y = 0.2 * (k ? 1 : -1);
  });
  scene.add(beachSet);

  /* ---------- fire pit: stones, logs, flames, a grill with sausages, two logs to sit on ---------- */
  const firePit = new THREE.Group();
  firePit.position.copy(fire);
  firePit.position.y = heightAt(fire.x, fire.z);
  firePit.rotation.y = seaYaw;
  const fp = (geo, m, x, y, z) => {
    const o = shadow(new THREE.Mesh(geo, m));
    o.position.set(x, y, z);
    firePit.add(o);
    return o;
  };
  for (let k = 0; k < 11; k++) {
    const an = (k / 11) * Math.PI * 2;
    fp(blobGeo(0.17, 1), rockM, Math.cos(an) * 0.62, 0.08, Math.sin(an) * 0.62).scale.y = 0.75;
  }
  fp(new THREE.CircleGeometry(0.56, 20), S({ color: "#2b2522", roughness: 1 }), 0, 0.02, 0).rotation.x = -Math.PI / 2;
  const logM = S({ color: "#5a4030", roughness: 0.95 }),
    charM = S({ color: "#1e1a18", roughness: 1, emissive: "#ff5a1a", emissiveIntensity: 0.6 });
  [0, 1.1, 2.2].forEach((an, k) =>
    fp(new THREE.CylinderGeometry(0.06, 0.07, 0.75, 8), k ? logM : charM, 0, 0.12, 0).rotation.set(
      Math.PI / 2 - 0.25,
      an,
      0,
      "YXZ",
    ),
  );
  const flameMs = [
    S({
      color: "#ff8a2a",
      emissive: "#ff6a10",
      emissiveIntensity: 2.2,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
    S({
      color: "#ffd25a",
      emissive: "#ffc23a",
      emissiveIntensity: 2.6,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  ];
  // [x, z, radius, height, material]
  const flames = [
    [0, 0, 0.22, 0.6, 0],
    [0.12, 0.05, 0.14, 0.42, 1],
    [-0.1, -0.06, 0.15, 0.46, 0],
    [0.02, 0.1, 0.09, 0.32, 1],
    [-0.04, -0.02, 0.1, 0.36, 1],
  ].map(([x, z, r, h, m], k) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), flameMs[m]);
    f.position.set(x, 0.15 + h / 2, z);
    f.userData = { h, ph: k * 1.7 };
    firePit.add(f);
    return f;
  });
  const grillM = S({ color: "#2a2a2c", metalness: 0.7, roughness: 0.45 });
  fp(new THREE.TorusGeometry(0.42, 0.015, 6, 28), grillM, 0, 0.62, 0).rotation.x = Math.PI / 2;
  for (let k = -3; k <= 3; k++) {
    const len = 2 * Math.sqrt(0.42 ** 2 - (k * 0.11) ** 2);
    fp(new THREE.CylinderGeometry(0.008, 0.008, len, 4), grillM, k * 0.11, 0.62, 0).rotation.x = Math.PI / 2;
  }
  for (let k = 0; k < 3; k++) {
    const an = (k / 3) * Math.PI * 2;
    fp(
      new THREE.CylinderGeometry(0.012, 0.012, 0.66, 5),
      grillM,
      Math.cos(an) * 0.45,
      0.31,
      Math.sin(an) * 0.45,
    ).rotation.set(Math.sin(an) * 0.12, 0, -Math.cos(an) * 0.12);
  }
  const sausageM = S({ color: "#9a4a2c", roughness: 0.5 });
  [-0.15, 0, 0.15].forEach(
    (x) => (fp(new THREE.CapsuleGeometry(0.03, 0.22, 4, 8), sausageM, x, 0.66, 0.05).rotation.x = Math.PI / 2),
  );
  [-1, 1].forEach((s) =>
    fp(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 12), logM, s * 1.55, 0.2, 0).rotation.set(
      Math.PI / 2,
      s * 0.3,
      0,
      "YXZ",
    ),
  );
  // a little smoke
  const smoke = Array.from({ length: 6 }, (_, k) => {
    const sp = sprite(puffTex, { color: "#8f8c88" });
    sp.userData.life = k / 6;
    firePit.add(sp);
    return sp;
  });
  scene.add(firePit);
  // the glow lives in the scene, not in the pit: a hidden parent would drop the light and recompile every material
  const fireLight = new THREE.PointLight("#ff8a3a", 0, 10, 2);
  fireLight.position.copy(firePit.position).y += 0.9;
  scene.add(fireLight);

  wrackLine();

  onSeason((S) => {
    beachSet.visible = !S.wi;
    firePit.visible = S.season === "summer";
    if (!firePit.visible) fireLight.intensity = 0;
  });
  const windIn = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0);
  onFrame((dt, t) => {
    if (!firePit.visible) return;
    windIn.set(WIND.x, 0, WIND.z).applyAxisAngle(up, -firePit.rotation.y);
    const flick = reduce ? 1 : 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
    flames.forEach((f) => {
      const s = reduce ? 1 : 0.8 + 0.25 * Math.abs(Math.sin(t * 6 + f.userData.ph));
      f.scale.set(1, s, 1);
      f.position.y = 0.15 + (f.userData.h * s) / 2;
      f.rotation.y = t * 0.8 + f.userData.ph;
    });
    fireLight.intensity = (2 + state.weather.lights * 14) * flick;
    smoke.forEach((sp) => {
      if (!reduce) sp.userData.life = (sp.userData.life + dt * 0.18) % 1;
      const L = sp.userData.life;
      sp.position.set(Math.sin(L * 4 + t * 0.3) * 0.2 + windIn.x * L * 0.9, 0.8 + L * 3.5, windIn.z * L * 0.9);
      sp.scale.setScalar(0.4 + L * 1.6);
      sp.material.opacity = reduce ? 0 : Math.sin(L * Math.PI) * 0.25;
    });
  });
}

// the lounger on dry sand where the coast faces the opening view; the fire pit a little inland,
// in the open, well clear of trees, flowers, boulders and paths
function findSpots() {
  const waterR = (a) => {
    let r = coastAt(a) - 9;
    while (r < coastAt(a) + 6 && heightAt(Math.cos(a) * r, Math.sin(a) * r) > 0.05) r += 0.1;
    return r;
  };
  const P = (a, r) => new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  const flowerPts = instancePositions(flowers);
  const near = (pts, x, z) => pts.reduce((m, q) => Math.min(m, Math.hypot(q[0] - x, q[1] - z)), 1e9);
  const rockGap = (x, z) => rocks.reduce((m, rk) => Math.min(m, Math.hypot(rk.x - x, rk.z - z) - rk.s), 1e9);
  let best = null;
  for (let k = 0; k <= 24; k++) {
    const a = Math.PI * (0.12 + k * 0.014),
      lounge = P(a, waterR(a) - 3),
      lr = rockGap(lounge.x, lounge.z);
    if (best && lr < 1.2) continue;
    for (let da = -0.3; da <= 0.3; da += 0.05)
      for (let dr = 3.5; dr <= 7; dr += 0.5) {
        const fire = P(a + da, waterR(a + da) - dr),
          h = heightAt(fire.x, fire.z);
        if (lounge.distanceTo(fire) < 3.5 || h < 0.3 || h > 1.6 || pathDist(fire.x, fire.z) < 2) continue;
        const slope =
          Math.abs(heightAt(fire.x + 1, fire.z) - heightAt(fire.x - 1, fire.z)) +
          Math.abs(heightAt(fire.x, fire.z + 1) - heightAt(fire.x, fire.z - 1));
        const score =
          Math.min(
            near(treeSpots, fire.x, fire.z) - 3.5,
            near(flowerPts, fire.x, fire.z) - 2.2,
            rockGap(fire.x, fire.z) - 1.5,
            lr - 1.2,
            0.6 - slope,
          ) -
          lounge.distanceTo(fire) * 0.02;
        if (!best || score > best.score) best = { a, lounge, fire, score };
      }
  }
  // fallback, should every candidate be ruled out: lounger and pit side by side on the first stretch of beach
  if (!best) {
    const a = Math.PI * 0.3;
    best = { a, lounge: P(a, waterR(a) - 3), fire: P(a + 0.15, waterR(a + 0.15) - 5) };
  }
  return best;
}

/* ================= the high-tide line ================= */
// what the sea leaves where the high tide reaches: a ragged line of seaweed with shells and pebbles caught in it, and
// now and then a piece of silvered driftwood
function wrackLine() {
  const wr = makeRng(5309),
    line = [];
  // walk round the island, finding where the sand is just above the highest tide
  for (let k = 0; k < 360; k++) {
    const a = (k / 360) * Math.PI * 2;
    let r = coastAt(a) - 8;
    while (r < coastAt(a) + 8 && heightAt(Math.cos(a) * r, Math.sin(a) * r) > 0.24) r += 0.05;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    // patchy, and clear of the pier and the rocky ground by the lighthouse
    if (vnoise(a * 9 + 3, 1.7) < 0.42 || Math.hypot(x - pierBase[0], z - pierBase[1]) < 4 || r > coastAt(a) + 7.9)
      continue;
    line.push({ a, x, z });
  }
  const dummy = new THREE.Object3D(),
    col = new THREE.Color();
  const scatter = (mesh, n, spread, place) => {
    let i = 0;
    for (let k = 0; k < n && line.length; k++) {
      const p = line[Math.floor(wr() * line.length)],
        along = (wr() - 0.5) * 0.5,
        across = (wr() - 0.5) * spread;
      const x = p.x + Math.cos(p.a) * across - Math.sin(p.a) * along,
        z = p.z + Math.sin(p.a) * across + Math.cos(p.a) * along;
      dummy.position.set(x, heightAt(x, z), z);
      dummy.rotation.set(0, wr() * 6.28, 0);
      dummy.scale.setScalar(1);
      place(dummy, col, p);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i++, col);
    }
    mesh.count = i;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  // seaweed: flattened, bent strands, dark olive to brown
  const weedG = new THREE.CapsuleGeometry(0.035, 0.38, 2, 6).rotateZ(Math.PI / 2).scale(1, 0.3, 1);
  weedG.attributes.position.array.forEach((v, i, arr) => {
    if (i % 3 === 2) arr[i] += Math.pow(arr[i - 2] * 3, 2) * 0.04;
  });
  scatter(
    new THREE.InstancedMesh(weedG, new THREE.MeshStandardMaterial({ roughness: 0.6 }), 420),
    420,
    0.35,
    (d, c) => {
      d.position.y += 0.012;
      d.scale.set(0.7 + wr() * 0.8, 1, 0.8 + wr() * 0.6);
      c.setHSL(0.13 + wr() * 0.05, 0.35 + wr() * 0.2, 0.09 + wr() * 0.07);
    },
  );
  // shells: little half-domes, white, cream, pink and blue-black mussels
  const shellC = ["#f3ede2", "#efe2c6", "#e8b9b0", "#2d3240", "#d9cbb6"];
  scatter(
    new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.045, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1.3),
      new THREE.MeshStandardMaterial({ roughness: 0.45 }),
      160,
    ),
    160,
    0.9,
    (d, c) => {
      d.scale.setScalar(0.6 + wr() * 0.8);
      d.rotation.x = (wr() - 0.5) * 0.5;
      c.set(shellC[Math.floor(wr() * shellC.length)]);
    },
  );
  // pebbles: grey and sandy, in little clusters
  scatter(
    new THREE.InstancedMesh(blobGeo(0.07, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 220),
    220,
    0.7,
    (d, c) => {
      d.position.y -= 0.02;
      d.scale.set(0.6 + wr() * 0.9, 0.5 + wr() * 0.3, 0.6 + wr() * 0.9);
      c.setHSL(0.08 + wr() * 0.05, 0.08 + wr() * 0.1, 0.35 + wr() * 0.3);
    },
  );
  // driftwood: bleached logs with a stub of a branch, half sunk in the sand
  const woodM = new THREE.MeshStandardMaterial({ color: "#a8a196", roughness: 0.9 });
  for (let k = 0; k < 9 && line.length; k++) {
    const p = line[Math.floor(wr() * line.length)],
      len = 0.8 + wr() * 1.5,
      rad = 0.06 + wr() * 0.07;
    const log = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.75, rad, len, 8).rotateZ(Math.PI / 2), woodM);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.3, rad * 0.5, len * 0.3, 6), woodM);
    stub.position.set(len * (wr() - 0.5) * 0.6, rad * 0.8, 0);
    stub.rotation.set(0.5, 0, 0.6);
    log.add(trunk, stub);
    log.traverse((o) => {
      o.castShadow = o.receiveShadow = true;
    });
    log.position.set(p.x, heightAt(p.x, p.z) + rad * 0.4, p.z);
    log.rotation.y = p.a + Math.PI / 2 + (wr() - 0.5) * 1.2;
    scene.add(log);
  }
}
