# Animation advice handoff: how to make, fix and check animations in this project

Written 2026-10-22 for the chat building the **golf swing**. It collects what Marc (the user) and Claude learned over many
rounds of grips, combos, carries and holds. Most rules here cost hours or a wrong claim before they were learned. Read
this first, then the longer guides it points to.

## 1. Read these before touching anything

- `CHARACTER_RIG_PLAYBOOK.md`: the order for any character, skeleton, weights or clip fix. It also says which reference
  answers which question.
- `WEAPON_HOLD_PROCESS.md`, sections 16 (contacts) and 17 (rigging lessons): the procedure for anything held in the hands.
  **A golf club is a held weapon for this purpose.**
- `GRIPS_HANDOFF.md` ("START HERE") and `ANIMATION_HANDOFF.md`: what exists, the tools, the traps.
- `UAL_PACKS.md`: the Quaternius clip packs that are on disk.

## 2. Where the motion comes from

- **Real mocap or library clips only.** Use Mixamo (judged on X Bot / Y Bot) or Quaternius UAL (judged on its mannequin).
  - Mixamo has golf clips ("Golf Drive", "Golf Swing", "Golf Putt" and others). Start there.
  - **Never KayKit**, for anything: not as a reference, a pose or a clip.
- **Don't invent motion with code or IK paths.** Custom-authored attacks were rejected more than once ("i hate it").
- **Video tracking is not viable.**
  - The reference-video bat combo was dropped: single or opposite cameras give no depth, and the tracked skeleton
    produced inhuman wrists.
  - Video is good only for timing and order.
- **Blending existing strong clips works.**
  - The user loved results that chained or mixed real clips: Quaternius Sword Light A/B/C for the crowbar, and a Timeline
    blend for the guard's leap slam.
  - Prefer blending pieces of good clips over building new motion.
- **The Animation Hub** (Unity 6 at `C:\Users\marc7\AnimationHub`, guide `HUB_GUIDE.md`) is for blending, smoothing and
  IK touch-ups, baked and exported as GLB.
  - It is one-way: it never edits the game.
  - Exports go to `assets/test_clips/hub_*.glb` for the Rig Lab, and into the game only with the user's OK.
  - Name Yola clips `hub_*` (posture.js skips them).
  - Key scale on every bone, or the game gets NaN scales.

## 3. The reference is the truth, never your own numbers

- **Compare every clip with its source rig playing the same clip**, side by side in the Rig Lab, frame by frame and in
  motion at 1x:
  - X Bot / Y Bot for Mixamo clips;
  - the Quaternius mannequin for UAL clips.
- **Never use the current character as the reference.** The user said so explicitly.
- **A change is good only if the character looks more like the reference.**
  - Round 19 "fixed" self-intersection by measuring her mesh against itself and bending the motion to hit a number. The
    user called it "absolutely terrible", and it was rolled back.
  - Never alter a clip's motion to remove small clipping. Fix the rig, weights or retarget, and only where the user can see it.
- **Never report "matches" from one metric.** A distance scalar is blind to direction: a hand that is close but on the
  wrong side of the handle still reads as a match.
- **Any runtime correction must be checked for jitter**: frame-to-frame acceleration against the chest, before showing anything.
- **Show one small change at a time** for approval before applying it to many clips.

## 4. Viewing: one viewer, the Rig Lab

- Use only the **Rig Lab**: `yolanda/zombie/viewer.html`, `src/viewer.js`, on the hospital branch (opening-reveal).
  Port 5173 (preview "yolanda"); other chats may be using 5173, 5177 or 5181.
  - `?char=yola2` is Yola 3.0, `?char=male1` is Marc; `&extra=assets/test_clips/x.glb` adds test bakes.
  - It shows the clip beside X Bot or the mannequin, with finger bones, weights view, Overlay and **Body check** mode.
- **Never build a new viewer or test page.** Add what you need to the Rig Lab, beside the reference dummy.
  - The user said "you're building too many different viewers"; they want one place.
  - Give the user controls there (sliders, toggles) rather than settling values yourself.
- **The game is only for confirming that the game matches the Rig Lab**, not for reviewing motion.
- **Captures without the UI:**
  - in the Rig Lab: `__lab.sheet(name, cells, cols, w, h)` writes `zombie/shots/<name>.png`; cells look like
    `{target: 'rhand' | 'hands' | 'head' | 'body', dir: [x, y, z], dist}`, and `__lab.setFrame(f)` picks the frame;
  - in the game: `game.cam({target: 'yola', yaw, pitch, dist, h})`, `game.tick(n)`, `game.shot(name)`;
    `game.scriptInput = () => ({moveX, moveZ, aimX, aimZ})` drives him (aim magnitude 1 attacks; 0.3 aims only);
  - after `game.tick()` the loop stays manual: reload the page afterwards.
- **Empty screenshots** mean the browser pane is collapsed (a 0×0 canvas). Set `resize_window` to 1280×900, then set it
  back to the desktop preset when done.
- **Send the user pictures as you go** (SendUserFile), as contact sheets of several frames and angles. Don't stop and wait;
  they judge visually and track progress that way. Put the worst frame first.
- **Judge at full size, not thumbnails.** Small sheets hid contorted arms, open support hands and inhuman wrists.

## 5. Contacts (two hands on a club, a hand on a handle)

The method, every time:

1. **Describe the reference contact in words first.** For example: "left hand on top, right hand below it, its little
   finger overlapping, both thumbs down the shaft". Say on which frames the contact starts, holds and ends.
2. **Measure in the held object's own frame.** For a club, measure along the shaft, across it and around it, as 3
   components in hand-lengths. Report the worst frame, never averages; flag anything over ~0.3 hand-lengths.
3. **Close-ups at full size, finger bones on, both rigs at the same zoom.** Use at least 4 angles: the support-hand side,
   below, above, and the user's usual 3/4. Show contact start, middle, end and the worst frame.
4. **Look to find the problem, not to agree with a number.**
5. **Say exactly what you checked and what you didn't.**

For two-handed holds:

- **One hand carries the object; the other is placed in that hand's frame.** For a right-handed golfer, the lead (left)
  hand carries the club and the right hand comes to it.
  - Use one placement function for the game and the Lab: `render/holdfit.js` (twoHandLine, handOnto, reachShoulder),
    with the anatomical limits in `render/armfit.js`.
- **Never scale hand goals by arm length** between characters with different proportions.
- **Fingers are the clip's own (open).** Closing them is our job: the Rig Lab Hands curl and the fist pose.
- **Check prop facing numerically before the user can see it.** Measure the prop's front or axis against the body, then
  take front and side close-ups. Asset files don't say which way is front. The wheelchair zombie once sat backwards in
  the shared pane.
  - For a club: shaft along the hands, face square at impact, grip end at the top hand.

## 6. Fitting a prop in the hand

- **Settle where the object sits first, then the hands** (the Fit panel in the Rig Lab, per character).
- **Fit edits default to "This clip only".** A fit set for one clip must never move the everyday hold. Saves go to
  `shots/*.json`; Claude copies them into `assets/hold/` only when the user says so.
- **Keep the wrist natural.** The user's rule from the walkie-talkie: lock the wrist straight and let the object's angle
  come from the forearm, rather than bending the wrist to stand the object upright.
  - Turn the forearm about its own axis for facing.
- **Use the prop's own markers** (grip points, axes in `assets/arena/weapons.json`) rather than guessed numbers.

## 7. Rig and retarget traps (each one cost a round)

- **Watch the source clip on its own rig first.** A clip's name proves nothing: a "pistol" reload turned out to be a rifle
  reload.
- **The retarget points bones along the source bone's axis.**
  - X Bot's neck and head axes sit 16.9° / 25.8° off his real neck line, so heads tip back in every Mixamo clip until
    posture.js fixes it.
  - Check axis against limb line on both rigs before trusting a pose.
  - Also check each new character's own neck and head bone directions: Remy's rest neck leaned 16° forward.
- **three.js's mixer skips values that haven't changed.** A bone you turned on top of a clip keeps your change on the
  next frame unless you reset or undo it. The game uses `mixerWritesAll`; the Lab resets every bone to rest per redraw.
- **Other traps:**
  - X Bot FBX has nested bones with the same name.
  - Quaternius rigs are Z-up.
  - Background tabs pause requestAnimationFrame.
  - Guard against dt = 0.
- **The game strips horizontal hips travel** (root motion) at load. A move that travels (a golf step-through, a lunge)
  needs its travel handled, or the feet slide. The runtime foot lock in clipchars.js holds planted feet; a golf swing
  needs both feet planted.
- **Test-bake first** into `assets/test_clips`, show it in the Lab with `&extra=`, and only then put it in the game's clip
  file. Verify by hash that only that clip changed.
- **Measure that the game matches the Lab** (bones against the clip at the action's time).

## 8. Working practices

- **Blender:**
  - Run heavy or scripted jobs headless, as `blender -b --factory-startup --python ...`. Never `read_homefile` in the
    user's open Blender, and never touch another chat's open Blender.
  - For new assets the user wants to see Blender open and used: build in a visible Blender, then batch export.
- **Shared checkout:** other chats edit `clipchars.js`, `viewer.js` and `dist/` in the same folder.
  - Stage only your own hunks (`git diff -U0`, then `git apply --cached`). Never `git add -A`.
  - Never commit another chat's files.
  - Never push unless the user asks.
- **Builds:** `node build.mjs`. Commit `dist/` only as a clean build of committed sources, made in a temporary worktree
  and written with `hash-object` / `update-index` so others' working `dist/` stays.
- **One code path for the game and the Lab.** Put pose logic in a small shared module under `src/render/` (see
  `radiohold.js`, `casecarry.js`) that both use, with per-character settings in `assets/hold/<name>.json` that the Lab
  saves. Then what the user tunes is exactly what the game does.
- **Temporary-vector aliasing:** module-level scratch vectors reused inside helper functions silently corrupted a solve
  this week (the grille landed 70 cm off). Give each helper its own temporaries.
- **The user judges looks themselves.** Offer toggles and options, not one pick. Report faithfully what you did not check.

## 9. Golf-specific starting suggestions

- **Clip:** start from a Mixamo golf clip on X Bot, then retarget to the character. Compare in the Rig Lab beside X Bot
  before any edit.
- **Club:** a rigid prop of known length.
  - Find or make its grip point, shaft axis and clubface direction as markers (in a visible Blender).
  - Fit it in the lead hand first, then bring the trail hand onto the grip in the lead hand's frame (section 5).
- **Feet:** both stay planted through the swing. Watch the foot lock and the stripped root motion.
- **Check frames:** address, top of backswing, impact, follow-through.
  - At impact: clubface square, shaft roughly in line with the lead arm, hands slightly ahead of the ball.
  - Check the lead wrist against the reference at the top: it should not bend past what X Bot does.
- **Show the user** a sheet of those four frames from face-on, down-the-line (behind the hands) and above, with the
  reference beside it.
