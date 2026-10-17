# Builds the gun sound bank (assets/sfx/guns/*.mp3) from the raw CC0 sources.
#   python build_guns.py <firearm library dir ("Prepared SFX Library")> <reload.wav> <out dir>
# Sources (raw files stay out of the repo, see SOUND_PLAN.md):
#   The Free Firearm Sound Library (CC0, opengameart.org/content/the-free-firearm-sound-library): close-mic shots
#   handgun reload sound effect (CC0, zer0_sol, opengameart.org/content/handgun-reload-sound-effect)
# Casings and shotgun hulls are synthesised here (modal synthesis), no source needed.
import os, sys, json
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

SR = 44100
LIB, RELOAD, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)
made = {}

def load(path):
    d, sr = sf.read(path, always_2d=True)
    x = d.mean(1)
    if sr != SR:
        g = np.gcd(SR, sr); x = resample_poly(x, SR // g, sr // g)
    return x

def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output='sos'), x)

def punch(x, amt):
    # phone translation: the 40-180 Hz body is driven through a soft clipper, and the harmonics it makes (180-1500 Hz,
    # which a phone speaker can play) are mixed back under the original, so the weight is still heard on the device
    lo = filt(x, 'lowpass', 180, 4)
    sat = np.tanh(lo * 6 / (np.abs(lo).max() + 1e-9))
    h = filt(filt(sat, 'highpass', 180, 2), 'lowpass', 1500, 2)
    return x + amt * h * (np.abs(x).max() / (np.abs(h).max() + 1e-9))

def finish(x, name, peak_db=-1.0, tail_db=-55, fade=0.04):
    x = filt(x, 'highpass', 28, 2)
    pk = np.abs(x).max()
    # trim the end where it stays below tail_db, then a short fade
    env = np.abs(x) / pk; above = np.where(env > 10 ** (tail_db / 20))[0]
    end = min(len(x), above[-1] + int(0.01 * SR)) if len(above) else len(x)
    x = x[:end].copy(); n = min(len(x), int(fade * SR))
    x[-n:] *= np.cos(np.linspace(0, np.pi / 2, n)) ** 2
    x *= 10 ** (peak_db / 20) / np.abs(x).max()
    p = os.path.join(OUT, name + '.mp3')
    sf.write(p, x.astype(np.float32), SR, format='MP3', compression_level=0.1)
    made[name] = round(len(x) / SR, 3)

def onset(x, a, b, rel=0.05):
    seg = np.abs(x[int(a * SR):int(b * SR)]); i = np.argmax(seg > seg.max() * rel)
    return a + i / SR

def gate(x, floor_db=-48, att=0.003, rel=0.03):
    # quiet mechanical takes were recorded 20+ dB under the shots: gate the field noise between their clicks
    w = int(0.004 * SR); sm = np.convolve(np.abs(x), np.ones(w) / w, 'same'); th = sm.max() * 10 ** (floor_db / 20)
    g = (sm > th).astype(float)
    k = int(rel * SR); g = np.convolve(g, np.ones(k) / k, 'same').clip(0, 1)
    return x * np.maximum(g, 0.03)

def cut(x, a, b):
    return x[int(a * SR):int(b * SR)].copy()

# ---------- shots (near mic, front of shooter: the dry crack and body; the room comes from the game's reverb) ----------
def shots(path, n_expected, dur, name, start_idx, amt):
    x = load(os.path.join(LIB, path)); env = np.abs(x); pk = env.max()
    w = int(0.005 * SR); e = np.maximum.reduceat(env, np.arange(0, len(env), w))
    starts = []
    for i, v in enumerate(e):
        if v > pk * 0.3 and (not starts or i - starts[-1] > 0.5 / 0.005): starts.append(i)
    k = start_idx
    for s in starts[:n_expected]:
        t = s * 0.005; t0 = onset(x, max(0, t - 0.02), t + 0.02) - 0.002
        finish(punch(cut(x, t0, t0 + dur), amt), f'{name}_{k:02d}', tail_db=-52, fade=dur * 0.35)
        k += 1
    return k

k = shots('Walther PPQ/X_39P.wav', 3, 0.42, 'pistol', 1, 0.5)
k = shots('1911/A_42P.wav', 2, 0.42, 'pistol', k, 0.5)
k = shots('Nova/O_21P.wav', 2, 0.7, 'shotgun', 1, 0.6)
k = shots('Model 12/K_22P.wav', 2, 0.7, 'shotgun', k, 0.6)
k = shots('CD/H_21P.wav', 2, 0.7, 'shotgun', k, 0.6)
k = shots('Mossberg/N_30P.wav', 2, 0.7, 'shotgun', k, 0.6)

# ---------- the Model 12's own pump, recorded between its shots ----------
m12 = load(os.path.join(LIB, 'Model 12/K_22P.wav'))
finish(gate(cut(m12, 4.262, 4.42)), 'pump_back', tail_db=-40, fade=0.03)
finish(gate(cut(m12, 4.700, 4.90)), 'pump_fwd', tail_db=-40, fade=0.03)

# ---------- pistol reload (mag drop, mag seated, slide racked) ----------
rl = load(RELOAD)
finish(cut(rl, 0.092, 0.30), 'mag_out', tail_db=-45)
finish(cut(rl, 0.566, 0.86), 'mag_in', tail_db=-45)
finish(cut(rl, 1.020, 1.44), 'slide', tail_db=-45)
finish(filt(cut(rl, 1.024, 1.075), 'highpass', 1800, 2), 'dry_click', tail_db=-40, fade=0.015) # the slide's first click

# ---------- casings: modal synthesis (a few inharmonic partials per bounce, the bounces closing up and dying away) ----------
def modal(t, modes, amp):
    y = np.zeros_like(t)
    for f, d, a in modes:
        y += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / d)
    return y * amp

def casing(name, base, ratios, decay, bounces, thunk=0.0, dur=0.6):
    n = int(dur * SR); y = np.zeros(n); t = 0.0; a = 1.0; gap = bounces[0]
    for i in range(bounces[1]):
        st = int(t * SR); tt = np.arange(n - st) / SR
        fb = base * rng.uniform(0.97, 1.03)
        modes = [(fb * r * rng.uniform(0.99, 1.01), decay * rng.uniform(0.7, 1.2) / (1 + j * 0.4), rng.uniform(0.4, 1) / (1 + j * 0.5)) for j, r in enumerate(ratios)]
        hit = modal(tt, modes, a)
        click = rng.standard_normal(len(tt)) * np.exp(-tt / 0.0015) * 0.6 * a
        if thunk: click = filt(click, 'lowpass', 2500) * 2 + thunk * a * np.sin(2 * np.pi * 420 * tt) * np.exp(-tt / 0.012)
        y[st:] += hit + click
        t += gap; gap *= rng.uniform(0.55, 0.75); a *= rng.uniform(0.45, 0.65)
        if t > dur - 0.05: break
    return y

for i in range(4): # 9 mm brass on hospital tile: bright, ringing, 4-6 bounces
    finish(filt(casing('', 4100 + i * 230, [1, 1.62, 2.41, 3.37], 0.045, (rng.uniform(0.08, 0.11), 6)), 'highpass', 1500), f'brass_{i + 1:02d}', peak_db=-1, tail_db=-50, fade=0.05)
for i in range(3): # 12 gauge hull: plastic body, brass rim: a dull clack, 3 bounces
    finish(filt(casing('', 1700 + i * 120, [1, 2.3, 3.9], 0.012, (rng.uniform(0.11, 0.14), 3), thunk=0.8, dur=0.45), 'highpass', 300), f'hull_{i + 1:02d}', tail_db=-48, fade=0.04)

print(json.dumps(made, indent=1))
tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f'{len(made)} files, {tot / 1024:.0f} KB')
