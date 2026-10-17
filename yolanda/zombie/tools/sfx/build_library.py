# Builds the Sound Board's candidate library (assets/sfx/lib/*.mp3) and its index (src/sfx/library.gen.js) from raw
# CC0 packs kept outside the repo (see SOUND_PLAN.md "Sources").
#   python build_library.py <scratch dir holding the unpacked packs> <zombie dir>
# Every take is: mono, 44.1 kHz, started 3 ms before its transient, trimmed where it falls under -55 dB, faded, peak
# -1 dBFS (the game's layer levels and the user's trims set the real loudness). Some takes are pitched (tinks -> brass).
import os, sys, glob, json
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

SR = 44100
SRC, ZDIR = sys.argv[1], sys.argv[2]
OUT = os.path.join(ZDIR, 'assets', 'sfx', 'lib'); os.makedirs(OUT, exist_ok=True)
groups, labels = {}, {}

def load(p):
    d, sr = sf.read(p, always_2d=True); x = d.mean(1)
    if sr != SR: g = np.gcd(SR, sr); x = resample_poly(x, SR // g, sr // g)
    return x

def pitch(x, semi):
    if not semi: return x
    r = 2 ** (semi / 12); up, down = int(round(1000 / r)), 1000  # resample = pitch + speed together (fine for short hits)
    g = np.gcd(up, down); return resample_poly(x, up // g, down // g)

def finish(x, key, label, tail_db=-55):
    x = sosfilt(butter(2, 25, 'highpass', fs=SR, output='sos'), x)
    pk = np.abs(x).max()
    if pk < 1e-6: return
    on = np.argmax(np.abs(x) > pk * 0.02); x = x[max(0, on - int(0.003 * SR)):]
    above = np.where(np.abs(x) > pk * 10 ** (tail_db / 20))[0]
    x = x[:min(len(x), above[-1] + int(0.01 * SR))].copy()
    n = min(len(x) // 3, int(0.03 * SR)); x[-n:] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
    x *= 10 ** (-1 / 20) / np.abs(x).max()
    i = len(groups.setdefault(key, [])) + 1
    name = f'{key}_{i:02d}'; rel = f'assets/sfx/lib/{name}.mp3'
    sf.write(os.path.join(OUT, name + '.mp3'), x.astype(np.float32), SR, format='MP3', compression_level=0.1)
    groups[key].append(rel); labels[rel] = f'{name} · {label}'

def files(key, pattern, label, semi=0, limit=None):
    ps = sorted(glob.glob(os.path.join(SRC, pattern)))[:limit]
    if not ps: raise SystemExit('nothing matches ' + pattern)
    for p in ps: finish(pitch(load(p), semi), key, label + f' ({os.path.splitext(os.path.basename(p))[0]})')

def split(key, pattern, label, min_gap=0.3, max_len=0.75, skip=0, take=None, rel_db=-12):
    # one recording holding several hits (shells pushed in one after another): a take per hit
    for p in sorted(glob.glob(os.path.join(SRC, pattern))):
        x = load(p); env = np.abs(x); w = int(0.005 * SR)
        e = np.maximum.reduceat(env, np.arange(0, len(env), w)); th = e.max() * 10 ** (rel_db / 20)
        starts = []
        for i, v in enumerate(e):
            if v > th and (not starts or (i - starts[-1]) * 0.005 > min_gap): starts.append(i)
        starts = starts[skip:][:take]
        for j, s in enumerate(starts):
            a = max(0, s * w - int(0.02 * SR)); b = min(len(x), a + int(max_len * SR))
            if j + 1 < len(starts): b = min(b, starts[j + 1] * w - int(0.01 * SR))
            finish(x[a:b], key, f'{label} ({os.path.splitext(os.path.basename(p))[0]}, hit {j + 1 + skip})')

K, R, SH = 'x_kenney_impact/Audio/', 'x_kenney_rpg/Audio/', 'x_oga_shotgun/ShotgunSounds/'
# ---- gun foley (real recordings for the parts the user turned down) ----
split('shellin', SH + '4 Shell Reload.mp3', 'shotgun shell pushed into the tube, real', take=4)
split('shellin', SH + '5 Shell Reload.mp3', 'shotgun shell pushed into the tube, real', skip=2, take=4)
split('shellin', SH + 'Subsequent Shells.mp3', 'shotgun shell pushed into the tube, real', take=1)
files('rack', SH + 'Rack.mp3', 'shotgun pump racked back and forward, one real recording')
split('rack', SH + '4 Shell Reload.mp3', 'shotgun closed after loading, real', skip=4, take=1)
split('rack', SH + 'Shell in Chamber.mp3', 'shell chambered, real', take=2)
files('brass', K + 'impactMetal_light_*.ogg', 'real small metal tink, pitched up like a 9mm casing', semi=7)
files('brass', K + 'impactTin_medium_*.ogg', 'real tin tink, pitched up like a casing', semi=5)
files('hull', K + 'impactGeneric_light_*.ogg', 'real light knock, pitched up like a plastic shotgun hull', semi=4)
files('hull', K + 'impactWood_light_*.ogg', 'real light wood tap, pitched up like a hull', semi=6)
files('magdrop', K + 'impactMetal_light_*.ogg', 'real metal piece dropping, like a magazine hitting the floor', semi=-2)
files('magdrop', K + 'impactMetal_medium_*.ogg', 'real heavier metal drop', semi=0)
files('click', R + 'metalClick.ogg', 'real metal click'); files('click', R + 'metalLatch.ogg', 'real metal latch')
files('click', R + 'beltHandle*.ogg', 'real buckle click')
# ---- melee hits ----
files('punch', 'x_oga_punch/qubodupPunch/*.flac', 'real body punch (qubodup)')
files('punch', K + 'impactPunch_medium_*.ogg', 'punch, medium (Kenney)')
files('punchheavy', K + 'impactPunch_heavy_*.ogg', 'punch, heavy (Kenney)')
files('wood', K + 'impactWood_heavy_*.ogg', 'heavy wood hit, bat-like crack')
files('wood', K + 'impactPlank_medium_*.ogg', 'plank hit')
files('thwack', 'x_oga_thwack/PCM/*.wav', 'thwack: something hard hitting something')
files('soft', K + 'impactSoft_heavy_*.ogg', 'heavy soft thud: a body')
files('soft', K + 'impactSoft_medium_*.ogg', 'soft thud')
files('blade', R + 'chop.ogg', 'blade chop'); files('blade', R + 'knifeSlice*.ogg', 'blade slice'); files('blade', R + 'drawKnife*.ogg', 'blade scrape')
files('squish', 'dl_oga_squish/*.mp3', 'wet squish / splat (low bitrate)')
files('metal', K + 'impactMetal_heavy_*.ogg', 'heavy metal hit'); files('metal', K + 'impactMetal_medium_*.ogg', 'metal hit')
files('glass', K + 'impactGlass_heavy_*.ogg', 'glass, heavy'); files('glass', K + 'impactGlass_medium_*.ogg', 'glass, medium')
# ---- footsteps, doors, handling ----
files('step', K + 'footstep_concrete_*.ogg', 'footstep, hard floor'); files('step', R + 'footstep0*.ogg', 'footstep (RPG pack)')
files('stepsoft', K + 'footstep_carpet_*.ogg', 'footstep, carpet'); files('stepsoft', K + 'footstep_wood_*.ogg', 'footstep, wood')
files('door', R + 'doorOpen_*.ogg', 'door opening'); files('door', R + 'creak*.ogg', 'door creak')
files('doorshut', R + 'doorClose_*.ogg', 'door closing')
files('cloth', R + 'cloth*.ogg', 'clothing rustle'); files('cloth', R + 'clothBelt*.ogg', 'belt and cloth')
files('pickup', R + 'handleSmallLeather*.ogg', 'small leather item handled'); files('pickup', R + 'dropLeather.ogg', 'leather item set down'); files('pickup', R + 'handleCoins*.ogg', 'coins / small metal handled')

with open(os.path.join(ZDIR, 'src', 'sfx', 'library.gen.js'), 'w', encoding='utf-8') as fh:
    fh.write('// GENERATED by tools/sfx/build_library.py: the Sound Board candidate takes by group, and what each one is.\n')
    fh.write('export const LIB = ' + json.dumps(groups, indent=1) + ';\n')
    fh.write('export const LIB_LABELS = ' + json.dumps(labels, indent=1, ensure_ascii=False) + ';\n')
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print({k: len(v) for k, v in groups.items()}, f'{sum(map(len, groups.values()))} takes, {tot / 1024:.0f} KB')
