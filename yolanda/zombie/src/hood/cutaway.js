// Chapter 2: the see-through hole. With the camera fixed (never turning), a house, a tree or a car between the lens and the
// player would hide the fight: every neighbourhood material dithers away above knee height inside a soft tube along the
// line from the camera to the player (the old Survive build's cutaway, which played well). Ground never cuts.
import * as THREE from 'three';

export const CUT = {
  cam: { value: new THREE.Vector3(0, 50, 0) },
  target: { value: new THREE.Vector3(0, -50, 0) },
  r: { value: 2.9 },        // tube radius at the player (m)
  floor: { value: 0.55 },   // nothing under this height cuts (the ground, kerbs, low clutter stay)
  on: { value: 1 },
  // the building the player is inside (the clubhouse, an open garage): everything above its ceiling inside its footprint
  // goes (the old build's interior dissolve, which beat a small hole): centre x/z, half sizes, yaw's cos/sin; y = clip height
  room: { value: new THREE.Vector4(0, 0, 0, 0) }, roomRot: { value: new THREE.Vector3(1, 0, 999) },
  // the baked ground light (blender/hood/bake_hood.py -> assets/neighborhood/hood_light.jpg, stored at half range), laid on
  // every near-ground upward surface by world x / z: lmRect = (x0, z0, width, depth); lmK = (strength, shadow floor)
  lm: { value: null }, lmRect: { value: new THREE.Vector4(-70, -130, 180, 226) }, lmK: { value: new THREE.Vector2(0, 0.42) },
};
export function setGroundLight(tex, strength = 1, floor = 0.42) { CUT.lm.value = tex; CUT.lmK.value.set(tex ? strength : 0, floor); }
export function setCutaway(cam, px, pz, on = true, room = null) {
  CUT.cam.value.copy(cam.position); CUT.target.value.set(px, 1.0, pz); CUT.on.value = on ? 1 : 0;
  if (room) { CUT.room.value.set(room.cx, room.cz, room.hx, room.hz); CUT.roomRot.value.set(Math.cos(room.yaw || 0), Math.sin(room.yaw || 0), room.clipY); }
  else CUT.roomRot.value.z = 999;
}
export function cutawayPatch(sh) {
  if (sh.vertexShader.includes('vCutW')) return;
  Object.assign(sh.uniforms, { cutCam: CUT.cam, cutTarget: CUT.target, cutR: CUT.r, cutFloor: CUT.floor, cutOn: CUT.on, cutRoom: CUT.room, cutRoomRot: CUT.roomRot, hoodLM: CUT.lm, hoodLMRect: CUT.lmRect, hoodLMK: CUT.lmK });
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCutW;\nvarying float vCutUp;')
    .replace('#include <fog_vertex>', `#include <fog_vertex>
  { vec4 cw = vec4(transformed, 1.0); vec3 cn = ${/Standard|Physical|Lambert|Phong|Toon/.test(sh.shaderType || '') ? 'objectNormal' : 'vec3(0.0)'};
    #ifdef USE_INSTANCING
      cw = instanceMatrix * cw; cn = mat3(instanceMatrix) * cn;
    #endif
    vCutW = (modelMatrix * cw).xyz; vCutUp = normalize(mat3(modelMatrix) * cn).y; }`);
  if (sh.fragmentShader.includes('#include <opaque_fragment>')) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
  if (hoodLMK.x > 0.0 && vCutW.y < 0.45 && vCutUp > 0.7) {
    vec3 lt = texture2D(hoodLM, vec2((vCutW.x - hoodLMRect.x) / hoodLMRect.z, 1.0 - (vCutW.z - hoodLMRect.y) / hoodLMRect.w)).rgb * 2.0;
    gl_FragColor.rgb *= mix(vec3(1.0), mix(vec3(hoodLMK.y), vec3(1.0), clamp(lt, 0.0, 1.0)) * vec3(0.97, 0.99, 1.03), hoodLMK.x);
  }`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vCutW; varying float vCutUp; uniform vec3 cutCam; uniform vec3 cutTarget; uniform float cutR; uniform float cutFloor; uniform float cutOn;
uniform vec4 cutRoom; uniform vec3 cutRoomRot; uniform sampler2D hoodLM; uniform vec4 hoodLMRect; uniform vec2 hoodLMK;`)
    .replace('void main() {', `void main() {
  if (vCutW.y > cutRoomRot.z) {
    vec2 rd = vCutW.xz - cutRoom.xy;
    vec2 rl = vec2(rd.x * cutRoomRot.x - rd.y * cutRoomRot.y, rd.x * cutRoomRot.y + rd.y * cutRoomRot.x);
    if (abs(rl.x) < cutRoom.z && abs(rl.y) < cutRoom.w) discard;
  }
  if (cutOn > 0.5 && vCutW.y > cutFloor) {
    vec3 ab = cutTarget - cutCam; float t = dot(vCutW - cutCam, ab) / dot(ab, ab);
    if (t > 0.0 && t < 0.985 && length(vCutW - cutTarget) > 1.15) { // (not what he carries or stands over: the can in his hand, a pickup at his feet)
      float d = length(vCutW - (cutCam + ab * t));
      float r = cutR * mix(0.75, 1.0, t);              // wide enough near the lens to clear big foreground palms
      float k = 1.0 - smoothstep(r * 0.62, r, d);
      float h = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
      if (k > h * 0.999) discard;
    }
  }`);
}
