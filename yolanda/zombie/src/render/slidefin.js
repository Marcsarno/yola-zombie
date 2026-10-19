// The shotgun's finisher: the slide (2026-10-19, built by the animation chat in the Animation Hub, the user: "this is really
// good ... looking very solid"). From the everyday shotgun hold she sprints in, drops into a knee skid side-on (her left
// side to the zombie), fires point blank mid-skid (the kick is in the clip), holds the kneel, stands and ends back in the
// hold. Three lengths (assets/yola2_ual.glb hub_execution_shotgun_slide_short / _mid / _long; 30 fps, 0-based frames): its
// shot frame and its travel (render/clipchars.js stripRoot keeps the hips' travel aside, x and z, in the hips' own units).
// The path bends ~0.25 m to her left (+x here: the model is mirrored from the hub) so the muzzle lands on the zombie's
// middle as she passes; she stops ~1.0 m short along the line. core/player.js startSlide picks the shortest that covers
// the gap and scales its travel down for a shorter one (as the jump finishers: EXEC_LAUNCH).
import * as THREE from 'three';
import { buildLibraryAttack } from './libattack.js';
import { EXEC_SLIDE, attackTime } from '../core/weapons.js';

const VARIANTS = [['short', 22, 2.09], ['mid', 29, 2.89], ['long', 36, 3.67]]; // [name, shot frame, forward travel m (the hub's)]

export function setupSlideFinisher(yola, anims) {
  const by = Object.fromEntries(anims.map((c) => [c.name, c])), made = [];
  EXEC_SLIDE.length = 0;
  for (const [v, shotF] of VARIANTS) {
    const clip = by['hub_execution_shotgun_slide_' + v]; if (!clip) continue;
    const [S] = buildLibraryAttack(yola, { clip, P: { kind: 'shotgun', dmg: 0, knock: 0, style: 'heavy', sever: {} }, name: 'shotgun slide ' + v, sound: 'shotgun', recover: 0.15, split: false });
    const shotT = attackTime(S, S.f0 + shotF); // (the clip's frames count from its first key: f0)
    Object.assign(S, { gunShot: shotT, windows: [[shotT, shotT + 0.02]], activeStart: shotT, activeEnd: shotT + 0.02, stand: 1.0, chainFrom: 99, slide: true });
    if (clip.travel) { // hips units to metres, from the clip's first frame; forward never pulled back
      const k = yola.bones.Hips.parent.getWorldScale(new THREE.Vector3()).z, z0 = clip.travel.z[0], x0 = clip.travel.x?.[0] ?? 0;
      let m = 0; S.ROOT = clip.travel.times.map((t, i) => ({ t: attackTime(S, Math.round(t * 30)), z: (m = Math.max(m, (clip.travel.z[i] - z0) * k)) }));
      S.ROOTX = clip.travel.x ? clip.travel.times.map((t, i) => ({ t: attackTime(S, Math.round(t * 30)), z: (clip.travel.x[i] - x0) * k })) : null;
    }
    EXEC_SLIDE.push({ variant: v, A: S });
    made.push(`${v} ${S.ROOT ? S.ROOT[S.ROOT.length - 1].z.toFixed(2) + 'm' : 'no travel'} shot@${shotT.toFixed(2)}s`);
  }
  if (made.length) console.info('shotgun slide finisher:', made.join(', '));
  return made;
}
