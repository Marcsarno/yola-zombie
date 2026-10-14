# Opening Day Visitors — original Happy Gumby style

Two actual Blender-built, rigged game-character prototypes based on the approved original Gray Patient 04 body, head and 20-joint skeleton. The newer sculpted zombie body was not used. Shared original proportions are retained; slight jaw/brow adjustments and the uniforms distinguish the adult visitor roles.

## Main files
- Opening_Day_Visitors.blend: both editable characters, original actions, named detachable modules, studio camera/lights.
- Baseball_Visitor.glb: standalone baseball visitor at the origin.
- Security_Visitor.glb: standalone private-security visitor at the origin.
- Baseball_Bat_Static.glb: detached static bat for belongings or floor placement. Origin is near the barrel’s resting contact point.
- Export_Statistics.json and Pose_QA.json: measured export and evaluated-frame results.

## Measured runtime geometry
| Character | Triangles | Mesh modules | Materials | Material primitives | Joints | Clips |
|---|---:|---:|---:|---:|---:|---:|
| Baseball | 21,128 | 5 | 14 | 19 | 20 | 5 |
| Security | 21,194 | 7 | 12 | 23 | 20 | 5 |

Both use named flat-color materials and zero image textures. All GLB resources are embedded. Material primitives are reported as an asset complexity measure, not a measured frame-rate guarantee. No blanket decimation was applied to this build.

## Modules and attachments
Baseball_Body, Baseball_Head, Baseball_Hair, Baseball_Cap and Baseball_Bat are separate skinned objects.
Security_Body, Security_Head, Security_Hair, Security_Vest, Security_Radio, Security_Holster and Security_Pistol are separate skinned objects.

Head/hair/cap use the original head joint. Bat follows anatomical right hand (Blender negative X, hand.R). Radio follows chest. Holster and pistol follow hips on anatomical right outer hip; pistol is holstered muzzle down. Vest and sewn clothing details inherit nearby original-body skin weights. Related small parts were consolidated into these modules while preserving material assignments.

Blender: +Z up, -Y forward. glTF: +Y up, +Z forward. Metres. Each standalone character is exported at its own ground origin; the combined Blender scene spaces them apart for review.

## Animation status and required prop handling
Five original baked clips are preserved: Idle, Walk_InPlace, SitDown, SeatedIdle and StandUp. They are the original 20-joint patient rig, not a claimed Mixamo conversion. No facial or articulated-finger rig, runtime IK, controller, collision, navigation or engine integration is supplied.

The bat is authored as a grounded resting prop for the standing pose. Independent 30 fps testing found that the unchanged inherited walk lowers its barrel up to 8.74 mm below ground. Idle keeps it approximately 1.26 mm above ground. Hide/stow/detach Baseball_Bat before locomotion or sitting. A visible carry state would need a coordinated hand/arm carry offset, not raising the bat alone through the hand. No new carry animation was authored.

Prop visibility is application logic; it is NOT automatically embedded in the five GLB clips. Hide the held bat and spawn Baseball_Bat_Static for belongings/floor placement as appropriate. Sitting screenshots show the bat hidden. The original hand mesh now has a simple curled resting grip; it remains curled when the bat is hidden because this rig has no individual finger controls.

The original seated animation is a forward-seat perch for a 0.47 m chair seat. The original chair-placement contract is Blender (0,+0.45,0) behind the standing origin. These files do not include the chair or seating controller. The guard vest and jersey piping were reweighted after actual sit tests caught intersections. Final visual pose checks include walk frame 8, sit-transition frame 31 and seated endpoint plus side view. Both characters were evaluated through all 275 inherited animation frames for finite geometry; independent reimport checked rigid attachments. Target-game integration and arbitrary new poses still need testing.

## Four actual review passes
1. Original body/head/rig reuse, uniform colors and initial headgear. Render review caught guard scalp intersections.
2. Head-shape-matched hair shells, collar/jersey piping, belt and subtle face adjustments. Review caught hairline/apex and strap issues.
3. Bat, radio, pistol/holster and outfit detail. Review caught floating sleeve trim, a relaxed rather than gripping hand, and barrel clearance.
4. Clean sleeves, curled original hand, grounded bat, fitted oval belts, seated cap badge, module consolidation, export and animation QA. Actual sit tests drove skin-weight corrections. Source snapshots and real rendered checkpoints are preserved.

All supplied character previews are actual mesh renders. The approved concept image remains a design reference only.
