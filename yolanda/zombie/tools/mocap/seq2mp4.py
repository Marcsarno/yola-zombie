# Blender (background): encode a PNG sequence to an H.264 MP4. usage: blender -b --python seq2mp4.py -- <dir> <prefix> <out.mp4> <fps>
import bpy, sys, os
a = sys.argv[sys.argv.index('--') + 1:]; d, pre, out, fps = a[0], a[1], a[2], int(a[3])
files = sorted(f for f in os.listdir(d) if f.startswith(pre) and f.endswith('.png'))
sc = bpy.context.scene; sc.sequence_editor_create()
seqs = sc.sequence_editor.strips if hasattr(sc.sequence_editor, 'strips') else sc.sequence_editor.sequences
st = seqs.new_image('s', os.path.join(d, files[0]), 1, 1)
for f in files[1:]: st.elements.append(f)
img = bpy.data.images.load(os.path.join(d, files[0])); w, h = img.size
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
sc.frame_start, sc.frame_end = 1, len(files); sc.render.fps = fps
r = sc.render
try: r.image_settings.media_type = 'VIDEO'
except Exception: pass
r.image_settings.file_format = 'FFMPEG'; r.ffmpeg.format = 'MPEG4'; r.ffmpeg.codec = 'H264'; r.ffmpeg.constant_rate_factor = 'HIGH'
r.filepath = out; r.use_sequencer = True
bpy.ops.render.render(animation=True); print('ENCODED', out, len(files))
