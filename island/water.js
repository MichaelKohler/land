// The sea: depth-tinted and see-through over the sand, with sun glitter, a path of moonlight, shore foam, rolling wave
// crests and raindrop rings; and low mist drifting over it around sunrise.
import * as THREE from "three";
import { makeRng, smooth, between, reduce, narrow, scene, state, renderer, onSeason, onTime, onFrame } from "./core.js";
import { SIZE, heightAt, coastAt, GLSL_NOISE } from "./world.js";
import { sunDir, sun, moonDir, moonLit } from "./sky.js";
import { puffTex, fxMat } from "./materials.js";

// tileable normal map made from sine waves
function waterNormals() {
  const rnd = makeRng(31);
  const N = 256,
    c = document.createElement("canvas");
  c.width = c.height = N;
  const ctx = c.getContext("2d"),
    img = ctx.createImageData(N, N),
    waves = [];
  for (let k = 0; k < 24; k++)
    waves.push([Math.round((rnd() - 0.5) * 16), Math.round((rnd() - 0.5) * 16), rnd() * 6.28, 0.3 + rnd()]);
  const h = (x, y) =>
    waves.reduce(
      (s, w) =>
        s + (Math.sin(((w[0] * x + w[1] * y) / N) * 6.2832 + w[2]) * w[3]) / (1 + Math.hypot(w[0], w[1]) * 0.25),
      0,
    );
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = h(x + 1, y) - h(x - 1, y),
        dy = h(x, y + 1) - h(x, y - 1),
        l = Math.hypot(dx, dy, 2),
        o = (y * N + x) * 4;
      img.data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      img.data[o + 2] = ((2 / l) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function initWater() {
  // depth below sea level (from a metre above it, for the high tide), sampled into a texture so the water knows where
  // it is shallow
  const DN = 256,
    depthData = new Uint8Array(DN * DN * 4);
  for (let j = 0; j < DN; j++)
    for (let i = 0; i < DN; i++) {
      const x = (i / (DN - 1) - 0.5) * SIZE,
        z = (j / (DN - 1) - 0.5) * SIZE;
      const d = Math.max(0, Math.min(1, (1 - heightAt(x, z)) / 11)),
        o = (j * DN + i) * 4;
      depthData[o] = d * 255;
      depthData[o + 3] = 255;
    }
  const depthTex = new THREE.DataTexture(depthData, DN, DN);
  depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter;
  depthTex.needsUpdate = true;
  const waterU = {
    uTime: { value: 0 },
    uDepth: { value: depthTex },
    uNormal: { value: waterNormals() },
    uSun: { value: sunDir },
    uSunCol: { value: new THREE.Color() },
    uMoon: { value: moonDir },
    uMoonCol: { value: new THREE.Color() },
    uSkyTop: { value: new THREE.Color("#5c9ccf") },
    uSkyHor: { value: new THREE.Color("#cfe2ee") },
    uSize: { value: SIZE },
    uNight: { value: 0 },
    uRain: { value: 0 },
    uCold: { value: 0 },
    uTide: { value: 0 },
    uGlow: { value: new THREE.Color(0, 0, 0) },
    uPath: { value: 0 },
    fogColor: { value: scene.fog.color },
    fogDensity: { value: scene.fog.density },
    uRefl: { value: null },
    uReflM: { value: new THREE.Matrix4() },
  };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: waterU,
      transparent: true,
      depthWrite: false,
      vertexShader: `uniform mat4 uReflM; varying vec3 vW; varying vec4 vR; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vR = uReflM * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime, uSize, uNight, uRain, uCold, uTide, uPath; uniform sampler2D uDepth, uNormal; uniform vec3 uSun, uSunCol, uMoon, uMoonCol, uSkyTop, uSkyHor, uGlow, fogColor; uniform float fogDensity; uniform sampler2D uRefl; varying vec3 vW; varying vec4 vR;
        ${GLSL_NOISE}
        void main(){
          vec2 uv = vW.xz / uSize + 0.5;
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          // how deep the water is here at this tide
          float depth = mix(10.0, texture2D(uDepth, uv).r * 11.0 - 1.0, inside) + uTide;
          vec3 n1 = texture2D(uNormal, vW.xz*0.045 + vec2(uTime*0.012, uTime*0.007)).xyz*2.0-1.0;
          vec3 n2 = texture2D(uNormal, vW.xz*0.11 - vec2(uTime*0.009, -uTime*0.014)).xyz*2.0-1.0;
          vec3 n = normalize(vec3(n1.x+n2.x, 3.2, n1.y+n2.y));
          // raindrop rings
          if (uRain > 0.01) {
            vec2 rip = vec2(0.0);
            for (int k = 0; k < 2; k++) {
              vec2 rp = vW.xz*(1.6 + float(k)*0.9) + float(k)*13.7, ci = floor(rp), cf = fract(rp) - 0.5;
              vec2 dv = cf - (vec2(h21(ci + 3.1), h21(ci + 7.7)) - 0.5)*0.5;
              float ph = fract(uTime*0.9 + h21(ci)), d = length(dv);
              rip += dv/(d + 1e-3) * sin((d - ph*0.45)*40.0) * smoothstep(0.08, 0.0, abs(d - ph*0.45)) * (1.0 - ph);
            }
            n = normalize(n + vec3(rip.x, 0.0, rip.y) * 0.8 * uRain);
          }
          vec3 V = normalize(cameraPosition - vW);
          float fres = 0.02 + 0.98*pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 Rf = reflect(-V, n);
          vec3 skyC = mix(uSkyHor, uSkyTop, smoothstep(0.0, 0.5, Rf.y));
          // at sunset the sea mirrors the glowing horizon on the sun's side
          float sunSide = max(dot(normalize(Rf.xz + 1e-5), normalize(uSun.xz + 1e-5)), 0.0);
          skyC += uGlow * pow(sunSide, 3.0) * (1.0 - smoothstep(0.0, 0.35, Rf.y));
          // and is darker away from the sun, so the light gathers in the path below it
          skyC *= 1.0 - 0.45 * clamp(uGlow.r, 0.0, 1.0) * (1.0 - pow(sunSide, 2.0));
          // the real mirror image (island, trees, boats, sky), rippled by the waves; it stands in for the sky colours
          // above, which only show where it has nothing (the very first frame)
          vec4 rp = vR; rp.xy += n.xz * 0.9 * rp.w * 0.06;
          vec4 refl = texture2DProj(uRefl, rp);
          skyC = mix(skyC, refl.rgb, refl.a);
          float spec = pow(max(dot(Rf, uSun), 0.0), 600.0) * 6.0 + pow(max(dot(Rf, uSun), 0.0), 60.0) * 0.25;
          // the moon's glittering path across the waves
          float mr = max(dot(Rf, normalize(uMoon)), 0.0);
          vec3 moonSpec = uMoonCol * (pow(mr, 400.0) * 5.0 + pow(mr, 40.0) * 0.18);
          // water body colour: clear turquoise over sand, deep blue further out
          vec3 shallow = pow(vec3(0.3, 0.78, 0.74), vec3(2.2)), mid = pow(vec3(0.07, 0.48, 0.62), vec3(2.2)), deep = pow(vec3(0.03, 0.2, 0.36), vec3(2.2));
          vec3 body = mix(shallow, mid, smoothstep(0.2, 2.5, depth)); body = mix(body, deep, smoothstep(2.5, 9.0, depth));
          body *= mix(1.0, 0.18, uNight);
          body = mix(body, body*vec3(0.7, 0.85, 0.95), uCold); body *= 1.0 - uRain*0.25;
          // opaque in deep water and towards the edge of the seabed mesh, so its square border never shows
          float alpha = mix(0.35, 1.0, smoothstep(0.0, 6.0, depth));
          alpha = mix(alpha, 1.0, smoothstep(52.0, 68.0, length(vW.xz)));
          // and, while the sun is still up, a glittering path of light runs across the waves towards it
          float path = pow(max(dot(Rf, normalize(uSun)), 0.0), 45.0) * smoothstep(0.55, 1.0, h21(floor(vW.xz * 3.0) + floor(uTime * 2.0)) + n.x * 2.0);
          vec3 c = mix(body, skyC, fres * 0.85) + uSunCol * spec + moonSpec + uGlow * path * 2.4 * uPath;
          // shore foam where it is very shallow, broken up by noise and moving with the waves
          float f = fb(vW.xz*0.9 + uTime*0.15);
          float swash = 0.1*sin(uTime*0.7 + vW.x*0.04 + vW.z*0.03);
          float foam = smoothstep(0.3, 0.0, depth + (f-0.5)*0.4 - swash) * smoothstep(0.0, 0.08, depth) * (0.55 + 0.45*sin(depth*14.0 - uTime*2.2));
          // rolling waves: crests run up the shelf towards the beach and break up as they go
          float wph = depth*5.0 + uTime*1.3 + (fb(vW.xz*0.12) - 0.5)*3.0;
          float crest = pow(max(0.0, sin(wph)), 14.0) * smoothstep(3.2, 0.6, depth) * smoothstep(0.05, 0.4, depth);
          crest *= smoothstep(0.3, 0.65, fb(vW.xz*0.45 + vec2(uTime*0.04, -uTime*0.03)));
          foam = max(foam, crest*0.85);
          c = mix(c, vec3(mix(0.9, 0.12, uNight)), clamp(foam, 0.0, 1.0)*0.9);
          alpha = max(alpha, foam);
          float dist = length(vW - cameraPosition);
          float fogF = 1.0 - exp(-fogDensity*fogDensity*dist*dist);
          c = mix(c, fogColor, fogF);
          gl_FragColor = vec4(c, mix(alpha, 1.0, fogF));
        }`,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  mirror(water, waterU);

  onSeason((S) => (waterU.uCold.value = S.wi ? 1 : S.au ? 0.3 : 0));
  // runs after the sky's hook, so the sun colour and the fog are already set for this hour
  const dusk = new THREE.Color("#f4b183"),
    rainTop = new THREE.Color("#7d8a94"),
    rainHor = new THREE.Color("#aab3b9");
  const setHor = new THREE.Color("#c9774a"),
    setTop = new THREE.Color("#6a80b0"),
    twiHor = new THREE.Color("#6e3a44"),
    twiTop = new THREE.Color("#1c2546");
  onTime((L) => {
    // golden hour and twilight, under a clear sky (the same as the sky's)
    const { gold, twi } = L;
    // the sky it mirrors: grey under rain or heavy cloud, the sunset's colours at sunset
    waterU.uSunCol.value.copy(sun.color).multiplyScalar((L.night > 0.5 ? 0.25 : 1) * (1 - L.grey * 0.85));
    waterU.uSkyTop.value
      .set(L.night > 0.5 ? "#0c1630" : "#4f8fc4")
      .lerp(rainTop, L.grey * 0.7)
      .lerp(setTop, gold * 0.7)
      .lerp(twiTop, twi * 0.8);
    waterU.uSkyHor.value
      .set(L.night > 0.5 ? "#1b2747" : "#cfe2ee")
      .lerp(dusk, L.dusk * 0.6 * (1 - L.night))
      .lerp(rainHor, L.grey * 0.6)
      .lerp(setHor, gold * 0.85)
      .lerp(twiHor, twi * 0.85);
    waterU.uMoonCol.value
      .set("#c9d6ff")
      .multiplyScalar(smooth(0.5, 1, L.night) * L.clear * (0.2 + 0.8 * moonLit) * 0.17);
    // the sunset colour on the water: golden hour into the red of twilight, under a clear sky
    waterU.uGlow.value
      .setRGB(1.0 * gold + 0.7 * twi, 0.45 * gold + 0.18 * twi, 0.12 * gold + 0.1 * twi)
      .multiplyScalar(1.3);
    waterU.uPath.value = smooth(-1, 1, L.elev);
    waterU.uNight.value = L.night;
    waterU.uRain.value = L.snowing ? 0 : L.rain;
    // the tide lifts and lowers the whole sea
    waterU.uTide.value = state.tide;
    water.position.y = state.tide;
    waterU.fogDensity.value = scene.fog.density;
  });
  onFrame((dt, t, tt) => (waterU.uTime.value = tt));
  buildMist();
}

/* ================= reflections ================= */
// before the sea is drawn, the scene is drawn once more from a camera mirrored under the water, at a third of the
// size (it is rippled anyway) and without the grass and flowers, into a texture the sea samples (as three's Reflector
// does: an oblique near plane cuts away everything below the water)
function mirror(water, U) {
  const size = new THREE.Vector2(),
    rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  U.uRefl.value = rt.texture;
  const cam = new THREE.PerspectiveCamera(),
    plane = new THREE.Plane(),
    clip = new THREE.Vector4(),
    q = new THREE.Vector4();
  const n = new THREE.Vector3(0, 1, 0),
    wp = new THREE.Vector3(),
    cp = new THREE.Vector3(),
    look = new THREE.Vector3(),
    target = new THREE.Vector3(),
    rot = new THREE.Matrix4();
  const scale = narrow() ? 0.25 : 0.35;
  water.onBeforeRender = (r, sc, camera) => {
    if (camera === cam) return;
    r.getDrawingBufferSize(size);
    size.multiplyScalar(scale).floor();
    if (rt.width !== size.x || rt.height !== size.y) rt.setSize(size.x, size.y);
    wp.set(0, water.position.y, 0);
    cp.setFromMatrixPosition(camera.matrixWorld);
    // the camera's mirror image, looking at the mirror image of what it looks at
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(cp);
    target.subVectors(wp, look).reflect(n).negate().add(wp);
    cam.position.subVectors(wp, cp).reflect(n).negate().add(wp);
    cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(n);
    cam.lookAt(target);
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    U.uReflM.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix)
      .multiply(cam.matrixWorldInverse)
      .multiply(water.matrixWorld);
    // the oblique near plane at the water (lowered a touch, so the shore meets its reflection without a seam)
    plane.setFromNormalAndCoplanarPoint(n, wp.setY(water.position.y - 0.05)).applyMatrix4(cam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = cam.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x;
    e[6] = clip.y;
    e[10] = clip.z + 1;
    e[14] = clip.w;
    const was = r.getRenderTarget(),
      shadows = r.shadowMap.autoUpdate;
    water.visible = false;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(rt);
    r.state.buffers.depth.setMask(true);
    r.clear();
    r.render(sc, cam);
    r.setRenderTarget(was);
    r.shadowMap.autoUpdate = shadows;
    water.visible = true;
  };
}

/* ================= morning mist ================= */
// in autumn, soft banks of mist lying low on the sea from first light, burning off a couple of hours after sunrise
function buildMist() {
  const mr = makeRng(6151),
    banks = [];
  const mistM = fxMat(puffTex, { color: "#e9eef2" });
  for (let k = 0; k < 46; k++) {
    const a = mr() * Math.PI * 2,
      r = coastAt(a) + 5 + mr() * 50,
      sp = new THREE.Sprite(mistM);
    sp.position.set(Math.cos(a) * r, 0.6 + mr() * 2.2, Math.sin(a) * r);
    sp.scale.set(26 + mr() * 30, 3 + mr() * 3, 1);
    sp.userData = { a, r, sp: 0.004 + mr() * 0.006 };
    sp.visible = false;
    scene.add(sp);
    banks.push(sp);
  }
  // the sprites are unlit, so the mist takes the colour of the haze: dark before dawn, rosy at sunrise, pale by day
  const warm = new THREE.Color("#ffd9b8"),
    white = new THREE.Color("#eef2f5");
  let autumn = false;
  onSeason(({ au }) => (autumn = au));
  onTime(({ hour, sunrise: r, rain, dusk, night, dl }) => {
    const m = autumn ? between(r - 1, r - 0.4, r + 1.4, r + 2.6, hour) * (1 - rain) : 0;
    mistM.opacity = m * (0.55 - night * 0.25);
    mistM.color
      .copy(scene.fog.color)
      .lerp(white, 0.5 * dl)
      .lerp(warm, dusk * 0.35 * (1 - night));
    banks.forEach((b) => (b.visible = m > 0.01));
  });
  onFrame((dt) => {
    if (reduce || !banks[0].visible) return;
    banks.forEach((b) => {
      const u = b.userData;
      u.a += (dt * u.sp) / 10;
      b.position.x = Math.cos(u.a) * u.r;
      b.position.z = Math.sin(u.a) * u.r;
    });
  });
}
