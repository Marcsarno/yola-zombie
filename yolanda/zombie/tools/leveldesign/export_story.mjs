// The story as the game has it now, for the design repo (story/): every line, objective and stop, read from the game's
// own source, written as Markdown the cloud chat can read and suggest changes to. Sources are never changed.
//   node tools/leveldesign/export_story.mjs <design repo>
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { LINES as OPEN_LINES, OBJECTIVES, RADIO } from '../../src/opening/content.js';
import { LINES as HOOD_LINES, GOALS } from '../../src/hood/script.js';
import { STOP_ORDER, SUPPLIES } from '../../src/hood/level.js';

const [, , designDir] = process.argv;
const here = path.dirname(fileURLToPath(import.meta.url)), Z = path.resolve(here, '../..');
let commit = 'unknown'; try { commit = execSync('git rev-parse --short HEAD', { cwd: Z }).toString().trim(); } catch { /* not a checkout */ }
const head = (t) => `# ${t}\n\nExported from the game (yola-zombie @ ${commit}) by tools/leveldesign/export_story.mjs. Edit ideas in story/NOTES.md or as markers in the editor; this file is replaced on every export.\n\n`;
const txt = (v) => typeof v === 'string' ? v : Array.isArray(v) ? v.map(txt).join(' / ') : v && typeof v === 'object' ? (v.text || v.label || v.title || JSON.stringify(v)) : String(v);

// ---- Chapter 1: the opening and the hospital floors
let c1 = head('Chapter 1 · Yola’s Medical Center: lines and objectives');
c1 += '## The opening’s spoken lines\n\n| id | who | line |\n|---|---|---|\n';
for (const l of OPEN_LINES) c1 += `| ${l.id} | ${l.who || ''} | ${String(l.text || '').replace(/\|/g, '\\|')} |\n`;
c1 += '\n## Objectives (what the HUD asks)\n\n';
for (const [k, v] of Object.entries(OBJECTIVES)) c1 += `- **${k}**: ${txt(v)}\n`;
c1 += '\n## The radio\n\n';
for (const [k, v] of Object.entries(RADIO)) c1 += `- **${k}**: ${txt(v)}\n`;
fs.mkdirSync(path.join(designDir, 'story'), { recursive: true });
fs.writeFileSync(path.join(designDir, 'story/chapter1.md'), c1);

// ---- Chapter 2: Marc's neighbourhood
const LABEL = { home: 'Home', curve: 'The curve', gate: 'The gate', club: 'Club front', lot: 'Parking lot', clubhouse: 'Clubhouse', west: 'Roadblock', grandma: 'Grandma’s', playground: 'Playground', dock: 'The dock' };
let c2 = head('Chapter 2 · Marc’s neighbourhood: stops, lines and goals');
c2 += '## The stops, in order\n\n' + STOP_ORDER.map((s, i) => `${i + 1}. **${LABEL[s]}** (\`${s}\`)${SUPPLIES[s] ? ' · supplies: ' + SUPPLIES[s].map((q) => q[0]).join(', ') : ''}`).join('\n') + '\n\n';
c2 += '## Lines (subtitles; no recordings yet)\n\nLines marked *radio* play over the radio. w01–w03 and d01 are drafts waiting for approval; LOOTER lines are the remake’s own.\n\n| id | who | line |\n|---|---|---|\n';
for (const [id, [who, text, radio]] of Object.entries(HOOD_LINES)) c2 += `| ${id} | ${who}${radio ? ' *radio*' : ''} | ${String(text).replace(/\|/g, '\\|')} |\n`;
c2 += '\n## Goals (the objective line on screen)\n\n';
for (const [k, v] of Object.entries(GOALS)) c2 += `- **${k}**: ${v}\n`;
fs.writeFileSync(path.join(designDir, 'story/chapter2.md'), c2);
console.log('wrote story/chapter1.md and story/chapter2.md');
