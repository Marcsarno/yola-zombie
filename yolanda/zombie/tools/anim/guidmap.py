# guid -> Assets path map of a .unitypackage, written as JSON beside the unpacked files
import sys, tarfile, json
pkg, out = sys.argv[1], sys.argv[2]; m = {}
with tarfile.open(pkg, 'r:gz') as t:
    for e in t:
        p = e.name.lstrip('./').split('/')
        if len(p) == 2 and p[1] == 'pathname' and e.isfile():
            m[p[0]] = t.extractfile(e).read().decode('utf-8', 'replace').splitlines()[0].strip()
json.dump(m, open(out, 'w'), indent=0); print('GUIDS', len(m), out)
