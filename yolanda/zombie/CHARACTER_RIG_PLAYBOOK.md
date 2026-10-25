# Character rigs: the playbook (bringing in a character, correcting its skeleton, weights and clips)

Read this before touching any character's skeleton, weights or clips. Written 2026-10-20 at the user's request ("so we
remember the absolute best way to correct character rigs and animation ... so we can always get it right in the
future"). It gathers what Yola 2 and Marc taught us. The details behind each rule are in WEAPON_HOLD_PROCESS.md
sections 16-17 (contacts, retargeting) and MARC_HANDOFF.md (what failed on Marc and why).

## 0. The order (never skip or reorder)

1. **Bring the character in untouched.** Keep the download as converted (`assets/source/<char>/<char>_original.glb`).
   Every later step saves its own file, so any version can come back.
2. **Skeleton first** (section 3), against the dummy. Weights are painted relative to the joints: moving a joint after
   painting undoes the paint.
3. **Weights second** (section 4), against a clothed reference of a similar build and outfit.
4. **Range-of-motion test** (section 5): the Rig Lab's Body check list, on the character and the references.
5. **Clips** (section 6): every clip retargeted from its own original source.
6. **Judge in the Rig Lab** (section 7), in motion at 1x, beside the clip's own source rig.
7. **Contacts and weapons last** (WEAPON_HOLD_PROCESS.md section 16).
8. **Game check:** the game must look like the Rig Lab (bones vs the clip at the action's time, within 1 deg).

One change at a time. Show the user a labelled before / after. Only then spread it to other clips or other parts.

### 0a. A new character, step by step (written 2026-10-20 for Arianna and Lilah)

**Day one: look, change nothing.** The goal is one intake report the user can read and draw on.

1. **Bring it in untouched.**
   - The download goes in its own empty folder; run nothing from it.
   - Convert it to `assets/source/<char>/<char>_original.glb`.
   - Open it in Blender visibly.
   - Note the licence: where may the file live? Mixamo and paid packs stay out of git.
2. **Make "as downloaded" the permanent baseline.**
   - Register the character in the Rig Lab (`CHARS`).
   - List the untouched file in `assets/test_clips/tests.json` as "as downloaded".
   - Every later version can then be put beside the original in one click. On Marc we lost hours before "put the
     original back and compare".
3. **Budget.** Triangles, materials, texture sizes and bones against Yola 2 (31.3k triangles, 1 material, 3 textures,
   68 bones). Marc is 48.8k triangles, 56% more. Decide early whether it needs a lighter version for the phone.
4. **Mesh at the joints.** Look at the wireframe at the shoulders, elbows, hips and knees. Weights cannot fix a joint
   with no edge loops to bend on; AI-made meshes often have none. Remesh before any paint if needed.
5. **The dangly-parts list.** Hair, ponytails, open shirt flaps, straps, lanyards, badges, hoods. For each, decide: on
   one bone (rigid), its own bones with sway (as Yola's ponytail, `render/hairsway.js`), or follow the body.
6. **Body check in the Rig Lab.** Live library clips, no bake:
   - the range of motion with "run the list";
   - weights as patches, for strays;
   - bones on, beside the dummy: the chest "V", the neck and head line, the spine curve;
   - for a woman: the female mannequin (Y Bot once the user downloads it), and the chest in arms-forward poses (Tripo
     rigs have no breast bones).
7. **Numbers and pictures: one command** (`tools/anim/intake_report.py`, 1-2 min, background Blender only):
   ```
   blender -b --factory-startup --python tools/anim/intake_report.py -- assets <character file> shots/intake/<char> name=<Name> height=<game m> [female=1]
   ```
   It writes `shots/intake/<char>/report.html`, one page with the pictures inside, plus `report.json`. It measures:
   - **budget** against Yola 2;
   - **skeleton** against the mannequin and X Bot: proportions, axis vs limb line, the chest "V", the spine curve,
     joints inside and centred, end bones outside the mesh, symmetry;
   - **weights:** influences, strays, far parts, coverage;
   - **rows of vertices to bend on** at each joint.

   Pictures: each dummy's skeleton laid over the character's bones (side, chest close-up, front), weight patches,
   strays (red) and far parts (yellow), and the wireframe at the joints. It ends with a "To talk about" list. It
   changes nothing.
   - Checked 2026-10-20 on Marc's and Yola's original downloads. On Marc it found the problems we had found by hand: the
     collarbone slope (3 deg vs the dummies' 12 / 38), his forward head (Neck->Head 20.6 deg vs ~10), the head-top bone
     7.8 cm out of his cap, and 1.56x Yola's triangles. On Yola it found Tripo's head-on-chest weights.
   - Its limits:
     - a beard on the neck (a neighbouring bone) is not a stray;
     - hair lying close to the body is not a far part;
     - the patches picture shows both.
   - Then `balance_check.py` on the idle, once clips exist.
8. **The intake report** goes to the user before any fix:
   - front, side and back pictures of the bones in the mesh;
   - the patches view and a range-of-motion sheet;
   - the numbers;
   - a fix list ranked by what the player will see.

   The user draws on it. Their drawn lines (Marc's shoulder line) were the fastest way to agree on a fix.

**Then fix, smallest test first:**

9. **Skeleton fixes** that the numbers and the user agree on. Each is a test file in tests.json.
10. **Weights** as skin-only test files (section 1a): no rebuild, beside the clothed dummy and "as downloaded".
11. **Clips:** the plain retarget first. Each correction after it (contacts, hand match, posture fix) goes in only if
    its A/B beats having none (section 6). Start with what the player sees most: idle, run, the main weapon. The 120
    clips come after that.
12. **Game side, before the character is called done:**
    - weapon fits per character (the Rig Lab fits are keyed by character);
    - the game's sockets calibrated on its skeleton;
    - move speed against its stride: longer legs at Yola's speed means feet slide;
    - its collision capsule;
    - how it reads from the game's fixed camera, not only in close-ups.
13. **A handoff file from day one** (as MARC_HANDOFF.md): its files, how to rebuild it, and every step tried, kept or
    rejected, and why.

## 1. Where to look: Blender or the Rig Lab

**Blender is where you fix. The Rig Lab is where you judge.**

| Job | Where | Why |
|---|---|---|
| Skeleton at rest: joint spots, bone directions, the chest "V", end bones | **Blender** (bones in front of the mesh, front + side views) + `rig_compare.py` numbers | Only Blender shows bones inside the mesh and edits them |
| Skeleton in motion | **Rig Lab**, Compare row "bones", one colour per figure (character orange, its second version magenta, dummy white, clothed dummy green); Overlay for one on top of the other | Shows which bone bends differently, frame by frame |
| Weights: painting | **Blender** (Weight Paint, one bone at a time) | Only Blender paints |
| Weights: looking and comparing | **Rig Lab**, Compare row "weights" (one bone, or patches), on every figure at once, in motion | Blender's colours on the game's own skinning, beside the dummies |
| How the weights move | **Rig Lab** with the range-of-motion list and real clips | It is the game's renderer and skinning: what ships |
| Clip motion | **Rig Lab**, 1x, beside the clip's own source rig | The user's standard |
| Contacts and weapons | **Rig Lab** close-ups (Yola hands / Ref hands), 4+ angles | WEAPON_HOLD_PROCESS.md section 16 |

Never sign off from Blender's viewport alone:
- The game keeps only the **4 strongest bone influences per vertex**. The glTF export drops the rest, so a vertex
  that looks fine in Blender can move differently in the game.
- three.js skins linearly. Check that the Blender armature has **Preserve Volume off**, so both programs bend the same way.

The Unity hub is for blending and chaining clips, not for correcting rigs. Its Humanoid retarget was worse on Marc:
his gun arms dropped and his idle leaned back.

### 1a. The fast loop: the Rig Lab's Body check (2026-10-20)

The user asked to "optimize the workflow, and the rig lab". Open `viewer.html?char=<char>`, then pick **Body check**
in the Weapon row (no weapon). The other weapon modes are unchanged.

- **Character** (the first row): any character, no Advanced needed.
- **Clip list:**
  - **Range of motion** comes first.
  - Then the baked idles and moves, and the game's moves.
  - Then the **whole Quaternius library, played live**.
  - "run the list" plays one clip after another.
- **Live clips:** any Quaternius clip plays on any character with no Blender bake (`src/riglab/check.js`
  LiveRetarget). It uses `retarget.py`'s rule, bone lines child to child, and rest-relative collarbones. The hands and
  feet contacts are not applied. It is a preview of the body in motion, not the game's clip; its name tag says "live".
- **Compare row:**
  - **2nd figure:** a test version of this character, or another character (shape and clothes only).
  - **+ dummy:** a clothed dummy beside the bare one, on the clip's own skeleton. Brian for Mixamo clips; Peasant or
    Ranger for library clips; or the female mannequin.
  - **weights:** one bone (blue none, green half, red all) or patches (a colour per bone: borders and strays).
  - **bones:** the skeleton on every figure.
  - **names:** a tag over every figure, in the pictures too.
- **Show:** All / the character / Dummy, and **Overlay** puts every figure on one spot with the others as coloured
  ghosts.
- **Order, left to right:** the character, its second version, the clip's dummy, the clothed dummy. Always the same,
  and named in every picture, so nobody has to ask which one is the "before".

**How it saves time:**
1. **A new character, day one:** add its `CHARS` entry. The range of motion and the whole library play on it live
   before any bake, so skeleton and weight problems show before the 6-minute build.
2. **A weight change, no rebuild:**
   - Export the mesh and skeleton only (no clips) to `assets/test_clips/<char>_skin_<step>.glb`.
   - Add it to `assets/test_clips/tests.json` (`{ "<char>": [{ "file", "label", "extra": [] }] }`).
   - Pick it as the 2nd figure. It plays every clip of the character with the new weights, beside the current ones.
   - Rebuild only after the user approves.
   - A changed skeleton still needs a test bake: its clips depend on the joints.
3. **One standard look per question:**
   - Range of motion with "run the list";
   - then weights "patches" for strays;
   - then the suspect bone beside the clothed dummy;
   - then Overlay with bones for before / after.
4. **Pictures:** `__lab.sheet(name, cells, cols, w, h)` with `target: [x, y, z]` and `dist` for the whole row. The
   names are in the picture.

## 2. Which dummy answers which question

Different questions need different references. A bare dummy is the truth for motion and skeleton. It is **not** the
truth for clothing.

| Question | Reference | Notes |
|---|---|---|
| What should this clip look like? (motion) | **The clip's own source rig.** Mixamo clips: X Bot (male), Y Bot (female, to collect). Quaternius clips: the mannequin (`Mannequin_F` for women). Hub blends: their source clips' rig. | Never Yola or another of our characters (the user's rule, 2026-10-16) |
| Where do the joints go? Which way do the bones point? (skeleton) | The dummies, measured with `rig_compare.py` | Compare **directions and angles**, not absolute spots: bodies differ |
| How should clothes bend? (weights) | A **professionally weighted, clothed** character with a similar build and outfit (2b) | Bare dummies are skin-tight. Their cut on clothes tears sleeves and pinches waists |
| Is it the body or the rig? (shape) | A body built to the character's proportions (MPFB twin, 2b) | Marc's long torso and open flannel made correct poses read oddly |

A finished character of ours (Yola 2) may serve as a clothing-weight reference for a similar outfit. She is never a
skeleton or motion reference.

### 2a. The dummies we have (in the Rig Lab now)
- **Mixamo X Bot:** `assets/mixamo/*.fbx` (+ `reference/ref_xbot_*.fbx` with his mesh).
  - Traps: his neck and head axes sit 16.9 / 25.8 deg off his neck line; his FBX nests same-named bones.
- **Quaternius mannequin (male):** `assets/source/ual/UAL1_Full.glb`, `UAL2_Full.glb`.
- **Quaternius mannequin (female):** `Mannequin_F.glb`.
  - Mannequin trap: Z-up; never zero the hips' z.
- **Clothed men on the mannequin's rig** (added 2026-10-20): `assets/source/ual/Clothed_Male_Peasant.glb` (shirt) and
  `Clothed_Male_Ranger.glb` (tunic). They are Quaternius's free Modular Character Outfits with the Universal Base
  Characters' head, built by `tools/anim/clothed_ref_build.py`; the downloads are in `Downloads\quaternius_clothed_ref`.
  - Same 65 bones as the mannequin, so they play UAL clips as they are; joints within ~2.5% of height of the mannequin's.
  - In the Rig Lab: the **"dummy:"** select (bare / clothed). The clothed choices are Brian + Peasant, or Brian + Ranger.
  - Bald, their head read as a woman's to the user. The build adds the pack's buzzed hair, beard and regular eyebrows,
    and keeps neck_01 so there is no gap at the collar.
- **Clothed Mixamo man, Brian** (added 2026-10-20; the user's pick: T-shirt, jeans):
  `assets/source/refs/brian/Brian_tpose.fbx` (Mixamo T-pose FBX with skin, 55 MB, git-ignored; never commit or deploy it).
  - Mixamo's own 65 bones, prefix `mixamorig12:`. The Rig Lab renames them to X Bot's and plays X Bot's clips on him:
    the shotgun, pistol and rifle clips and every other Mixamo clip, when "dummy: clothed" is picked.
  - The hips travel is scaled to his hips.
  - Trap: load him from Mixamo's FBX. A Blender → GLB round trip turned his bones' local axes, and X Bot's rotations
    folded him over.

- **Chad, Mixamo's surgeon in scrubs** (downloaded 2026-10-20, the user's favourite of their 23 picks):
  `assets/source/refs/chad/Chad_tpose.fbx` (local only).
  - Professionally weighted scrubs on X Bot's skeleton: the clothed reference for Yola's scrubs, as well as a
    character candidate.
  - Intake report: `shots/intake/chad/report.html`.

### 2b. Clothed and shape references to collect (researched 2026-10-20)

| Reference | What it is | Skeleton / plays our clips | Licence, cost | Who gets it | Use it for |
|---|---|---|---|---|---|
| **Mixamo Y Bot** | Mixamo's female bot (X Bot's twin) | X Bot's skeleton; plays Mixamo clips natively | Free with an Adobe account | **User** (sign-in) | Motion and skeleton truth for Yola, Arianna, Lilah |
| **Mixamo clothed characters** (2-3 per hero, picked by outfit) | Adobe's rigged, clothed people from the Characters tab | Same skeleton as X Bot; plays Mixamo clips | Free with an Adobe account; royalty-free in games; raw files never redistributed (keep them local, untracked) | **User** (sign-in, FBX "with skin", T-pose) | Clothing weights in motion on Mixamo clips. Marc: an open over-shirt or jacket, cargo trousers, boots. Women: a loose top with trousers, and one fitted outfit |
| **Quaternius Universal Base Characters** | 6 bodies: Superhero, Regular and Teen proportions, male and female | The UAL humanoid rig; plays UAL clips natively | CC0. Standard free (2 bodies, 5 hairstyles); Source $19.99 (all bodies, rigged .blend) | Me, from itch.io, with the user's OK (Source: the user buys) | Shape variety on the UAL rig |
| **Quaternius Modular Character Outfits, Fantasy** | 12 outfits: tunics, robes, cloaks, armour | Same rig; plays UAL clips | CC0. Ranger and Peasant free; Source $20 (rigged .blend) | Me (free) / the user (Source) | **Loose cloth**, hand-weighted on the UAL rig: how a tunic or cloak should fall off the body. Stylised: read the weight falloff, not the look |
| **MPFB 2** (MakeHuman for Blender) | Free Blender extension. Makes a human of any height and build with clothes (shirts, suits, pants, shoes, hats) and a game-engine or Mixamo rig | Its own rig, retargeted by our pipeline | Output CC0 (add-on GPL); extensions.blender.org | Me, installing it in Blender, with the user's OK | A **shape twin**: dial in the character's height and torso length to tell body from rig. Its clothes follow the body mesh, so it is not a loose-cloth reference |
| **Second-opinion auto-rigs of our own mesh** | Mixamo's auto-rigger; Reallusion AccuRIG 2 (free; export needs a free ActorCore account) | Mixamo's / Reallusion's skeleton | Free | **User** (uploads, sign-in) | Compare their weights on our exact mesh with ours |

Not used:
- **KayKit:** never.
- **Unreal's Manny / Quinn / Paragon:** Epic's licence keeps them inside Unreal.
- **100 Avatars:** Mixamo auto-rigged, so no better than our own auto-rig; its repo names no clear licence.
- **Blender Studio's Rain / Snow:** CC-BY with excellent weights, but custom rigs that can't play our clips. Study only.

## 3. Skeleton checks (first, on every character, at rest)

Record the numbers (`rig_compare.py`) and a front + side picture of the bones in the mesh. The user sees them before
any paint.

1. **Scale and transforms:** 1 unit = 1 m, transforms applied, height as expected (Marc 1.80 m with cap and boots).
2. **Names and hierarchy:** mixamorig names (or a map like viewer.js `UE_MAP`), fingers present, nothing nested twice.
3. **Joint spots against the character's OWN body:** shoulder at the ball of the shoulder, elbow at the crease,
   wrist, hip socket, knee, ankle. Use X-ray, front and side. **Do not copy the dummy's coordinates.**
   - Marc, 2026-10-19: hips moved to the mannequin's spot pinched his waist. His spine moved to Yola's spots made him
     hang 7 cm in front of his feet. His original joints were right.
4. **Bone direction vs limb line:** each bone's axis against the line to its child. More than ~5 deg matters, because
   the retarget copies directions. X Bot's neck / head error put every Mixamo clip's head back, chin up.
5. **The chest "V" (collarbones):** in side view, compare the chest-to-shoulder direction with the dummy's. If the
   build differs, the collarbones must move from the character's own rest (`retarget(..., rest_relative=...)`).
   - Marc, 2026-10-20 (the user spotted it): copying the dummy's collarbone direction pulled his shoulders back and
     pinched his upper back. Rest-relative collarbones fixed it.
6. **Spine curve:** side view, hips -> spine -> chest -> neck angles against the dummy. A different curve shows up as a
   hump or a lean. `balance_check.py` measures lean as a share of height. Within ~1% of the dummy is fine.
7. **End bones inside the mesh:** head top, finger tips, toe ends. Marc's head-top bone stuck 27 cm out of his cap.
8. **Symmetry:** left and right joints mirror within ~1 cm.
9. **Rest pose:** note A-pose or T-pose. Weights are painted and judged in rest and in test poses.

## 4. Weight checks

First look in the Rig Lab: Body check, Compare row "weights". Every figure is coloured the same way, in motion, beside
the bare and clothed dummies. Start with patches, then one bone. Paint in Blender (Weight Paint, one bone at a time) with
the character and the clothed reference side by side, same pose, same camera, same bone. Look in the A-pose **and** in
test poses (the range-of-motion list): arm raised, elbow bent, leg lifted, torso twisted.

1. **Strays.** Parts that sit near each other at rest catch each other's weights:
   - hands by the hips: pockets and gowns follow the hands (`tools/anim/fix_gown_weights.mjs`);
   - beard and chin near the chest: the beard goes 100% head, the neck paint stops under the beard;
   - hair or ponytail on the back: Tripo put Yola's ponytail and face on her chest;
   - arms against the torso: the armpit.
2. **Rigid things on one bone:**
   - cap, helmet, hair, glasses -> head;
   - belt, holster -> hips;
   - backpack -> upper spine;
   - boots -> foot, with an ankle blend.
3. **Clothing gets soft, long falloffs.** Loose cloth follows the part it hangs from, not the limb under it.
   - Never copy a bare dummy's tight cut onto clothes. Marc's "underwear line" pinched his waist in splits, and a
     tighter armpit tore the sleeve.
   - The user (2026-10-19): "keep it a little bit softer ... imagine that the clothing would lift a little bit."
4. **Joints:**
   - elbow and knee fades long enough to avoid a twisted-wrapper crease;
   - the shoulder cap shared between collarbone, upper arm and chest;
   - the armpit defined but soft;
   - upper-arm paint stops at the elbow.
5. **At most 4 influences per vertex, normalised.** Limit and normalise in Blender before export, then look again.
6. **Symmetry:** mirror the paint when the mesh is symmetric.
7. **Coverage per bone vs the reference is a hint, never a target.** Marc's arm paint covered 1.2% of his body vs
   Yola's 3.3%. Copying Yola's paint changed little.

Pass: before / after heat maps beside the clothed reference, plus the range-of-motion clip in the Rig Lab at 1x, and
the user approves.

Never change a clip to hide a weight problem (round 19). Never fix what the user can't see.

## 5. The range-of-motion test (built 2026-10-20: the Body check's first list)

The same 14 Quaternius clips for every character. The mannequin and the clothed Quaternius men play them as they are,
and any character plays them live (`src/riglab/check.js` ROM):

| Clip | What it tests |
|---|---|
| A_TPose | Rest: arms out |
| Idle_Loop | Standing relaxed |
| Celebration | Arms overhead (armpits, shoulder caps) |
| Climb_Up_Loop | Reaching up, knee up |
| Push_Loop | Arms forward (back, shoulder blades) |
| Idle_FoldArms_Loop | Arms folded (chest, elbows) |
| Bow_Aim_Neutral | Elbow back, arm across |
| Sword_Heavy_Combo | Twists and big swings |
| Kick | High kick (hips, thighs) |
| Crouch_Idle_Loop | Deep crouch (knees, seat) |
| PickUp_Kneeling | Kneeling, reaching down |
| Sitting_Idle_Loop | Sitting (hips at 90 deg) |
| GroundSit_Idle_Loop | Sitting on the ground |
| Jog_Fwd_Loop | Jogging |

Turn on "run the list" to play them in order. Take sheets of the same frames for every character. It shows skeleton and
weight problems before any game clip does, and the test is the same every time, so characters can be compared.

## 6. Clips (the retarget)

- **Retarget each clip from its own original source** (X Bot FBX, the mannequin), never through another character.
  Clips that exist only on Yola 2 are the exception.
- **`blender/retarget.py` copies each source bone's world direction.**
  - Where the character's rest direction differs by build (collarbones; X Bot's neck / head axes), move that bone
    from the character's own rest (`rest_relative`) or correct it per bone (posture fix).
  - Decide per bone from the section 3 numbers, and show the user.
- **Contacts after the retarget** (`tools/anim/contacts.py`):
  - feet on the floor when the source's are planted;
  - the gun hand at the character's own reach, and the support hand comes to it;
  - never scale hand goals by arm length.
- **Every correction after the retarget is a switch, proven by an A/B against none.** This covers contacts, the hand
  match and the posture fix.
  - Bake the character without the correction as a 2nd figure (tests.json) and compare.
  - Marc, 2026-10-20: his right arm folded on the pistol idle because the hand-match step (10-19, `male1_match.py`)
    pulled his hand across and locked the arm straight: the elbow at 164 deg against X Bot's 151. Without it, his arm
    bent like Brian's. The step is dropped. His files are now the build plus the head fix only.
  - A "fix" that makes a clip match the dummy by one measure can make it look worse.
- **Fingers are the clip's own** (relaxed). Closing them is a separate, per-weapon job.
- **Test bakes first:** into `assets/test_clips`, viewed with `viewer.html?char=<char>&extra=assets/test_clips/<glb>`.
  Only after the user approves, into the character's files. Check by hash that only that clip changed.
- **If a clip looks wrong on every character, the clip is the problem** (X Bot's own shotgun back arch). Try another
  source for that move.

## 7. Judging (the user's standard)

- **Rig Lab, at 1x, then frame by frame.** The character beside the clip's source rig. Add a clothed or shape
  reference when the question is weights or shape.
- **Full-size close-ups.** Never thumbnails, never one number. Contacts per WEAPON_HOLD_PROCESS.md section 16.
- **Before / after:** always the same order (before on the left), labelled on the image. The user had to ask whether
  the far left was always the before.
- **Show progress:** send pictures as each step lands, without waiting to be asked.
- **Keep a file per step** (e.g. `male1_weights_00` ... `_21`) so any version can be restored.
- **When small fixes keep failing:** stop, put the original back, and do one big inspection
  (`balance_check.py`, `rig_compare.py`, the overlay on the dummy) before changing anything else. Marc, 2026-10-19:
  "Just stop doing small little changes. Do a big inspection."

## 8. Plan: what to build next (proposed 2026-10-20, not done)

1. **Collect the references (2b).**
   - **Done 2026-10-20:** the free Quaternius tiers, built into the two clothed men in 2a.
   - **In progress:** the user is downloading a clothed Mixamo man (shotgun reload + pistol idle) for the X Bot clips.
   - **Still to get:** Y Bot and clothed Mixamo women (user, sign-in); MPFB 2 (with the user's OK); the Quaternius
     Source tiers only if the user buys them.
   - New downloads go into `assets/source/refs/<name>/` (git ignores `assets/source/`). Mixamo files stay local: their
     licence forbids handing out the raw files.
2. **Rig Lab, more than one reference at once: done 2026-10-20** (section 1a).
   - Up to four figures: the character, a second version or another character, the clip's dummy, and a clothed dummy
     (Brian for Mixamo clips, Peasant or Ranger for library clips).
   - Also: the weight view, the name tags, one skeleton colour per figure, Overlay.
   - The Advanced row's "dummy:" select (swap the dummy itself for a clothed one) still works.
3. **The range-of-motion test: done 2026-10-20** (section 5). It is a list of library clips played live, rather than one
   keyed clip.
4. **A rig report: done 2026-10-20** as the intake report (`tools/anim/intake_report.py`, section 0a step 7).
5. **A Blender weight sheet:** mostly covered by the Rig Lab's weight view and `__lab.sheet`. Only needed for Blender-side
   checks (more than 4 influences, before the export drops them).
6. **Next:**
   - characters listed from a data file instead of `CHARS` in viewer.js, so a new character needs no code;
   - Mixamo clips played live onto any character, from X Bot, as the library is now.

## 9. Tools

| Tool | Does |
|---|---|
| `tools/anim/intake_report.py` | **A new character's day-one report** (section 0a): budget, skeleton vs the dummies, weights (strays, far parts), joint topology, pictures, a "to talk about" list; one HTML page |
| `tools/anim/rig_compare.py` | Rest numbers vs Yola 2 / mannequin / X Bot: height, limb shares, rest angles, axis-vs-line per bone |
| `tools/anim/balance_check.py` | Lean in front of the feet per clip and frame, every rig; overlay renders |
| `blender/retarget.py` | Direction-copy retarget; `rest_relative` bones move from the target's own rest |
| `tools/anim/contacts.py` | Feet, gun hand, support hand after the retarget |
| `tools/anim/yola2_build.py`, `male1_build.py` | Whole-character builds (Mixamo + UAL + carried clips) |
| `tools/anim/male1_posture.py` | The X Bot head / neck fix (and optional lower-back straightening) |
| `tools/anim/male1_match.py` | Hands matched onto the dummy's, skeleton on skeleton |
| `tools/anim/yola2_compare.py`, `yola2_sheet.py` | Numbers and side-by-side sheets vs the source rigs |
| `tools/anim/fix_gown_weights.mjs` | Clears arm weights from cloth near the hands at rest |
| Rig Lab `viewer.html?char=<char>` | `&extra=` test bakes, skeleton / finger overlay, `__lab.sheet(name, cells, cols, w, h)` pictures |
| Rig Lab **Body check** (`src/riglab/check.js`) | Live library clips on any character, range of motion, 2nd figure, clothed dummy, weights view, names, Overlay (section 1a) |
| `assets/test_clips/tests.json` | The test versions each character's 2nd figure can show (`&second=<glb>` for a one-off) |

Run bakes in background Blender (`blender -b --factory-startup --python ...`). Open new assets in Blender visibly first.

## 9a. What has proven itself, and what we were not checking (2026-10-20)

**Proven (keep doing):**
- **The clip's source rig as the truth**, never another of our characters. Round 19 failed without it.
- **A clothed dummy for clothing questions.** Brian showed that the shotgun reload's rounded back is in Mixamo's clip
  itself, not Marc's rig, which saved chasing a non-problem.
- **A/B without rebuilding** (2nd figure). In one afternoon it showed the softer elbow on every clip, and it caught the
  hand-match step folding Marc's arm.
- **One big inspection when small fixes keep failing.** `balance_check.py` showed Marc's original rig was balanced, and
  moving his joints is what had hurt.
- **The user's own eye and drawings.** The chest "V" and the shoulder line both came from the user. Give them clear
  pictures to draw on, then follow the lines.
- **A file per step and a handoff file.** Any version comes back, and work survives a compacted chat.

**Not checked until now (now in 0a):**
1. **Correction steps can hurt.** A/B every one against none (section 6).
2. **Mesh topology at the joints.** No weight paint fixes a missing edge loop.
3. **Dangly parts and open clothing** (flaps, hair, straps) need a decision of their own.
4. **The game, not the lab:**
   - stride against move speed (foot slide on a taller character);
   - the collision capsule;
   - how the character reads from the fixed game camera.
5. **The phone budget**, measured at intake (Marc: 48.8k triangles vs Yola 2's 31.3k).
6. **Animation Hub clips were made on Yola.** The executions' jump lengths and contacts are hers: re-bake them on the
   new character in the hub, or accept them, but decide.
7. **Women:**
   - Y Bot is not collected yet;
   - the chest deforms with no breast bones;
   - long hair needs sway bones.
8. **Licences:** where each download may live, before it is copied anywhere tracked.
9. **Adding a character still means editing code** (`CHARS` in viewer.js). Next: a data file (section 8).
10. **Intake was by hand.** Now it is one command: `tools/anim/intake_report.py` (section 0a step 7).

## 10. Where each character stands (2026-10-20)

- **Yola 2:** done, and the model for this process (WEAPON_HOLD_PROCESS.md section 17).
- **Marc (`char=male1`):** in the Rig Lab only. His clips were rebuilt 2026-10-20 with rest-relative collarbones and no
  hand match (his gun arm now bends like X Bot's). His weight tests (steps 22-25) are 2nd figures in tests.json, not in
  his files. Next: the user places his guns in the Rig Lab (fits save under `male1`). MARC_HANDOFF.md.
- **Arianna 2.0, Lilah:** waiting for Blender to be free. They follow this playbook from the skeleton step.
- **Mixamo candidates (2026-10-20):** the user's 23 picks, with Chad the surgeon first.
  - **All downloaded** (T-pose FBX) to `assets/source/refs/<name>/`, local only (the repo is public).
  - Each has its intake report and a textured portrait (`shots/intake/<name>/`). One comparison page:
    `shots/intake/compare.html`.
  - They share X Bot's skeleton, so the Mixamo clips play on them as they are; the Quaternius clips go through the
    usual retarget.
  - **Budget:** most of the people are 42-58k triangles (1.3-1.85x Yola) and need a lighter game version. The zombies
    are light (Zombie Girl 7.4k, Yaku 8.1k, Parasite 10.9k, Skeleton Zombie 12.5k), and so are Swat (19.5k) and Eve
    (27.2k).
  - **Scale to check:**
    - Remy's file is 3.79 units tall;
    - Eve's is 1.39;
    - the four light zombies are about 2.06.
  - **Mixamo download traps:**
    - the viewer carries the last animation onto the next character (clear it, or the T-pose option is gone);
    - the browser sometimes leaves a finished download as `<uuid>.tmp`, or renames it late: check the FBX footer and
      the size before filing it.
