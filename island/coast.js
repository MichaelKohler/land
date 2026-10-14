// Around the coast: distant islands on the horizon, the lighthouse with its turning beam, the pier,
// a rowing boat moored to it and a sailing boat circling the island.
import * as THREE from "three";
import { makeRng, WIND, reduce, smooth, scene, state, addInfo, onTime, onFrame } from "./core.js";
import { PIER_A, pierBase, lightPos, heightAt } from "./world.js";
import { S, shadow, canvasTex, tiles, mPlaster, mWood, mDark, mGlass } from "./materials.js";
import { gableRoof } from "./building.js";
import { makeBoat } from "./boats.js";

export function buildCoast() {
  distantIslands();
  lighthouse();
  pierAndBoats();
}

/* ================= distant islands on the horizon, so the sea does not go on forever ================= */
function distantIslands() {
  const r2 = makeRng(9173);
  const farM = S({ vertexColors: true, roughness: 1, envMapIntensity: 0.2 }),
    c = new THREE.Color(),
    cG = new THREE.Color("#4f6b45"),
    cR = new THREE.Color("#6d7468");
  // far away but a little less hazy than the fog would make them, so they stay visible
  farM.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <fog_fragment>",
      "#ifdef USE_FOG\n float fd = vFogDepth * 0.18;\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 1.0 - exp(-fogDensity * fogDensity * fd * fd));\n#endif",
    );
  };
  // [angle, distance, length, depth, height]
  [
    [0.35, 1350, 220, 78, 38],
    [1.25, 1420, 145, 58, 26],
    [2.3, 1320, 180, 70, 46],
    [3.55, 1440, 260, 90, 34],
    [4.6, 1380, 120, 52, 21],
    [5.5, 1400, 170, 65, 34],
  ].forEach(([a, dist, w, d, h]) => {
    const geo = new THREE.PlaneGeometry(w, d, 72, 24);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position,
      col = [],
      ph = [r2() * 6.28, r2() * 6.28, r2() * 6.28];
    for (let i = 0; i < pos.count; i++) {
      // a rounded hump with a few ridges, dipping under the water at its edge
      const x = pos.getX(i) / (w / 2),
        z = pos.getZ(i) / (d / 2),
        e = Math.max(0, 1 - x * x - z * z);
      const bumps =
        0.65 +
        0.2 * Math.sin(x * 3.1 + ph[0]) +
        0.15 * Math.sin(x * 7.3 + z * 2 + ph[1]) +
        0.08 * Math.sin(x * 17 + z * 5 + ph[2]);
      const y = h * Math.pow(e, 0.9) * bumps - 3 * (1 - Math.min(1, e * 8));
      pos.setY(i, y);
      c.set("#c9b98f")
        .lerp(cG, smooth(0.02, 0.12, y / h))
        .lerp(cR, smooth(0.5, 0.9, y / h) * 0.6);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const isle = new THREE.Mesh(geo, farM);
    isle.position.set(Math.cos(a) * dist, 0, Math.sin(a) * dist);
    isle.rotation.y = -a - Math.PI / 2 + (r2() - 0.5) * 0.5;
    scene.add(isle);
  });
}

/* ================= lighthouse ================= */
function lighthouse() {
  const lh = new THREE.Group();
  const hhmm = (h) =>
    `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
  addInfo(lh, 2.2, 5, "Lighthouse", () =>
    state.weather.lights > 0.3
      ? "Its lamp is lit, and the beam sweeps the sea until dawn"
      : `Its lamp comes on at dusk; the sun sets at ${hhmm(state.sun.set)} today`,
  );
  const bandTex = canvasTex(64, 256, (x, w, h) => {
    for (let k = 0; k < 6; k++) {
      x.fillStyle = k % 2 ? "#c8352b" : "#f5f2ea";
      x.fillRect(0, (k * h) / 6, w, h / 6 + 1);
    }
  });
  const tower = shadow(
    new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 9, 24), S({ map: bandTex, roughness: 0.6 })),
  );
  tower.position.y = 4.5;
  const gallery = shadow(new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.18, 24), mDark));
  gallery.position.y = 9.1;
  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.75, 1.3, 12),
    new THREE.MeshStandardMaterial({
      color: "#fff6d8",
      emissive: "#ffd27a",
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.85,
    }),
  );
  lantern.position.y = 9.85;
  const dome = shadow(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      S({ color: "#c8352b", roughness: 0.5 }),
    ),
  );
  dome.position.y = 10.5;
  const hut = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 2.2), mPlaster));
  hut.position.set(-2.2, 0.9, 0);
  const hutRoof = shadow(new THREE.Mesh(gableRoof(2.2, 0.9, 3.0, 0.2), S({ map: tiles("#8a3b2c") })));
  hutRoof.rotation.y = Math.PI / 2;
  hutRoof.position.set(-2.2, 1.8, 0);
  // the beam fades out along its length
  const beamFade = canvasTex(4, 128, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, "#555555");
    g.addColorStop(1, "#000000");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
  beamFade.colorSpace = THREE.NoColorSpace;
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(2.4, 30, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: "#fff2c4",
      alphaMap: beamFade,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.set(15, 0, 0);
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 9.85;
  beamPivot.add(beam);
  lh.add(tower, gallery, lantern, dome, hut, hutRoof, beamPivot);
  // gallery railing, a door and small windows up the tower, a door and window on the keeper's hut
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2,
      post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 5), mDark);
    post.position.set(Math.cos(a) * 1.38, 9.45, Math.sin(a) * 1.38);
    lh.add(post);
  }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(1.38, 0.03, 6, 48), mDark);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 9.72;
  lh.add(rail);
  const lhDoor = shadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.15, 0.12), S({ color: "#4a3426", roughness: 0.7 })),
  );
  lhDoor.position.set(0, 0.62, 1.45);
  lhDoor.rotation.x = -0.05;
  lh.add(lhDoor);
  [
    [4.0, 0.6],
    [6.4, 2.6],
    [8.0, 4.4],
  ].forEach(([y, a]) => {
    const r = 1.5 - (y / 9) * 0.5 + 0.02,
      w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.46, 0.08), mGlass);
    w.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
    w.rotation.y = a;
    lh.add(w);
  });
  const hutDoor = shadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.06), S({ color: "#5a3d2b", roughness: 0.7 })),
  );
  hutDoor.position.set(-2.6, 0.6, 1.12);
  lh.add(hutDoor);
  const hutWin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.6), mGlass);
  hutWin.position.set(-3.52, 1.05, 0);
  lh.add(hutWin);
  lh.position.set(lightPos[0], heightAt(lightPos[0], lightPos[1]) - 0.1, lightPos[1]);
  scene.add(lh);
  // the lamp glows when the lights come on; the beam only sweeps in the dark
  onTime((L) => {
    lantern.material.emissiveIntensity = 0.2 + L.lightsOn * 3;
    beam.material.opacity = L.dark * 0.35;
  });
  onFrame((dt, t, tt) => (beamPivot.rotation.y = tt * 0.8 + 0.5));
}

/* ================= pier and boats ================= */
function pierAndBoats() {
  const rnd = makeRng(71);
  const pier = new THREE.Group();
  for (let k = 0; k < 22; k++) {
    const pl = shadow(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.42), mWood));
    pl.position.set(0, 0.9, k * 0.46);
    pl.rotation.y = (rnd() - 0.5) * 0.03;
    pier.add(pl);
    if (k % 4 === 0)
      [-1.0, 1.0].forEach((x) => {
        const pole = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 3.4, 8), mDark));
        pole.position.set(x, -0.6, k * 0.46);
        pier.add(pole);
      });
  }
  pier.position.set(pierBase[0], 0, pierBase[1]);
  pier.lookAt(Math.cos(PIER_A) * 80, 0, Math.sin(PIER_A) * 80);
  scene.add(pier);
  pier.updateMatrixWorld();

  // a rowing boat tied up a little way out from the end of the pier
  const moored = makeBoat("#f2efe6", null, 1.1);
  const tideNow = () =>
    state.tide > 0.12
      ? "high tide"
      : state.tide < -0.12
        ? "low tide"
        : state.tideRising
          ? "the tide is coming in"
          : "the tide is going out";
  addInfo(moored, 1.4, 0.4, "Rowing boat", () => `Tied up off the end of the pier; ${tideNow()}`);
  const pierEnd = pier.localToWorld(new THREE.Vector3(0, 0, 9.5));
  moored.position.set(
    pierEnd.x + Math.cos(PIER_A + Math.PI / 2) * 3.4 - Math.cos(PIER_A) * 1.5,
    0,
    pierEnd.z + Math.sin(PIER_A + Math.PI / 2) * 3.4 - Math.sin(PIER_A) * 1.5,
  );
  moored.rotation.y = -PIER_A + Math.PI / 2 + 0.18;
  // a mooring line from the bow ring to the nearest pier post
  moored.updateMatrixWorld();
  const bow = moored.localToWorld(new THREE.Vector3(0, 0.56, 1.58));
  const post = [-1, 1]
    .map((x) => pier.localToWorld(new THREE.Vector3(x, 1.05, 9.2)))
    .sort((a, b) => a.distanceTo(bow) - b.distanceTo(bow))[0];
  const mid = bow.clone().lerp(post, 0.5);
  mid.y = Math.max(0.08, Math.min(bow.y, post.y) - 0.45);
  scene.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([bow, mid, post]), 24, 0.025, 5),
      S({ color: "#c9b48a", roughness: 0.9 }),
    ),
  );

  // a sailing boat on a wide circle around the island
  const sailer = makeBoat("#2b4c6f", "#fbf7ee", 1.3);
  // where the wind comes from, as a compass point (WIND is where it blows to)
  const windFrom = () =>
    ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][
      Math.round((((Math.atan2(-WIND.x, -WIND.z) * 180) / Math.PI + 360) % 360) / 45) % 8
    ];
  addInfo(sailer, 2.2, 1.5, "Sailing boat", () => `Sailing round the island, with the wind from the ${windFrom()}`);
  const { rig, jib, pen } = sailer.userData.sails,
    up = new THREE.Vector3(0, 1, 0),
    wl = new THREE.Vector3();
  let side = 1;
  onFrame((dt, t, tt) => {
    const ba = tt * 0.018 + 0.6,
      rough = 1 + state.weather.rain * 2.5;
    sailer.position.set(Math.cos(ba) * 48, state.tide + Math.sin(tt * 1.2) * 0.12 * rough, Math.sin(ba) * 48);
    // the sails go out on the side the wind blows towards, swinging across when the course turns through it;
    // the pennant streams downwind
    wl.set(WIND.x, 0, WIND.z).applyAxisAngle(up, ba);
    side += (Math.sign(wl.x || 1) - side) * Math.min(1, (reduce ? 1 : dt) * 1.5);
    rig.rotation.y = -0.28 * side;
    jib.scale.x = (side < 0 ? -1 : 1) * Math.max(0.15, Math.abs(side));
    pen.rotation.y = Math.atan2(-wl.x, -wl.z);
    // bow (+z) points along the course; she heels to the side her sails are let out to; both boats roll more in the rain
    sailer.rotation.set(Math.sin(tt * 0.9) * 0.04 * rough, -ba, Math.sin(tt * 1.1) * 0.07 * rough - 0.1 * side);
    moored.position.y = state.tide + Math.sin(tt * 1.4) * 0.06 * rough;
    moored.rotation.set(
      Math.sin(tt * 0.8 + 1) * 0.025 * (rough - 1),
      moored.rotation.y,
      Math.sin(tt * 1.1) * 0.04 * rough,
    );
  });
}
