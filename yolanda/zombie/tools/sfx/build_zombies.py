# Builds the Sound Board's zombie / creature / boss candidates (assets/sfx/zombie/*.mp3) and their index
# (src/sfx/zombies.gen.js) from raw CC0 packs kept outside the repo (SOUND_PLAN.md "Sources").
#   python build_zombies.py <scratch dir holding the unpacked packs> <zombie dir>
# Takes are grouped by the moment they suit (idle, alert, attack, bite, hurt, death, sprinter, guard boss, horde). The
# packs number most clips without names, so each label says what the clip measures as: length, dark/bright, and whether
# it builds or dies away; the user judges on the Sound Board. Boss versions are the same recordings pitched down.
import os, sys, glob, json
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

SR = 44100
SRC, ZDIR = sys.argv[1], sys.argv[2]
OUT = os.path.join(ZDIR, 'assets', 'sfx', 'zombie'); os.makedirs(OUT, exist_ok=True)
groups, labels = {}, {}

def load(p):
    d, sr = sf.read(p, always_2d=True); x = d.mean(1)
    if sr != SR: g = np.gcd(SR, sr); x = resample_poly(x, SR // g, sr // g)
    return x

def pitch(x, semi):
    if not semi: return x
    r = 2 ** (semi / 12); up, down = int(round(1000 / r)), 1000
    g = np.gcd(up, down); return resample_poly(x, up // g, down // g)

def describe(x):
    dur = len(x) / SR; w = int(0.01 * SR)
    env = np.array([np.sqrt(np.mean(x[i:i + w] ** 2)) for i in range(0, max(1, len(x) - w), w)]) + 1e-9
    sp = np.abs(np.fft.rfft(x[:SR * 2])); f = np.fft.rfftfreq(len(x[:SR * 2]), 1 / SR); cen = (sp * f).sum() / (sp.sum() + 1e-9)
    tone = 'deep' if cen < 700 else 'dark' if cen < 1500 else 'mid' if cen < 3000 else 'bright, screechy'
    h = len(env) // 2; slope = 20 * np.log10(env[h:].mean() / env[:h].mean()) if h > 2 else 0
    shape = 'builds' if slope > 3 else 'dies away' if slope < -7 else 'steady'
    peak_at = np.argmax(env) * 0.01
    hit = 'sharp start' if peak_at < 0.08 else 'slow swell' if peak_at > 0.3 else ''
    return f"{dur:.1f} s, {tone}, {shape}" + (f", {hit}" if hit else '')

def finish(x, key, label, tail_db=-50, peak_db=-1):
    x = sosfilt(butter(2, 30, 'highpass', fs=SR, output='sos'), x)
    pk = np.abs(x).max()
    if pk < 1e-6: return
    on = np.argmax(np.abs(x) > pk * 0.02); x = x[max(0, on - int(0.004 * SR)):]
    above = np.where(np.abs(x) > pk * 10 ** (tail_db / 20))[0]
    x = x[:min(len(x), above[-1] + int(0.02 * SR))].copy()
    if len(x) < 0.05 * SR: return
    n = min(len(x) // 3, int(0.06 * SR)); x[-n:] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
    x *= 10 ** (peak_db / 20) / np.abs(x).max()
    i = len(groups.setdefault(key, [])) + 1
    name = f'{key}_{i:02d}'; rel = f'assets/sfx/zombie/{name}.mp3'
    sf.write(os.path.join(OUT, name + '.mp3'), x.astype(np.float32), SR, format='MP3', compression_level=0.1)
    groups[key].append(rel); labels[rel] = f'{name} · {label} — {describe(x)}'

def files(key, pattern, label, semi=0, names=None):
    ps = [p for p in sorted(glob.glob(os.path.join(SRC, pattern))) if '__MACOSX' not in p]
    if names is not None: ps = [p for p in ps if os.path.splitext(os.path.basename(p))[0] in names]
    if not ps: raise SystemExit('nothing matches ' + pattern + ' ' + str(names))
    for p in ps: finish(pitch(load(p), semi), key, label + f' ({os.path.splitext(os.path.basename(p))[0]}{f", {semi:+d} st" if semi else ""})')

def bursts(key, pattern, label, semi=0, gap=0.25, max_len=3.0, min_len=0.25):
    # a reel of several cries: one take per cry (split where it stays under -30 dB for gap s)
    for p in sorted(glob.glob(os.path.join(SRC, pattern))):
        x = load(p); w = int(0.01 * SR); pk = np.abs(x).max()
        env = np.array([np.sqrt(np.mean(x[i:i + w] ** 2)) for i in range(0, len(x) - w, w)]) / pk
        on = env > 10 ** (-30 / 20); segs = []; s = None; g = 0
        for i, v in enumerate(on):
            if v:
                if s is None: s = i
                g = 0
            elif s is not None:
                g += 1
                if g * 0.01 > gap: segs.append((s, i - g + 2)); s = None; g = 0
        if s is not None: segs.append((s, len(on)))
        n = 0
        for a, b in segs:
            if (b - a) * 0.01 < min_len: continue
            n += 1; seg = x[max(0, a * w - int(0.03 * SR)):min(len(x), a * w + int(max_len * SR), b * w + int(0.05 * SR))]
            finish(pitch(seg, semi), key, f'{label} ({os.path.splitext(os.path.basename(p))[0]}, cry {n}{f", {semi:+d} st" if semi else ""})')

def stinger(key, pattern, label, semi=-4):
    # a boss stinger from a real roar: the roar reversed swelling up into the roar itself, pitched down
    for p in sorted(glob.glob(os.path.join(SRC, pattern))):
        x = pitch(load(p), semi); r = x[::-1].copy(); n = len(r)
        r *= np.linspace(0, 1, n) ** 2
        finish(np.concatenate([r[:-int(0.02 * SR)], x]), key, f'{label} ({os.path.splitext(os.path.basename(p))[0]}, {semi:+d} st)')

def make_floor(key):
    # under-the-floor rumble for zombies breaking up through the tiles: the heavy soft impacts slowed way down + a crack
    K = 'x_kenney_impact/Audio/'
    for i, p in enumerate(sorted(glob.glob(os.path.join(SRC, K + 'impactSoft_heavy_*.ogg')))[:4]):
        rum = pitch(load(p), -14); crack = load(sorted(glob.glob(os.path.join(SRC, K + 'impactWood_heavy_*.ogg')))[i])
        out = np.zeros(len(rum) + int(0.2 * SR)); out[:len(rum)] += rum * 0.9; o = int(0.35 * len(rum)); out[o:o + len(crack)] += crack[:len(out) - o] * 0.6
        finish(out, key, f'floor rumble + tile crack (Kenney soft impact -14 st + wood crack {i + 1})', tail_db=-45)

Z, O1, O2 = 'x_z_zombies/zombies/', 'x_z_ogre1/Monster-Sounds-Volume-2/', 'x_z_ogre2/monster_sfx_pack/'
R1, R2, SN, GH = 'x_z_rubber1/', 'x_z_rubber2/', 'dl_z_snarls/', 'x_z_ghost/qubodup-GhostMoans/wav/'
zn = lambda *n: [f'zombie-{i}' for i in n]

# ---- every zombie ----
files('idle', Z + '*.wav', 'zombie moan (Summoning Wars pack)', names=zn(15, 16, 17, 18, 19, 21))
files('idle', R1 + '*.ogg', 'creature breath / cough / snore (rubberduck)', names=['breath', 'cough_01', 'cough_02', 'cough_03', 'snore', 'burble_01', 'burble_02'])
files('idle', R2 + '*.ogg', 'creature breath / snore (rubberduck)', names=['breath_02', 'snore_02'])
files('idle', GH + '*.wav', 'ghost moan pitched down into a zombie moan (qubodup)', semi=-4)
files('alert', R1 + 'monster_*.ogg', 'monster growl (rubberduck)')
files('alert', R2 + 'monster_*.ogg', 'monster growl (rubberduck)')
bursts('alert', SN + 'monster-snarls_0.ogg', 'snarl (Darsycho)'); bursts('alert', SN + 'monsters-snarls-3_0.ogg', 'snarl (Darsycho)')
bursts('alert', SN + 'monster-snarls-2_0.ogg', 'snarl (Darsycho)')
files('attack', Z + '*.wav', 'zombie attack cry (Summoning Wars pack)', names=zn(3, 4, 5, 7, 9, 11, 12, 13, 24))
files('attack', R2 + 'attack_*.ogg', 'creature attack (rubberduck)')
bursts('attack', SN + 'monster-snarl-attack.ogg', 'snarl attack (Darsycho)'); bursts('attack', SN + 'monster-snarl-5.ogg', 'snarl (Darsycho)')
files('bite', R1 + 'eat_*.ogg', 'creature eating / biting (rubberduck)')
files('bite', R2 + 'slime_*.ogg', 'wet slime (rubberduck)')
files('bite', R1 + 'spit_*.ogg', 'spit (rubberduck)')
files('hurt', Z + '*.wav', 'zombie pain (Summoning Wars pack)', names=zn(2, 6, 10, 22))
files('hurt', R1 + 'hurt_*.ogg', 'creature hurt (rubberduck)')
files('hurt', O1 + '*.wav', 'monster yelp (Ogrebane vol. 2)', names=['Monster-3', 'Monster-4', 'monster-10', 'monster-13', 'monster-15', 'monster-16', 'monster-17'])
files('death', Z + '*.wav', 'zombie death (Summoning Wars pack)', names=zn(1, 8, 14, 20, 23))
files('death', R2 + 'die_*.ogg', 'creature death (rubberduck)')
files('death', O2 + '*.wav', 'beast death / groan (Ogrebane)', names=['monster-1', 'monster-6', 'monster-8', 'monster-9', 'monster-10'])
# ---- the sprinter (the big lady): her scream before the charge, the lock-in, her death ----
files('scream', R1 + 'scream_*.ogg', 'creature scream (rubberduck)'); files('scream', R1 + 'howl.ogg', 'howl (rubberduck)')
files('scream', O1 + '*.wav', 'screech (Ogrebane vol. 2)', names=['Monster-1', 'Monster-2', 'Monster-6', 'monster-11', 'monster-12', 'monster-14'])
files('scream', R1 + 'roar_*.ogg', 'roar, pitched up (rubberduck)', semi=3)
files('charge', R2 + 'grunt_*.ogg', 'effort grunt (rubberduck)'); files('charge', R1 + 'grunt_*.ogg', 'effort grunt (rubberduck)')
files('charge', O1 + '*.wav', 'short screech (Ogrebane vol. 2)', names=['Monster-5', 'Monster-7', 'Monster-8', 'monster-9', 'monster-18'])
files('sdeath', R2 + 'die_*.ogg', 'creature death, pitched down for her (rubberduck)', semi=-2)
files('sdeath', Z + '*.wav', 'zombie death, pitched for her (Summoning Wars)', semi=-2, names=zn(1, 8, 20))
# ---- the guard (the boss): deep versions ----
files('groar', R1 + 'roar_*.ogg', 'roar, deep (rubberduck)', semi=-3); files('groar', R2 + 'roar_*.ogg', 'roar, deep (rubberduck)', semi=-3)
files('groar', R1 + 'troll_*.ogg', 'troll voice (rubberduck)'); files('groar', R1 + 'howl.ogg', 'howl, deep (rubberduck)', semi=-5)
files('groar', Z + '*.wav', 'zombie moan, very deep (Summoning Wars)', semi=-6, names=zn(16, 17, 18))
files('groar', O2 + '*.wav', 'beast growl (Ogrebane)', names=['monster-6', 'monster-8', 'monster-10'])
files('gattack', O2 + '*.wav', 'beast grunt (Ogrebane)', names=['monster-2', 'monster-3', 'monster-4', 'monster-5', 'monster-7'])
files('gattack', R2 + 'grunt_*.ogg', 'grunt, deep (rubberduck)', semi=-4); files('gattack', R1 + 'grunt_*.ogg', 'grunt, deep (rubberduck)', semi=-4)
files('gpain', R1 + 'hurt_*.ogg', 'hurt, deep (rubberduck)', semi=-5); files('gpain', O2 + '*.wav', 'beast pain (Ogrebane)', names=['monster-1', 'monster-9'])
files('gpain', Z + '*.wav', 'zombie pain, deep (Summoning Wars)', semi=-5, names=zn(2, 6, 10, 22))
files('gdeath', R2 + 'die_*.ogg', 'death, very deep (rubberduck)', semi=-6); files('gdeath', R1 + 'roar_*.ogg', 'dying roar, very deep (rubberduck)', semi=-7)
files('gdeath', GH + '*.wav', 'ghost moan, very deep (qubodup)', semi=-8)
files('stomp', R2 + 'stomp_01.ogg', 'stomp (rubberduck)'); files('stomp', R2 + 'stomp_01.ogg', 'stomp, deep (rubberduck)', semi=-5)
files('stomp', 'x_kenney_impact/Audio/impactSoft_heavy_*.ogg', 'heavy thud, very deep (Kenney)', semi=-8)
files('stomp', 'x_kenney_impact/Audio/impactPunch_heavy_*.ogg', 'heavy punch, deep (Kenney)', semi=-6)
files('debris', 'x_kenney_impact/Audio/impactPlank_medium_*.ogg', 'floor debris (Kenney plank)', semi=-2)
files('debris', 'x_kenney_impact/Audio/impactGlass_light_*.ogg', 'tile shards (Kenney glass)', semi=-3)
stinger('sting', R1 + 'roar_*.ogg', 'boss stinger: reversed roar swelling into the roar (rubberduck)', semi=-4)
stinger('sting', R2 + 'roar_*.ogg', 'boss stinger: reversed roar swelling into the roar (rubberduck)', semi=-5)
# ---- the horde, far off, and zombies coming up through the floor ----
files('horde', GH + '*.wav', 'distant moan (qubodup ghost, pitched down)', semi=-3)
files('horde', Z + '*.wav', 'far zombie moan, low (Summoning Wars)', semi=-3, names=zn(15, 16, 17, 18, 19, 21))
make_floor('breach')

with open(os.path.join(ZDIR, 'src', 'sfx', 'zombies.gen.js'), 'w', encoding='utf-8') as fh:
    fh.write('// GENERATED by tools/sfx/build_zombies.py: the zombie / boss candidate takes by group, and what each one is.\n')
    fh.write('export const ZLIB = ' + json.dumps(groups, indent=1) + ';\n')
    fh.write('export const ZLIB_LABELS = ' + json.dumps(labels, indent=1, ensure_ascii=False) + ';\n')
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print({k: len(v) for k, v in groups.items()}, f'{sum(map(len, groups.values()))} takes, {tot / 1024:.0f} KB')
