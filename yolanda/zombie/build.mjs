// Bundle the combat benchmark: node build.mjs [--watch]
// dist/combat.js: the game. dist/rapier.js: the Rapier physics library, loaded only when selected.
import * as esbuild from 'esbuild';

const base = {
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  sourcemap: true,
  minify: process.argv.includes('--min'),
  logLevel: 'info',
};
const game = { ...base, entryPoints: ['src/main.js'], outfile: 'dist/combat.js' };
const viewer = { ...base, entryPoints: ['src/viewer.js'], outfile: 'dist/viewer.js' };
const moves = { ...base, entryPoints: ['src/moves.js'], outfile: 'dist/moves.js' };
const rapier = { ...base, entryPoints: ['src/rapier-entry.js'], outfile: 'dist/rapier.js', sourcemap: false, minify: true };
if (process.argv.includes('--watch')) (await esbuild.context(game)).watch();
else await Promise.all([esbuild.build(game), esbuild.build(rapier), esbuild.build(viewer), esbuild.build(moves)]);
