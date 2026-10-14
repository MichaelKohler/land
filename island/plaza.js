// The plaza in the middle of the village: the fountain (frozen in winter), street lamps, benches
// and the big plush teddy bear leaning against the fountain on the side of the house with the family garden.
import * as THREE from "three";
import { makeRng, reduce, scene, onSeason, onTime, onFrame } from "./core.js";
import { plots, heightAt } from "./world.js";
import { S, shadow, makeBench, stoneTex, mStone, mDark, glowTex, sprite } from "./materials.js";

// where the teddy sits: an angle around the fountain (Sally naps beside it)
export let teddyA = 0;
// the street lamp heads, where the moths gather at night
export const lampSpots = [];

export function buildPlaza() {
  const rnd = makeRng(61);
  /* ---------- fountain ---------- */
  const fountain = new THREE.Group();
  const basin = shadow(
    new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.15, 0.6, 32, 1, true),
      S({ map: stoneTex, side: THREE.DoubleSide }),
    ),
  );
  basin.position.y = 0.3;
  const rim = shadow(new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.14, 8, 40), mStone));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.6;
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1.95, 32),
    new THREE.MeshPhysicalMaterial({ color: "#3d8fb0", roughness: 0.05, metalness: 0.1, envMapIntensity: 1.5 }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.48;
  const column = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.6, 12), mStone));
  column.position.y = 1.0;
  // a shallow upper bowl with water in it and a small spout in the middle
  const bowl = shadow(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      S({ map: stoneTex, side: THREE.DoubleSide }),
    ),
  );
  bowl.position.y = 2.0;
  bowl.scale.y = 0.42;
  const bowlRim = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 32), mStone));
  bowlRim.rotation.x = Math.PI / 2;
  bowlRim.position.y = 2.0;
  const bowlWater = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), pool.material);
  bowlWater.rotation.x = -Math.PI / 2;
  bowlWater.position.y = 1.95;
  const spout = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.35, 10), mStone));
  spout.position.y = 2.1;
  const finial = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), mStone));
  finial.position.y = 2.3;
  fountain.add(basin, rim, pool, column, bowl, bowlRim, bowlWater, spout, finial);
  fountain.position.y = heightAt(0, 0);
  scene.add(fountain);
  // water jets as particles
  const dropN = 260,
    dropGeo = new THREE.BufferGeometry(),
    dropPos = new Float32Array(dropN * 3),
    drops = [];
  for (let k = 0; k < dropN; k++) drops.push({ a: rnd() * 6.28, life: rnd() });
  dropGeo.setAttribute("position", new THREE.BufferAttribute(dropPos, 3));
  const spray = new THREE.Points(
    dropGeo,
    new THREE.PointsMaterial({ color: "#e6f6ff", size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  spray.position.y = fountain.position.y;
  scene.add(spray);
  // the fountain freezes over in winter
  onSeason((S) => {
    spray.visible = !S.wi;
    pool.material.color.set(S.wi ? "#d6e6ee" : "#3d8fb0");
    pool.material.roughness = S.wi ? 0.35 : 0.05;
  });
  // each drop arcs up from the spout and falls into the pool; held still when motion is reduced
  const placeDrops = (dt) => {
    drops.forEach((d, k) => {
      d.life = (d.life + dt * 0.9) % 1;
      const L = d.life,
        rr = L * 1.5;
      dropPos[k * 3] = Math.cos(d.a) * rr;
      dropPos[k * 3 + 1] = 2.2 + L * 2.4 - L * L * 3.6;
      dropPos[k * 3 + 2] = Math.sin(d.a) * rr;
    });
    dropGeo.attributes.position.needsUpdate = true;
  };
  placeDrops(0);
  onFrame((dt) => {
    if (!reduce && spray.visible) placeDrops(dt);
  });

  /* ---------- street lamps and benches, one of each per house ---------- */
  const lamps = [],
    glows = [],
    lights = [];
  plots.forEach((p) => {
    const a = p.a + 0.42,
      x = Math.cos(a) * 5.0,
      z = Math.sin(a) * 5.0,
      y = heightAt(x, z);
    const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.2, 8), mDark));
    post.position.set(x, y + 1.6, z);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 14, 10),
      S({ color: "#fff1c9", emissive: "#ffc46b", emissiveIntensity: 0 }),
    );
    head.position.set(x, y + 3.3, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 10), mDark);
    cap.position.set(x, y + 3.5, z);
    const glow = sprite(glowTex, { blending: THREE.AdditiveBlending });
    glow.position.copy(head.position);
    glow.scale.setScalar(2.4);
    const light = new THREE.PointLight("#ffbf6b", 0, 9, 2);
    light.position.copy(head.position);
    scene.add(post, head, cap, glow, light);
    lamps.push(head);
    glows.push(glow);
    lights.push(light);
    lampSpots.push(head.position.clone());
    const ba = p.a - 0.45,
      bench = makeBench();
    bench.position.set(Math.cos(ba) * 3.6, heightAt(Math.cos(ba) * 3.6, Math.sin(ba) * 3.6), Math.sin(ba) * 3.6);
    bench.lookAt(0, bench.position.y, 0);
    scene.add(bench);
  });
  onTime((L) => {
    lamps.forEach((l) => (l.material.emissiveIntensity = L.lightsOn * 3));
    glows.forEach((g) => (g.material.opacity = L.lightsOn * L.lightsOn * 0.45)); // growing as it gets properly dark
    lights.forEach((l) => (l.intensity = L.lightsOn * 6));
  });

  /* ---------- the big teddy bear ---------- */
  const family = plots.find((p) => p.r.garden === "family") || plots[0];
  teddyA = family.a + 0.25;
  const bx = Math.cos(teddyA) * 2.6,
    bz = Math.sin(teddyA) * 2.6;
  const bear = new THREE.Group();
  bear.position.set(bx, heightAt(bx, bz), bz);
  bear.scale.setScalar(2.2);
  scene.add(bear);
  // facing out across the plaza, leaning back against the basin
  bear.lookAt(bx * 4, bear.position.y, bz * 4);
  bear.rotateX(-0.14);
  const plush = S({ color: "#b7834f", roughness: 1 }),
    pad = S({ color: "#ead1a8", roughness: 1 }),
    dark = S({ color: "#24160e", roughness: 0.3 }),
    ribbon = S({ color: "#c8304a", roughness: 0.45 });
  const bp = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const o = shadow(new THREE.Mesh(geo, m));
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    bear.add(o);
    return o;
  };
  const ball = (r) => new THREE.SphereGeometry(r, 20, 14);
  bp(ball(0.2), plush, 0, 0.22, 0, 1, 1.15, 0.88); // body
  bp(ball(0.13), pad, 0, 0.2, 0.1, 1, 1.2, 0.5); // belly
  bp(ball(0.155), plush, 0, 0.53, 0.02); // head
  bp(ball(0.07), pad, 0, 0.5, 0.15, 1, 0.8, 0.9); // muzzle
  bp(ball(0.025), dark, 0, 0.52, 0.21); // nose
  [-1, 1].forEach((s) => {
    bp(ball(0.02), dark, s * 0.055, 0.575, 0.14); // eye
    bp(ball(0.06), plush, s * 0.12, 0.66, 0, 1, 1, 0.55); // ear
    bp(ball(0.035), pad, s * 0.12, 0.66, 0.026, 1, 1, 0.4);
    bp(ball(0.07), plush, s * 0.2, 0.25, 0.06, 1, 1.9, 1).rotation.z = s * 0.5; // arm
    bp(ball(0.085), plush, s * 0.11, 0.07, 0.17, 1, 1, 1.9); // leg
    bp(ball(0.06), pad, s * 0.11, 0.08, 0.33, 1, 1, 0.3); // foot pad
    bp(new THREE.ConeGeometry(0.045, 0.1, 10), ribbon, s * 0.06, 0.4, 0.14).rotation.z = (s * Math.PI) / 2; // bow
  });
  bp(ball(0.03), ribbon, 0, 0.4, 0.15);
}
