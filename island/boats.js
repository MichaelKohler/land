// Boats: a proper hull (pointed bow, flat transom, painted bottom, wooden inside) fitted out either as
// a rowing boat (floor, seats, oars) or as a little sailing boat (deck, cabin, mast, cambered sails, rigging).
import * as THREE from "three";
import { scene } from "./core.js";
import { S, shadow, canvasTex, mWood, mDark, mMetal, mGlass } from "./materials.js";

// hullColor paints the topsides; with a sailColor it becomes a sailing boat, without one a rowing boat
export function makeBoat(hullColor, sailColor, scale) {
  const b = new THREE.Group(),
    L = 3.2,
    W = 0.62,
    TOP = 0.5,
    KEEL = -0.2,
    ns = 28,
    nr = 18;
  const half = (u) => (u > 0 ? W * Math.pow(Math.max(0, 1 - Math.pow(u, 2.2)), 0.6) : W * (1 - 0.38 * u * u));
  const sheer = (u) => TOP + 0.14 * Math.max(0, u) ** 2 + 0.04 * u * u;
  const depth = (u) => (sheer(u) - KEEL) * (1 - 0.25 * u * u);
  // half-width of the hull at height y for station u
  const xAt = (u, y) =>
    half(u) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(1, Math.max(0, (sheer(u) - y) / depth(u))), 2 / 0.55)));
  const bottomC = new THREE.Color(sailColor ? "#7a2a24" : "#3d5c4c"),
    topC = new THREE.Color(hullColor),
    pos = [],
    col = [],
    idx = [];
  for (let i = 0; i <= ns; i++) {
    const u = -1 + (2 * i) / ns,
      z = (u * L) / 2,
      w = half(u),
      t = sheer(u),
      d = depth(u);
    for (let j = 0; j <= nr; j++) {
      const ph = -Math.PI / 2 + (Math.PI * j) / nr,
        y = t - d * Math.pow(Math.cos(ph), 0.55);
      pos.push(w * Math.sin(ph), y, z);
      const c = y < 0.04 ? bottomC : topC;
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < ns; i++)
    for (let j = 0; j < nr; j++) {
      const a = i * (nr + 1) + j,
        c = a + nr + 1;
      idx.push(a, a + 1, c, c, a + 1, c + 1);
    }
  // transom: a fan across the stern section
  const ci = pos.length / 3;
  pos.push(0, sheer(-1) - depth(-1) * 0.45, -L / 2);
  col.push(topC.r, topC.g, topC.b);
  for (let j = 0; j <= nr; j++) idx.push(ci, j === nr ? 0 : j + 1, j);
  const hg = new THREE.BufferGeometry();
  hg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  hg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  hg.setIndex(idx);
  hg.computeVertexNormals();
  const hull = shadow(new THREE.Mesh(hg, S({ vertexColors: true, roughness: 0.4, envMapIntensity: 0.6 })));
  const inside = new THREE.Mesh(
    hg,
    S({ color: sailColor ? "#d8cfbf" : "#9c7650", roughness: 0.8, side: THREE.BackSide }),
  );
  b.add(hull, inside);
  // gunwale rail and a painted stripe just below it, both following the sheer line
  const along = (fn) =>
    new THREE.CatmullRomCurve3(
      Array.from({ length: 2 * ns + 1 }, (_, k) => {
        const u = k <= ns ? -1 + (2 * k) / ns : 1 - (2 * (k - ns)) / ns,
          s = k <= ns ? 1 : -1;
        return fn(u, s);
      }),
    );
  b.add(
    shadow(
      new THREE.Mesh(
        new THREE.TubeGeometry(
          along((u, s) => new THREE.Vector3(s * half(u), sheer(u), (u * L) / 2)),
          120,
          0.035,
          6,
        ),
        sailColor ? mWood : S({ color: "#7a5a3c", roughness: 0.7 }),
      ),
    ),
  );
  b.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(
        along((u, s) => new THREE.Vector3(s * (xAt(u, sheer(u) - 0.1) + 0.012), sheer(u) - 0.1, (u * L) / 2)),
        120,
        0.022,
        5,
      ),
      S({ color: sailColor ? "#f3efe6" : "#2f5d7c", roughness: 0.5 }),
    ),
  );
  const tr = shadow(new THREE.Mesh(new THREE.BoxGeometry(2 * half(-1) + 0.06, 0.06, 0.07), mWood));
  tr.position.set(0, sheer(-1), -L / 2);
  b.add(tr);
  const plank = (w, h, d, x, y, z, m = mWood) => {
    const o = shadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
    o.position.set(x, y, z);
    b.add(o);
    return o;
  };
  if (!sailColor) {
    // rowing boat: floorboards, two thwarts, oarlocks and the oars resting on the seats
    const floorS = new THREE.Shape(),
      FY = 0.03;
    for (let i = 0; i <= ns; i++) {
      const u = -0.98 + (1.96 * i) / ns;
      floorS[i ? "lineTo" : "moveTo"](xAt(u, FY), -(u * L) / 2);
    }
    for (let i = ns; i >= 0; i--) {
      const u = -0.98 + (1.96 * i) / ns;
      floorS.lineTo(-xAt(u, FY), -(u * L) / 2);
    }
    const floorG = new THREE.ShapeGeometry(floorS);
    floorG.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorG, S({ color: "#8a6644", roughness: 0.85, side: THREE.DoubleSide }));
    floor.position.y = FY;
    b.add(floor);
    [-0.12, 0, 0.12].forEach((x) => plank(0.1, 0.03, 2.0, x, FY + 0.02, -0.1));
    [-0.6, 0.35].forEach((z) => {
      const u = z / (L / 2);
      plank(2 * xAt(u + 0.1 * Math.sign(u), 0.32) * 0.95, 0.05, 0.24, 0, 0.32, z);
    });
    plank(2 * xAt(-0.95, 0.34) * 0.95, 0.05, 0.3, 0, 0.34, -1.36);
    [-1, 1].forEach((s) => {
      const lock = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 6, 12, Math.PI), mMetal));
      lock.position.set(s * half(0), sheer(0) + 0.03, -0.05);
      lock.rotation.y = Math.PI / 2;
      b.add(lock);
      const oar = new THREE.Group();
      oar.position.set(s * 0.2, 0.37, -0.42);
      oar.rotation.set(0, s * 0.06, 0);
      b.add(oar);
      const shaft = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 2.1, 8), mWood));
      shaft.rotation.x = Math.PI / 2;
      oar.add(shaft);
      const blade = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.014, 0.42), mWood));
      blade.position.z = 1.2;
      oar.add(blade);
      const grip = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.14, 8), mDark));
      grip.rotation.x = Math.PI / 2;
      grip.position.z = -1.0;
      oar.add(grip);
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12), mMetal);
    ring.position.set(0, sheer(1) - 0.08, L / 2 - 0.02);
    b.add(ring);
  } else {
    // sailing boat: deck with a cockpit, little cabin, mast and boom, cambered sails and rigging
    const deckS = new THREE.Shape();
    for (let i = 0; i <= ns; i++) {
      const u = -1 + (2 * i) / ns;
      deckS[i ? "lineTo" : "moveTo"](half(u) * 0.97, -(u * L) / 2);
    }
    for (let i = ns; i >= 0; i--) {
      const u = -1 + (2 * i) / ns;
      deckS.lineTo(-half(u) * 0.97, -(u * L) / 2);
    }
    const pit = new THREE.Path();
    pit.moveTo(-0.36, 1.3);
    pit.lineTo(0.36, 1.3);
    pit.lineTo(0.36, 0.25);
    pit.lineTo(-0.36, 0.25);
    pit.lineTo(-0.36, 1.3);
    deckS.holes.push(pit);
    const deckG = new THREE.ShapeGeometry(deckS);
    deckG.rotateX(-Math.PI / 2);
    const deck = shadow(new THREE.Mesh(deckG, S({ color: "#c9a77a", roughness: 0.7, side: THREE.DoubleSide })));
    deck.position.y = TOP - 0.01;
    b.add(deck);
    plank(0.7, 0.03, 1.0, 0, 0.12, -0.78, S({ color: "#c9a77a", roughness: 0.7 }));
    [-1, 1].forEach((s) => plank(0.12, 0.05, 1.0, s * 0.3, 0.32, -0.78));
    const cabinM = S({ color: "#f3efe6", roughness: 0.5 });
    plank(0.82, 0.24, 0.95, 0, TOP + 0.12, 0.3, cabinM);
    plank(0.86, 0.04, 0.99, 0, TOP + 0.25, 0.3, cabinM);
    [-1, 1].forEach((s) => [0.12, 0.46].forEach((z) => plank(0.01, 0.07, 0.22, s * 0.415, TOP + 0.14, z, mGlass)));
    const MZ = 0.55,
      MH = 4.6;
    plank(0.07, MH, 0.07, 0, TOP + MH / 2, MZ, S({ color: "#cfd2d4", metalness: 0.6, roughness: 0.35 }));
    const sailTex = canvasTex(64, 256, (x, w, h) => {
      x.fillStyle = "#ffffff";
      x.fillRect(0, 0, w, h);
      x.strokeStyle = "rgba(120,110,95,0.35)";
      x.lineWidth = 1;
      for (let y = 16; y < h; y += 28) {
        x.beginPath();
        x.moveTo(0, y);
        x.lineTo(w, y);
        x.stroke();
      }
    });
    const sailM = S({ color: sailColor, map: sailTex, roughness: 0.85, side: THREE.DoubleSide });
    // a sail as a gently bellied grid between its luff (front edge) and leech (back edge)
    function sail(luff0, luff1, leech0, leech1, camber, roach) {
      const nu = 8,
        nv = 12,
        p = [],
        uv = [],
        ix = [];
      for (let j = 0; j <= nv; j++) {
        const v = j / nv,
          Lp = luff0.clone().lerp(luff1, v),
          Ep = leech0.clone().lerp(leech1, v);
        Ep.z -= roach * Math.sin(Math.PI * v);
        for (let i = 0; i <= nu; i++) {
          const c = i / nu,
            q = Lp.clone().lerp(Ep, c);
          q.x += camber * Math.sin(Math.PI * c) * (1 - 0.6 * v);
          p.push(q.x, q.y, q.z);
          uv.push(c, v);
        }
      }
      for (let j = 0; j < nv; j++)
        for (let i = 0; i < nu; i++) {
          const a = j * (nu + 1) + i,
            c2 = a + nu + 1;
          ix.push(a, c2, a + 1, a + 1, c2, c2 + 1);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(ix);
      g.computeVertexNormals();
      return shadow(new THREE.Mesh(g, sailM));
    }
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // main sail and boom swing out together around the mast (the course sets the side, see coast.js)
    const rig = new THREE.Group();
    rig.position.set(0, 0, MZ);
    b.add(rig);
    const boom = shadow(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 1.9, 8),
        S({ color: "#cfd2d4", metalness: 0.6, roughness: 0.35 }),
      ),
    );
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, TOP + 0.48, -0.92);
    rig.add(boom);
    rig.add(
      sail(
        V(0, TOP + 0.52, -0.04),
        V(0, TOP + MH - 0.15, -0.04),
        V(0, TOP + 0.52, -1.8),
        V(0, TOP + MH - 0.15, -0.1),
        0.16,
        0.18,
      ),
    );
    const head = V(0, TOP + MH * 0.82, MZ + 0.22),
      tack = V(0, sheer(1) + 0.05, L / 2 - 0.06);
    // the jib is drawn let out to starboard (+x) and mirrored to go to port
    const jib = new THREE.Group();
    jib.add(sail(tack, head, V(0.32, TOP + 0.3, 0.05), head, 0.12, 0));
    b.add(jib);
    // forestay, backstay and shrouds
    const top = V(0, TOP + MH, MZ),
      lines = [
        top,
        V(0, sheer(1), L / 2),
        top,
        V(0, sheer(-1), -L / 2),
        top,
        V(0.55, TOP, MZ - 0.05),
        top,
        V(-0.55, TOP, MZ - 0.05),
      ];
    b.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(lines),
        new THREE.LineBasicMaterial({ color: "#3c3f44" }),
      ),
    );
    // pennant at the masthead, rudder and tiller at the stern
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.16, 0, 0, -0.08, -0.4], 3));
    pg.computeVertexNormals();
    const pen = new THREE.Mesh(pg, S({ color: "#c8304a", side: THREE.DoubleSide }));
    pen.position.set(0, TOP + MH + 0.05, MZ);
    b.add(pen);
    b.userData.sails = { rig, jib, pen };
    plank(0.04, 0.6, 0.26, 0, 0.0, -L / 2 - 0.1, mWood);
    plank(0.04, 0.04, 0.7, 0, sheer(-1) + 0.12, -L / 2 + 0.3, mWood).rotation.x = -0.15;
  }
  b.scale.setScalar(scale);
  scene.add(b);
  return b;
}
