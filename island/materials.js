// Procedural textures and the materials shared across the island.
import * as THREE from "three";
import { makeRng } from "./core.js";

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}
// a soft round puff for clouds, smoke and snowflakes, and a warm one for night glows
export const radial = (size, stops) => {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d"),
    h = size / 2,
    g = x.createRadialGradient(h, h, 0, h, h, h);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
};
export const puffTex = radial(128, [
  [0, "rgba(255,255,255,1)"],
  [0.5, "rgba(255,255,255,0.55)"],
  [1, "rgba(255,255,255,0)"],
]);
export const glowTex = radial(64, [
  [0, "rgba(255,214,150,1)"],
  [0.18, "rgba(255,196,120,0.45)"],
  [0.5, "rgba(255,170,80,0.1)"],
  [1, "rgba(255,160,60,0)"],
]);
// sprites (smoke, mist, glows, clouds) are transparent and start hidden at zero opacity
export const fxMat = (map, o) =>
  new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0, ...o });
export const sprite = (map, o) => new THREE.Sprite(fxMat(map, o));

// roof tiles in a resident's colour (seeded by the colour, so a house always gets the same tiles)
export function tiles(hex) {
  const rnd = makeRng(parseInt(hex.slice(1), 16));
  const base = new THREE.Color(hex);
  return canvasTex(
    256,
    256,
    (x, w, h) => {
      x.fillStyle = "#" + base.clone().multiplyScalar(0.55).getHexString();
      x.fillRect(0, 0, w, h);
      for (let row = 0; row < 8; row++)
        for (let col = 0; col < 9; col++) {
          const c = base.clone().multiplyScalar(0.8 + rnd() * 0.35);
          const ox = (row % 2) * 14,
            X = col * 30 - ox,
            Y = row * 32;
          const g = x.createLinearGradient(0, Y, 0, Y + 32);
          g.addColorStop(0, "#" + c.getHexString());
          g.addColorStop(1, "#" + c.clone().multiplyScalar(0.7).getHexString());
          x.fillStyle = g;
          x.beginPath();
          x.roundRect(X + 1, Y + 1, 28, 30, [0, 0, 10, 10]);
          x.fill();
        }
    },
    [2.2, 1.6],
  );
}

// standard material with the island's defaults, and a helper that lets a mesh cast and receive shadows
export const S = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, envMapIntensity: 0.35, ...o });
export const shadow = (m) => {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

export const mTrim = S({ color: "#f8f5ee", roughness: 0.6 });
export const mDark = S({ color: "#3a2c22", roughness: 0.7 });
export const mMetal = S({ color: "#6b6e72", metalness: 0.8, roughness: 0.35 });
export const mSnow = S({ color: "#f3f6fa", roughness: 0.9 });
// window glass; it glows warm when the lights come on (see houses.js)
export const mGlass = new THREE.MeshPhysicalMaterial({
  color: "#7d97a8",
  roughness: 0.05,
  metalness: 0.2,
  envMapIntensity: 0.8,
  emissive: "#ffb85c",
  emissiveIntensity: 0,
});
// the textured materials are made by initMaterials(), before the houses need them
export let stoneTex, mPlaster, mStone, mWood;

export function initMaterials() {
  const rnd = makeRng(41);
  const plaster = canvasTex(
    256,
    256,
    (x, w, h) => {
      x.fillStyle = "#efe6d6";
      x.fillRect(0, 0, w, h);
      for (let k = 0; k < 5000; k++) {
        x.fillStyle = `rgba(${rnd() < 0.5 ? "120,100,80" : "255,255,255"},${rnd() * 0.07})`;
        x.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 2 + rnd() * 4);
      }
    },
    [2, 2],
  );
  const woodTex = canvasTex(
    128,
    128,
    (x, w, h) => {
      x.fillStyle = "#7a5134";
      x.fillRect(0, 0, w, h);
      for (let k = 0; k < 60; k++) {
        x.strokeStyle = `rgba(40,25,15,${0.1 + rnd() * 0.2})`;
        x.beginPath();
        const y = rnd() * h;
        x.moveTo(0, y);
        x.bezierCurveTo(w * 0.3, y + rnd() * 6, w * 0.6, y - rnd() * 6, w, y);
        x.stroke();
      }
    },
    [1, 1],
  );
  stoneTex = canvasTex(
    256,
    256,
    (x, w, h) => {
      x.fillStyle = "#6f6a62";
      x.fillRect(0, 0, w, h);
      for (let row = 0; row < 8; row++)
        for (let col = 0; col < 6; col++) {
          const v = 130 + rnd() * 60;
          x.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
          x.beginPath();
          x.roundRect(col * 44 + (row % 2) * 22 - 10 + rnd() * 3, row * 32 + 2, 40, 28, 6);
          x.fill();
        }
    },
    [2, 1],
  );
  mPlaster = S({ map: plaster, roughness: 0.92 });
  mStone = S({ map: stoneTex, roughness: 0.95 });
  mWood = S({ map: woodTex, roughness: 0.8 });
}

// a wooden bench with dark legs and back supports (gardens and plaza)
export function makeBench() {
  const b = new THREE.Group();
  const seat = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.4), mWood));
  seat.position.y = 0.45;
  const back = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.06), mWood));
  back.position.set(0, 0.7, -0.18);
  b.add(seat, back);
  [-0.6, 0.6].forEach((x) => {
    const leg = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.41, 0.36), mDark));
    leg.position.set(x, 0.205, 0);
    const strut = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), mDark));
    strut.position.set(x, 0.62, -0.18);
    b.add(leg, strut);
  });
  return b;
}
