YOLA OPENING V3 — CLAUDE IMPLEMENTATION PACKAGE

START HERE
1. Give Claude START_HERE_CLAUDE.txt and the full Yola_Opening_V3_Handoff.txt.
2. Extract this ZIP and make its audio/ directory and manifests available to the current game project.
3. Supply the existing Hospital_Outbreak_Texture_Kit_v1.zip and approved visual reference separately if they are not already available. They are intentionally not duplicated in this ZIP.
4. Preserve the existing approximately 47-second narrator recording in the project. It was not regenerated and is not included here.

CONTENTS
- audio/: 66 original MP3 clips; 33 lines, takes A and B for each.
- audio_manifest.json and audio_manifest.csv: exact transcript, role, stock voice, take, local clip filename, measured/decoded/provider durations, stable provider task ID, byte count and SHA-256.
- audition_reels/: one all-A and one all-B unselected raw audition reel, plus audition_cues.csv for line locations.
- Yola_Opening_V3_Handoff.txt: full plain-text script, choices, staging, creative direction, integration requirements and test plan.
- Yola_Opening_V3_Handoff.md: the same full handoff with Markdown formatting.
- START_HERE_CLAUDE.txt: short implementation prompt.
- SOURCES.txt: public clinical and Three.js reference URLs.
- technical_qa.json: actual technical checks, durations and hashes.
- SHA256SUMS.txt: checksums for the delivered content files.

AUDIO USE
Use exactly one selected take for each line. A/B labels are alternatives, not rankings. All manifest entries are selected=false until a human or the implementation reviewer listens and chooses. The three choice cards, hints and explanations are unvoiced on-screen text.

The reels play lines 01–33 sequentially, including the optional objective cue, with exactly 0.4 seconds added between clips. The takes themselves retain their existing silences. Reels omit the existing narrator, choice interactions, clinical waits, music, sound effects and staging. They are unselected raw dialogue compilations for listening, not dramatized scenes, final edits, normalized dialogue or final mixes. Only these convenience reels were re-encoded; the 66 original downloaded MP3s remain byte-for-byte unchanged.

Take A reel: 90.514 seconds; 1,448,912 bytes.
Take B reel: 92.682 seconds; 1,483,603 bytes.
The complete staged opening runs longer than these dialogue-only reels. Use playback-completion events rather than these audition timings to drive the final scene.

COMPLETED TECHNICAL QA
66/66 MP3 files downloaded; 2,593,320 original audio bytes in total.
66/66 passed ffprobe inspection and a complete ffmpeg decode with no reported errors.
66/66 contain nonzero decoded audio and valid positive durations.
66 unique MP3-file hashes and 66 unique decoded-PCM hashes; no exact byte or decoded-audio duplicates.
All container durations agree with provider metadata within 0.25 seconds, allowing for MP3 frame padding.
Both audition reels also passed complete decode checks.

NOT YET VERIFIED
No full perceptual acting, pronunciation or listening review has been performed. No takes have been selected or loudness-normalized. The package has not been integrated into or tested in the game. In particular, listen for Yola/rocuronium pronunciation, naturalness, intended urgency and any unintended whispering before selecting takes. Technical decoding is not evidence of acting quality or exact spoken-word accuracy.

CREDITS AND PROVENANCE
The earlier 66 generations used 92 included credits, with 393 remaining at generation completion. No credits were purchased. Downloading, technical QA, making the reels and packaging used no new generation calls or credits. Voices are stock generated voices: Niki (Yola), Brodie (patient), Wanda (receptionist), Leslie (qualified anesthesia colleague). They are not clones of real people.

The clean manifests contain stable task IDs for provenance. There are no signed audio URLs, expiring download tokens or raw generation-response files in this package. The MP3s are included locally, so the package does not depend on the original download URLs remaining valid.
