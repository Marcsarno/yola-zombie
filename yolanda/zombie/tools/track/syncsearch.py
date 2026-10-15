# Find the best frame offset between two views for one stretch of the move: solve that stretch in 3D at each candidate
# offset and keep the one where both cameras agree best (the second view's reprojection error, body and bat).
# usage: python -I syncsearch.py <base config.json> <a0> <a1> <offsets "70,71,..."> <workdir> [parallel]
import sys, json, os, subprocess, re, statistics
base, a0, a1, offs, wd = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), [int(x) for x in sys.argv[4].split(',')], sys.argv[5]
par = int(sys.argv[6]) if len(sys.argv) > 6 else 4
C = json.load(open(base)); here = os.path.dirname(os.path.abspath(__file__)); os.makedirs(wd, exist_ok=True)
procs = []; results = {}
def launch(o):
    cfg = dict(C, a0=a0, a1=a1, sync=[[a0, o], [a1, o]], iters=120, w_grip=0)
    cp = os.path.join(wd, f'cfg_{a0}_{o}.json'); json.dump(cfg, open(cp, 'w'))
    log = open(os.path.join(wd, f'log_{a0}_{o}.txt'), 'w')
    return subprocess.Popen([sys.executable, '-I', os.path.join(here, 'solve3d.py'), cp, os.path.join(wd, f'sol_{a0}_{o}.json')], stdout=log, stderr=subprocess.STDOUT), o, log
queue = list(offs)
while queue or procs:
    while queue and len(procs) < par: procs.append(launch(queue.pop(0)))
    for p in list(procs):
        if p[0].poll() is not None:
            p[2].close(); procs.remove(p)
            txt = open(os.path.join(wd, f'log_{a0}_{p[1]}.txt')).read()
            g = lambda k: float(re.search(k + r' median ([\d.]+)', txt).group(1)) if re.search(k + r' median ([\d.]+)', txt) else float('nan')
            results[p[1]] = {'B_body': g('B_body'), 'B_bat': g('B_bat'), 'A_bat': g('A_bat'), 'A_body': g('A_body')}
    import time; time.sleep(1)
for o in sorted(results):
    r = results[o]; print(f'offset {o}: B body {r["B_body"]:.1f}  B bat {r["B_bat"]:.1f}  A body {r["A_body"]:.1f}  A bat {r["A_bat"]:.1f} px')
best = min(results, key=lambda o: results[o]['B_body'] + 0.5 * (results[o]['B_bat'] if results[o]['B_bat'] == results[o]['B_bat'] else 0) + results[o]['A_body'])
print('BEST', a0, a1, best)
