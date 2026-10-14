// The shape every resident's house shares: its measurements, the gable roof, and the spots on it that other parts of
// the island use (Sally's porch steps, the toys, the Christmas lights, the chimney smoke). In a house's own
// coordinates: the front faces +z (the plaza), x runs along the front and y = 0 is the foot of the stone base.
import * as THREE from "three";

export const W = 5.2; // width along the front
export const D = 4.2; // depth; the front wall is at z = D / 2
export const FLOOR = 0.55; // height of the stone base the walls stand on
export const WH = 2.9; // wall height
export const RH = 2.2; // roof height above the walls
export const ROOF_LEN = W + 0.9; // the roof along the ridge, with its overhang at both gable ends
// the gutters along both eaves: their height and how far out from the middle they run
export const EAVE_Y = FLOOR + WH - 0.15,
  EAVE_Z = D / 2 + 0.6;
// the middle of the chimney, and its height
export const CHIMNEY = { x: 1.4, y: FLOOR + WH + RH - 0.1, z: -0.7, h: 1.9 };
// the middle of the front door
export const DOOR = { y: FLOOR + 1.0, z: D / 2 + 0.03 };
// the two posts holding up the porch roof, either side of the door
export const PORCH_POSTS = { x: 0.75, z: D / 2 + 1.2 };
// the porch steps, upper first: the height of the top, the middle in z and the width
export const STEPS = [0, 1].map((k) => ({ top: 0.63 - k * 0.18, z: D / 2 + 0.45 + k * 0.45, w: 1.6 - k * 0.2 }));

export function gableRoof(w, h, len, overhang) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 - overhang, -0.12);
  s.lineTo(0, h);
  s.lineTo(w / 2 + overhang, -0.12);
  s.lineTo(w / 2 + overhang, 0.05);
  s.lineTo(0, h + 0.17);
  s.lineTo(-w / 2 - overhang, 0.05);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  // UVs along the slope so the tiles run the right way
  const p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) / 2.2 + 0.5, (Math.abs(p.getX(i)) + p.getY(i)) / 2.4);
  return g;
}
