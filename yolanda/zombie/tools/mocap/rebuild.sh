#!/bin/sh
# Rebuild the bat combo from the cleaned reference (steps 6-7 of README.md) and install it in the game.
# usage: sh tools/mocap/rebuild.sh <work dir>   (run from yolanda/zombie; Blender 5.2)
set -e
WD="$1"; B="${BLENDER:-C:/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
"$B" -b blender/characters.blend --python tools/mocap/retarget_mocap.py -- tools/mocap/data/combo13b.json bat_combo_mc bat_swing 24 "$WD/work.blend" 2>&1 | grep -E "pulled|anim contacts|reference leg|scale|shoe|contacts|pelvis|IK miss|RETARGET|Error|Traceback|line [0-9]" || true
"$B" -b "$WD/work.blend" --python tools/mocap/export_combo.py -- bat_combo_mc "$WD/yola_combo.glb" "$WD/combo_clipdata.json" 2>&1 | grep -E "EXPORTED|Error|Traceback" || true
cp "$WD/yola_combo.glb" assets/yola_combo.glb
node -e "const fs=require('fs');const cd=JSON.parse(fs.readFileSync('assets/clipdata.json'));Object.assign(cd,JSON.parse(fs.readFileSync(process.argv[1])));fs.writeFileSync('assets/clipdata.json',JSON.stringify(cd));console.log('installed bat_combo_mc')" "$WD/combo_clipdata.json"
