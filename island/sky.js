// The sky and its light: the physical sky, the sun and sky light, the environment map, a clear blue dome on
// sunny days, a grey cloud deck in the rain, the moon in today's phase, drifting clouds, the stars with the odd
// shooting star, and a rainbow after a shower. Also the daylight reaction to the time.
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import {
  NOW,
  NEW_MOON,
  params,
  WIND,
  narrow,
  reduce,
  makeRng,
  smooth,
  addFx,
  renderer,
  scene,
  camera,
  bloom,
  onTime,
  onFrame,
} from "./core.js";
import { GLSL_NOISE } from "./world.js";

export const sunDir = new THREE.Vector3();
export const moonDir = new THREE.Vector3();
// the moon's phase from the date (0 new, 0.5 full; ?moon=0.5 picks one), and how much of it is lit: 0 to 1
const SYNODIC = 29.530588853,
  moonQ = parseFloat(params.get("moon"));
const realPhase = moonQ >= 0 ? moonQ % 1 : ((((NOW - NEW_MOON) / 864e5 / SYNODIC) % 1) + 1) % 1;
// around new moon it would all but vanish, so it never gets thinner than a clear crescent
const phase = Math.min(0.85, Math.max(0.15, realPhase));
export const moonLit = (1 - Math.cos(phase * Math.PI * 2)) / 2;
export let sun;
let sky,
  sU,
  hemi,
  envSky,
  envScene,
  pmrem,
  envRT = null,
  envDirty = true,
  lastEnv = 0;

export function updateEnv() {
  Object.keys(sU).forEach((k) => {
    if (envSky.material.uniforms[k]) envSky.material.uniforms[k].value = sU[k].value;
  });
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene);
  scene.environment = envRT.texture;
}

// the physical sky draws the sun's disc very bright, which the bloom spreads into a large blob when the sun is in
// view; a fraction of it still reads as the sun, and stays small
const dimSunDisc = (s) =>
  (s.material.fragmentShader = s.material.fragmentShader.replace("vSunE * 19000.0 * Fex", "vSunE * 1600.0 * Fex"));

export function initSky() {
  sky = new Sky();
  dimSunDisc(sky);
  sky.scale.setScalar(3000);
  scene.add(sky);
  sU = sky.material.uniforms;
  sU.turbidity.value = 6;
  sU.rayleigh.value = 1.6;
  sU.mieCoefficient.value = 0.004;
  sU.mieDirectionalG.value = 0.82;
  sun = new THREE.DirectionalLight("#fff4e0", 3);
  sun.castShadow = true;
  const shadowRes = narrow() ? 2048 : 4096;
  sun.shadow.mapSize.set(shadowRes, shadowRes);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 220 });
  scene.add(sun, sun.target);
  hemi = new THREE.HemisphereLight("#cfe6ff", "#5b6b3a", 0.6);
  scene.add(hemi);
  // image-based light from a second, smaller copy of the sky
  pmrem = new THREE.PMREMGenerator(renderer);
  envScene = new THREE.Scene();
  envSky = new Sky();
  dimSunDisc(envSky);
  envSky.scale.setScalar(1000);
  envScene.add(envSky);

  // a grey cloud deck that closes over the sky while it rains
  const overcast = new THREE.Mesh(
    new THREE.SphereGeometry(1800, 32, 16),
    new THREE.MeshBasicMaterial({
      color: "#8c979f",
      side: THREE.BackSide,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    }),
  );
  // both domes draw before the water so it never shows them through its edge
  overcast.visible = false;
  overcast.renderOrder = -10;
  scene.add(overcast);
  // a clear blue dome laid over the physical sky on sunny days, fading out at dawn, dusk and in the rain; navy at night
  const blueSky = new THREE.Mesh(
    new THREE.SphereGeometry(1700, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: sunDir },
        uOp: { value: 0 },
        uDisc: { value: new THREE.Color(1, 0.92, 0.8) },
        uTop: { value: new THREE.Color("#2d74c4") },
        uHor: { value: new THREE.Color("#a9cdea") },
        uBright: { value: 2.4 },
      },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uSun, uTop, uHor, uDisc; uniform float uOp, uBright; varying vec3 vD;
      void main(){
        vec3 c = mix(uHor, uTop, pow(clamp(vD.y, 0.0, 1.0), 0.35));
        float s = max(dot(vD, normalize(uSun)), 0.0);
        c += uDisc * (smoothstep(0.99985, 0.99996, s) * 2.5 + pow(s, 16.0) * 0.12);
        gl_FragColor = vec4(c * uBright, uOp);
      }`,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    }),
  );
  blueSky.renderOrder = -11;
  blueSky.frustumCulled = false;
  scene.add(blueSky);
  // sunset and twilight, laid over both: deep orange along the horizon under the sun turning gold higher up; once it has gone down, the glow reddens and sinks while a pink band (the Belt of Venus) rises
  // opposite above the blue-grey shadow of the earth
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1650, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sunDir }, uGold: { value: 0 }, uTwi: { value: 0 } },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uSun; uniform float uGold, uTwi; varying vec3 vD;
      // laid over the sky as colour (premultiplied), so it tints it rather than only brightening it
      vec4 over(vec4 base, vec3 c, float a){ return vec4(base.rgb * (1.0 - a) + c * a, base.a + a * (1.0 - base.a)); }
      void main(){
        float h = vD.y, up = max(h, 0.0);
        vec2 sa = normalize(uSun.xz + 1e-5), da = normalize(vD.xz + 1e-5);
        float toward = dot(da, sa), side = smoothstep(-0.3, 1.0, toward), away = smoothstep(0.1, -1.0, toward);
        float above = smoothstep(-0.04, 0.02, h);
        vec4 o = vec4(0.0);
        // at sunset this paints its own sky over the physical one, at moderate brightness: very bright colours would
        // come out of the tone mapping washed towards white
        // golden hour: deep orange and gold low under the sun, pinker further round, peach above, soft blue higher up
        vec3 low = mix(vec3(0.95, 0.52, 0.5), vec3(1.3, 0.6, 0.2), smoothstep(-0.3, 1.0, toward));
        vec3 mid = mix(vec3(0.92, 0.7, 0.66), vec3(1.25, 0.84, 0.5), smoothstep(0.2, 1.0, toward));
        vec3 c = mix(mix(low, mid, smoothstep(0.0, 0.12, up)), vec3(0.42, 0.56, 0.86), smoothstep(0.1, 0.55, up));
        o = over(o, c, (0.92 - 0.3 * smoothstep(0.0, 0.7, up)) * uGold);
        // twilight: red where it set, the pink belt low in the opposite sky, deepening blue above
        vec3 tl = mix(vec3(0.42, 0.3, 0.48), vec3(1.0, 0.36, 0.16), smoothstep(-0.2, 1.0, toward));
        vec3 tc = mix(tl, vec3(0.13, 0.17, 0.38), smoothstep(0.03, 0.4, up));
        tc = mix(tc, vec3(0.85, 0.5, 0.62), exp(-pow((up - 0.12) / 0.06, 2.0)) * away * 0.8);
        o = over(o, tc, 0.9 * uTwi);
        // the low sun itself: a small golden disc with a tight corona, no wide glare
        float s = max(dot(vD, normalize(uSun)), 0.0);
        o = over(o, vec3(1.0, 0.68, 0.3) * 2.6, smoothstep(0.99986, 0.99994, s) * uGold);
        o.rgb += vec3(1.0, 0.6, 0.28) * (pow(s, 900.0) * 0.5 + pow(s, 140.0) * 0.18) * uGold;
        gl_FragColor = o * above;
      }`,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  glow.renderOrder = -10.5;
  glow.frustumCulled = false;
  scene.add(glow);

  // the moon: a pale disc with darker seas and craters in today's phase, and a soft glow round it, crossing the sky
  // from the evening to the early morning. Drawn by a shader on a square that always faces the camera, so it needs no
  // canvas (browsers that resist fingerprinting scramble pixels read back from one)
  const MOON = 220,
    DISC = 29.5 / 110; // the square's size, and the disc's radius as a part of its half-width
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(MOON, MOON),
    new THREE.ShaderMaterial({
      uniforms: {
        uOp: { value: 0 },
        uGlow: { value: 0 },
        uLight: { value: new THREE.Vector3(Math.sin(phase * Math.PI * 2), 0, -Math.cos(phase * Math.PI * 2)) },
      },
      vertexShader: `varying vec2 vQ; void main(){ vQ = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uOp, uGlow; uniform vec3 uLight; varying vec2 vQ;
      ${GLSL_NOISE}
      // a dark sea: a soft, ragged-edged ellipse
      float mare(vec2 p, vec2 c, float s){ return smoothstep(1.0, 0.65, length((p - c) / vec2(s, s * 0.8)) + (vn(p * 6.0 + c * 9.0) - 0.5) * 0.45); }
      void main(){
        float R = ${DISC.toFixed(4)}, g = pow(max(0.0, 1.0 - length(vQ)), 2.2);
        vec3 glow = vec3(0.62, 0.71, 1.0) * g * uGlow;
        vec2 p = vQ / R; float r = length(p);
        if (r >= 1.0) { gl_FragColor = vec4(glow, 0.0); return; }
        float z = sqrt(1.0 - r * r);
        // pale grey-white, a touch lighter towards the top left, mottled, with the seas and scattered craters
        vec3 alb = mix(vec3(0.98, 0.97, 0.93), vec3(0.84, 0.82, 0.76), smoothstep(0.0, 1.6, length(p - vec2(-0.3, 0.3))));
        alb *= 0.9 + 0.2 * fb(p * 4.0 + 3.0);
        float m = max(max(mare(p, vec2(-0.26, 0.30), 0.43), mare(p, vec2(0.17, 0.13), 0.33)), max(mare(p, vec2(-0.07, -0.26), 0.37), max(mare(p, vec2(0.35, -0.35), 0.22), mare(p, vec2(-0.43, -0.18), 0.2))));
        alb = mix(alb, vec3(0.5, 0.52, 0.57), m * 0.5);
        vec2 cp = p * 6.0, ci = floor(cp), cf = fract(cp) - 0.5;
        if (h21(ci + 9.9) > 0.5) {
          float cr = 0.1 + 0.2 * h21(ci + 3.1), d = length(cf - (vec2(h21(ci), h21(ci + 7.3)) - 0.5) * 0.5);
          alb *= (1.0 - 0.16 * smoothstep(cr, cr * 0.5, d)) * (1.0 + 0.14 * smoothstep(cr * 0.3, 0.0, abs(d - cr)));
        }
        alb *= 0.82 + 0.18 * z; // a little darker towards the edge
        // today's phase: lit from the right while it waxes, from the left while it wanes; the dark part keeps a faint
        // earthshine
        float lit = smoothstep(-0.04, 0.04, dot(vec3(p, z), uLight));
        vec3 c = alb * vec3(0.3 + 0.7 * lit, 0.32 + 0.68 * lit, 0.4 + 0.6 * lit);
        float a = smoothstep(1.0, 0.97, r) * (0.12 + 0.88 * lit) * uOp;
        // premultiplied: the disc over the glow
        gl_FragColor = vec4(c * a + glow * (1.0 - a), a);
      }`,
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  moon.frustumCulled = false;
  moon.visible = false;
  // drawn after both domes, in front of the stars
  moon.renderOrder = -9;
  scene.add(moon);
  onFrame(() => moon.visible && moon.quaternion.copy(camera.quaternion));

  const fogDay = new THREE.Color("#b9d4e6"),
    fogNight = new THREE.Color("#141d36"),
    fogDusk = new THREE.Color("#f2b48a");
  const fogRain = {
    night: new THREE.Color("#1a2230"),
    winter: new THREE.Color("#c9d2da"),
    other: new THREE.Color("#9aa5ad"),
  };
  const sunsetFog = new THREE.Color("#b8764f"),
    lowSun = new THREE.Color(1, 0.55, 0.25),
    navyTop = new THREE.Color("#060d22"),
    navyHor = new THREE.Color("#18233f");
  onTime((L) => {
    // grey: rain, or a sky closed over by heavy cloud; lighter cloud only takes the edge off the sun
    const { dl, dusk, night, wi } = L,
      rain = L.grey;
    // the sun: warm and low at dawn and dusk, white at noon; a faint blue moonlight at night
    sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - L.elev), THREE.MathUtils.degToRad(L.az));
    sU.sunPosition.value.copy(sunDir);
    sun.position
      .copy(sunDir)
      .multiplyScalar(L.elev > -2 ? 90 : -90)
      .setY(Math.max(8, sunDir.y * 90));
    sun.color.setHSL(0.07 + dl * 0.05, 0.95 - dl * 0.55, 0.62 + dl * 0.28);
    sun.intensity =
      night > 0.9 ? 0.25 * (0.3 + 0.7 * moonLit) * (0.35 + 0.65 * L.clear) : (0.9 + dl * 2.6) * (1 - night);
    // the moon moves across the sky from five in the evening to seven in the morning. It stays low, where the view
    // can see it, while its light comes from higher on the same bearing, so shadows point away from it
    const mT = ((L.hour + 7) % 24) / 14,
      arc = Math.sin(Math.PI * Math.min(1, mT)),
      moonAz = THREE.MathUtils.degToRad(160 + mT * 160);
    moonDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 2 - arc * 3.5), moonAz);
    moon.position.copy(moonDir).multiplyScalar(1400);
    const mu = moon.material.uniforms;
    mu.uOp.value = night * L.clear;
    mu.uGlow.value = night * L.clear * 0.35 * (0.2 + 0.8 * moonLit);
    moon.visible = mu.uOp.value > 0.005;
    if (night > 0.5) {
      sun.color.set("#9fb4ff");
      sun.position.setFromSphericalCoords(90, THREE.MathUtils.degToRad(90 - 25 - arc * 25), moonAz);
    }
    hemi.intensity = 0.2 + dl * 0.45 + (1 - night) * 0.1;
    hemi.color.set(night > 0.5 ? "#6b7fb3" : "#cfe6ff");
    renderer.toneMappingExposure = 0.5 - 0.08 * L.lowSun + night * 0.25;
    // the haze dims with the daylight, so the low sun does not wash the island out in a pale glow, and takes the warm
    // colour of the sunset horizon (the far sea fades into it)
    scene.fog.color
      .copy(night > 0.5 ? fogNight : fogDay)
      .lerp(fogDusk, dusk * 0.5 * (1 - night))
      .multiplyScalar(night > 0.5 ? 1 : 0.45 + 0.55 * smooth(0, 14, L.elev));
    scene.fog.color.lerp(sunsetFog, L.gold * 0.8);
    sU.rayleigh.value = 1.6 + dusk * 1.2;
    // the glow round lamps and windows grows with the night; while the sun is still up the bloom stays faint, or the
    // bright sky round a low sun spreads a milky veil over everything
    bloom.strength = 0.06 + night * 0.6;
    bloom.threshold = 0.95 - night * 0.4;
    // rain dims the light, thickens the haze and closes the cloud deck
    sun.intensity *= (1 - rain * 0.75) * (1 - L.cloud * 0.3);
    hemi.intensity *= 1 - rain * 0.25;
    renderer.toneMappingExposure *= 1 - rain * 0.1;
    scene.fog.color.lerp(night > 0.5 ? fogRain.night : wi ? fogRain.winter : fogRain.other, rain * 0.85);
    scene.fog.density = 0.0032 + rain * 0.005;
    // less haze glare round the sun as it gets low (the physical sky makes a wide, blinding glow there otherwise)
    sU.turbidity.value = 6 - 3.5 * smooth(20, 2, L.elev) + rain * 14;
    sU.mieCoefficient.value = 0.004 * (1 - 0.8 * smooth(20, 2, L.elev)) + rain * 0.02;
    sU.rayleigh.value *= 1 - rain * 0.6;
    overcast.visible = rain > 0.01;
    overcast.material.opacity = rain * 0.9;
    overcast.material.color.set(night > 0.5 ? "#151b27" : wi ? "#b9c2ca" : "#8c979f");
    // the low sun is dimmer and redder through the thick air near the horizon
    blueSky.material.uniforms.uDisc.value
      .setRGB(1, 0.92, 0.8)
      .lerp(lowSun, smooth(25, 2, L.elev))
      .multiplyScalar(0.3 + 0.7 * smooth(2, 25, L.elev));
    // sunset: golden hour while the sun is low, then the twilight colours until it is well down; clear skies only
    glow.material.uniforms.uGold.value = L.gold;
    glow.material.uniforms.uTwi.value = L.twi;
    glow.visible = glow.material.uniforms.uGold.value + glow.material.uniforms.uTwi.value > 0.01;
    // blue sky in sunshine, navy at night
    const bu = blueSky.material.uniforms;
    bu.uOp.value = Math.max(Math.pow(dl, 1.5) * (1 - rain), night * 0.92);
    bu.uTop.value.set(wi ? "#4a84c2" : "#1d61b6").lerp(navyTop, night);
    bu.uHor.value.set(wi ? "#b4cfe6" : "#97c2e8").lerp(navyHor, night);
    bu.uBright.value = 2.4 - night * 1.4;
    envDirty = true;
  });
  // rebuilding the environment map is costly, so at most four times a second while the time slider moves
  onFrame((dt, t) => {
    if (envDirty && t - lastEnv > 0.25) {
      updateEnv();
      envDirty = false;
      lastEnv = t;
    }
  });
}

/* ================= clouds ================= */
// fair-weather clouds painted on a dome: noise projected onto a flat deck overhead, so they shrink and crowd together
// towards the horizon as real ones do; lit on the sun's side and greyer underneath, more of them as the weather closes
// in, coloured by the sunset, drifting with the wind
export function buildClouds() {
  const U = {
    uSun: { value: sunDir },
    uTime: { value: 0 },
    uCover: { value: 0.3 },
    uLit: { value: new THREE.Color() },
    uShade: { value: new THREE.Color() },
    uWind: { value: new THREE.Vector2() },
    uOp: { value: 1 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1600, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uSun, uLit, uShade; uniform float uTime, uCover, uOp; uniform vec2 uWind; varying vec3 vD;
      ${GLSL_NOISE}
      float dens(vec2 p){ return clamp((fb(p * 0.32) - (1.0 - uCover) * 0.75 - 0.05) * 3.2, 0.0, 1.0); }
      void main(){
        if (vD.y < 0.005) discard;
        // where this ray meets the deck
        vec2 p = vD.xz / (vD.y + 0.06) * 1.6 + uWind * uTime * 0.01;
        float d = dens(p);
        if (d <= 0.001) discard;
        // lit where the cloud thins towards the sun, with a bright rim round the sun itself
        float lit = clamp(0.5 + (d - dens(p + normalize(uSun.xz + 1e-4) * 0.25)) * 2.0, 0.0, 1.0);
        float sunward = pow(max(dot(vD, normalize(uSun)), 0.0), 6.0);
        vec3 c = mix(uShade, uLit, lit * 0.8 + 0.2) + uLit * sunward * 0.6 * (1.0 - d);
        // fading into the haze low down
        float a = d * smoothstep(0.005, 0.12, vD.y) * uOp;
        gl_FragColor = vec4(c * a, a);
      }`,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  // over the blue sky and the sunset glow, under the grey rain deck
  dome.renderOrder = -10.2;
  dome.frustumCulled = false;
  scene.add(dome);
  // the colour of the light: white by day, gold then pink at sunset, dark blue-grey at night
  const white = new THREE.Color(1.6, 1.6, 1.62),
    shade = new THREE.Color(0.62, 0.66, 0.74),
    warm = new THREE.Color(1.5, 0.85, 0.5),
    warmShade = new THREE.Color(0.5, 0.36, 0.38);
  const pink = new THREE.Color(0.95, 0.5, 0.55),
    pinkShade = new THREE.Color(0.26, 0.22, 0.34),
    dark = new THREE.Color(0.05, 0.06, 0.09),
    darkShade = new THREE.Color(0.02, 0.025, 0.04);
  onTime(({ night, grey, cloud, rain, gold, twi }) => {
    U.uLit.value
      .copy(white)
      .lerp(warm, gold * 0.9)
      .lerp(pink, twi * 0.8)
      .lerp(dark, night)
      .multiplyScalar(1 - grey * 0.45);
    U.uShade.value
      .copy(shade)
      .lerp(warmShade, gold * 0.8)
      .lerp(pinkShade, twi * 0.8)
      .lerp(darkShade, night)
      .multiplyScalar(1 - grey * 0.3);
    U.uCover.value = Math.min(0.95, 0.32 + cloud * 0.55 + rain * 0.5);
    U.uOp.value = 1 - night * 0.6;
  });
  onFrame((dt, t, tt) => {
    U.uTime.value = tt;
    U.uWind.value.set(WIND.x, WIND.z);
  });
}

/* ================= stars ================= */
export function buildStars() {
  const rnd = makeRng(23);
  const starGeo = new THREE.BufferGeometry(),
    sv = [];
  for (let k = 0; k < 2500; k++) {
    const a = rnd() * 6.28,
      e = Math.asin(rnd());
    sv.push(Math.cos(a) * Math.cos(e) * 1500, Math.sin(e) * 1500, Math.sin(a) * Math.cos(e) * 1500);
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sv, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: "#ffffff",
      size: 1.5,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    }),
  );
  scene.add(stars);
  // hidden by cloud as well as by daylight
  onTime(({ night, clear }) => (stars.material.opacity = night * clear));
}

/* ================= shooting stars ================= */
// now and then on a clear night a streak runs down the sky, low enough to be seen from the island
export function buildShootingStars() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute([1, 1, 1, 0, 0, 0], 3));
  const streak = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  streak.renderOrder = -9;
  addFx(streak);
  let clear = 0,
    wait = 3,
    life = 1;
  const from = new THREE.Vector3(),
    dir = new THREE.Vector3(),
    head = new THREE.Vector3(),
    tail = new THREE.Vector3();
  onTime((L) => (clear = L.night > 0.8 && L.clear > 0.95 ? 1 : 0));
  onFrame((dt) => {
    if (reduce || !clear) {
      streak.visible = false;
      return;
    }
    if (life < 1) {
      life += dt / 0.8;
      head.copy(from).addScaledVector(dir, life * 160);
      tail.copy(head).addScaledVector(dir, -Math.min(life, 0.4) * 160);
      const p = geo.attributes.position.array;
      head.toArray(p, 0);
      tail.toArray(p, 3);
      geo.attributes.position.needsUpdate = true;
      streak.material.opacity = Math.sin(Math.min(1, life) * Math.PI);
      streak.visible = life < 1;
      return;
    }
    if ((wait -= dt) > 0) return;
    // a new one somewhere on the horizon, 6 to 11 degrees up, falling at a slant
    wait = 5 + Math.random() * 12;
    life = 0;
    from.setFromSphericalCoords(1300, THREE.MathUtils.degToRad(79 - Math.random() * 5), Math.random() * Math.PI * 2);
    const side = new THREE.Vector3(-from.z, 0, from.x).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    dir
      .copy(side)
      .add(new THREE.Vector3(0, -0.45 - Math.random() * 0.3, 0))
      .normalize();
  });
}

/* ================= rainbow ================= */
// when a shower has just passed and the sun comes out, a rainbow stands over the sea on the side away from the sun
export function buildRainbow() {
  const R = 420,
    W = 26;
  const bow = new THREE.Mesh(
    new THREE.RingGeometry(R - W, R, 128, 1, 0, Math.PI),
    new THREE.ShaderMaterial({
      uniforms: { uOp: { value: 0 }, uR: { value: R }, uW: { value: W } },
      vertexShader: `varying vec2 vP; varying float vY; void main(){ vP = position.xy; vY = (modelMatrix * vec4(position, 1.0)).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uOp, uR, uW; varying vec2 vP; varying float vY;
      void main(){
        if (vY < 0.0) discard;
        float t = (uR - length(vP)) / uW;
        // red outside, violet inside, soft at both edges and fading into the sea
        vec3 c = clamp(vec3(1.5 - abs(t - 0.1) * 4.0, 1.5 - abs(t - 0.45) * 4.0, 1.5 - abs(t - 0.82) * 4.0), 0.0, 1.0);
        float a = smoothstep(0.0, 0.15, t) * smoothstep(1.0, 0.8, t) * smoothstep(0.0, 60.0, vY);
        gl_FragColor = vec4(c, a * uOp);
      }`,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    }),
  );
  bow.renderOrder = -9;
  bow.visible = false;
  scene.add(bow);
  onTime(({ az, afterRain }) => {
    const op = smooth(0.2, 0.7, afterRain);
    bow.visible = op > 0.01;
    bow.material.uniforms.uOp.value = op * 0.45;
    // stands 900 out, opposite the sun, its top about nine degrees above the horizon
    const a = THREE.MathUtils.degToRad(az + 180);
    bow.position.set(Math.sin(a) * 900, 150 - R, Math.cos(a) * 900);
    bow.lookAt(0, bow.position.y, 0);
  });
}
