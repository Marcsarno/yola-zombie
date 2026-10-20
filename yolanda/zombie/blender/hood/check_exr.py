# (check) stats of a baked float image: blender -b --python check_exr.py -- <file.exr>
import bpy, sys
f = sys.argv[sys.argv.index('--') + 1:][0]
im = bpy.data.images.load(f); px = im.pixels[:]; w, h = im.size
vals = [px[i] for i in range(0, len(px), 4 * 97)]
vals.sort(); n = len(vals)
print('size', w, h, 'min', vals[0], 'p10', vals[n // 10], 'p50', vals[n // 2], 'p90', vals[n * 9 // 10], 'max', vals[-1])
# a row through the home area (z = 20): sun-lit lawn vs B05's shadow side
row = int(h * (1 - (20 + 96) / 192)); print('row z=20:', [round(px[(row * w + int(w * (x + 70) / 180)) * 4], 3) for x in range(20, 75, 5)])
