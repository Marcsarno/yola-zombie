// Weapon meshes built from rounded forms (matte, sculpted-minimal). Origins are the hand grip points:
// pistol: right-hand grip, barrel along +Z, top up +Y. Bat: midway between the hands, barrel along +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const mat = (color, rough = 0.62, metal = 0.1) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });

export function makePistol(scale = 1) {
  const g = new THREE.Group();
  const dark = mat(0x3b4048, 0.5, 0.25), grip = mat(0x2a2e34, 0.85, 0), accent = mat(0x9aa4ad, 0.4, 0.5);
  // grip (canted back like a real pistol), the hand wraps it at the origin
  const gripM = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.105, 0.046, 3, 0.012), grip);
  gripM.position.set(0, -0.03, -0.012); gripM.rotation.x = -0.28; g.add(gripM);
  // frame + slide
  const frame = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.026, 0.17, 3, 0.01), dark);
  frame.position.set(0, 0.03, 0.055); g.add(frame);
  const slide = new THREE.Mesh(new RoundedBoxGeometry(0.034, 0.03, 0.19, 3, 0.012), dark);
  slide.position.set(0, 0.058, 0.06); g.add(slide);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.012), accent); sight.position.set(0, 0.076, 0.145); g.add(sight);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 6, 14, Math.PI), dark);
  guard.rotation.set(0, Math.PI / 2, Math.PI); guard.position.set(0, 0.014, 0.03); g.add(guard);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.058, 0.157); g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

export function makeBat(length = 0.84) {
  // lathe profile along +Y, then turned to +Z. Origin at the hands' midpoint (0.13 m from the knob).
  const L = length, s = L / 0.84;
  const pts = [
    [0.0, 0], [0.026, 0.0], [0.03, 0.01], [0.024, 0.022], [0.0145, 0.03], [0.0145, 0.3], [0.019, 0.42],
    [0.028, 0.56], [0.033, 0.7], [0.034, 0.79], [0.031, 0.825], [0.02, 0.838], [0.0, 0.84],
  ].map(([r, y]) => new THREE.Vector2(r * s, y * s));
  const geo = new THREE.LatheGeometry(pts, 18);
  geo.rotateX(Math.PI / 2); // +Y -> +Z
  geo.translate(0, 0, -0.13 * s);
  const wood = new THREE.Mesh(geo, mat(0xc79a62, 0.7, 0));
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.0158 * s, 0.0158 * s, 0.2 * s, 14, 1, true), mat(0x2f3a4a, 0.9, 0));
  tape.rotation.x = Math.PI / 2; tape.position.z = (0.13 - 0.13) * s; // centred on the hands
  const g = new THREE.Group();
  g.add(wood, tape);
  g.userData.tip = new THREE.Object3D(); g.userData.tip.position.z = (0.84 - 0.13) * s; g.add(g.userData.tip);
  g.userData.handOffset = 0.045 * s; // each hand this far either side of the origin along the bat
  return g;
}
