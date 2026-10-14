// Plants and stones: deciduous trees and pines swaying in the wind, grass blades over the meadow, wildflowers,
// boulders on the coast and the mountain, and bare branches for winter. All recoloured by the season.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { narrow, reduce, makeRng, hash01, smooth, WIND, scene, state, onSeason, onFrame } from "./core.js";
import { plots, lightPos, pathDist, heightAt, fbm, vnoise, coastAt, PEAK, pierBase, blobGeo } from "./world.js";
import { S, shadow } from "./materials.js";
import { grassClear } from "./gardens.js";

// tree positions [x, z], also used to keep the christmas tree and the fire pit in the open
export const treeSpots = [];
// boulders { x, z, s: rough radius }
export const rocks = [];
export let decid, pines, branches, grass, flowers, barkM, rockM;

// a free spot for a tree: on land, outside the plaza, plots, lighthouse grounds and paths, not too close to another tree
function free(x, z, minH, gap) {
  const h = heightAt(x, z);
  if (h < minH) return null;
  if (Math.hypot(x, z) < 6.5) return null;
  if (plots.some((p) => Math.hypot(x - p.x, z - p.z) < 6.2)) return null;
  if (Math.hypot(x - lightPos[0], z - lightPos[1]) < 5) return null;
  if (pathDist(x, z) < 1.8) return null;
  if (treeSpots.some((t) => Math.hypot(t[0] - x, t[1] - z) < gap)) return null;
  return h;
}

// sways the top of a (possibly instanced) mesh in the wind; gusts make it sway harder and lean over. The wind comes
// in world space (core.js WIND) and is turned into each instance's own frame, so every tree leans the same way
const windU = { uTime: { value: 0 }, uGust: { value: 0 }, uWind: { value: new THREE.Vector2(WIND.x, WIND.z) } };
const WIND_GLSL = `
  #ifdef USE_INSTANCING
    mat3 toWorld = mat3(modelMatrix) * mat3(instanceMatrix);
  #else
    mat3 toWorld = mat3(modelMatrix);
  #endif
  vec2 lw = normalize(transpose(toWorld) * vec3(uWind.x, 0.0, uWind.y)).xz;`;
function windy(m, amount) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windU);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime, uGust; uniform vec2 uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      ${WIND_GLSL}
      #ifdef USE_INSTANCING
        vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
      #else
        vec2 ip = vec2(0.0);
      #endif
      float sway = (sin(uTime*1.4 + ip.x*0.35 + ip.y*0.21) + 0.4*sin(uTime*2.9 + ip.x*0.8)) * (1.0 + uGust*1.5) + uGust*1.2;
      float bend = sway * ${amount.toFixed(3)} * max(0.0, position.y - 1.5) * max(0.0, position.y - 1.5);
      transformed.xz += bend * lw;`,
      );
  };
  return m;
}

// bakes light and shade into foliage as vertex colours (the instance colour tints on top): darker underneath and deep
// inside the crown, lighter on the outer top, broken into clumps of leaves. Noise rather than the random numbers, so
// the layout stays the same
function shadeFoliage(g, cx, cz, y0, y1, rOut, tier) {
  const p = g.attributes.position,
    nrm = g.attributes.normal,
    c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const up = Math.min(1, Math.max(0, (y - y0) / (y1 - y0))),
      out = Math.min(1, Math.hypot(x - cx, z - cz) / rOut);
    const clump = vnoise(x * 2.4 + 5, y * 2.4 + z * 1.7);
    // pine tiers: each one darker where the tier above overhangs it
    const t = tier ? tier(y) : up;
    const k = 0.5 + 0.28 * t + 0.14 * out + 0.1 * Math.max(0, nrm.getY(i)) + (clump - 0.5) * 0.3;
    c[i * 3] = k * (1 + 0.06 * up);
    c[i * 3 + 1] = k;
    c[i * 3 + 2] = k * (1 - 0.05 * up);
  }
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}
const plain = (g) =>
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));

export function buildVegetation() {
  const rnd = makeRng(81);
  const dummy = new THREE.Object3D(),
    col = new THREE.Color();

  /* ---------- trees: merged trunk + foliage geometries, instanced ---------- */
  const trunkG = new THREE.CylinderGeometry(0.16, 0.28, 2.6, 8);
  trunkG.translate(0, 1.3, 0);
  const leafy = mergeGeometries(
    [
      [0, 3.3, 0, 1.5],
      [0.8, 2.8, 0.3, 1.1],
      [-0.7, 2.9, -0.4, 1.15],
      [0.1, 2.6, 0.9, 1.0],
      [0.2, 4.1, -0.2, 1.0],
    ].map(([x, y, z, r]) => blobGeo(r, 2).translate(x, y, z)),
  );
  shadeFoliage(leafy, 0.1, 0.1, 1.8, 5.1, 2.0);
  const decidG = mergeGeometries([plain(trunkG.toNonIndexed()), leafy], true);
  const coneParts = [
    [1.7, 2.4, 2.4],
    [1.35, 2.1, 3.6],
    [0.95, 1.8, 4.7],
    [0.55, 1.4, 5.6],
  ].map(([r, h, y]) => {
    const c = new THREE.ConeGeometry(r, h, 12, 3);
    const p = c.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (rnd() - 0.5) * 0.12;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    c.computeVertexNormals();
    return c.translate(0, y, 0);
  });
  const pineTrunk = new THREE.CylinderGeometry(0.13, 0.22, 2.4, 7);
  pineTrunk.translate(0, 1.2, 0);
  // each tier: lighter towards its tip, darker at its skirt under the tier above
  const tiers = [
    [1.2, 3.6],
    [2.55, 4.65],
    [3.8, 5.6],
    [4.9, 6.3],
  ];
  const tierT = (y) => {
    const [a, b] = tiers.reduce((best, tr) => (y >= tr[0] && y <= tr[1] ? tr : best), tiers[0]);
    return Math.min(1, Math.max(0, (y - a) / (b - a))) * 0.7 + ((y - 1.2) / 5.1) * 0.3;
  };
  const pineG = mergeGeometries(
    [plain(pineTrunk), shadeFoliage(mergeGeometries(coneParts), 0, 0, 1.2, 6.3, 1.8, tierT)],
    true,
  );
  barkM = S({ color: "#5a4030", roughness: 1 });
  const leafM = windy(S({ color: "#ffffff", roughness: 0.95, vertexColors: true }), 0.012);
  const needleM = windy(S({ color: "#ffffff", roughness: 0.95, vertexColors: true }), 0.008);
  decid = new THREE.InstancedMesh(decidG, [barkM, leafM], 260);
  pines = new THREE.InstancedMesh(pineG, [barkM, needleM], 320);
  [decid, pines].forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
  });
  let nd = 0,
    np = 0;
  for (let k = 0; k < 9000 && (nd < 260 || np < 320); k++) {
    const a = rnd() * Math.PI * 2,
      r = 6 + Math.sqrt(rnd()) * 26,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    const h = free(x, z, 1.0, 1.9);
    if (h === null) continue;
    // keep the village meadow open: only a few trees close in
    if (r < 17 && rnd() > 0.1) continue;
    const forest = fbm(x * 0.08 + 40, z * 0.08, 3);
    if (forest < 0.42 && rnd() < 0.85) continue;
    const pine = h > 4 || rnd() < 0.35;
    dummy.position.set(x, h - 0.1, z);
    dummy.rotation.set((rnd() - 0.5) * 0.08, rnd() * 6.28, (rnd() - 0.5) * 0.08);
    dummy.scale.setScalar((pine ? 0.75 : 0.7) + rnd() * 0.55);
    dummy.updateMatrix();
    treeSpots.push([x, z]);
    if (pine && np < 320) {
      pines.setMatrixAt(np, dummy.matrix);
      pines.setColorAt(np++, col.setHSL(0.34 + rnd() * 0.05, 0.42, 0.1 + rnd() * 0.06));
    } else if (!pine && nd < 260) {
      decid.setMatrixAt(nd, dummy.matrix);
      decid.setColorAt(nd++, col.setHSL(0.22 + rnd() * 0.08, 0.5, 0.14 + rnd() * 0.09));
    }
  }
  decid.count = nd;
  pines.count = np;
  scene.add(decid, pines);

  /* ---------- grass: small tufts of curved blades over the meadow, bending in the wind ---------- */
  // a tuft is three blades of different heights, each tapering to a point and arching over a little as it rises;
  // aShade makes some blades in a tuft a touch darker or lighter than the others
  const BLADE_H = 0.3,
    tr = makeRng(83);
  const blade = (h, w, arch, turn, ox, oz, shade) => {
    const pos = [],
      rows = [0, 0.45, 1];
    rows.forEach((t) => {
      const half = (w / 2) * Math.pow(1 - t, 0.8);
      pos.push(-half, t * h, arch * t * t * h, half, t * h, arch * t * t * h);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(
        rows.flatMap(() => [0, 1, 0, 0, 1, 0]),
        3,
      ),
    );
    g.setAttribute(
      "aShade",
      new THREE.Float32BufferAttribute(
        rows.flatMap(() => [shade, shade]),
        1,
      ),
    );
    g.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4]);
    return g.rotateY(turn).translate(ox, 0, oz);
  };
  const tuftG = mergeGeometries(
    [0, 1, 2].map((k) =>
      blade(
        BLADE_H * (0.6 + tr() * 0.4),
        0.03 + tr() * 0.012,
        0.15 + tr() * 0.35,
        (k / 3) * Math.PI * 2 + tr() * 1.2,
        (tr() - 0.5) * 0.05,
        (tr() - 0.5) * 0.05,
        0.85 + tr() * 0.25,
      ),
    ),
  );
  const grassM = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    side: THREE.DoubleSide,
    roughness: 1,
    envMapIntensity: 0.3,
  });
  grassM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windU);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime, uGust; uniform vec2 uWind; attribute float aShade; varying float vH; varying float vShade;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
      ${WIND_GLSL}
      vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
      float w = (sin(uTime*1.8 + ip.x*0.5 + ip.y*0.3) * 0.5 + sin(uTime*3.1 + ip.x*1.7) * 0.2) * (1.0 + uGust*1.5) + uGust*0.9;
      float t = position.y / ${BLADE_H.toFixed(3)}; vH = t; vShade = aShade;
      transformed.xz += w * t * t * 0.08 * lw;`,
      );
    // lit like the ground they grow from (their normals point up, on both sides), a little shaded low in the tuft
    // and paling towards the tips
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vH; varying float vShade;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n diffuseColor.rgb *= mix(0.7, 0.98, vH) * vShade;\n diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.08, 1.04, 0.8), vH * vH * 0.3);",
      )
      .replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n normal = normalize(vNormal);");
  };
  const GN = narrow() ? 9000 : 22000;
  grass = new THREE.InstancedMesh(tuftG, grassM, GN);
  let ng = 0;
  for (let k = 0; k < GN * 3 && ng < GN; k++) {
    const a = rnd() * Math.PI * 2,
      r = 4.6 + Math.sqrt(rnd()) * 17,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r,
      h = heightAt(x, z);
    if (h < 0.9) continue;
    const pd = pathDist(x, z);
    if (pd < 0.9 || plots.some((p) => Math.hypot(x - p.x, z - p.z) < 3.4)) continue;
    // shorter where people walk: along the paths and towards the plaza
    const trodden = (0.55 + 0.45 * smooth(0.9, 2.6, pd)) * (0.7 + 0.3 * smooth(5, 8, r));
    const yaw = rnd() * 6.28,
      tall = (0.45 + rnd() * 0.55) * trodden,
      lx = rnd(),
      lz = rnd();
    dummy.position.set(x, h - 0.02, z);
    dummy.rotation.set((lx - 0.5) * 0.35, yaw, (lz - 0.5) * 0.35);
    dummy.scale.set(0.85 + lz * 0.3, tall, 0.85 + lx * 0.3);
    dummy.updateMatrix();
    grass.setMatrixAt(ng, dummy.matrix);
    grass.setColorAt(ng++, col);
  }
  grass.count = ng;
  grass.receiveShadow = true;
  // no blades poking up through sandboxes, trampolines, beds and the greenhouse
  clearInstances(grass, (x, z) => grassClear.some(([cx, cz, rad]) => Math.hypot(x - cx, z - cz) < rad));
  // layer 1: seen by the camera but left out of the sea's reflection, where they would hardly show
  grass.layers.set(1);
  scene.add(grass);

  /* ---------- wildflowers ---------- */
  // one small flower: a stem with a leaf, five petals in the flower's own colour and a yellow centre.
  // aPart marks the pieces: 0 petals (take the instance colour), 1 stem and leaf (green), 2 centre (yellow)
  const part = (g, k) => {
    g.deleteAttribute("uv");
    g.setAttribute("aPart", new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(k), 1));
    return g;
  };
  const flowerG = mergeGeometries([
    part(new THREE.CylinderGeometry(0.008, 0.012, 0.4, 4).translate(0, 0.2, 0), 1),
    part(
      new THREE.SphereGeometry(0.04, 5, 3).scale(1, 0.15, 0.4).translate(0.04, 0, 0).rotateZ(0.5).translate(0, 0.14, 0),
      1,
    ),
    ...[0, 1, 2, 3, 4].map((k) =>
      part(
        new THREE.SphereGeometry(0.045, 5, 3)
          .scale(1, 0.3, 0.55)
          .translate(0.05, 0, 0)
          .rotateZ(0.25)
          .rotateY((k / 5) * Math.PI * 2)
          .translate(0, 0.4, 0),
        0,
      ),
    ),
    part(new THREE.SphereGeometry(0.026, 6, 4).scale(1, 0.6, 1).translate(0, 0.41, 0), 2),
  ]);
  const flowerM = S({ color: "#ffffff", roughness: 0.7 });
  flowerM.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aPart;").replace(
      "#include <color_vertex>",
      `#include <color_vertex>
      if (aPart > 1.5) vColor = vec3(0.95, 0.75, 0.15); else if (aPart > 0.5) vColor = vec3(0.16, 0.36, 0.1);`,
    );
  };
  flowers = new THREE.InstancedMesh(flowerG, flowerM, 1200);
  const petals = ["#ffffff", "#ffe066", "#ff8fab", "#b197fc", "#ff6b6b", "#74c0fc"].map((c) => new THREE.Color(c));
  let nf = 0;
  for (let k = 0; k < 6000 && nf < 1200; k++) {
    const x = (rnd() - 0.5) * 50,
      z = (rnd() - 0.5) * 50,
      h = heightAt(x, z);
    if (h < 1 || Math.hypot(x, z) < 5 || pathDist(x, z) < 0.9 || plots.some((p) => Math.hypot(x - p.x, z - p.z) < 5))
      continue;
    if (fbm(x * 0.15, z * 0.15, 2) < 0.5) continue;
    dummy.position.set(x, h - 0.03, z);
    dummy.scale.setScalar(0.8 + rnd() * 0.7);
    dummy.rotation.set((rnd() - 0.5) * 0.3, rnd() * 6.28, (rnd() - 0.5) * 0.3);
    dummy.updateMatrix();
    flowers.setMatrixAt(nf, dummy.matrix);
    flowers.setColorAt(nf++, petals[Math.floor(rnd() * petals.length)]);
  }
  flowers.count = nf;
  flowers.layers.set(1);
  scene.add(flowers);

  /* ---------- boulders on the coast and the mountain ---------- */
  rockM = S({ color: "#8a867c", roughness: 0.95 });
  // the boulders get their own colouring: darker in the cracks, pale lichen, moss on the tops (snow in winter)
  const boulderM = S({ color: "#ffffff", roughness: 0.95, vertexColors: true });
  const stone = new THREE.Color("#8a867c"),
    crack = new THREE.Color("#5e5a52"),
    lichen = new THREE.Color("#c4c2a8"),
    moss = new THREE.Color("#5d7a3a"),
    snowC = new THREE.Color("#eef2f7");
  const boulders = [],
    cc = new THREE.Color();
  const colourRock = (g, wx, wz) => {
    const p = g.attributes.position,
      nrm = g.attributes.normal,
      green = new Float32Array(p.count * 3),
      white = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + wx,
        y = p.getY(i),
        z = p.getZ(i) + wz,
        ny = nrm.getY(i);
      const n1 = vnoise(x * 3.1 + 11, z * 3.1 + y * 2.3),
        n2 = vnoise(x * 9.7 - 4, z * 9.7 + y * 7.1);
      cc.copy(stone)
        .lerp(crack, Math.max(0, 0.5 - n1) * 1.4)
        .lerp(lichen, n2 > 0.72 ? 0.5 : 0);
      const top = Math.min(1, Math.max(0, (ny - 0.35) * 2.2 + (n1 - 0.5) * 0.8));
      cc.clone()
        .lerp(moss, top * 0.85)
        .toArray(green, i * 3);
      cc.clone()
        .lerp(snowC, Math.min(1, top * 1.3))
        .toArray(white, i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(green.slice(), 3));
    boulders.push({ g, green, white });
    return g;
  };
  onSeason(({ wi }) =>
    boulders.forEach((b) => {
      b.g.attributes.color.array.set(wi ? b.white : b.green);
      b.g.attributes.color.needsUpdate = true;
    }),
  );
  for (let k = 0; k < 70; k++) {
    const near = k < 40,
      a = rnd() * Math.PI * 2;
    const x = near ? Math.cos(a) * (coastAt(a) - 1 - rnd() * 4) : PEAK[0] + (rnd() - 0.5) * 16,
      z = near ? Math.sin(a) * (coastAt(a) - 1 - rnd() * 4) : PEAK[1] + (rnd() - 0.5) * 16;
    if (Math.hypot(x - pierBase[0], z - pierBase[1]) < 5) continue;
    const size = 0.5 + rnd() * 1.2,
      rk = shadow(new THREE.Mesh(colourRock(blobGeo(size, 2), x, z), boulderM));
    rk.position.set(x, heightAt(x, z) - 0.2, z);
    rk.scale.set(1, 0.55 + rnd() * 0.4, 1 + rnd() * 0.4);
    rk.rotation.y = rnd() * 6;
    rocks.push({ x, z, s: size * 1.4 });
    scene.add(rk);
  }

  /* ---------- bare branches for winter, sharing the deciduous trees' placement ---------- */
  const branchG = mergeGeometries(
    [...Array(7)]
      .map((_, k) => {
        const len = 1.3 + (k % 2) * 0.6,
          c = new THREE.CylinderGeometry(0.03, 0.08, len, 5);
        c.translate(0, len / 2, 0);
        c.rotateZ(0.5 + (k % 3) * 0.18);
        c.rotateY((k / 7) * Math.PI * 2 + k * 0.7);
        c.translate(0, 2.0 + (k % 3) * 0.5, 0);
        return c;
      })
      .concat([new THREE.CylinderGeometry(0.05, 0.12, 1.8, 6).translate(0, 3.4, 0)]),
  );
  branches = new THREE.InstancedMesh(branchG, barkM, nd);
  {
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < nd; i++) {
      decid.getMatrixAt(i, m4);
      branches.setMatrixAt(i, m4);
    }
  }
  branches.castShadow = true;
  branches.visible = false;
  scene.add(branches);

  /* ---------- seasons: blossom, summer green, autumn colours, bare winter ---------- */
  const flowerN = flowers.count;
  onSeason(({ sp, au, wi }) => {
    for (let i = 0; i < nd; i++) {
      const a = hash01(i, 1),
        b = hash01(i, 2);
      if (sp)
        a < 0.3
          ? col.setHSL(0.94 + b * 0.04, 0.55, 0.58 + b * 0.12)
          : col.setHSL(0.24 + a * 0.06, 0.55, 0.2 + b * 0.08);
      else if (au) a < 0.15 ? col.setHSL(0.17, 0.5, 0.22) : col.setHSL(0.01 + a * 0.11, 0.75, 0.2 + b * 0.14);
      else if (wi) col.setHSL(0.08, 0.12, 0.5);
      else col.setHSL(0.22 + a * 0.08, 0.5, 0.14 + b * 0.09);
      decid.setColorAt(i, col);
      branches.setColorAt(i, col);
    }
    for (let i = 0; i < np; i++) {
      const b = hash01(i, 4),
        a = hash01(i, 3);
      wi ? col.setHSL(0.45, 0.14, 0.3 + b * 0.12) : col.setHSL(0.34 + a * 0.05, 0.42, 0.1 + b * 0.06);
      pines.setColorAt(i, col);
    }
    // grass: close to the colour of the ground it grows on, with a few dry, straw-coloured tufts (more in autumn)
    for (let i = 0; i < grass.count; i++) {
      const a = hash01(i, 5),
        b = hash01(i, 6),
        dry = hash01(i, 7) < (au ? 0.35 : sp ? 0 : 0.08);
      if (dry) col.setHSL(0.11 + a * 0.03, 0.4, 0.3 + b * 0.07);
      else
        sp
          ? col.setHSL(0.24 + a * 0.04, 0.58, 0.27 + b * 0.07)
          : au
            ? col.setHSL(0.15 + a * 0.06, 0.48, 0.26 + b * 0.07)
            : col.setHSL(0.22 + a * 0.05, 0.52, 0.24 + b * 0.07);
      grass.setColorAt(i, col);
    }
    [decid, branches, pines, grass].forEach((m) => (m.instanceColor.needsUpdate = true));
    leafM.visible = !wi;
    branches.visible = wi;
    grass.visible = !wi;
    flowers.count = wi ? 0 : au ? Math.floor(flowerN * 0.2) : flowerN;
  });
  // on windy days (and on the island's own autumn days) the wind comes in gusts every so often; otherwise a breeze
  onFrame((dt, t, tt) => {
    windU.uTime.value = tt;
    windU.uWind.value.set(WIND.x, WIND.z);
    state.gust =
      state.weather.gusty && !reduce ? Math.pow(Math.max(0, Math.sin(tt * 0.21) * Math.sin(tt * 0.53 + 1.3)), 2) : 0;
    windU.uGust.value = state.gust;
  });
}

// hides (scales to zero) the instances whose position matches; used to keep spots clear
export function clearInstances(mesh, test, n = mesh.count) {
  const m4 = new THREE.Matrix4(),
    p = new THREE.Vector3(),
    zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let k = 0; k < n; k++) {
    mesh.getMatrixAt(k, m4);
    p.setFromMatrixPosition(m4);
    if (test(p.x, p.z)) mesh.setMatrixAt(k, zero);
  }
  mesh.instanceMatrix.needsUpdate = true;
}
// the [x, z] positions of a mesh's instances
export function instancePositions(mesh, n = mesh.count) {
  const m4 = new THREE.Matrix4(),
    p = new THREE.Vector3(),
    out = [];
  for (let k = 0; k < n; k++) {
    mesh.getMatrixAt(k, m4);
    p.setFromMatrixPosition(m4);
    out.push([p.x, p.z]);
  }
  return out;
}
