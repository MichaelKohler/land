// Sally, a European shorthair in smoky charcoal grey with white paws and white back legs. She belongs to every
// house: strolls the village paths, naps curled up against the big teddy by the fountain in the afternoon,
// waits at one of the doors at night and shelters on a porch when it rains (or snows). On fine spring and summer days
// some of her strolls turn into chasing a butterfly.
import * as THREE from "three";
import { makeRng, mix, reduce, scene, state, pickables, onTime, onFrame } from "./core.js";
import { plots, paths, heightAt } from "./world.js";
import { S, shadow, canvasTex } from "./materials.js";
import { teddyA } from "./plaza.js";
import { STEPS } from "./building.js";

// her size, and where her hips are on her body (tracks.js puts her paw prints under the front ones)
const SCALE = 1.4,
  HIP = { side: 0.058, front: 0.14, back: -0.15 };
export const frontPaws = { ahead: HIP.front * SCALE, side: HIP.side * SCALE };

export let cat = null;
// what she is up to right now, for her card
export let catStatus = () => "";
// where her head is while she chases a butterfly (insects.js sends one fluttering just ahead of her), otherwise null
export let catChase = () => null;

export function buildCat() {
  // her own random numbers for the coat
  const fr = makeRng(4242);
  const furTex = canvasTex(
    256,
    256,
    (x, w, h) => {
      x.fillStyle = "#4a4847";
      x.fillRect(0, 0, w, h);
      // soft, uneven undercoat so the grey is not flat (no tabby rings)
      x.filter = "blur(10px)";
      for (let k = 0; k < 40; k++) {
        x.fillStyle = `rgba(${fr() < 0.5 ? "118,116,114" : "28,27,27"},${0.15 + fr() * 0.2})`;
        x.beginPath();
        x.arc(fr() * w, fr() * h, 10 + fr() * 25, 0, 6.29);
        x.fill();
      }
      x.filter = "none";
      // short guard hairs, some with silver tips
      for (let k = 0; k < 6000; k++) {
        const l = fr();
        x.fillStyle = `rgba(${l < 0.45 ? "160,158,156" : l < 0.75 ? "30,29,29" : "100,98,96"},${0.05 + fr() * 0.17})`;
        x.fillRect(fr() * w, fr() * h, 1, 1 + fr() * 2.5);
      }
    },
    [2, 2],
  );
  const furOpts = {
    map: furTex,
    roughness: 0.92,
    sheen: 0.6,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#a7a5a2"),
    envMapIntensity: 0.3,
  };
  // legs and tail are thin cylinders that would squash the coat texture into rings, so they get plain smoky fur
  const legFurM = new THREE.MeshPhysicalMaterial({ ...furOpts, map: null, color: "#454342" });
  const furM = new THREE.MeshPhysicalMaterial(furOpts),
    furBodyM = new THREE.MeshPhysicalMaterial({ ...furOpts, vertexColors: true });
  const whiteM = new THREE.MeshPhysicalMaterial({
    color: "#f2efea",
    roughness: 0.95,
    sheen: 0.5,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#ffffff"),
    envMapIntensity: 0.3,
  });
  const catDark = S({ color: "#1f1e1e", roughness: 0.85 }),
    pinkM = S({ color: "#c98a8a", roughness: 0.6 });
  const irisM = S({ color: "#c9c23a", emissive: "#8f8a1e", emissiveIntensity: 0.35, roughness: 0.15 }),
    pupilM = S({ color: "#0a0a0a", roughness: 0.1 });
  cat = new THREE.Group();
  const catBody = new THREE.Group();
  cat.add(catBody);
  const cm = (geo, mat, x, y, z) => {
    const m = shadow(new THREE.Mesh(geo, mat));
    m.position.set(x, y, z);
    return m;
  };
  // body: a capsule shaped into haunches, waist and chest, darker along the back and paler underneath
  const torsoG = new THREE.CapsuleGeometry(0.105, 0.32, 10, 24);
  {
    const p = torsoG.attributes.position,
      n = torsoG.attributes.normal,
      col = [],
      g = (y, c, s) => Math.exp(-(((y - c) / s) ** 2));
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i),
        k = 1 + 0.12 * g(y, -0.13, 0.09) - 0.08 * g(y, 0.01, 0.08) + 0.06 * g(y, 0.14, 0.07);
      p.setX(i, p.getX(i) * k * 0.94);
      p.setZ(i, p.getZ(i) * k * (p.getZ(i) > 0 ? 1 + 0.1 * g(y, -0.02, 0.12) : 1));
      const sh = 0.78 + 0.4 * ((n.getZ(i) + 1) / 2);
      col.push(sh, sh, sh);
    }
    torsoG.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    torsoG.computeVertexNormals();
  }
  const torso = cm(torsoG, furBodyM, 0, 0.33, 0);
  torso.rotation.x = Math.PI / 2;
  const neck = cm(new THREE.SphereGeometry(0.08, 18, 14), furM, 0, 0.39, 0.2);
  const catHead = new THREE.Group();
  catHead.position.set(0, 0.45, 0.27);
  const skull = cm(new THREE.SphereGeometry(0.095, 28, 20), furM, 0, 0, 0);
  skull.scale.set(1.1, 0.92, 1);
  const bridge = cm(new THREE.SphereGeometry(0.04, 16, 12), furM, 0, -0.008, 0.066);
  bridge.scale.set(0.9, 0.85, 1.1);
  const chin = cm(new THREE.SphereGeometry(0.022, 12, 10), whiteM, 0, -0.064, 0.068);
  const nose = cm(new THREE.SphereGeometry(0.012, 10, 8), pinkM, 0, -0.022, 0.106);
  nose.scale.set(1.3, 0.75, 0.8);
  catHead.add(skull, bridge, chin, nose);
  const catEyes = [],
    whiskers = [],
    whiskerM = new THREE.LineBasicMaterial({ color: "#ecebe6", transparent: true, opacity: 0.75 });
  [-1, 1].forEach((s) => {
    const cheek = cm(new THREE.SphereGeometry(0.05, 16, 12), furM, s * 0.056, -0.03, 0.032);
    cheek.scale.set(1, 0.85, 1);
    const pad = cm(new THREE.SphereGeometry(0.028, 14, 10), whiteM, s * 0.021, -0.04, 0.083);
    pad.scale.set(1, 0.85, 0.9);
    const ear = cm(new THREE.ConeGeometry(0.04, 0.085, 16), furM, s * 0.058, 0.08, -0.012);
    ear.scale.z = 0.5;
    ear.rotation.set(-0.15, 0, s * -0.32);
    const inner = cm(new THREE.ConeGeometry(0.03, 0.065, 14), pinkM, 0, -0.008, 0.034);
    inner.scale.set(0.9, 0.9, 0.55);
    ear.add(inner);
    // eyes: yellow-green with a slit pupil; the group squashes shut when she sleeps
    const eye = new THREE.Group();
    eye.position.set(s * 0.04, 0.014, 0.08);
    eye.rotation.y = s * 0.35;
    const ball = cm(new THREE.SphereGeometry(0.018, 16, 12), irisM, 0, 0, 0);
    ball.scale.z = 0.7;
    const slit = cm(new THREE.SphereGeometry(0.018, 12, 10), pupilM, 0, 0, 0.004);
    slit.scale.set(0.22, 0.85, 0.7);
    eye.add(ball, slit);
    catEyes.push(eye);
    catHead.add(cheek, pad, ear, eye);
    for (let k = 0; k < 3; k++)
      whiskers.push(s * 0.035, -0.04 - k * 0.006, 0.092, s * 0.08675, -0.031 - k * 0.0132, 0.0845 - k * 0.0054);
  });
  catHead.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(whiskers, 3)),
      whiskerM,
    ),
  );
  // the lines are unlit, so they dim with the daylight rather than shining white in the dark
  const whiskerDay = new THREE.Color("#ecebe6");
  onTime(({ dl, rain }) => whiskerM.color.copy(whiskerDay).multiplyScalar((0.18 + 0.82 * dl) * (1 - rain * 0.3)));
  catBody.add(torso, neck, catHead);
  // legs pivot at the hip: front legs grey with white paws, back legs white below the haunch
  const toeG = new THREE.SphereGeometry(0.013, 8, 6);
  const catLegs = [
    [-1, 1, 0],
    [1, 1, Math.PI],
    [-1, -1, Math.PI],
    [1, -1, 0],
  ].map(([s, f, ph]) => {
    const front = f > 0,
      hip = new THREE.Group();
    hip.position.set(s * HIP.side, 0.29, front ? HIP.front : HIP.back);
    const part = (geo, mat, y, z = 0) => {
      const m = cm(geo, mat, 0, y, z);
      hip.add(m);
      return m;
    };
    if (front) {
      part(new THREE.SphereGeometry(0.046, 16, 12), furM, -0.01).scale.set(0.85, 1.25, 1.05);
      part(new THREE.CylinderGeometry(0.036, 0.03, 0.15, 14), legFurM, -0.08);
      part(new THREE.CylinderGeometry(0.03, 0.027, 0.13, 14), legFurM, -0.185);
      part(new THREE.CylinderGeometry(0.028, 0.03, 0.035, 14), whiteM, -0.248);
    } else {
      part(new THREE.SphereGeometry(0.062, 16, 12), furM, -0.03, 0.005).scale.set(0.78, 1.35, 1.15);
      part(new THREE.CylinderGeometry(0.034, 0.03, 0.08, 14), whiteM, -0.1);
      part(new THREE.CylinderGeometry(0.031, 0.026, 0.17, 14), whiteM, -0.18);
    }
    part(new THREE.SphereGeometry(0.033, 14, 10), whiteM, -0.268, 0.012).scale.set(1, 0.6, 1.3);
    [-1, 0, 1].forEach((t) => (part(toeG, whiteM, -0.272, 0.044).position.x = t * 0.016));
    catBody.add(hip);
    return { hip, ph, front };
  });
  // tail: a chain of rounded segments that curls and sways, with a darker tip
  const tailSegs = [];
  let tailParent = catBody;
  for (let k = 0; k < 7; k++) {
    const seg = new THREE.Group();
    if (k === 0) seg.position.set(0, 0.36, -0.25);
    else seg.position.y = 0.06;
    const r0 = 0.024 - k * 0.0015,
      m = k === 6 ? catDark : legFurM;
    seg.add(
      cm(new THREE.CylinderGeometry(r0 - 0.0015, r0, 0.066, 12), m, 0, 0.03, 0),
      cm(new THREE.SphereGeometry(r0, 12, 8), m, 0, 0, 0),
    );
    if (k === 6) seg.add(cm(new THREE.SphereGeometry(r0 - 0.0015, 12, 8), m, 0, 0.066, 0));
    tailParent.add(seg);
    tailParent = seg;
    tailSegs.push(seg);
  }
  cat.scale.setScalar(SCALE);
  scene.add(cat);

  // an invisible, larger sphere so she is easy to click
  const catHit = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  catHit.position.y = 0.3;
  catHit.userData = { kind: "cat" };
  cat.add(catHit);
  pickables.push(catHit);

  // at each house: the porch step she sits on, the lower step and the spot in front she jumps up from
  const homeSpots = plots.map((p) => {
    p.group.updateMatrixWorld();
    const L = (x, y, z) => p.group.localToWorld(new THREE.Vector3(x, y, z));
    const step = L(0, STEPS[0].top, STEPS[0].z),
      lower = L(0, STEPS[1].top, STEPS[1].z),
      front = L(0, 0, STEPS[1].z + 0.7);
    return { p, step, lower, front, doorYaw: Math.atan2(front.x - step.x, front.z - step.z) };
  });
  // her nap spot: beside the teddy, with the teddy on the side she turns her head to
  const napSpot = (() => {
    const ta = teddyA,
      ox = Math.cos(ta),
      oz = Math.sin(ta);
    const x = ox * 2.75 - oz * 0.76,
      z = oz * 2.75 + ox * 0.76;
    return { x, z, y: heightAt(x, z), yaw: Math.atan2(ox, oz), a: Math.atan2(z, x) };
  })();
  // she belongs to every house: each nap and each night she picks another house
  let catSpots = homeSpots[Math.floor(Math.random() * homeSpots.length)],
    catHome = catSpots.p;
  function chooseHome() {
    const opts = homeSpots.filter((h) => h !== catSpots);
    if (opts.length) catSpots = opts[Math.floor(Math.random() * opts.length)];
    catHome = catSpots.p;
  }
  const st = {
    x: paths[0][0][0],
    z: paths[0][0][1],
    y: 0,
    yaw: 0,
    queue: [],
    at: "ring",
    goal: "wander",
    seg: null,
    pauseT: 0,
    walk: 0,
    sit: 0,
    sleep: 0,
    gait: 0,
    last: 0,
    init: false,
    chase: false,
    chaseK: 0,
  };
  const pt = (x, z, y = null, jump = false) => ({ x, z, y, jump });
  function catMode() {
    if (state.weather.rain > 0.3) return "shelter";
    const hour = state.hour;
    if (hour >= 13 && hour < 16.5) return "nap";
    // home for the night half an hour after sunset, out again half an hour after sunrise
    if (hour >= state.sun.set + 0.5 || hour < state.sun.rise + 0.5) return "door";
    return "wander";
  }
  // butterflies are out on fine spring and summer days
  const butterflyWeather = () =>
    (state.season === "spring" || state.season === "summer") &&
    state.hour > state.sun.rise + 1.5 &&
    state.hour < state.sun.set - 1 &&
    state.weather.rain < 0.1;
  const chasing = () => st.chase && st.goal === "wander" && st.at === "ring" && butterflyWeather();
  function lastXZ() {
    for (let i = st.queue.length - 1; i >= 0; i--) if ("x" in st.queue[i]) return st.queue[i];
    return st;
  }
  function ringTo(a1) {
    const p = lastXZ(),
      a0 = Math.atan2(p.z, p.x);
    let da = a1 - a0;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const n = Math.max(1, Math.ceil(Math.abs(da) / 0.12));
    for (let k = 1; k <= n; k++) {
      const a = a0 + (da * k) / n;
      st.queue.push(pt(Math.cos(a) * 4.2, Math.sin(a) * 4.2));
    }
  }
  const along = (pts) => pts.map(([x, z]) => pt(x, z));
  function placeCat(at) {
    st.queue.length = 0;
    st.seg = null;
    st.at = at;
    st.chase = false;
    if (at !== "ring" && st.init) chooseHome();
    const s =
      at === "teddy"
        ? napSpot
        : at === "door"
          ? { x: catSpots.step.x, z: catSpots.step.z, y: catSpots.step.y, yaw: catSpots.doorYaw }
          : { x: paths[0][0][0], z: paths[0][0][1], y: null, yaw: 0 };
    st.x = s.x;
    st.z = s.z;
    st.y = s.y ?? heightAt(s.x, s.z);
    st.yaw = s.yaw;
    st.sleep = at === "teddy" ? 1 : 0;
    st.sit = at === "teddy" ? 0 : 1;
    st.walk = 0;
  }
  function planCat() {
    const mode = catMode(),
      toDoor = mode === "door" || mode === "shelter",
      na = napSpot.a;
    st.chase = false;
    if (st.at === "teddy") {
      if (mode === "nap") return;
      st.goal = toDoor ? "door" : "wander";
      st.queue.push(pt(Math.cos(na) * 3.5, Math.sin(na) * 3.5), pt(Math.cos(na) * 4.2, Math.sin(na) * 4.2), {
        fn: () => (st.at = "ring"),
      });
      return;
    }
    if (st.at === "door") {
      if (toDoor) return;
      const pts = catHome.path;
      st.goal = mode === "nap" ? "teddy" : "wander";
      st.queue.push(
        pt(catSpots.lower.x, catSpots.lower.z, catSpots.lower.y, true),
        pt(catSpots.front.x, catSpots.front.z, null, true),
        ...along(pts.slice(0, pts.length - 2)).reverse(),
        { fn: () => (st.at = "ring") },
      );
      return;
    }
    if (mode === "nap") {
      chooseHome();
      st.goal = "teddy";
      ringTo(na);
      st.queue.push(pt(Math.cos(na) * 3.5, Math.sin(na) * 3.5), pt(napSpot.x, napSpot.z), {
        fn: () => (st.at = "teddy"),
      });
      return;
    }
    if (toDoor) {
      chooseHome();
      const pts = catHome.path;
      st.goal = "door";
      ringTo(Math.atan2(pts[0][1], pts[0][0]));
      st.queue.push(
        ...along(pts.slice(1, pts.length - 2)),
        pt(catSpots.front.x, catSpots.front.z),
        pt(catSpots.lower.x, catSpots.lower.z, catSpots.lower.y, true),
        pt(catSpots.step.x, catSpots.step.z, catSpots.step.y, true),
        { fn: () => (st.at = "door") },
      );
      return;
    }
    st.goal = "wander";
    st.chase = butterflyWeather() && Math.random() < 0.4;
    let i;
    do {
      i = Math.random() < 0.7 ? Math.floor(Math.random() * plots.length) : Math.floor(Math.random() * paths.length);
    } while (i === st.last && paths.length > 1);
    st.last = i;
    const pts = paths[i];
    ringTo(Math.atan2(pts[0][1], pts[0][0]));
    const out = along(pts.slice(1, pts.length - 2));
    st.queue.push(
      ...out,
      { pause: 3 + Math.random() * 5, pose: Math.random() < 0.5 ? "sit" : "stand" },
      ...out.slice().reverse(),
      { pause: 1 + Math.random() * 2, pose: "stand" },
    );
  }
  // follows the queue; returns true while walking or jumping
  function stepCat(dt) {
    const head = st.queue[0];
    if (!head) return false;
    if (head.fn) {
      head.fn();
      st.queue.shift();
      return false;
    }
    if ("pause" in head) {
      st.pauseT += dt;
      if (st.pauseT > head.pause) {
        st.pauseT = 0;
        st.queue.shift();
      }
      return false;
    }
    if (!st.seg)
      st.seg = { x0: st.x, z0: st.z, y0: st.y, len: Math.hypot(head.x - st.x, head.z - st.z) || 0.001, s: 0 };
    const sg = st.seg;
    sg.s += dt * (head.jump ? 1.8 : 0.75 * (chasing() ? 1.5 : 1) * Math.max(0.2, st.walk));
    const f = Math.min(1, sg.s / sg.len);
    st.x = sg.x0 + (head.x - sg.x0) * f;
    st.z = sg.z0 + (head.z - sg.z0) * f;
    st.y = head.jump
      ? sg.y0 + ((head.y ?? heightAt(head.x, head.z)) - sg.y0) * f + Math.sin(f * Math.PI) * 0.3
      : heightAt(st.x, st.z);
    if (sg.len > 0.05) {
      let dy = Math.atan2(head.x - sg.x0, head.z - sg.z0) - st.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.yaw += dy * Math.min(1, dt * (head.jump ? 12 : 6));
    }
    if (f >= 1) {
      st.queue.shift();
      st.seg = null;
    }
    return true;
  }
  function status() {
    const head = st.queue[0],
      who = catHome.r.short;
    if (st.at === "teddy" && !head) return "Curled up asleep against the big teddy by the fountain";
    if (st.at === "door" && !head)
      return catMode() === "shelter"
        ? `Sheltering from the rain on ${who}'s porch`
        : `Waiting by ${who}'s door for the night`;
    if (head && "pause" in head && chasing()) return "Watching a butterfly flutter just out of reach";
    if (head && "pause" in head)
      return head.pose === "sit" ? "Sitting down for a little look around" : "Sniffing something interesting";
    if (chasing()) return "Chasing a butterfly through the village";
    if (st.goal === "teddy") return "On her way to nap with the big teddy";
    if (st.goal === "door")
      return catMode() === "shelter" ? `Hurrying to ${who}'s porch, out of the rain` : `Heading home to ${who}'s door`;
    return "Out for a stroll around the village";
  }
  function updateCat(dt, t) {
    const mode = catMode();
    const want = mode === "nap" ? "teddy" : mode === "door" || mode === "shelter" ? "door" : "ring";
    if (!st.init || reduce) {
      if (!st.init || st.at !== want) placeCat(want);
      st.init = true;
    }
    let moving = false;
    if (!reduce) {
      if (!st.queue.length) planCat();
      moving = stepCat(dt);
    }
    const head = st.queue[0],
      idle = !head;
    const sitT = (idle && st.at === "door") || (head && head.pose === "sit") || (reduce && st.at === "ring") ? 1 : 0;
    const sleepT = idle && st.at === "teddy" ? 1 : 0;
    const k = Math.min(1, dt * 3);
    st.walk += ((moving ? 1 : 0) - st.walk) * Math.min(1, dt * 4);
    st.sit += (sitT - st.sit) * k;
    st.sleep += (sleepT - st.sleep) * Math.min(1, dt * 2);
    if (idle && st.at !== "ring") {
      const fy = st.at === "teddy" ? napSpot.yaw : catSpots.doorYaw;
      let dy = fy - st.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      st.yaw += dy * Math.min(1, dt * 4);
    }
    st.gait += dt * st.walk * 11 * (chasing() ? 1.4 : 1);
    st.chaseK += ((chasing() ? 1 : 0) - st.chaseK) * Math.min(1, dt * 2);
    const w = st.walk,
      s = st.sit,
      z = st.sleep;
    cat.position.set(st.x, st.y + 0.02, st.z);
    cat.rotation.y = st.yaw;
    catLegs.forEach(({ hip, ph, front }) => {
      hip.rotation.x = Math.sin(st.gait + ph) * 0.5 * w + (front ? 0.5 : -1.15) * s + (front ? -1.3 : 1.45) * z;
      hip.scale.y = 1 - (front ? 0.45 : 0.7) * z - (front ? 0 : 0.4) * s * (1 - z);
      hip.position.y = 0.29 + Math.max(0, Math.cos(st.gait + ph)) * 0.025 * w - (front ? 0 : 0.06 * s);
    });
    catBody.position.set(0, Math.abs(Math.sin(st.gait)) * 0.012 * w - 0.04 * s - 0.2 * z, -0.03 * s);
    catBody.rotation.set(-0.5 * s * (1 - z), 0, Math.sin(st.gait) * 0.03 * w + 0.12 * z);
    const breathe = reduce ? 0 : Math.sin(t * 1.6) * 0.03 * z;
    torso.scale.set(1 + breathe, 1, 1 + breathe);
    const look = reduce ? 0 : (1 - w) * (1 - z) * Math.sin(t * 0.7) * 0.7;
    // she looks up at the butterfly while she chases it
    catHead.rotation.set(
      Math.sin(st.gait * 2) * 0.04 * w + (1 - w) * 0.1 * (1 - z) + 0.4 * s * (1 - z) + 0.5 * z - 0.35 * st.chaseK,
      look * (1 - st.chaseK) + 0.7 * z,
      0,
    );
    catHead.position.set(0, 0.45 - 0.07 * z, 0.27 + 0.03 * z);
    catEyes.forEach((e) => (e.scale.y = 1 - 0.85 * z));
    tailSegs.forEach((sg, k) => {
      const sway = reduce ? 0 : Math.sin(t * (2 + (1 - w) * 2) - k * 0.6) * (0.08 + k * 0.03);
      if (k === 0) {
        sg.rotation.x = mix(mix(-1.15 + (1 - w) * 0.35, -1.75, s), -1.6, z);
        sg.rotation.z = sway * (1 - z);
      } else {
        sg.rotation.x = mix(mix(0.2 + (1 - w) * 0.06, -0.05, s), 0, z);
        sg.rotation.z = mix(mix(sway, 0.35 + sway * 0.3, s), 0.42, z);
      }
    });
  }
  catStatus = status;
  const headPos = new THREE.Vector3();
  catChase = () => (chasing() ? catHead.getWorldPosition(headPos) : null);
  onFrame(updateCat);
}
