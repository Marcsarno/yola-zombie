import {
  AnimationMixer, LoopOnce, PropertyBinding, Quaternion, SRGBColorSpace,
  TextureLoader, Vector3,
} from 'three';

export const FRAGMENT_NAMES = Object.freeze([
  'Fragment_01_UpperLeft',
  'Fragment_02_UpperRight',
  'Fragment_03_Center',
  'Fragment_04_LowerLeft',
  'Fragment_05_LowerRight',
]);

/** Load ONCE per asset cache, then share across controllers. Caller owns textures. */
export async function loadDamageTextures(assetDirectoryURL, loader = new TextureLoader()) {
  const results = await Promise.allSettled(['hairline', 'heavy'].map(async (state) => {
      const suffix = state === 'hairline' ? 'Hairline' : 'Heavy';
      const texture = await loader.loadAsync(new URL(
        `textures/Shield_BaseColor_${suffix}.png`, assetDirectoryURL,
      ).href);
      // GLTFLoader already configures the embedded intact map. External maps need this.
      texture.flipY = false;
      texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return [state, texture];
    }));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) {
    for (const result of results) {
      if (result.status === 'fulfilled') result.value[1].dispose();
    }
    throw failure.reason;
  }
  return Object.fromEntries(results.map((result) => result.value));
}

function uniqueNode(root, name) {
  const nodes = [];
  root.traverse((node) => { if (node.name === name) nodes.push(node); });
  if (nodes.length !== 1) throw new Error(`Expected exactly one ${name}; found ${nodes.length}.`);
  return nodes[0];
}

function assertUniformHierarchy(node) {
  for (let ancestor = node; ancestor; ancestor = ancestor.parent) {
    const { x, y, z } = ancestor.scale;
    const tolerance = 1e-6 * Math.max(1, Math.abs(x), Math.abs(y), Math.abs(z));
    if (Math.min(x, y, z) <= 0 || Math.abs(x - y) > tolerance || Math.abs(y - z) > tolerance) {
      throw new Error('Break requires positive uniform scale throughout both parent chains. Bake scale first.');
    }
  }
}

/**
 * One shield lifetime. Geometry and textures are borrowed; materials are owned clones.
 * Pass a cached GLTFLoader result. This class clones the static object hierarchy.
 * The controller does not load, fit, retarget, or modify a character rig.
 */
export class ShieldController {
  constructor({ gltf, scene, damageTextures, fadeDelaySeconds = 5, fadeSeconds = 0.6 }) {
    if (!gltf?.scene?.isObject3D || !scene?.isScene) {
      throw new TypeError('Provide a GLTFLoader result and the world THREE.Scene.');
    }
    if (!Number.isFinite(fadeDelaySeconds) || fadeDelaySeconds < 0 ||
        !Number.isFinite(fadeSeconds) || fadeSeconds <= 0) {
      throw new RangeError('fadeDelaySeconds must be >= 0; fadeSeconds must be > 0.');
    }
    for (const state of ['hairline', 'heavy']) {
      const texture = damageTextures?.[state];
      if (!texture?.isTexture || texture.flipY !== false || texture.colorSpace !== SRGBColorSpace) {
        throw new Error(`${state} must be a texture with flipY=false and colorSpace=SRGBColorSpace.`);
      }
    }
    this.scene = scene;
    this.object3D = gltf.scene.clone(true);
    this.root = uniqueNode(this.object3D, 'Shield_Root');
    this.fragments = FRAGMENT_NAMES.map((name) => uniqueNode(this.root, name));
    this.grips = { center: uniqueNode(this.root, 'Grip_Center') };
    const gripMarkers = [];
    this.root.traverse((node) => {
      if (!node.isMesh && /^Grip_/.test(node.name)) gripMarkers.push(node);
    });
    if (gripMarkers.length !== 1 || this.grips.center.parent !== this.fragments[2]) {
      throw new Error('Expected one Grip_Center marker parented to Fragment_03_Center.');
    }
    const allFragments = [];
    this.root.traverse((node) => { if (/^Fragment_\d\d_/.test(node.name)) allFragments.push(node); });
    if (allFragments.length !== 5 || this.fragments.some((node) => node.isMesh)) {
      throw new Error('Expected exactly five named fragment groups/empties.');
    }
    let hasSkinnedMesh = false;
    this.root.traverse((node) => { hasSkinnedMesh ||= !!node.isSkinnedMesh; });
    if (hasSkinnedMesh) throw new Error('This controller is for the static shield, not skinned meshes.');

    this._materials = new Map();
    this._surfaceMaterials = [];
    this.root.traverse((node) => {
      if (!node.isMesh) return;
      const cloneMaterial = (source) => {
        if (!this._materials.has(source)) {
          const material = source.clone();
          this._materials.set(source, {
            material, opacity: source.opacity,
          });
          if (source.name === 'Shield_Surface') {
            this._surfaceMaterials.push({ material, intactMap: source.map });
          }
        }
        return this._materials.get(source).material;
      };
      node.material = Array.isArray(node.material)
        ? node.material.map(cloneMaterial) : cloneMaterial(node.material);
    });
    if (!this._surfaceMaterials.length || this._surfaceMaterials.some(({ intactMap }) => !intactMap)) {
      for (const { material } of this._materials.values()) material.dispose();
      throw new Error('Shield_Surface with an embedded intact base-color map is required.');
    }
    this._damageTextures = damageTextures;
    this._clip = gltf.animations?.find((clip) => clip.name === 'Break_Test');
    this._mixer = null;
    this._physics = null;
    this._mode = null;
    this._breakElapsed = 0;
    this._fadeDelaySeconds = fadeDelaySeconds;
    this._fadeSeconds = fadeSeconds;
    this.state = 'intact';
    this.phase = 'attached';
    this.disposed = false;
    scene.add(this.object3D);
  }

  /** Texture states may be previewed in any order before break. 'break' delegates. */
  setDamageState(state, breakOptions) {
    if (state === 'break') return this.breakApart(breakOptions);
    if (this.disposed || this.state === 'break') throw new Error('Create a new controller to reset a broken shield.');
    if (!['intact', 'hairline', 'heavy'].includes(state)) throw new Error(`Unknown damage state: ${state}`);
    for (const { material, intactMap } of this._surfaceMaterials) {
      material.map = state === 'intact' ? intactMap : this._damageTextures[state];
      material.needsUpdate = true;
    }
    this.state = state;
    return this;
  }

  /**
   * mode='clip': authored transform demo, no physics/collision.
   * mode='physics': createPhysics({ scene, fragments }) must synchronously return
   * { update(deltaSeconds), dispose() }. See README_RUNTIME.md.
   */
  breakApart({ mode = 'clip', createPhysics } = {}) {
    if (this.disposed) throw new Error('Shield has been disposed.');
    if (this.state === 'break') return this; // Repeated hit events are harmless.
    if (!['clip', 'physics'].includes(mode)) throw new Error('Break mode must be clip or physics.');
    if (mode === 'clip' && createPhysics) throw new Error('Choose clip OR physics, never both.');
    if (mode === 'physics' && typeof createPhysics !== 'function') {
      throw new Error('Physics mode requires your engine adapter createPhysics callback.');
    }
    if (mode === 'clip') {
      if (!this._clip) throw new Error('Break_Test is absent. Use an engine physics adapter.');
      const animated = new Set();
      for (const track of this._clip.tracks) {
        const binding = PropertyBinding.parseTrackName(track.name);
        if (!FRAGMENT_NAMES.includes(binding.nodeName) ||
            !['position', 'quaternion', 'scale'].includes(binding.propertyName)) {
          throw new Error(`Break_Test has an unexpected track: ${track.name}`);
        }
        animated.add(binding.nodeName);
      }
      if (animated.size !== 5) throw new Error('Break_Test must animate all five fragment groups.');
    }
    assertUniformHierarchy(this.root);
    assertUniformHierarchy(this.scene);
    if (mode === 'physics') this.fragments.forEach(assertUniformHierarchy);
    this.setDamageState('heavy');
    this.root.updateWorldMatrix(true, true);
    this.scene.updateWorldMatrix(true, false);
    // First detach the whole shield from a moving hand/socket without a world-space jump.
    // Clip tracks still bind to fragment local transforms beneath this root.
    this.scene.attach(this.root);
    if (this.object3D !== this.root) this.object3D.removeFromParent();
    this._mode = mode;
    this.state = 'break';
    this.phase = 'breaking';

    if (mode === 'clip') {
      this._mixer = new AnimationMixer(this.root);
      const action = this._mixer.clipAction(this._clip);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.reset().play();
      this._mixer.update(0);
    } else {
      const fragments = this.fragments.map((object) => {
        this.scene.attach(object); // Same world pose, now independently movable.
        object.updateWorldMatrix(true, true);
        return {
          name: object.name, object,
          worldMatrix: object.matrixWorld.clone(),
          worldPosition: object.getWorldPosition(new Vector3()),
          worldQuaternion: object.getWorldQuaternion(new Quaternion()),
          worldScale: object.getWorldScale(new Vector3()),
        };
      });
      this.root.removeFromParent();
      try {
        const handle = createPhysics({ scene: this.scene, fragments });
        this._physics = handle;
        if (!handle || ['update', 'dispose'].some((key) => typeof handle[key] !== 'function')) {
          throw new Error('Physics adapter must return update and dispose functions.');
        }
      } catch (error) {
        // Adapter must roll back its own partial body creation if it throws.
        this.dispose();
        throw error;
      }
    }
    return this;
  }

  /** Call once each frame with nonnegative elapsed simulation time in seconds. */
  update(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('Invalid frame delta.');
    if (this.disposed || this.state !== 'break') return;
    this._breakElapsed += deltaSeconds;
    if (this._mode === 'clip') {
      this._mixer.update(deltaSeconds);
      if (this._breakElapsed >= this._clip.duration && this.phase === 'breaking') this.phase = 'holding';
    } else {
      this._physics.update(deltaSeconds);
    }
    // Lifetime is measured from the break trigger, never from an unbounded settle gate.
    if (this._breakElapsed < this._fadeDelaySeconds) return;
    if (this.phase !== 'fading') {
      this.phase = 'fading';
      for (const { material } of this._materials.values()) {
        material.transparent = true;
        material.depthWrite = false;
        material.needsUpdate = true;
      }
      // Opaque shadow maps otherwise linger while the visible material fades.
      for (const fragment of this.fragments) fragment.traverse((node) => {
        if (node.isMesh) node.castShadow = false;
      });
    }
    const alpha = Math.max(0, 1 - (this._breakElapsed - this._fadeDelaySeconds) / this._fadeSeconds);
    for (const { material, opacity } of this._materials.values()) material.opacity = opacity * alpha;
    if (alpha <= 0) this.dispose();
  }

  /** Idempotent. Removes this instance and frees only its material clones/body handle. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.phase = 'disposed';
    try {
      if (typeof this._physics?.dispose === 'function') this._physics.dispose();
    } finally {
      this._physics = null;
      if (this._mixer) {
        this._mixer.stopAllAction();
        this._mixer.uncacheRoot(this.root);
        this._mixer = null;
      }
      for (const fragment of this.fragments) fragment.removeFromParent();
      this.root.removeFromParent();
      this.object3D.removeFromParent();
      for (const { material } of this._materials.values()) material.dispose();
      this._materials.clear();
      // Never dispose borrowed geometries, maps, or ImageBitmaps here.
    }
  }
}
