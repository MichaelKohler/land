// The ground the island stands on: value noise, the layout (plots, paths, coast, pier, lighthouse),
// the height field and the terrain mesh with its shader (grass, sand, rock, paths, cobbles, snow, caustics).
import * as THREE from "three";
import { makeRng, smooth, scene, state, R, onSeason, onTime, onFrame } from "./core.js";

/* ================= value noise (JS) ================= */
const perm = [];
const lat = (x, y) => perm[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 512];
export function vnoise(x, y) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    xf = x - xi,
    yf = y - yi,
    u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf);
  const a = lat(xi, yi),
    b = lat(xi + 1, yi),
    c = lat(xi, yi + 1),
    d = lat(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x, y, o = 5) => {
  let s = 0,
    a = 0.5,
    f = 1;
  for (let i = 0; i < o; i++) {
    s += vnoise(x * f, y * f) * a;
    a *= 0.5;
    f *= 2.03;
  }
  return s;
};
// a lumpy sphere: boulders, foliage and fire-pit stones
export function blobGeo(r, det) {
  const g = new THREE.IcosahedronGeometry(r, det),
    p = g.attributes.position,
    v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + (vnoise(v.x * 3 + 9, v.y * 3 + v.z * 2) - 0.5) * 0.35;
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

/* ================= layout ================= */
export const COAST = 31,
  PLOT_R = 12.5;
export const PIER_A = Math.PI * 0.62,
  LIGHT_A = -Math.PI * 0.08,
  PEAK = [-15, -13];
export const coastAt = (a) => COAST + Math.sin(a * 3 + 0.4) * 3 + Math.sin(a * 7 + 1) * 1.3 + Math.sin(a * 13) * 0.5;
// one plot per resident, around the plaza
export const plots = R.map((r, i) => {
  const a = (i / R.length) * Math.PI * 2 + Math.PI * 0.15;
  return { a, x: Math.cos(a) * PLOT_R, z: Math.sin(a) * PLOT_R, r };
});
// paths: plaza → every plot, plaza → pier, plaza → lighthouse
export const paths = [];
function addPath(a, b, bend) {
  const mid = [(a[0] + b[0]) / 2 + bend[0], (a[1] + b[1]) / 2 + bend[1]],
    pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40,
      u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * mid[0] + t * t * b[0], u * u * a[1] + 2 * u * t * mid[1] + t * t * b[1]]);
  }
  paths.push(pts);
  return pts;
}
plots.forEach((p) => {
  p.path = addPath(
    [Math.cos(p.a) * 4.2, Math.sin(p.a) * 4.2],
    [p.x - Math.cos(p.a) * 3.6, p.z - Math.sin(p.a) * 3.6],
    [-Math.sin(p.a) * 1.5, Math.cos(p.a) * 1.5],
  );
});
export const pierBase = [Math.cos(PIER_A) * (coastAt(PIER_A) - 2.5), Math.sin(PIER_A) * (coastAt(PIER_A) - 2.5)];
addPath([Math.cos(PIER_A) * 4.2, Math.sin(PIER_A) * 4.2], pierBase, [3, 2]);
export const lightPos = [Math.cos(LIGHT_A) * (coastAt(LIGHT_A) - 3.5), Math.sin(LIGHT_A) * (coastAt(LIGHT_A) - 3.5)];
addPath([Math.cos(LIGHT_A) * 4.2, Math.sin(LIGHT_A) * 4.2], [lightPos[0] - 2.5, lightPos[1]], [0, 4]);
export function pathDist(x, z) {
  let m = 99;
  for (const pts of paths)
    for (let i = 0; i < pts.length; i += 2) {
      const d = Math.hypot(x - pts[i][0], z - pts[i][1]);
      if (d < m) m = d;
    }
  return m;
}

/* ================= height field ================= */
export function heightAt(x, z) {
  const r = Math.hypot(x, z),
    a = Math.atan2(z, x),
    coast = coastAt(a) + (fbm(x * 0.05, z * 0.05, 3) - 0.5) * 4;
  let land = 1.3 + (fbm(x * 0.045 + 3, z * 0.045 + 7) - 0.45) * 5 * smooth(14, 24, r);
  land +=
    8 *
    Math.exp(-((x - PEAK[0]) ** 2 + (z - PEAK[1]) ** 2) / (2 * 7.5 * 7.5)) *
    (0.75 + fbm(x * 0.2, z * 0.2, 4) * 0.5);
  land += 4 * Math.exp(-((x - 16) ** 2 + (z + 14) ** 2) / (2 * 6 * 6));
  land += (fbm(x * 0.25, z * 0.25, 3) - 0.5) * 0.35;
  // gentle central meadow with the plaza and the plots
  const meadow = 1 - smooth(15, 21, r);
  land = land * (1 - meadow) + (1.25 + (fbm(x * 0.12, z * 0.12, 3) - 0.5) * 0.5) * meadow;
  land = land + (1.2 - land) * (1 - smooth(4, 5.5, r));
  plots.forEach((p) => {
    const d = Math.hypot(x - p.x, z - p.z);
    land = land + (1.3 - land) * (1 - smooth(4.2, 6.2, d));
  });
  const dl = Math.hypot(x - lightPos[0], z - lightPos[1]);
  land = land + (Math.max(land, 3.2) - land) * (1 - smooth(2.5, 4, dl));
  // beach and seabed
  const shore = smooth(coast - 7, coast - 1.5, r);
  land = land * (1 - shore) + 0.35 * shore;
  // a long, gently sloping shelf of sand before the sea floor drops away
  if (r > coast - 1.5) {
    const d = r - (coast - 1.5);
    land = 0.35 - d * 0.2 - Math.max(0, d - 12) * 0.45;
  }
  return Math.max(-14, land);
}

/* ================= shader snippets ================= */
export const GLSL_NOISE = `
  float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
  float fb(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += vn(p)*a; p *= 2.07; a *= 0.5; } return s; }`;
// caustics: bright lines along the edges of slowly drifting cells, two layers crossed into a net
const GLSL_CAUSTICS = `
  float cauLayer(vec2 p, float t){
    vec2 ip = floor(p), fp = fract(p); float f1 = 8.0, f2 = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j)), cell = ip + g;
      vec2 o = 0.5 + 0.38*sin(t + 6.2831*vec2(h21(cell), h21(cell + 17.3)));
      float d = length(g + o - fp);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return 1.0 - smoothstep(0.0, 0.13, f2 - f1);
  }
  float caustics(vec2 p, float t){
    p += (vec2(vn(p*0.6 + t*0.15), vn(p*0.6 + 5.3 - t*0.12)) - 0.5) * 0.9;
    float a = cauLayer(p, t*0.55), b = cauLayer(p*1.37 + vec2(3.1, 7.7), t*0.7 + 2.0);
    return clamp(a*0.7 + b*0.35 + a*b*0.5, 0.0, 1.0);
  }`;

/* ================= terrain (smooth, detailed in the shader) ================= */
export const SIZE = 150;
export let terrain;
const terrainU = {
  uTime: { value: 0 },
  uSnow: { value: 0 },
  uAutumn: { value: 0 },
  uSpring: { value: 0 },
  uWet: { value: 0 },
  uSunny: { value: 1 },
  uTide: { value: 0 },
};

export function initWorld() {
  const rnd = makeRng(11);
  for (let i = 0; i < 512; i++) perm.push(rnd());

  const SEG = 300;
  const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tGeo.rotateX(-Math.PI / 2);
  const tp = tGeo.attributes.position,
    pathA = new Float32Array(tp.count),
    plazaA = new Float32Array(tp.count);
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i),
      z = tp.getZ(i),
      r = Math.hypot(x, z);
    tp.setY(i, heightAt(x, z));
    if (r < 34) pathA[i] = 1 - smooth(0.55, 1.35, pathDist(x, z));
    plazaA[i] = 1 - smooth(4.3, 4.9, r);
  }
  tGeo.setAttribute("pathMask", new THREE.BufferAttribute(pathA, 1));
  tGeo.setAttribute("plazaMask", new THREE.BufferAttribute(plazaA, 1));
  tGeo.computeVertexNormals();
  const tMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: 0.3 });
  tMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, terrainU);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float pathMask; attribute float plazaMask; varying float vPath; varying float vPlaza; varying vec3 vWP; varying vec3 vWN;",
      )
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvPath = pathMask; vPlaza = plazaMask; vWP = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uTime, uSnow, uAutumn, uSpring, uWet, uSunny, uTide; varying float vPath; varying float vPlaza; varying vec3 vWP; varying vec3 vWN;" +
          GLSL_NOISE +
          GLSL_CAUSTICS,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, uWet * step(0.0, vWP.y));",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float y = vWP.y; float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
        float n = fb(vWP.xz*0.35), n2 = fb(vWP.xz*2.3), n3 = fb(vWP.xz*0.06);
        vec3 sand = mix(vec3(0.82,0.72,0.52), vec3(0.88,0.8,0.62), n2);
        vec3 wet = vec3(0.62,0.55,0.42);
        vec3 grass = mix(vec3(0.26,0.43,0.15), vec3(0.4,0.55,0.2), n);
        grass = mix(grass, vec3(0.55,0.58,0.28), smoothstep(0.55, 0.8, n3) * 0.6);
        grass *= 0.85 + n2*0.3;
        grass = mix(grass, mix(vec3(0.4,0.6,0.17), vec3(0.5,0.66,0.24), n) * (0.85 + n2*0.3), uSpring*0.6);
        grass = mix(grass, mix(vec3(0.5,0.42,0.18), vec3(0.63,0.5,0.23), n) * (0.85 + n2*0.3), uAutumn*0.75);
        vec3 rock = mix(vec3(0.42,0.4,0.37), vec3(0.6,0.58,0.53), n2) * (0.85 + n*0.3);
        vec3 dirt = mix(vec3(0.5,0.4,0.28), vec3(0.62,0.52,0.38), n2);
        vec3 c = grass;
        c = mix(sand, c, smoothstep(0.45, 0.8, y + (n-0.5)*0.4));
        c = mix(c, rock, smoothstep(0.32, 0.55, slope + (n2-0.5)*0.2) * step(0.3, y));
        c = mix(c, rock, smoothstep(7.0, 10.0, y + n*3.0) * 0.7);
        c = mix(c, dirt, smoothstep(0.15, 0.6, vPath + (n2-0.5)*0.4));
        // cobbles on the plaza
        vec2 cb = vWP.xz*2.2; vec2 cf = fract(cb + vec2(0.5*step(1.0, mod(floor(cb.y),2.0)), 0.0));
        float edge = smoothstep(0.0, 0.12, min(min(cf.x, 1.0-cf.x), min(cf.y, 1.0-cf.y)));
        vec3 cob = mix(vec3(0.45,0.42,0.38), vec3(0.72,0.68,0.6)*(0.85+h21(floor(cb))*0.3), edge);
        c = mix(c, cob, vPlaza);
        // wet sand along the waterline, which moves with the tide (yw: height above the sea right now); the sand the
        // falling tide has just uncovered stays damp
        float yw = y - uTide;
        c = mix(c, wet, max(smoothstep(0.28, 0.06, yw + (n2 - 0.5)*0.06), 0.6*smoothstep(0.22, 0.12, y)) * (1.0 - smoothstep(-0.2, -1.0, yw)));
        // winter snow on flat ground, in patches that join up as uSnow rises; darker, wet ground in the rain
        float patches = vn(vWP.xz*0.11)*0.65 + vn(vWP.xz*0.47)*0.35;
        float snow = smoothstep(0.0, 0.12, uSnow - (1.0 - patches)*0.8) * smoothstep(0.5, 0.9, y + (n2-0.5)*0.3) * smoothstep(0.55, 0.8, vWN.y + (n-0.5)*0.25) * (1.0 - vPath*0.35);
        c = mix(c, mix(vec3(0.84,0.87,0.92), vec3(0.96,0.97,1.0), n2), snow);
        c *= 1.0 - uWet*0.3*step(0.0, y)*(1.0 - snow);
        // under water: sand with moving caustics
        if (yw < 0.0) {
          vec3 bed = mix(vec3(0.78,0.72,0.55), vec3(0.55,0.6,0.5), smoothstep(-1.0, -8.0, yw));
          // finer and sharper in the shallows, wider and fainter deeper down
          float cd = smoothstep(-0.3, -6.0, yw);
          float ca = caustics(vWP.xz * mix(0.6, 0.38, cd), uTime);
          bed += vec3(0.22, 0.24, 0.22) * ca * smoothstep(-0.05, -0.6, yw) * (1.0 - cd * 0.75) * uSunny;
          c = mix(c, bed, smoothstep(0.0, -0.6, yw));
        }
        diffuseColor.rgb = pow(c, vec3(2.2));`,
      );
  };
  terrain = new THREE.Mesh(tGeo, tMat);
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  scene.add(terrain);

  onSeason((S) => {
    terrainU.uAutumn.value = S.au ? 1 : 0;
    terrainU.uSpring.value = S.sp ? 1 : 0;
  });
  onTime((L) => {
    // winter snow on the ground (time.js works out how much), the sea level for the waterline
    terrainU.uSnow.value = state.weather.snowCover;
    terrainU.uTide.value = state.tide;
    // light patterns on the seabed only in real sunshine; wet, darker ground in the rain (not in snow)
    terrainU.uSunny.value = L.fair ? L.dl * (1 - L.grey) : 0;
    terrainU.uWet.value = L.snowing ? 0 : Math.min(1, L.rain * 1.3);
  });
  onFrame((dt, t, tt) => (terrainU.uTime.value = tt));
}
