// Bundle the combat benchmark: node build.mjs [--watch]
import * as esbuild from 'esbuild';

const opts = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  outfile: 'dist/combat.js',
  sourcemap: true,
  minify: process.argv.includes('--min'),
  logLevel: 'info',
};
if (process.argv.includes('--watch')) (await esbuild.context(opts)).watch();
else await esbuild.build(opts);
