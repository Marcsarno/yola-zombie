// The level editor's copy of Chapter 1 (the private design repo, Marcsarno/yola-level-design). The hospital floors are built
// by the game's code (render/arena.js from core/chapter.js), not exported from Blender, so the editor gets them from the
// game itself: tools/leveldesign/capture.html builds the game's own Arena with the per-room prop merge switched off,
// exports each floor's shell (floors, walls, doors, the lift, signs, the outbreak dressing: everything but the props) as a
// GLB, and writes every prop's final placement (the game's own centring, fitting and wall mounting) so the editor can show
// the props one by one and move them. The opening's clinic (outside and in) comes from the running opening
// (captureObject on combat.html?intro=1&crisis=1, with the cast hidden). Files go through the dev server's test-evidence
// endpoint (/__shot/, localhost only) to zombie/shots/; tools/leveldesign/export_hospital.mjs takes them from there.
// Bundled by: npx esbuild tools/leveldesign/capture.js --bundle --format=iife --outfile=tools/leveldesign/capture.bundle.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { LAYOUT, useLevel } from '../../src/core/layout.js';
import { Arena } from '../../src/render/arena.js';

const post = (name, body) => fetch('/__shot/' + name, { method: 'POST', body }).then((r) => { if (!r.ok) throw new Error('save ' + name + ': ' + r.status); });
const exportGLB = (obj) => new GLTFExporter().parseAsync(obj, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
const log = (...a) => { console.log('[capture]', ...a); const el = document.getElementById('log'); if (el) el.textContent += a.join(' ') + '\n'; };

window.captureHospital = async () => {
  useLevel('chapter', 7);
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer();
  const arena = new Arena(scene, 'high', renderer);
  arena.mergeRooms = () => {}; // (keep every prop its own object)
  // which holder is which prop: loadProps adds the holder, then sets p._actual (synchronously, in that order)
  const props = LAYOUT.chapter.props, holderOf = new Map(); let last = null;
  const add = arena.group.add.bind(arena.group); arena.group.add = (...o) => { last = o[0]; return add(...o); };
  props.forEach((p, i) => Object.defineProperty(p, '_actual', { configurable: true, get() { return this.__actual; }, set(v) { this.__actual = v; if (last?.userData?.prop) holderOf.set(last, i); } }));
  const mgr = THREE.DefaultLoadingManager; let pending = 0; mgr.onStart = () => pending++; mgr.onLoad = () => { pending = 0; };
  await arena.loadProps(new GLTFLoader(), (k) => log('props', Math.round(k * 100) + '%'));
  for (let t = 0; t < 40 && pending; t++) await new Promise((r) => setTimeout(r, 250)); // (the outbreak dressing loads on its own)
  await new Promise((r) => setTimeout(r, 1500));
  arena.adoptFloors();
  log('props placed', holderOf.size, 'of', props.filter((p) => !p.kind).length);
  // each prop's placement: the matrix of the model's own root (the game's centring, fitting and wall mounting applied)
  const out = [];
  for (const [holder, i] of holderOf) {
    const p = props[i], obj = holder.children[0]; holder.updateMatrixWorld(true);
    out.push({ i, m: p.m, floor: p.floor, name: p.name || '', x: p.x, y: p.y || 0, z: p.z, rot: p.rot, fp: p.fp, h: p.h, wall: p.wall || '', noCollide: !!p.noCollide, matrix: obj.matrixWorld.toArray().map((v) => +v.toFixed(5)) });
  }
  out.sort((a, b) => a.i - b.i);
  await post('hosp_props.json', JSON.stringify(out));
  // each floor's shell: everything in its group but the props and the lights
  for (const n of [7, 6, 5]) {
    const g = arena.floorGroups[n]; g.visible = true;
    const shell = new THREE.Scene();
    for (const o of [...g.children]) { if (holderOf.has(o) || o.isLight) continue; shell.add(o); }
    shell.traverse((o) => { if (o.isLight) o.visible = false; });
    const glb = await exportGLB(shell);
    await post(`hosp_floor${n}_glb.txt`, new Blob([glb]));
    log('floor', n, (glb.byteLength / 1048576).toFixed(1) + ' MB,', shell.children.length, 'pieces');
  }
  log('done');
};

// the opening's clinic, from the running opening: its set, with the cast hidden
window.captureObject = async (obj, name, hide = []) => {
  const was = hide.map((o) => o.visible); hide.forEach((o) => { o.visible = false; });
  obj.updateMatrixWorld(true);
  const glb = await exportGLB(obj);
  hide.forEach((o, k) => { o.visible = was[k]; });
  await post(name + '_glb.txt', new Blob([glb]));
  log(name, (glb.byteLength / 1048576).toFixed(1) + ' MB');
};
