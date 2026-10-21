# Unpack a .unitypackage (gzipped tar of <guid>/{asset,pathname}) into OUT, rebuilding the Assets/... paths.
# Keeps models, textures, materials and animation files only; never runs anything from the package.
# python -I unpack_unitypkg.py <package> <out_dir>
import sys, tarfile, os, posixpath

KEEP = {'.fbx', '.obj', '.blend', '.png', '.tga', '.jpg', '.jpeg', '.tif', '.tiff', '.psd', '.exr', '.mat', '.anim', '.controller', '.prefab'}
pkg, out = sys.argv[1], os.path.abspath(sys.argv[2])
os.makedirs(out, exist_ok=True)
paths, blobs = {}, {}
with tarfile.open(pkg, 'r:gz') as t:
    for m in t:
        if not m.isfile():
            continue
        parts = m.name.lstrip('./').split('/')
        if len(parts) != 2:
            continue
        guid, kind = parts
        if kind == 'pathname':
            paths[guid] = t.extractfile(m).read().decode('utf-8', 'replace').splitlines()[0].strip()
        elif kind == 'asset':
            blobs[guid] = m
    kept = skipped = 0
    for guid, m in blobs.items():
        p = paths.get(guid)
        if not p:
            continue
        p = posixpath.normpath(p)
        if p.startswith('/') or p.startswith('..') or ':' in p:
            print('UNSAFE PATH, skipped:', p); continue
        if os.path.splitext(p)[1].lower() not in KEEP:
            skipped += 1; continue
        dst = os.path.join(out, *p.split('/'))
        if not os.path.abspath(dst).startswith(out + os.sep):
            print('UNSAFE PATH, skipped:', p); continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with t.extractfile(m) as src, open(dst, 'wb') as f:
            f.write(src.read())
        kept += 1
print('UNPACKED', pkg, '->', out, 'kept', kept, 'skipped', skipped)
for root, _, files in os.walk(out):
    for fn in files:
        if fn.lower().endswith(('.fbx', '.obj', '.blend')):
            fp = os.path.join(root, fn); print('  MODEL', round(os.path.getsize(fp) / 1e6, 2), 'MB', os.path.relpath(fp, out))
