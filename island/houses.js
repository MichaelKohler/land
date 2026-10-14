// The residents' houses: walls, tiled roof, porch, windows with shutters, flower boxes, the garden (gardens.js),
// lanterns for the resident's places on the web, chimney smoke and warm lights at night.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeRng, WIND, reduce, scene, pickables, onSeason, onTime, onFrame } from "./core.js";
import { plots, heightAt } from "./world.js";
import {
  S,
  shadow,
  tiles,
  mPlaster,
  mStone,
  mWood,
  mTrim,
  mDark,
  mGlass,
  mMetal,
  mSnow,
  puffTex,
  glowTex,
  sprite,
} from "./materials.js";
import { buildGarden } from "./gardens.js";
import {
  W,
  D,
  FLOOR,
  WH,
  RH,
  ROOF_LEN,
  EAVE_Y,
  EAVE_Z,
  CHIMNEY,
  DOOR,
  PORCH_POSTS,
  STEPS,
  gableRoof,
} from "./building.js";

export const houses = {};

function gableWall(w, h, wallH, d) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, wallH);
  s.lineTo(0, wallH + h);
  s.lineTo(-w / 2, wallH);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  const p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) / 3, p.getY(i) / 3);
  return g;
}
function windowAt(g, x, y, z, ry, shutterColor, w = 0.95, h = 1.15) {
  const win = new THREE.Group();
  const frame = shadow(new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.12), mTrim));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mGlass);
  glass.position.z = 0.04;
  const mullV = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.08), mTrim);
  mullV.position.z = 0.07;
  const mullH = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.08), mTrim);
  mullH.position.z = 0.07;
  const sill = shadow(new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.08, 0.28), mStone));
  sill.position.set(0, -h / 2 - 0.1, 0.1);
  win.add(frame, glass, mullV, mullH, sill);
  if (shutterColor) {
    const sm = S({ color: shutterColor, roughness: 0.6 });
    [-1, 1].forEach((sd) => {
      const sh = shadow(new THREE.Mesh(new THREE.BoxGeometry(w / 2 + 0.05, h + 0.1, 0.06), sm));
      sh.position.set(sd * (w / 2 + w / 4 + 0.14), 0, 0.02);
      for (let k = 0; k < 5; k++) {
        const sl = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.05, 0.03, 0.04), sm);
        sl.position.set(0, -h / 2 + 0.12 + k * (h / 5), 0.04);
        sh.add(sl);
      }
      win.add(sh);
    });
  }
  win.position.set(x, y, z);
  win.rotation.y = ry;
  g.add(win);
  return win;
}

export function buildHouses() {
  const mGutter = S({ color: "#7f858b", metalness: 0.55, roughness: 0.4 });
  const rnd = makeRng(51);
  const roofSnow = [],
    boxPlants = [];
  // window box planting: upright tufts of pointed leaves and five-petal blooms, all kept inside the box
  const leafG = new THREE.SphereGeometry(0.05, 8, 4).scale(0.42, 0.12, 1).translate(0, 0, 0.05);
  const tuftG = mergeGeometries(
    [...Array(7)].map((_, k) =>
      leafG
        .clone()
        .rotateX(-0.95 - (k % 2) * 0.3)
        .rotateY((k / 7) * Math.PI * 2 + k * 0.4),
    ),
  );
  const bloomG = mergeGeometries(
    [0, 1, 2, 3, 4].map((k) =>
      new THREE.SphereGeometry(0.022, 8, 4)
        .scale(1, 0.3, 0.62)
        .translate(0.024, 0, 0)
        .rotateZ(0.3)
        .rotateY((k / 5) * Math.PI * 2),
    ),
  );
  const eyeG = new THREE.SphereGeometry(0.011, 8, 6).scale(1, 0.7, 1).translate(0, 0.006, 0);
  const boxLeafM = [S({ color: "#3d7a2e", roughness: 0.8 }), S({ color: "#5a8f34", roughness: 0.8 })];
  const petalM = ["#e63950", "#ff8fab", "#ffd166", "#ffffff", "#b197fc"].map((c) => S({ color: c, roughness: 0.6 }));
  const eyeM = S({ color: "#d98c1a", roughness: 0.7 }),
    soilM = S({ color: "#4a3424", roughness: 1 });
  // the pieces of one box are merged into one mesh per material
  const o3 = new THREE.Object3D();
  const piece = (parts, m, geo, x, y, z, ry = 0, rx = 0, sx = 1, sy = 1, sz = 1) => {
    o3.position.set(x, y, z);
    o3.rotation.set(rx, ry, 0);
    o3.scale.set(sx, sy, sz);
    o3.updateMatrix();
    if (!parts.has(m)) parts.set(m, []);
    parts.get(m).push(geo.clone().applyMatrix4(o3.matrix));
  };
  plots.forEach((p, i) => {
    // each house sits on its plot facing the plaza (+z in its own coordinates)
    const g = new THREE.Group();
    g.position.set(p.x, heightAt(p.x, p.z) - 0.05, p.z);
    g.lookAt(0, g.position.y, 0);
    scene.add(g);
    p.group = g;
    const r = p.r;
    const base = shadow(new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.55, D + 0.3), mStone));
    base.position.y = 0.27;
    const walls = shadow(new THREE.Mesh(new THREE.BoxGeometry(W, WH, D), mPlaster));
    walls.position.y = FLOOR + WH / 2;
    const gables = shadow(new THREE.Mesh(gableWall(D, RH - 0.1, 0, W), mPlaster));
    gables.rotation.y = Math.PI / 2;
    gables.position.y = FLOOR + WH - 0.02;
    const roofTex = tiles(r.color);
    const roof = shadow(new THREE.Mesh(gableRoof(D, RH, ROOF_LEN, 0.55), S({ map: roofTex, roughness: 0.75 })));
    roof.rotation.y = Math.PI / 2;
    roof.position.y = FLOOR + WH;
    const snowRoof = new THREE.Mesh(roof.geometry, mSnow);
    snowRoof.rotation.y = Math.PI / 2;
    snowRoof.position.y = FLOOR + WH + 0.06;
    snowRoof.scale.setScalar(1.02);
    snowRoof.visible = false;
    roofSnow.push(snowRoof);
    const ridge = shadow(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, ROOF_LEN, 8),
        S({ color: new THREE.Color(r.color).multiplyScalar(0.6), roughness: 0.7 }),
      ),
    );
    ridge.rotation.z = Math.PI / 2;
    ridge.position.y = FLOOR + WH + RH + 0.1;
    const chimney = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.6, CHIMNEY.h, 0.6), mStone));
    chimney.position.set(CHIMNEY.x, CHIMNEY.y, CHIMNEY.z);
    const cap = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.1, 0.78), mDark));
    cap.position.set(CHIMNEY.x, CHIMNEY.y + CHIMNEY.h / 2 + 0.05, CHIMNEY.z);
    g.add(base, walls, gables, roof, snowRoof, ridge, chimney, cap);
    // gutters under both eaves, and a downpipe from each down a corner of the house (front right, back left)
    const gutterParts = [];
    [-1, 1].forEach((side) => {
      gutterParts.push(
        new THREE.CylinderGeometry(0.065, 0.065, ROOF_LEN, 10).rotateZ(Math.PI / 2).translate(0, EAVE_Y, side * EAVE_Z),
      );
      const px = side * (W / 2 + 0.07),
        pz = side * (D / 2 + 0.07);
      gutterParts.push(
        new THREE.CylinderGeometry(0.04, 0.04, EAVE_Y - 0.97, 8).translate(px, (0.62 + EAVE_Y - 0.35) / 2, pz),
      );
      // the swan neck from the gutter back to the wall, and the shoe at the bottom
      const neck = new THREE.Vector3(px, EAVE_Y, side * EAVE_Z),
        wall = new THREE.Vector3(px, EAVE_Y - 0.35, pz),
        len = neck.distanceTo(wall);
      gutterParts.push(
        new THREE.CylinderGeometry(0.04, 0.04, len, 8)
          .rotateX(-side * Math.atan2(EAVE_Z - Math.abs(pz), 0.35))
          .translate(px, (neck.y + wall.y) / 2, (neck.z + wall.z) / 2),
      );
      gutterParts.push(
        new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8).rotateX(side * 1.0).translate(px, 0.62, pz + side * 0.06),
      );
    });
    g.add(shadow(new THREE.Mesh(mergeGeometries(gutterParts), mGutter)));
    // front: door with porch roof, steps, lamp
    const door = shadow(
      new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 2.0, 0.1),
        S({ color: new THREE.Color(r.color).multiplyScalar(0.55), roughness: 0.5 }),
      ),
    );
    door.position.set(0, DOOR.y, DOOR.z);
    const doorFrame = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.2, 0.08), mTrim));
    doorFrame.position.set(0, DOOR.y + 0.08, DOOR.z - 0.02);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mMetal);
    knob.position.set(0.35, 1.55, D / 2 + 0.1);
    const porch = shadow(new THREE.Mesh(gableRoof(1.8, 0.55, 1.4, 0.1), S({ map: roofTex, roughness: 0.75 })));
    porch.position.set(0, FLOOR + 2.35, D / 2 + 0.6);
    [-1, 1].forEach((s) => {
      const post = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), mWood));
      post.position.set(s * PORCH_POSTS.x, FLOOR + 1.15, PORCH_POSTS.z);
      g.add(post);
    });
    STEPS.forEach((s) => {
      const st = shadow(new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.18, 0.5), mStone));
      st.position.set(0, s.top - 0.09, s.z);
      g.add(st);
    });
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 8),
      S({ color: "#fff1c9", emissive: "#ffc46b", emissiveIntensity: 0 }),
    );
    lamp.position.set(-0.85, 2.3, D / 2 + 0.12);
    g.add(door, doorFrame, knob, porch, lamp);
    // windows with shutters in the resident's colour (sized so the open shutters stay within the walls), and a small
    // one in the gable
    [-1.6, 1.6].forEach((x) => windowAt(g, x, FLOOR + 1.55, D / 2 + 0.04, 0, r.color, 0.8));
    [-1.1, 1.1].forEach((z) => {
      windowAt(g, W / 2 + 0.04, FLOOR + 1.55, z, Math.PI / 2, r.color, 0.8);
      windowAt(g, -W / 2 - 0.04, FLOOR + 1.55, z, -Math.PI / 2, r.color, 0.8);
    });
    windowAt(g, W / 2 + 0.03, FLOOR + WH + 0.75, 0, Math.PI / 2, null, 0.6, 0.6);
    // flower boxes: a planter with a rim and soil on two brackets, leafy tufts and blooms
    [-1.6, 1.6].forEach((x) => {
      const bz = D / 2 + 0.25;
      const bx = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.3), mWood));
      bx.position.set(x, FLOOR + 0.82, bz);
      g.add(bx);
      const rim = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.04, 0.36), mWood));
      rim.position.set(x, 1.47, bz);
      g.add(rim);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.02, 0.24), soilM);
      soil.position.set(x, 1.485, bz);
      g.add(soil);
      [-0.4, 0.4].forEach((dx) => {
        const br = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.22), mDark));
        br.position.set(x + dx, 1.2, bz - 0.04);
        g.add(br);
      });
      const plants = new THREE.Group();
      g.add(plants);
      boxPlants.push(plants);
      const parts = new Map();
      for (let k = 0; k < 8; k++) {
        const px = x - 0.36 + (k / 7) * 0.72 + (rnd() - 0.5) * 0.04,
          py = 1.47 + rnd() * 0.03,
          pz = bz + (rnd() - 0.5) * 0.03;
        const sx = 1 + rnd() * 0.3,
          sy = 0.85 + rnd() * 0.4;
        piece(parts, boxLeafM[k % 2], tuftG, px, py, pz, rnd() * 3, 0, sx, sy, sx);
      }
      const pm = petalM[Math.floor(rnd() * petalM.length)];
      for (let k = 0; k < 14; k++) {
        const m = rnd() < 0.75 ? pm : petalM[3],
          fx = x - 0.42 + rnd() * 0.84,
          fy = 1.58 + rnd() * 0.06,
          fz = bz - 0.07 + rnd() * 0.14,
          fs = 0.8 + rnd() * 0.5;
        // blooms face up and a little towards the street
        piece(parts, m, bloomG, fx, fy, fz, k * 1.3, 0.35, fs, fs, fs);
        piece(parts, eyeM, eyeG, fx, fy, fz, 0, 0.35, fs, fs, fs);
      }
      parts.forEach((geos, m) => plants.add(shadow(new THREE.Mesh(mergeGeometries(geos), m))));
    });
    buildGarden({ g, r, i });
    // the resident's places on the web: lanterns on posts along the garden path
    const lanterns = [];
    r.links.forEach((l, j) => {
      const side = j % 2 ? 1 : -1,
        row = Math.floor(j / 2);
      const x = side * 1.1,
        z = D / 2 + 1.9 + row * 1.25;
      const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 8), mDark));
      post.position.set(x, 0.75, z);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.04), mDark);
      arm.position.set(x + side * 0.15, 1.45, z);
      const glassM = new THREE.MeshStandardMaterial({
        color: l.locked ? "#f2b84b" : r.color,
        emissive: l.locked ? "#f2b84b" : r.color,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        transparent: true,
        opacity: 0.92,
      });
      const lan = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.32, 6), glassM));
      lan.position.set(x + side * 0.3, 1.22, z);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.15, 6), mDark);
      top.position.set(x + side * 0.3, 1.45, z);
      lan.userData = { kind: "link", r, l };
      g.add(post, arm, lan, top);
      lanterns.push(lan);
      pickables.push(lan);
    });
    [base, walls, gables, roof, chimney, door, porch].forEach((m) => {
      m.userData = { kind: "house", r };
      pickables.push(m);
    });
    houses[r.id] = { group: g, plot: p, lanterns, roof, lamp };
  });

  // chimney smoke, only in the colder half of the year
  const puffs = [];
  Object.values(houses).forEach((h, i) => {
    for (let k = 0; k < 14; k++) {
      const sp = sprite(puffTex, { color: "#e9e6e1" });
      scene.add(sp);
      puffs.push({ sp, h, life: k / 14 + i * 0.21 });
    }
  });
  const chimneyTop = new THREE.Vector3();
  let smoky = false;
  onSeason(({ au, wi }) => (smoky = !reduce && (au || wi)));
  onFrame((dt, t) => {
    puffs.forEach((pf) => {
      pf.life += dt * 0.12;
      if (pf.life > 1) pf.life -= 1;
      const L = pf.life,
        c = pf.h.group.localToWorld(chimneyTop.set(CHIMNEY.x, CHIMNEY.y + CHIMNEY.h / 2 + 0.1, CHIMNEY.z));
      const wob = Math.sin(L * 5 + t) * 0.5;
      pf.sp.position.set(c.x + WIND.x * L * 3.5 - WIND.z * wob, c.y + L * 6, c.z + WIND.z * L * 3.5 + WIND.x * wob);
      pf.sp.scale.setScalar(0.6 + L * 3.2);
      pf.sp.material.opacity = smoky ? Math.sin(L * Math.PI) * 0.35 : 0;
    });
  });
  // warm glows around the porch lamps and lanterns at night
  const glows = [];
  const addGlow = (parent, pos, s) => {
    const sp = sprite(glowTex, { blending: THREE.AdditiveBlending });
    sp.position.copy(pos);
    sp.scale.setScalar(s);
    parent.add(sp);
    glows.push(sp);
  };
  Object.values(houses).forEach((h) => {
    addGlow(h.group, h.lamp.position, 1.6);
    h.lanterns.forEach((l) => addGlow(h.group, l.position, 1.3));
  });

  onSeason((S) => {
    roofSnow.forEach((r) => (r.visible = S.wi));
    boxPlants.forEach((p) => (p.visible = !S.wi));
  });
  const smokeDay = new THREE.Color("#e9e6e1"),
    smokeNight = new THREE.Color("#2a3040"),
    smokeC = new THREE.Color();
  onTime((L) => {
    // windows light up at dusk, and earlier when the rain makes it dark
    mGlass.emissiveIntensity = L.lightsOn * 1.6;
    glows.forEach((g) => (g.material.opacity = L.lightsOn * L.lightsOn * 0.45)); // growing as it gets properly dark
    Object.values(houses).forEach((h) => (h.lamp.material.emissiveIntensity = L.lightsOn * 3));
    smokeC.copy(smokeDay).lerp(smokeNight, L.night);
    puffs.forEach((pf) => pf.sp.material.color.copy(smokeC));
  });
}
