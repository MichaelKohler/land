// Footprints in the snow: Sally leaves a trail of paw prints wherever she walks on snowy ground. They slowly fade,
// and fresh snowfall fills them in quickly. (The hedgehog sleeps through the winter, so it is hers alone.)
import * as THREE from "three";
import { smooth, scene, state, onFrame } from "./core.js";
import { heightAt } from "./world.js";
import { cat, frontPaws } from "./cat.js";

export function buildTracks() {
  const N = 240,
    LIFE = 150; // prints kept at most, seconds each one lasts
  // her front paws: ahead of her middle and either side of it
  const PAW_AHEAD = frontPaws.ahead,
    PAW_SIDE = frontPaws.side;
  const geo = new THREE.CircleGeometry(0.024, 10).rotateX(-Math.PI / 2).scale(1, 1, 1.35);
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  geo.setAttribute("aFade", fade);
  // lit, so the prints darken with the snow at night; each one has its own fade
  const mat = new THREE.MeshLambertMaterial({
    color: "#7f8ea6",
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFade; varying float vFade;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = aFade;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFade;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vFade;");
  };
  const prints = new THREE.InstancedMesh(geo, mat, N);
  prints.count = 0;
  prints.frustumCulled = false;
  prints.visible = false;
  scene.add(prints);

  const life = new Float32Array(N),
    last = new THREE.Vector3(),
    p = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    m = new THREE.Matrix4();
  const one = new THREE.Vector3(1, 1, 1),
    up = new THREE.Vector3(0, 1, 0);
  let next = 0,
    side = 1,
    tracking = false;
  onFrame((dt) => {
    // only on a good covering of snow, not on the thin patches of a winter morning
    const show = smooth(0.5, 0.95, state.weather.snowCover);
    if (show < 0.01) {
      prints.visible = false;
      prints.count = 0;
      tracking = false;
      return;
    }
    prints.visible = true;
    // a print every step while she walks on the ground (not on the porch or mid-jump), paws left and right in turn,
    // where her front paws land (a cat's hind paws step into the same prints)
    const c = cat.position,
      ground = heightAt(c.x, c.z);
    if (!tracking || Math.abs(c.y - ground) > 0.05) {
      last.copy(c);
      tracking = true;
    } else if (last.distanceTo(c) > 0.11) {
      const yaw = cat.rotation.y;
      side = -side;
      const fx = c.x + Math.sin(yaw) * PAW_AHEAD,
        fz = c.z + Math.cos(yaw) * PAW_AHEAD;
      p.set(fx + Math.cos(yaw) * PAW_SIDE * side, heightAt(fx, fz) + 0.012, fz - Math.sin(yaw) * PAW_SIDE * side);
      prints.setMatrixAt(next, m.compose(p, q.setFromAxisAngle(up, yaw), one));
      life[next] = 1;
      next = (next + 1) % N;
      prints.count = Math.min(N, prints.count + 1);
      prints.instanceMatrix.needsUpdate = true;
      last.copy(c);
    }
    // they fade over a few minutes, much faster while it snows
    const fill = (state.weather.snowing && state.weather.rain > 0.3 ? 6 : 1) / LIFE;
    for (let i = 0; i < prints.count; i++) {
      life[i] = Math.max(0, life[i] - dt * fill);
      fade.array[i] = life[i] * show * 0.6;
    }
    fade.needsUpdate = true;
  });
}
