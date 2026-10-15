# Blender (background): extract frames of a movie at a given step to PNGs, scaled to a given width.
# usage: blender -b --factory-startup --python vframes.py -- <movie> <outdir> <step> <width> [probe]
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
movie, out, step, width = argv[0], argv[1], int(argv[2]), int(argv[3])
probe = len(argv) == 5
clip = bpy.data.movieclips.load(movie)
n, fps, (w, h) = clip.frame_duration, clip.fps, clip.size
print('PROBE', os.path.basename(movie), 'frames', n, 'fps', fps, 'size', w, h)
if probe: sys.exit(0)
sc = bpy.context.scene
sc.sequence_editor_create()
seqs = sc.sequence_editor.strips if hasattr(sc.sequence_editor, 'strips') else sc.sequence_editor.sequences
st = seqs.new_movie('m', movie, 1, 1)
sc.render.resolution_x = w; sc.render.resolution_y = h; sc.render.resolution_percentage = max(1, int(round(100 * width / w)))
sc.render.fps = int(round(fps)) or 30
sc.render.image_settings.file_format = 'PNG'
sc.render.use_sequencer = True
os.makedirs(out, exist_ok=True)
f0 = int(argv[5]) if len(argv) > 5 else 1; f1 = int(argv[6]) if len(argv) > 6 else n
for f in range(f0, f1 + 1, step):
    sc.frame_set(f)
    sc.render.filepath = os.path.join(out, 'f%04d.png' % f)
    bpy.ops.render.render(write_still=True)
print('DONE', n)
