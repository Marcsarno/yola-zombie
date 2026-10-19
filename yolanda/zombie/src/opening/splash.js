// The test splash card (2026-10-19, the user: "a splash card for a version that I'm sending out as a test, not for all of
// them"): combat.html?intro=1&splash=1 only. The user's picture fills the screen while the game loads; once it is ready, a
// tap on PLAY (anywhere on the card) starts the voiced opening, inside the tap (the iPhone's audio needs one).
export function splashCard(src = 'assets/ui/splash_test.webp') {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:300;background:#c8e0f7;display:flex;align-items:center;justify-content:center;touch-action:manipulation;cursor:default';
  el.innerHTML = `<img src="${src}" alt="Yolanda's Specialty Medical Center" style="height:100%;width:100%;object-fit:contain;user-select:none;-webkit-user-drag:none" draggable="false">
    <div data-l style="position:absolute;left:50%;bottom:4%;transform:translateX(-50%);padding:6px 14px;border-radius:14px;background:rgba(255,255,255,.75);color:#1d6f8a;font:600 14px system-ui,sans-serif">Loading…</div>`;
  document.body.appendChild(el);
  const load = el.querySelector('[data-l]');
  let go = null;
  el.addEventListener('click', () => { if (!go) return; const f = go; go = null; el.remove(); f(); });
  return {
    ready(onPlay) { go = onPlay; load.remove(); el.style.cursor = 'pointer'; },
    remove() { el.remove(); },
  };
}
