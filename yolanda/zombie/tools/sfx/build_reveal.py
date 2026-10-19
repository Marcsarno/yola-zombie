# Builds the Sound Board's "Opening reveal" candidates (assets/sfx/reveal/*.mp3) and their index (src/sfx/reveal.gen.js)
# from raw CC0 recordings kept outside the repo (SOUND_PLAN.md "Sources"):
#   python build_reveal.py <scratch dir: dl_bsb/<group>/<id>.flac|ogg (BigSoundBank), x_oga_reveal/ (OpenGameArt)> <zombie dir>
# Each group below suits one moment of the reveal (src/opening/revealsound.js). Long recordings are cut into their events;
# some takes are processed from the recordings (pitched down, slowed, reversed into a swell, a pitch glide for the power
# dying), never synthesised. Labels say the source and what the take measures as.
import os, sys, glob, json
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

SR = 44100
SRC, ZDIR = sys.argv[1], sys.argv[2]
OUT = os.path.join(ZDIR, 'assets', 'sfx', 'reveal'); os.makedirs(OUT, exist_ok=True)
groups, labels = {}, {}
B = lambda grp, i: sorted(glob.glob(os.path.join(SRC, 'dl_bsb', grp, f'{i:04d}.*')), key=lambda p: not p.endswith('.ogg'))[0] # (an OGG copy wins: some FLACs there don't decode)
O = lambda name: os.path.join(SRC, 'x_oga_reveal', name)

def load(p):
    d, sr = sf.read(p, always_2d=True); x = d.mean(1)
    if sr != SR: g = np.gcd(SR, sr); x = resample_poly(x, SR // g, sr // g)
    return x

def pitch(x, semi):
    if not semi: return x
    r = 2 ** (semi / 12); up, down = int(round(1000 / r)), 1000
    g = np.gcd(up, down); return resample_poly(x, up // g, down // g)

def glide(x, r0, r1):
    # play the recording at a speed sliding from r0 to r1 (a motor or hum winding down as the power dies)
    n_out = int(len(x) / ((r0 + r1) / 2)); rates = np.linspace(r0, r1, n_out); pos = np.cumsum(rates)
    pos = pos[pos < len(x) - 1]; return np.interp(pos, np.arange(len(x)), x)

def filt(x, kind, f, order=2): return sosfilt(butter(order, f, kind, fs=SR, output='sos'), x)
def cut(x, a, b): return x[int(a * SR):int(b * SR)].copy()
def fade_in(x, s): n = min(len(x), int(s * SR)); x = x.copy(); x[:n] *= np.linspace(0, 1, n) ** 2; return x

def describe(x):
    dur = len(x) / SR; w = int(0.01 * SR)
    env = np.array([np.sqrt(np.mean(x[i:i + w] ** 2)) for i in range(0, max(1, len(x) - w), w)]) + 1e-9
    sp = np.abs(np.fft.rfft(x[:SR * 2])); f = np.fft.rfftfreq(len(x[:SR * 2]), 1 / SR); cen = (sp * f).sum() / (sp.sum() + 1e-9)
    tone = 'deep' if cen < 500 else 'dark' if cen < 1200 else 'mid' if cen < 3000 else 'bright'
    h = len(env) // 2; slope = 20 * np.log10(env[h:].mean() / env[:h].mean()) if h > 2 else 0
    shape = 'builds' if slope > 3 else 'dies away' if slope < -7 else 'steady'
    return f'{dur:.1f} s, {tone}, {shape}'

def finish(x, key, label, tail_db=-50, peak_db=-1, keep_start=False, fade=0.08):
    x = filt(x, 'highpass', 28)
    pk = np.abs(x).max()
    if pk < 1e-6: return
    if not keep_start: on = np.argmax(np.abs(x) > pk * 0.02); x = x[max(0, on - int(0.004 * SR)):]
    above = np.where(np.abs(x) > pk * 10 ** (tail_db / 20))[0]
    x = x[:min(len(x), above[-1] + int(0.02 * SR))].copy()
    if len(x) < 0.04 * SR: return
    n = min(len(x) // 3, int(fade * SR)); x[-n:] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
    x *= 10 ** (peak_db / 20) / np.abs(x).max()
    i = len(groups.setdefault(key, [])) + 1
    name = f'{key}_{i:02d}'; rel = f'assets/sfx/reveal/{name}.mp3'
    sf.write(os.path.join(OUT, name + '.mp3'), x.astype(np.float32), SR, format='MP3', compression_level=0.1)
    groups[key].append(rel); labels[rel] = f'{name} · {label} — {describe(x)}'

def events(x, thr_db=-28, gap=0.12, min_len=0.04, max_len=2.0, pre=0.01):
    # the separate hits in a recording: where it rises above thr_db (re its peak) after gap s quieter
    w = int(0.005 * SR); pk = np.abs(x).max()
    env = np.array([np.abs(x[i:i + w]).max() for i in range(0, len(x) - w, w)]) / pk
    on = env > 10 ** (thr_db / 20); segs = []; s = None; g = 0
    for i, v in enumerate(on):
        if v:
            if s is None: s = i
            g = 0
        elif s is not None:
            g += 1
            if g * 0.005 > gap: segs.append((s, i - g)); s = None; g = 0
    if s is not None: segs.append((s, len(on)))
    out = []
    for a, b in segs:
        if (b - a) * 0.005 < min_len: continue
        a0 = max(0, a * w - int(pre * SR)); b0 = min(len(x), a * w + int(max_len * SR), b * w + int(0.25 * SR))
        out.append(x[a0:b0])
    return out

def take_events(key, path, label, n=99, semi=0, skip=0, **kw):
    x = load(path)
    for j, e in enumerate(events(x, **kw)[skip:skip + n]):
        finish(pitch(e, semi), key, f'{label} (hit {j + 1 + skip}{f", {semi:+d} st" if semi else ""})')

def take(key, path, label, semi=0, a=None, b=None, proc=None, **kw):
    x = load(path)
    if a is not None: x = cut(x, a, b)
    x = pitch(x, semi)
    if proc: x = proc(x)
    finish(x, key, label + (f' ({semi:+d} st)' if semi else ''), **kw)

# ---------------- the lift ----------------
for i, lab in [(2153, 'subway door bell'), (2531, 'counter bell'), (2533, 'counter bell'), (479, 'counter bell'), (1269, 'industrial doorbell'), (2365, 'doorbell')]:
    take_events('ding', B('lift', i), f'{lab} #{i} (BigSoundBank)', n=2, thr_db=-20, gap=0.4, max_len=2.2)
take('ding', B('lift', 1631), 'microwave bell #1631 (BigSoundBank)')
take('ding', B('lift', 2531), 'counter bell, an octave down, like a big lift chime (BigSoundBank)', semi=-12, a=0, b=2.6)
take('ldoorsopen', B('lift', 1711), 'real lift doors opening (elevator, 3 floors, BigSoundBank)', a=23.55, b=26.3)
take('ldoorsopen', B('lift', 1712), 'real lift doors opening (elevator, 6 floors, BigSoundBank)', a=34.35, b=37.1)
take('ldoorsopen', B('lift', 336), 'sliding door opening (BigSoundBank)', a=0.12, b=2.45)
take('ldoorsopen', B('lift', 1510), 'car sliding door opening (BigSoundBank)')
take('ldoorsopen', B('lift', 1803), 'automatic hatch starting to open (BigSoundBank)', a=0, b=2.6, keep_start=True)
take('ldoorsclose', B('lift', 1711), 'real lift doors closing (elevator, 3 floors, BigSoundBank)', a=3.1, b=5.75)
take('ldoorsclose', B('lift', 1712), 'real lift doors closing (elevator, 6 floors, BigSoundBank)', a=2.8, b=5.25)
take('ldoorsclose', B('lift', 336), 'sliding door closing (BigSoundBank)', a=2.55, b=4.95)
take('ldoorsclose', B('lift', 1511), 'car sliding door closing (BigSoundBank)')
for i in (2358, 2359, 2360): take_events('ldoorsclose', B('lift', i), f'metal barrier closing #{i} (BigSoundBank)', n=1, thr_db=-16, gap=0.6, max_len=2.5)
take('larrive', B('lift', 1711), 'real lift car arriving: the motor running down to a stop (BigSoundBank)', a=16.8, b=20.0, keep_start=True)
take('larrive', B('lift', 1712), 'real lift car arriving: the motor running down to a stop (BigSoundBank)', a=28.5, b=31.7, keep_start=True)
take('larrive', B('lift', 1711), 'real lift car starting off (BigSoundBank)', a=5.3, b=8.6, keep_start=True)
take('larrive', B('lift', 1712), 'real lift car starting off (BigSoundBank)', a=4.8, b=8.1, keep_start=True)
take('larrive', B('lift', 1803), 'hatch motor slowed into a lift motor (BigSoundBank)', semi=-9, a=10, b=12.2, proc=lambda x: fade_in(x, 0.9), keep_start=True)
for i in (3061, 3062, 3063): take_events('clunk', B('power', i), f'industrial switch clunk #{i}, deep (BigSoundBank)', n=1, semi=-5, thr_db=-15, gap=0.5, max_len=0.9)
for i in (2358, 2360): take_events('clunk', B('lift', i), f'metal barrier settling #{i} (BigSoundBank)', n=1, skip=1, thr_db=-18, gap=0.4, max_len=0.9)

# ---------------- power and the flashes ----------------
take_events('breaker', B('power', 1092), 'circuit breaker thrown (BigSoundBank)', n=4, thr_db=-18, gap=0.5, max_len=1.2)
for i in (3061, 3062, 3063): take_events('breaker', B('power', i), f'industrial switch #{i} (BigSoundBank)', n=1, thr_db=-15, gap=0.5, max_len=1.5)
for i, a, b in [(64, 1, 5), (86, 0, 2.7), (2118, 1, 5), (2119, 1, 5), (2120, 1, 5)]:
    take('pdown', B('power', i), f'transformer / neon hum #{i} winding down as the power dies (BigSoundBank)', a=a, b=b, proc=lambda x: glide(x, 1.0, 0.18), keep_start=True, fade=0.4)
take('pdown', B('lift', 1803), 'hatch motor winding down as the power dies (BigSoundBank)', a=4, b=7, proc=lambda x: glide(x, 1.0, 0.15), keep_start=True, fade=0.4)
for i in (950, 951, 952): take_events('arc', B('power', i), f'welding arc (BigSoundBank #{i})', n=3, thr_db=-14, gap=0.15, max_len=0.7)
take_events('arc', B('power', 134), 'electric shock (BigSoundBank)', n=4, thr_db=-14, gap=0.25, max_len=0.8)
for i in (2143, 2144, 2145, 2146): take('arc', B('power', i), f'flashing light bulb zap #{i} (BigSoundBank)')
for i in (2949, 2961): take_events('crack', B('hits', i), f'whip crack #{i} (BigSoundBank)', n=2, thr_db=-22, gap=0.15, max_len=0.6)
for i in (1806, 1807, 1808): take('crack', B('hits', i), f'short explosion #{i} as a crack (BigSoundBank)')
take('ring', B('power', 1388), 'tinnitus ring (BigSoundBank)', a=2, b=5.5, proc=lambda x: fade_in(x, 0.05), keep_start=True, fade=0.8)
take('ring', B('power', 1388), 'tinnitus ring, longer (BigSoundBank)', a=10, b=15, proc=lambda x: fade_in(x, 0.05), keep_start=True, fade=1.5)
take('ring', B('hits', 1482), 'soft gong, high and ringing (BigSoundBank)', semi=7, a=0, b=4.5, fade=1.2)

# ---------------- cinematic hits ----------------
for i in (1483, 1484, 1485): take('boom', B('hits', i), f'gong struck hard, an octave down: a cinematic boom (BigSoundBank #{i})', semi=-12, a=0, b=4.5, fade=1.5)
take('boom', B('hits', 1482), 'soft gong, two octaves down: a deep swell-hit (BigSoundBank)', semi=-19, a=0, b=4, fade=1.2)
for i in (1807, 1808): take('boom', B('hits', i), f'explosion, slowed into a big low hit (BigSoundBank #{i})', semi=-9)
take('boom', B('hits', 1023), 'distant explosion (BigSoundBank)')
take('boom', B('hits', 1806), 'distant explosion, slowed (BigSoundBank)', semi=-7)
for i in (2338, 2339, 2341, 2333): take('thump', B('drums', i), f'bass tom, slowed into a deep thump (BigSoundBank #{i})', semi=-9, a=0, b=1.8, fade=0.5)
for i in (2459, 2462, 2464, 2466): take('thump', B('smash', i), f'punch, slowed into a deep thump (BigSoundBank #{i})', semi=-10)
take('thump', B('hits', 1806), 'distant explosion, short and deep (BigSoundBank)', semi=-5, fade=0.3)

# ---------------- slow motion ----------------
WH = [(1795, 'whoosh'), (1796, 'whoosh'), (1797, 'whoosh'), (1798, 'whoosh'), (1799, 'whoosh'), (1800, 'whoosh'), (1801, 'whoosh'), (1802, 'whoosh'), (127, 'sword through the air'), (128, 'sword through the air')]
for i, lab in WH: take('whoosh', B('whoosh', i), f'{lab} #{i} (BigSoundBank)')
take_events('whoosh', B('whoosh', 573), 'whoosh (BigSoundBank #573)', n=3, thr_db=-15, gap=0.3, max_len=1.0)
for k in (1, 3, 5, 9, 12): take('whoosh', O(f'swishes/swish-{k}.wav'), f'swish {k} (artisticdude, OpenGameArt)')
for i in (1795, 1796, 1800, 1801): take('slowswish', B('whoosh', i), f'whoosh #{i}, slowed for slow motion (BigSoundBank)', semi=-7)
for k in (2, 5, 9): take('slowswish', O(f'swishes/swish-{k}.wav'), f'swish {k}, slowed for slow motion (OpenGameArt)', semi=-8)
def suck(x, tail):
    r = pitch(x, -5)[::-1].copy(); r *= np.linspace(0, 1, len(r)) ** 2
    return np.concatenate([r, tail])
gong = cut(pitch(load(B('hits', 1484)), -14), 0, 2.2)
for i in (1796, 1800, 1801, 1795):
    take('suck', B('whoosh', i), f'whoosh #{i} reversed into a sucked-in swell, then a deep gong drop (BigSoundBank)', proc=lambda x: suck(x, gong * 0.9), keep_start=True, fade=0.8)
for k in (5, 9): take('suck', O(f'swishes/swish-{k}.wav'), f'swish {k} reversed into a swell, then a deep gong drop (OpenGameArt + BigSoundBank)', proc=lambda x: suck(x, gong * 0.9), keep_start=True, fade=0.8)
for i in (1795, 1796, 1800, 1801): take('slowdown', B('whoosh', i), f'whoosh #{i} with its pitch falling: time stretching (BigSoundBank)', semi=-2, proc=lambda x: glide(x, 1.0, 0.35))
take('slowdown', B('hits', 1482), 'gong swell sliding down (BigSoundBank)', semi=-5, a=0, b=3, proc=lambda x: glide(x, 1.0, 0.4), fade=0.8)
take_events('launch', B('steps', 1318), 'fast step on concrete: the push-off (BigSoundBank)', n=4, thr_db=-12, gap=0.12, max_len=0.35)
take('launch', B('steps', 1835), 'jump on concrete (BigSoundBank)'); take('launch', B('steps', 1836), 'jump on concrete (BigSoundBank)')
for i in (218, 770, 1929, 1930): take_events('heart', B('heart', i), f'heartbeat #{i} (BigSoundBank)', n=3, thr_db=-12, gap=0.3, max_len=0.75)
for i in (243, 244): take('heart', B('heart', i), f'heartbeat #{i} (BigSoundBank)')
for i in (218, 770): take_events('heart', B('heart', i), f'heartbeat #{i}, deep (BigSoundBank)', n=2, semi=-4, thr_db=-12, gap=0.3, max_len=0.8)
for i in (514, 606): take_events('bigstep', B('steps', i), f'shoe on concrete/stone, slowed into a heavy footfall (BigSoundBank #{i})', n=3, semi=-8, thr_db=-24, gap=0.15, max_len=0.5)
for i in (1835, 1836): take('bigstep', B('steps', i), f'jump on concrete, slowed (BigSoundBank #{i})', semi=-7)
for i in (2338, 2339, 2341, 2333): take('drum', B('drums', i), f'bass tom (BigSoundBank #{i})', a=0, b=2, fade=0.5)
for i in (2338, 2341): take('drum', B('drums', i), f'bass tom, deeper: a war drum (BigSoundBank #{i})', semi=-5, a=0, b=2.4, fade=0.6)

# ---------------- the finisher ----------------
for i in (2459, 2460, 2461, 2462, 2463, 2464, 2465, 2466, 2467, 2468): take('scrack', B('smash', i), f'punch #{i} (BigSoundBank)')
for i in (2949, 2961): take_events('scrack', B('hits', i), f'whip crack #{i} (BigSoundBank)', n=1, thr_db=-22, gap=0.15, max_len=0.6)
for k in (1, 2, 3, 4): take('scrack', O(f'bfh1_wood_breaking_0{k}.ogg'), f'wood breaking {k} (rubberduck, OpenGameArt)')
take_events('sbone', B('smash', 596), 'bones cracking (BigSoundBank #596)', n=6, thr_db=-14, gap=0.2, max_len=0.6)
for i in (1408, 1409): take('sbone', B('smash', i), f'bones cracking #{i} (BigSoundBank)')
for i in (1113, 1114, 3081): take_events('sbone', B('smash', i), f'apple crunched: the classic film bone crunch (BigSoundBank #{i})', n=2, thr_db=-12, gap=0.3, max_len=0.5)
for i in (1519, 1520, 1521): take_events('swet', B('smash', i), f'big splash: a wet burst (BigSoundBank #{i})', n=2, thr_db=-12, gap=0.4, max_len=1.2)
take_events('swet', B('smash', 1520), 'big splash, slowed: a heavy wet burst (BigSoundBank)', n=2, semi=-5, thr_db=-12, gap=0.4, max_len=1.4)
for i in (2452, 2453, 2454, 2455, 2456): take('bodyfall', B('smash', i), f'body fall #{i} (BigSoundBank)')
take_events('gthunk', B('glass', 319), 'knock on a glass door (BigSoundBank)', n=2, thr_db=-12, gap=0.2, max_len=0.5)
take_events('gthunk', B('glass', 320), 'knock on a glass door (BigSoundBank)', n=2, thr_db=-12, gap=0.2, max_len=0.5)
take_events('gthunk', B('glass', 198), 'striking a glass door (BigSoundBank)', n=3, thr_db=-12, gap=0.3, max_len=0.6)
take_events('gthunk', B('glass', 319), 'knock on glass, deep (BigSoundBank)', n=2, semi=-6, thr_db=-12, gap=0.2, max_len=0.6)
for i in (2205, 2206, 2207, 2208): take('gcrack', B('glass', i), f'cracking ice: glass cracking under a hit (BigSoundBank #{i})')
take('gcrack', B('glass', 148), 'glass burst (BigSoundBank)'); take('gcrack', B('glass', 387), 'a mirror explodes (BigSoundBank)')
take_events('gcrack', B('glass', 771), 'broken glass (BigSoundBank)', n=2, thr_db=-12, gap=0.5, max_len=1.8)
take('gcrack', B('glass', 1591), 'broken champagne glass (BigSoundBank)'); take('gcrack', B('glass', 1121), 'broken glass ball (BigSoundBank)')
take('gcrack', O('../dl_oga_reveal/glass_breaking.wav'), 'glass breaking (Till Behrend, OpenGameArt)')
for k in range(1, 7): take('gcrack', O(f'bfh1_glass_breaking_0{k}.ogg'), f'glass breaking {k} (rubberduck, OpenGameArt)')
for k in range(1, 5): take('gshards', O(f'bfh1_glass_falling_0{k}.ogg'), f'glass pieces falling {k} (rubberduck, OpenGameArt)')
for k in (1, 2): take('gshards', O(f'bfh1_glass_hit_0{k}.ogg'), f'glass hit {k} (rubberduck, OpenGameArt)')
for i in (1643, 1644): take('gshards', B('glass', i), f'broken plate, high shards only (BigSoundBank #{i})', proc=lambda x: filt(x, 'highpass', 2500, 4))
for i in (1483, 1485): take('gong', B('hits', i), f'gong struck hard (BigSoundBank #{i})', a=0, b=5, fade=1.5)
take('gong', B('hits', 1485), 'very strong gong, a fifth down (BigSoundBank)', semi=-7, a=0, b=5, fade=1.5)

# ---------------- earlier in the opening (hospital) ----------------
for i in (457, 456): take_events('ecg', B('hospital', i), f'heart monitor beep #{i} (BigSoundBank)', n=2, thr_db=-12, gap=0.3, max_len=0.5)
take_events('ecg', B('hospital', 2504), 'blood pressure monitor beep (BigSoundBank)', n=2, thr_db=-12, gap=0.3, max_len=0.6)
for i in (1309, 1310): take('flatline', B('hospital', i), f'cardiac arrest on the monitor: the flatline (BigSoundBank #{i})', a=8, b=16, keep_start=True, fade=1.0)
for i, a, b in [(3411, 0, 5), (3412, 0, 5), (3413, 0, 6), (2249, 2, 8), (800, 0, 5)]:
    take('alarm', B('hospital', i), f'alarm #{i} (BigSoundBank)', a=a, b=b, keep_start=True, fade=0.6)
for i in (2143, 2144, 2145, 2146): take('flicker', B('power', i), f'fluorescent tube flickering #{i} (BigSoundBank)')
for i in (2118, 2119, 2120): take('flicker', B('power', i), f'neon / transformer buzz #{i} (BigSoundBank)', a=0, b=3, keep_start=True, fade=0.5)

with open(os.path.join(ZDIR, 'src', 'sfx', 'reveal.gen.js'), 'w', encoding='utf-8') as fh:
    fh.write('// GENERATED by tools/sfx/build_reveal.py: the opening reveal candidate takes by group, and what each one is.\n')
    fh.write('export const RLIB = ' + json.dumps(groups, indent=1) + ';\n')
    fh.write('export const RLIB_LABELS = ' + json.dumps(labels, indent=1, ensure_ascii=False) + ';\n')
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print({k: len(v) for k, v in groups.items()}, f'{sum(map(len, groups.values()))} takes, {tot / 1024:.0f} KB')
