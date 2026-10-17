#!/bin/sh
# Two chats share this folder: commit dist bundles built from COMMITTED sources only. Builds dist/combat.js + dist/viewer.js
# from HEAD in a temporary git worktree and stages those blobs (the working copy, with the other chat's work in progress,
# is untouched). Usage, after committing your sources: sh tools/clean_dist.sh && git commit -m "dist: ..."
set -e
R="/c/Users/marc7/.claude/projects/Zombie Apoc"; W="$TEMP/wt_clean"
cd "$R"; rm -rf "$W"; git worktree prune; git worktree add -q --detach "$W" HEAD
cd "$W/yolanda/zombie"; cmd //c mklink //J node_modules "C:\Users\marc7\.claude\projects\Zombie Apoc\yolanda\zombie\node_modules" >/dev/null
node build.mjs >/dev/null 2>&1 || { echo BUILD FAILED; exit 1; }
cd "$R/yolanda/zombie"
for f in combat viewer; do H=$(git hash-object -w "$W/yolanda/zombie/dist/$f.js"); git update-index --cacheinfo 100644,$H,yolanda/zombie/dist/$f.js; done
cd "$R"; git worktree remove --force "$W"; echo CLEAN_DIST_STAGED
