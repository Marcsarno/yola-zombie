// Career layer · modern interface shell.
// Replaces the text-only top bar and four-button dock with a graphical HUD (cash, reputation ring,
// mood face, patients, day clock), a goal tracker, an icon dock with direct access to every hub tab,
// a "more" sheet, floating +$ popups and drawer / bottom-sheet panels. The original controls stay in
// the DOM (hidden) and are driven through .click(), so all of the base game logic is untouched.
(function () {
  const YC = window.YC;
  const proto = eu.prototype;

  // ---- icons --------------------------------------------------------------------------------------------
  const P = {
    coin: '<circle cx="12" cy="12" r="8.6"/><path d="M14.6 9.3c-.4-1-1.4-1.5-2.6-1.5-1.5 0-2.6.8-2.6 1.9 0 2.8 5.2 1.4 5.2 4.2 0 1.2-1.2 1.9-2.6 1.9-1.3 0-2.3-.5-2.8-1.6M12 6.2v1.6M12 16.2v1.6"/>',
    star: '<path d="M12 3.4l2.6 5.5 6 .8-4.4 4.2 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9-4.4-4.2 6-.8z"/>',
    happy: '<circle cx="12" cy="12" r="8.6"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/><path d="M8 14.2c1 1.7 2.3 2.5 4 2.5s3-.8 4-2.5"/>',
    meh: '<circle cx="12" cy="12" r="8.6"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/><path d="M8.5 15.4h7"/>',
    sad: '<circle cx="12" cy="12" r="8.6"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/><path d="M8 16.6c1-1.7 2.3-2.5 4-2.5s3 .8 4 2.5"/>',
    people: '<circle cx="9" cy="8.2" r="3.1"/><path d="M3.5 19.5c.6-3.5 2.7-5.2 5.5-5.2s4.9 1.7 5.5 5.2"/><circle cx="17" cy="9" r="2.4"/><path d="M16.6 14.4c2.4-.2 4 1.2 4.5 4.4"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/>',
    build: '<path d="M13.2 4.6l6.2 6.2-2.8 2.8-6.2-6.2zM10.7 8.9L4.2 15.4l4.4 4.4 6.5-6.5"/>',
    staff: '<circle cx="12" cy="7.8" r="3.3"/><path d="M5 20c.5-4.2 3.1-6.3 7-6.3s6.5 2.1 7 6.3M10.2 16.6h3.6M12 14.8v3.6"/>',
    goals: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
    research: '<path d="M9.5 3.6h5M10.4 3.6v5.9L5 18.6a1.6 1.6 0 0 0 1.4 2.4h11.2a1.6 1.6 0 0 0 1.4-2.4l-5.4-9.1V3.6M7.8 15h8.4"/>',
    finance: '<path d="M4 20V4.5M4 20h16.5M8 16v-4.2M12 16V8.2M16 16v-6.4"/>',
    hospital: '<path d="M4.2 20.4V8.4L12 4l7.8 4.4v12zM12 9v6.4M8.8 12.2h6.4"/>',
    prices: '<path d="M3.6 12.2V4.6h7.6l9.2 9.2-7.6 7.6z"/><circle cx="8" cy="9" r="1.3"/>',
    log: '<path d="M5 6.4h14M5 12h14M5 17.6h8.6"/>',
    bolt: '<path d="M13.4 3L5.2 13.4h6l-1 7.6 8.6-11h-6.2z"/>',
    play: '<path d="M8.4 5.6v12.8l10.4-6.4z" fill="currentColor"/>',
    pause: '<rect x="7" y="5.6" width="3.6" height="12.8" rx="1" fill="currentColor"/><rect x="13.6" y="5.6" width="3.6" height="12.8" rx="1" fill="currentColor"/>',
    gear: '<circle cx="12" cy="12" r="3.1"/><path d="M10.4 3.6h3.2l.5 2.2 1.6.9 2.1-.8 1.6 2.8-1.7 1.5v1.6l1.7 1.5-1.6 2.8-2.1-.8-1.6.9-.5 2.2h-3.2l-.5-2.2-1.6-.9-2.1.8-1.6-2.8L6.6 13V11.4L4.9 9.9l1.6-2.8 2.1.8 1.6-.9z"/>',
    more: '<circle cx="5.6" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18.4" cy="12" r="1.6" fill="currentColor"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.4M12 17.2v.4"/>',
    chevron: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.6l4.4 4.4L19 7.4"/>',
    heart: '<path d="M12 20s-7.4-4.4-7.4-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.4 2.6C19.4 15.6 12 20 12 20z"/>',
    skip: '<path d="M6 6.6l8 5.4-8 5.4zM17.6 6.4v11.2"/>',
    sound: '<path d="M4 9.6v4.8h3.4L12 18.4V5.6L7.4 9.6zM15.6 8.8a4.6 4.6 0 0 1 0 6.4M18 6.4a8 8 0 0 1 0 11.2"/>',
    mute: '<path d="M4 9.6v4.8h3.4L12 18.4V5.6L7.4 9.6zM16 9.6l4.4 4.8M20.4 9.6L16 14.4"/>',
  };
  const ic = (n, cls = "") =>
    `<svg class="cx-ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] ?? ""}</svg>`;
  YC.ic = ic;
  YC.icons = P;

  // ---- styles -------------------------------------------------------------------------------------------
  const css = document.createElement("style");
  css.textContent = `
  :root{--cx-ink:#0e3340;--cx-glass:#0f3b47e8;--cx-glass2:#164c5af2;--cx-line:#b9e2dd38;--cx-teal:#3ed0bd;--cx-gold:#f2c15b;--cx-coral:#ef8a76;--cx-cream:#f7faf6;--cx-r:18px}
  .cx-ic{width:22px;height:22px;flex:none;display:block}
  .cx-ic.fill{fill:currentColor}
  body.cx-modern:not(.build-mode) .management-top,
  body.cx-modern .management-dock,
  body.cx-modern #flow-goal,
  body.cx-modern .department-shortcuts{display:none!important}
  #cx-hud,#cx-goal,#cx-alert,#cx-dock,#cx-sheet{display:none;font-family:inherit}
  body.cx-modern:not(.build-mode) #cx-hud{display:flex}
  body.cx-modern:not(.build-mode) #cx-goal{display:flex}
  body.cx-modern:not(.build-mode) #cx-dock{display:flex}
  body.cx-modern:not(.build-mode) #cx-alert.on{display:flex}
  body.cx-modern:not(.build-mode) #cx-sheet.on{display:grid}

  /* HUD */
  #cx-hud{position:absolute;z-index:9;top:max(10px,env(safe-area-inset-top));left:14px;align-items:stretch;gap:6px;padding:6px;border-radius:20px;background:var(--cx-glass);backdrop-filter:blur(14px);border:1px solid var(--cx-line);box-shadow:0 10px 30px #0a24305c;color:#eef9f5;pointer-events:auto;max-width:calc(100vw - 28px)}
  #cx-hud .cx-brand{display:grid;place-items:center;width:46px;border-radius:14px;background:linear-gradient(145deg,#37c7b4,#1b8d94);color:#fff}
  #cx-hud .cx-brand .cx-ic{width:26px;height:26px}
  .cx-chip{position:relative;display:flex;align-items:center;gap:9px;padding:6px 12px 6px 10px;border-radius:14px;background:#ffffff12;min-width:0;transition:background .2s}
  .cx-chip>.cx-ic{color:var(--cx-teal)}
  .cx-chip b{display:block;font-size:17px;line-height:1.1;font-variant-numeric:tabular-nums;letter-spacing:.2px;white-space:nowrap}
  .cx-chip small{display:block;font-size:10.5px;opacity:.68;margin-top:1px;text-transform:uppercase;letter-spacing:.7px;white-space:nowrap}
  .cx-cash>.cx-ic{color:var(--cx-gold)}
  .cx-cash b{color:#ffe3a1;font-size:19px}
  .cx-cash.low b{color:#ff9d8a}
  .cx-ring{position:relative;width:38px;height:38px;flex:none}
  .cx-ring svg{width:38px;height:38px;transform:rotate(-90deg)}
  .cx-ring circle{fill:none;stroke-width:4.2;stroke-linecap:round}
  .cx-ring .t{stroke:#ffffff22}.cx-ring .v{stroke:var(--cx-gold);transition:stroke-dasharray .6s ease}
  .cx-ring .cx-ic{position:absolute;inset:0;margin:auto;width:17px;height:17px;color:var(--cx-gold)}
  .cx-mood>.cx-ic{width:30px;height:30px;transition:color .3s}
  .cx-mood.good>.cx-ic{color:#7be0a4}.cx-mood.ok>.cx-ic{color:var(--cx-gold)}.cx-mood.bad>.cx-ic{color:var(--cx-coral)}
  .cx-day{padding-bottom:10px}
  .cx-dayprog{position:absolute;left:10px;right:10px;bottom:4px;height:3px;border-radius:9px;background:#ffffff1f;overflow:hidden}
  .cx-dayprog i{display:block;height:100%;background:linear-gradient(90deg,var(--cx-teal),var(--cx-gold));border-radius:9px;transition:width .4s linear}
  .cx-day.paused small{color:var(--cx-gold);opacity:1}
  #cx-hud .cx-gear{display:grid;place-items:center;width:44px;border-radius:14px;border:0;background:#ffffff12;color:#dff4ef;cursor:pointer;padding:0}
  #cx-hud .cx-gear:hover{background:#ffffff26}
  .cx-pop{position:absolute;left:50%;top:-4px;transform:translateX(-50%);font-weight:800;font-size:16px;color:#7be0a4;text-shadow:0 2px 8px #0009;pointer-events:none;animation:cxPop 1.5s ease-out forwards;white-space:nowrap}
  .cx-pop.neg{color:#ff9d8a}
  @keyframes cxPop{0%{opacity:0;transform:translate(-50%,6px) scale(.8)}15%{opacity:1;transform:translate(-50%,-4px) scale(1.12)}100%{opacity:0;transform:translate(-50%,-38px) scale(1)}}
  @keyframes cxBump{0%{transform:scale(1)}40%{transform:scale(1.07)}100%{transform:scale(1)}}
  .cx-chip.bump{animation:cxBump .35s ease}

  /* goal tracker + alert */
  #cx-goal,#cx-alert{position:absolute;z-index:8;left:14px;align-items:center;gap:11px;padding:8px 14px 8px 12px;border-radius:16px;border:1px solid var(--cx-line);background:var(--cx-glass);backdrop-filter:blur(12px);color:#eef9f5;cursor:pointer;text-align:left;width:min(380px,calc(100vw - 100px));box-shadow:0 8px 22px #0a243040;font:inherit}
  #cx-goal{top:calc(max(10px,env(safe-area-inset-top)) + 70px)}
  #cx-goal:hover,#cx-alert:hover{background:var(--cx-glass2)}
  #cx-goal .stars{display:flex;gap:1px;color:#ffffff40}
  #cx-goal .stars .cx-ic{width:19px;height:19px}
  #cx-goal .stars .on{color:var(--cx-gold)}
  #cx-goal .txt{flex:1;min-width:0}
  #cx-goal .txt small{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.7px;opacity:.66}
  #cx-goal .txt b{display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:1px 0 5px}
  #cx-goal .seg{display:flex;gap:3px}
  #cx-goal .seg i{flex:1;height:5px;border-radius:9px;background:#ffffff22}
  #cx-goal .seg i.on{background:linear-gradient(90deg,var(--cx-teal),#8be8d6)}
  #cx-goal>.cx-ic{width:16px;height:16px;opacity:.6}
  #cx-alert{top:calc(max(10px,env(safe-area-inset-top)) + 134px);background:#6b2c25ee;border-color:#ffb3a455;animation:cxPulse 2.4s ease-in-out infinite}
  #cx-alert .cx-ic{color:#ffc2b6}
  #cx-alert b{font-size:13px;display:block}
  #cx-alert small{font-size:11.5px;opacity:.82;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:290px}
  @keyframes cxPulse{0%,100%{box-shadow:0 8px 22px #0a243040}50%{box-shadow:0 8px 26px #ef8a7666}}

  /* dock */
  #cx-dock{position:absolute;z-index:9;bottom:max(14px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);align-items:center;gap:4px;padding:7px;border-radius:26px;background:var(--cx-glass);backdrop-filter:blur(16px);border:1px solid var(--cx-line);box-shadow:0 14px 34px #0a243066;pointer-events:auto}
  #cx-dock button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:64px;height:58px;padding:0 8px;border:0;border-radius:18px;background:transparent;color:#cfe9e3;font:600 11px/1 inherit;font-family:inherit;cursor:pointer;transition:background .15s,transform .15s,color .15s;-webkit-tap-highlight-color:transparent}
  #cx-dock button:hover{background:#ffffff1c;color:#fff}
  #cx-dock button:active{transform:scale(.94)}
  #cx-dock button.active{background:#3ed0bd2e;color:#8ff0df}
  #cx-dock button.active::after{content:"";position:absolute;bottom:3px;width:16px;height:3px;border-radius:9px;background:var(--cx-teal)}
  #cx-dock .cx-play{min-width:92px;flex-direction:row;gap:7px;background:linear-gradient(145deg,#37c7b4,#1b8d94);color:#fff;font-size:13px;box-shadow:0 6px 16px #1b8d9455}
  #cx-dock .cx-play:hover{background:linear-gradient(145deg,#4bd7c4,#25a0a4)}
  #cx-dock .cx-play.paused{background:linear-gradient(145deg,#f2c15b,#e59a3b);color:#2e2108;box-shadow:0 6px 16px #e59a3b55}
  #cx-dock .cx-speed{min-width:52px;font-size:15px;font-weight:800;color:#ffe3a1}
  #cx-dock .cx-speed small{font:600 9px/1 inherit;opacity:.6;text-transform:uppercase;letter-spacing:.6px}
  #cx-dock .sep{width:1px;height:34px;background:var(--cx-line);margin:0 3px}
  #cx-dock .cx-badge{position:absolute;top:5px;right:11px;min-width:16px;height:16px;padding:0 4px;border-radius:99px;background:var(--cx-coral);color:#fff;font-size:10px;font-weight:800;display:grid;place-items:center;line-height:1}
  #cx-dock .cx-badge.dot{min-width:9px;width:9px;height:9px;padding:0;top:8px;right:18px;background:var(--cx-gold)}
  #cx-dock .m-only{display:none}

  /* more sheet */
  #cx-sheet{position:absolute;z-index:10;bottom:calc(max(14px,env(safe-area-inset-bottom)) + 82px);left:50%;transform:translateX(-50%);grid-template-columns:repeat(3,1fr);gap:8px;padding:10px;border-radius:22px;background:var(--cx-glass2);backdrop-filter:blur(16px);border:1px solid var(--cx-line);box-shadow:0 14px 34px #0a243066;width:min(330px,calc(100vw - 24px));animation:cxRise .2s ease-out}
  #cx-sheet button{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px;border:0;border-radius:16px;background:#ffffff14;color:#eaf7f3;font:600 12px/1.1 inherit;font-family:inherit;cursor:pointer}
  #cx-sheet button:hover{background:#ffffff26}
  #cx-sheet .cx-ic{width:24px;height:24px;color:var(--cx-teal)}
  @keyframes cxRise{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}

  /* panel as drawer / sheet */
  body.cx-modern:not(.build-mode) #management-panel{background:var(--cx-cream);border-radius:22px;border:1px solid #ffffffaa;box-shadow:0 18px 50px #0a24308c;color:#17414a}
  body.cx-modern:not(.build-mode) #management-panel .panel-title{background:linear-gradient(180deg,var(--cx-cream) 78%,#f7faf600)}
  body.cx-modern:not(.build-mode) #management-panel .panel-title h3{font-size:19px;letter-spacing:.2px}
  @media (min-width:761px){
    body.cx-modern.has-management-panel:not(.build-mode) #cx-dock{left:calc((100% - 446px) / 2)}
    #cx-dock{transition:left .25s ease}
    body.cx-modern:not(.build-mode) #management-panel{top:134px!important;right:16px!important;left:auto!important;bottom:16px!important;width:min(430px,calc(100vw - 32px))!important;max-width:none!important;max-height:none!important;height:auto;padding:14px 16px 18px}
    body.cx-modern:not(.build-mode) #management-panel[hidden]{display:none}
  }
  @keyframes cxSlide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
  @media (max-width:760px){
    :root{--cx-top:max(6px,env(safe-area-inset-top));--cx-bot:max(8px,env(safe-area-inset-bottom))}
    /* one slim HUD row */
    #cx-hud{top:var(--cx-top);left:6px;right:6px;max-width:none;display:flex!important;gap:4px;padding:4px;border-radius:16px}
    #cx-hud .cx-brand,#cx-hud .cx-pts,#cx-hud small,#cx-hud .cx-dayprog,#cx-hud .cx-snd{display:none}
    #cx-hud .cx-chip{flex:1 1 auto;justify-content:center;padding:0 7px;gap:5px;height:38px;border-radius:12px}
    #cx-hud .cx-chip b{font-size:13.5px}
    #cx-hud .cx-cash{flex:1.5 0 auto;min-width:max-content}.cx-cash b{font-size:15px!important}
    #cx-hud .cx-cash>.cx-ic{display:none}
    #cx-hud .cx-day{padding-bottom:0}
    #cx-hud .cx-day>.cx-ic{display:none}
    #cx-hud .cx-ring{width:24px;height:24px}.cx-ring svg{width:24px;height:24px}.cx-ring circle{stroke-width:5}.cx-ring .cx-ic{width:10px;height:10px}
    .cx-mood>.cx-ic{width:22px;height:22px}
    #cx-hud .cx-gear{flex:0 0 36px;width:36px;height:38px}
    #cx-hud .cx-gear .cx-ic{width:19px;height:19px}
    /* goal pill and alert */
    #cx-goal,#cx-alert{left:6px;width:calc(100vw - 72px);top:calc(var(--cx-top) + 50px);padding:5px 10px;gap:8px;border-radius:13px}
    #cx-goal .stars .cx-ic{width:13px;height:13px}
    #cx-goal .txt small{display:none}
    #cx-goal .txt b{margin:0 0 3px;font-size:12px}
    #cx-goal .seg i{height:3px}
    #cx-goal>.cx-ic{display:none}
    #cx-alert{top:calc(var(--cx-top) + 96px);width:auto;max-width:calc(100vw - 72px)}
    #cx-alert small{display:none}
    body.cx-modern:not(.build-mode) .camera-controls{top:calc(var(--cx-top) + 50px)!important}
    /* slim icon dock */
    #cx-dock{left:6px;right:6px;bottom:var(--cx-bot);transform:none;justify-content:space-between;padding:4px;gap:1px;border-radius:20px}
    #cx-dock button{min-width:0;flex:1;height:46px;padding:0 1px;gap:2px;font-size:10px;border-radius:15px}
    #cx-dock button .cx-ic{width:21px;height:21px}
    #cx-dock .cx-play{flex:0 0 52px;min-width:0;height:46px;border-radius:16px}
    #cx-dock .cx-play span{display:none}
    #cx-dock .cx-play.first{flex:0 0 84px;min-width:0}#cx-dock .cx-play.first span{display:inline}
    #cx-dock .cx-speed{flex:0 0 40px;min-width:0;font-size:14px}#cx-dock .cx-speed small{display:none}
    #cx-dock button.active::after{bottom:1px}
    #cx-dock .d-only,#cx-dock .sep{display:none}
    #cx-dock .m-only{display:flex}
    #cx-dock .cx-badge{top:2px;right:calc(50% - 20px)}
    #cx-dock .cx-badge.dot{top:5px;right:calc(50% - 15px)}
    #cx-sheet{bottom:calc(var(--cx-bot) + 58px);gap:6px;padding:8px;border-radius:18px}
    #cx-sheet button{padding:9px 2px;gap:4px;font-size:11px;border-radius:13px}
    #cx-sheet .cx-ic{width:22px;height:22px}
    /* compact bottom sheet */
    body.cx-modern:not(.build-mode) #management-panel{left:6px!important;right:6px!important;width:auto!important;max-width:none!important;bottom:calc(var(--cx-bot) + 58px)!important;max-height:44dvh!important;padding:8px 10px 12px;border-radius:20px}
    body.cx-modern:not(.build-mode) #management-panel::before{content:"";display:block;width:34px;height:4px;border-radius:9px;background:#17414a2e;margin:0 auto 6px}
    body.cx-modern:not(.build-mode) #management-panel .panel-title{margin-bottom:4px;padding-bottom:4px;align-items:center}
    body.cx-modern:not(.build-mode) #management-panel .panel-title h3{font-size:16px}
    body.cx-modern:not(.build-mode) #management-panel .panel-mark{display:none}
    body.cx-modern:not(.build-mode) #management-panel #panel-close{font-size:0!important;width:34px;min-width:34px;height:34px;min-height:34px;padding:0;border-radius:50%;display:grid;place-items:center}
    body.cx-modern:not(.build-mode) #management-panel #panel-close::before{content:"✕";font-size:14px;color:#17414a}
    body.cx-modern:not(.build-mode) #management-panel #panel-back{font-size:0!important;width:34px;min-width:34px;height:34px;min-height:34px;padding:0}
    body.cx-modern:not(.build-mode) #management-panel #panel-back::before{content:"‹";font-size:22px;color:#17414a}
    #management-panel .hint,#management-panel .cx-more-info,#management-panel .cx-note.event{display:none!important}
    #management-panel .cx-tabs{display:flex!important;margin:0 0 6px!important;gap:3px!important}
    #management-panel .cx-tabs button{flex:1 1 0!important;min-width:0;min-height:34px!important;padding:3px 2px!important;flex-direction:row!important;gap:5px!important;justify-content:center}
    #management-panel .cx-tabs button span{display:none}
    #management-panel .cx-tabs button[aria-pressed=true] span{display:inline;font-size:11px}
    #management-panel .cx-tabs button[aria-pressed=true]{flex:2.6 1 0!important}
    .cx-hero{padding:9px 11px;gap:10px;margin:2px 0 7px}
    .cx-bigring,.cx-bigring svg{width:64px;height:64px}.cx-bigring circle{stroke-width:9}
    .cx-bigring b{font-size:16px}.cx-bigring small{display:none}
    .cx-hero .side{gap:6px}
    .cx-tiles{gap:5px;margin-bottom:7px}.cx-tile{padding:5px 2px;border-radius:11px}.cx-tile b{font-size:13px}.cx-tile .cx-ic{width:16px;height:16px}#management-panel .cx-tile small{display:none}
    .cx-hero .side .cx-meter:last-child{display:none}
    .cx-depts{gap:6px}#management-panel .cx-dept{padding:7px 9px;border-radius:12px}.cx-dept .h{font-size:12px}.cx-dept small{display:none}
    #management-panel h4{margin:8px 0 4px;font-size:12px}
    .cx-startrack .cx-ic{width:34px;height:34px}.cx-startrack{padding:0}
    .cx-goalrow{padding:7px 9px;margin:5px 0;border-radius:12px;gap:8px}.cx-goalrow small{display:none}.cx-goalrow b{font-size:12.5px}
    #management-panel .cx-card{padding:8px 9px;margin:6px 0;border-radius:12px}
    #management-panel .cx-card .cx-meta{font-size:11.5px}
    .cx-ava{width:32px;height:32px;border-radius:11px;font-size:12px}.cx-staff{grid-template-columns:32px 1fr;gap:8px}
    .cx-kpis{gap:5px}.cx-kpi{padding:5px 8px}.cx-kpi b{font-size:15px}
    #management-panel button{padding:7px 9px;font-size:12.5px}
    #management-panel .cx-card select{min-height:34px;margin:4px 0}
    /* room panel */
    #management-panel .room-summary{font-size:12px;margin:0 0 4px}
    #management-panel .room-summary span{font-size:11.5px}
    #management-panel .role-summary{display:none}
    #management-panel .capacity-cause{font-size:12px;margin:4px 0;padding:5px 8px}
    #management-panel .primary-action{min-height:40px!important;margin:5px 0!important}
    #management-panel .panel-actions{gap:5px}
    .cx-upgrades h4{margin-top:6px}
    #management-panel .cx-upgrades .cx-card>.cx-meta,#management-panel .cx-upgrades .cx-actions small{display:none}
    .cx-upgrades .cx-actions button{padding:6px 4px}
    /* tutorial uses the stock HUD: keep it small too */
    body:not(.cx-modern):not(.build-mode) .management-top{min-height:42px!important;padding:4px 8px!important}
    body:not(.cx-modern):not(.build-mode) .hospital-heading small,body:not(.cx-modern):not(.build-mode) .mini-flow{display:none!important}
    body:not(.cx-modern):not(.build-mode) #flow-goal{display:none!important}
    body:not(.cx-modern):not(.build-mode) #opening-guide{padding:8px 10px!important;border-radius:16px!important}
    body:not(.cx-modern):not(.build-mode) #opening-guide .opening-eyebrow span{display:none}
    body:not(.cx-modern):not(.build-mode) #opening-guide strong{font-size:14px!important}
    body:not(.cx-modern):not(.build-mode) #opening-guide p{font-size:12px!important;line-height:1.3!important;margin:3px 0 6px!important}
    body:not(.cx-modern):not(.build-mode) #opening-guide button:not(#opening-skip){min-height:40px!important;padding:6px 10px!important}
    body:not(.cx-modern):not(.build-mode) .management-dock{min-height:50px!important;padding:3px!important}
    body:not(.cx-modern):not(.build-mode) .management-dock button{min-height:42px!important;font-size:11px!important}
  }
  @keyframes cxUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
  @media (max-width:760px) and (max-height:560px){#cx-goal,#cx-alert{display:none!important}}

  /* in-game notices sit above the dock */
  body.cx-modern.manage-mode:not(.build-mode) #build-notice{top:auto!important;left:50%!important;right:auto!important;transform:translateX(-50%);bottom:calc(max(14px,env(safe-area-inset-bottom)) + 88px)!important;max-width:min(460px,calc(100vw - 24px))!important;width:max-content;font-size:13px!important;line-height:1.35;padding:9px 16px!important;border-radius:16px!important;background:#fffdf4f2!important;color:#1f5a57!important;border:1px solid #ffffff!important;box-shadow:0 10px 26px #0a243055!important;text-align:center;z-index:11!important}
  body.cx-modern.manage-mode:not(.build-mode) #build-notice.error{background:#fbe9e0f5!important;color:#a24a36!important}
  @media (min-width:761px){body.cx-modern.has-management-panel.manage-mode:not(.build-mode) #build-notice{left:calc((100% - 446px) / 2)!important}}

  /* panel contents */
  body.cx-modern #management-panel .cx-tabs{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin:2px 0 10px;padding:0;overflow:visible}
  body.cx-modern #management-panel .cx-tabs button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:48px;padding:5px 2px;border-radius:12px;font-size:10.5px;font-weight:600;background:#e8f1ec;color:#245a5a;border:1px solid #cfe2d9}
  body.cx-modern #management-panel .cx-tabs button .cx-ic{width:18px;height:18px}
  body.cx-modern #management-panel .cx-tabs button span{font-size:10.5px;line-height:1}
  body.cx-modern #management-panel .cx-tabs button[aria-pressed=true]{background:linear-gradient(145deg,#2aa89c,#1b8d94);color:#fff;border-color:transparent;box-shadow:0 4px 12px #1b8d9455}
  .cx-hero{display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;padding:14px;border-radius:18px;background:linear-gradient(145deg,#12495a,#1b6d77);color:#eaf8f4;margin:4px 0 10px}
  .cx-bigring{position:relative;width:92px;height:92px}
  .cx-bigring svg{width:92px;height:92px;transform:rotate(-90deg)}
  .cx-bigring circle{fill:none;stroke-width:8;stroke-linecap:round}
  .cx-bigring .t{stroke:#ffffff26}.cx-bigring .v{stroke:var(--cx-gold)}
  .cx-bigring div{position:absolute;inset:0;display:grid;place-content:center;text-align:center}
  .cx-bigring b{font-size:22px;line-height:1}.cx-bigring small{font-size:8.5px!important;letter-spacing:.3px;text-transform:uppercase;opacity:.7;display:block;margin-top:2px}
  .cx-hero .side{display:grid;gap:9px}
  .cx-meter{display:grid;grid-template-columns:22px 1fr auto;align-items:center;gap:8px;font-size:12px}
  .cx-meter .cx-ic{width:20px;height:20px;color:var(--cx-teal)}
  .cx-meter .bar{height:7px;border-radius:9px;background:#ffffff26;overflow:hidden}
  .cx-meter .bar i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,#3ed0bd,#9af0dd)}
  .cx-meter.bad .bar i{background:linear-gradient(90deg,#ef8a76,#f6b3a3)}
  .cx-meter.bad .cx-ic{color:var(--cx-coral)}
  .cx-meter b{font-variant-numeric:tabular-nums}
  .cx-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:0 0 10px}
  .cx-tile{display:grid;justify-items:center;gap:2px;padding:9px 4px;border-radius:14px;background:#eaf3ee;border:1px solid #d3e4db;color:#1c4650;text-align:center}
  .cx-tile .cx-ic{width:20px;height:20px;color:#1f8a82}
  .cx-tile b{font-size:15px;font-variant-numeric:tabular-nums}.cx-tile small{font-size:10px!important;opacity:.7;text-transform:uppercase;letter-spacing:.5px}
  .cx-depts{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  #management-panel .cx-dept{display:grid;gap:5px;text-align:left;padding:10px 11px;border-radius:15px;background:#fff;border:1px solid #d3e4db;color:#17414a;box-shadow:0 2px 6px #17414a0f;cursor:pointer;min-height:0}
  #management-panel .cx-dept:hover{border-color:#8fcfc4;background:#f3faf7}
  .cx-dept .h{display:flex;align-items:center;gap:7px;font-weight:700;font-size:13px}
  .cx-dept .dot{width:9px;height:9px;border-radius:50%;background:#5cc79b;flex:none}
  .cx-dept .dot.busy{background:var(--cx-gold)}.cx-dept .dot.bad{background:var(--cx-coral)}.cx-dept .dot.idle{background:#a9bdb5}
  .cx-dept .bar{height:6px;border-radius:9px;background:#dce9e2;overflow:hidden}
  .cx-dept .bar i{display:block;height:100%;background:linear-gradient(90deg,#2fb3a5,#7ad8c9);border-radius:9px}
  .cx-dept small{font-size:11px!important;color:#5b746e;line-height:1.3}
  .cx-banner{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center;padding:12px 14px;margin:10px 0;border-radius:16px;background:linear-gradient(145deg,#fff4d6,#ffe7a8);border:1px solid #efd58d;color:#4d3a0a}
  .cx-banner .cx-ic{width:30px;height:30px;color:#c98a14}
  .cx-banner b{font-size:14px}.cx-banner small{font-size:12px!important;opacity:.8}
  #management-panel .cx-banner button{grid-column:1/-1;background:#1f8a82;color:#fff;border:0;border-radius:12px;font-weight:700}
  .cx-startrack{display:flex;justify-content:center;gap:10px;padding:8px 0 2px}
  .cx-startrack .cx-ic{width:50px;height:50px;color:#c9d8d1;stroke-width:1.4}
  .cx-startrack .on{color:var(--cx-gold);fill:var(--cx-gold);filter:drop-shadow(0 4px 8px #d9a23a66)}
  .cx-goalrow{display:grid;grid-template-columns:30px 1fr;gap:10px;align-items:center;padding:10px 11px;margin:7px 0;border-radius:15px;background:#fff;border:1px solid #d3e4db;box-shadow:0 2px 6px #17414a0f}
  .cx-goalrow .ck{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;border:2px solid #b8cdc4;color:transparent}
  .cx-goalrow.done .ck{background:#2fb3a5;border-color:#2fb3a5;color:#fff}
  .cx-goalrow .ck .cx-ic{width:16px;height:16px;stroke-width:2.6}
  .cx-goalrow b{font-size:13.5px;display:block}.cx-goalrow small{font-size:12px!important;color:#5b746e}
  .cx-goalrow .bar{height:6px;border-radius:9px;background:#dce9e2;overflow:hidden;margin-top:5px}.cx-goalrow .bar i{display:block;height:100%;background:linear-gradient(90deg,#2fb3a5,#e0a93f);border-radius:9px}
  .cx-goalrow.done b{text-decoration:line-through;opacity:.6}
  .cx-ava{display:grid;place-items:center;width:40px;height:40px;border-radius:14px;font-weight:800;font-size:14px;color:#fff;flex:none}
  .cx-staff{display:grid;grid-template-columns:40px 1fr;gap:10px}
  .cx-pips{display:inline-flex;gap:3px;vertical-align:middle}.cx-pips i{width:9px;height:9px;border-radius:50%;background:#d0ded7}.cx-pips i.on{background:#e0a93f}
  #management-panel .cx-card>button:not(:disabled),#management-panel .cx-actions button:not(:disabled):not([aria-pressed=true]){background:#e1f2ed;color:#17636a;border:1px solid #b6dcd3;font-weight:700;border-radius:11px}
  #management-panel .cx-card>button:not(:disabled):hover,#management-panel .cx-actions button:not(:disabled):not([aria-pressed=true]):hover{background:#cdeae2}
  #management-panel button[data-cx=hire],#management-panel button[data-cx=research]{background:#1f8a82!important;color:#fff!important;border-color:#1f8a82!important;width:100%}
  #management-panel button:disabled{opacity:.5}
  #cx-celebrate .cx-big-star{animation:cxStar .8s ease-out}
  @keyframes cxStar{0%{transform:scale(.3) rotate(-30deg);opacity:0}60%{transform:scale(1.25) rotate(6deg);opacity:1}100%{transform:none}}

  /* title screen */
  #cx-title{background:radial-gradient(120% 90% at 50% 0%,#1e6f7acc 0%,#0b2b38ee 70%)!important;backdrop-filter:blur(10px)}
  #cx-title .cx-titlecard{width:min(460px,100%);text-align:center;background:linear-gradient(180deg,#17475af7,#0f3444f7);border:1px solid #b9e2dd40;border-radius:26px;padding:26px 22px 18px;animation:cxRiseC .5s ease-out}
  @keyframes cxRiseC{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}
  .cx-logo{display:grid;place-items:center;width:74px;height:74px;margin:0 auto 10px;border-radius:24px;background:linear-gradient(145deg,#4adcc8,#1b8d94);color:#fff;box-shadow:0 10px 26px #1b8d9488}
  .cx-logo .cx-ic{width:42px;height:42px}
  #cx-title h1{font-size:36px!important;margin:4px 0 0!important;letter-spacing:.5px}
  #cx-title .cx-sub{font-size:13px!important;letter-spacing:2.4px;text-transform:uppercase;color:#8fe3d4;opacity:1!important;margin:2px 0 8px!important}
  #cx-title .cx-tag{margin:0 0 16px;font-size:14px;opacity:.82}
  #cx-title button.big{display:flex!important;align-items:center;gap:14px;text-align:left;padding:14px 16px!important;min-height:70px!important;margin:8px 0!important}
  #cx-title button.big .cx-ic{width:30px;height:30px;flex:none}
  #cx-title button.big b{font-size:17px}
  #cx-title button.primary{background:linear-gradient(145deg,#5ee6d2,#2fb8ab)!important;color:#07323a!important;box-shadow:0 8px 22px #2fb8ab55}
  #cx-title .cx-grid3{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:6px}
  #cx-title .cx-grid3 button{display:grid!important;justify-items:center;gap:3px;text-align:center!important;padding:12px 4px!important;margin:0!important;min-height:0!important}
  #cx-title .cx-grid3 .cx-ic{width:26px;height:26px;color:#7be0d0}
  #cx-title .cx-grid3 b{font-size:13px}
  #cx-title button:hover{background:#ffffff26}
  #cx-title button.primary:hover{background:linear-gradient(145deg,#74efdd,#3cc6b9)!important}
  #cx-title .cx-fine{font-size:11px;opacity:.55;margin:14px 0 0}
  #cx-celebrate .cx-modal{text-align:center;position:relative;z-index:1}
  #cx-celebrate .cx-startrack .on{animation:cxStar .8s ease-out both}
  #cx-celebrate .cx-startrack .cx-ic:nth-child(2).on{animation-delay:.15s}#cx-celebrate .cx-startrack .cx-ic:nth-child(3).on{animation-delay:.3s}
  #cx-celebrate .cx-startrack .cx-ic{width:60px;height:60px}
  .cx-confetti{position:fixed;top:-12px;width:9px;height:14px;border-radius:2px;opacity:.9;animation:cxFall linear infinite;pointer-events:none}
  @keyframes cxFall{to{transform:translateY(105vh) rotate(540deg)}}
  `;
  document.head.append(css);

  // ---- helpers ------------------------------------------------------------------------------------------
  const careerOn = (ctrl) => ctrl.sim?.careerOn?.();
  const MORE = [
    ["research", "research", "Research"],
    ["finance", "finance", "Finance"],
    ["prices", "prices", "Prices"],
    ["overview", "hospital", "Overview"],
    ["log", "log", "Activity"],
    ["settings", "gear", "Settings"],
  ];

  function openTab(ctrl, tab) {
    const open = !ctrl.panel.hidden && ctrl.panel.dataset.context === "career" && ctrl.cxTab === tab;
    if (open) return ctrl.closePanel();
    ctrl.cxTab = tab;
    ctrl.panelType = "overview";
    ctrl.navigate("overview");
    ctrl.render();
  }
  YC.openTab = openTab;

  function mount(ctrl) {
    if (ctrl.cxMounted) return;
    ctrl.cxMounted = true;
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div id="cx-hud">
        <div class="cx-brand">${ic("hospital")}</div>
        <div class="cx-chip cx-cash" title="Cash">${ic("coin")}<div><b data-f="cash">$0</b><small data-f="cashsub">Cash</small></div></div>
        <div class="cx-chip cx-rep" title="Reputation"><div class="cx-ring"><svg viewBox="0 0 40 40"><circle class="t" cx="20" cy="20" r="16"/><circle class="v" cx="20" cy="20" r="16" stroke-dasharray="0 100.5"/></svg>${ic("star", "fill")}</div><div><b data-f="rep">0%</b><small>Reputation</small></div></div>
        <div class="cx-chip cx-mood good" title="Patient mood"><span data-f="face">${ic("happy")}</span><div><b data-f="mood">0%</b><small>Mood</small></div></div>
        <div class="cx-chip cx-pts" title="Patients in the center">${ic("people")}<div><b data-f="pts">0</b><small>Patients</small></div></div>
        <div class="cx-chip cx-day" title="Day and clock">${ic("clock")}<div><b data-f="day">Day 1</b><small data-f="clock">0:00</small></div><div class="cx-dayprog"><i data-f="dayprog"></i></div></div>
        <button class="cx-gear cx-snd" data-act="sound" aria-label="Sound on or off" data-f="snd">${ic("sound")}</button>
        <button class="cx-gear" data-act="settings" aria-label="Settings and saves">${ic("gear")}</button>
      </div>
      <button id="cx-goal" data-act="goal" aria-label="Open the next step or goals"><div class="stars" data-f="stars"></div><div class="txt"><small data-f="goalhead">Goals</small><b data-f="goaltext"></b><div class="seg" data-f="seg"></div></div>${ic("chevron")}</button>
      <button id="cx-alert" data-act="alert" aria-label="Inspect bottleneck">${ic("alert")}<div><b data-f="alerthead"></b><small data-f="alerttext"></small></div></button>
      <nav id="cx-dock" aria-label="Center management">
        <button class="cx-play" data-act="play" data-f="play" aria-label="Open or pause the center"></button>
        <button class="cx-speed" data-act="speed" data-f="speed" aria-label="Game speed"></button>
        <span class="sep"></span>
        <button data-act="build" aria-label="Build">${ic("build")}<span>Build</span></button>
        <button data-act="tab:team" data-tab="team" aria-label="Team and hiring">${ic("staff")}<span>Team</span><em class="cx-badge dot" data-f="teambadge" hidden></em></button>
        <button data-act="tab:goals" data-tab="goals" aria-label="Goals">${ic("goals")}<span>Goals</span><em class="cx-badge" data-f="goalbadge" hidden></em></button>
        <button class="d-only" data-act="tab:research" data-tab="research" aria-label="Research">${ic("research")}<span>Research</span><em class="cx-badge dot" data-f="resbadge" hidden></em></button>
        <button class="d-only" data-act="tab:finance" data-tab="finance" aria-label="Finance">${ic("finance")}<span>Finance</span></button>
        <button class="d-only" data-act="tab:overview" data-tab="overview" aria-label="Hospital overview">${ic("hospital")}<span>Hospital</span></button>
        <button class="m-only" data-act="more" aria-label="More">${ic("more")}<span>More</span></button>
      </nav>
      <div id="cx-sheet" role="menu">${MORE.map(([k, i, l]) => `<button data-act="${k === "settings" ? "settings" : "tab:" + k}" data-tab="${k}">${ic(i)}<span>${l}</span></button>`).join("")}<button data-act="sound" data-f="snd2">${ic("sound")}<span>Sound</span></button></div>`;
    while (wrap.firstChild) ctrl.ui.append(wrap.firstChild);
    const $ = (s) => ctrl.ui.querySelector(s);
    ctrl.cxEls = { hud: $("#cx-hud"), goal: $("#cx-goal"), alert: $("#cx-alert"), dock: $("#cx-dock"), sheet: $("#cx-sheet") };
    const sheet = ctrl.cxEls.sheet;
    ctrl.ui.addEventListener("click", (ev) => {
      const el = ev.target.closest?.("[data-act]");
      if (!el) {
        if (!ev.target.closest?.("#cx-sheet")) sheet.classList.remove("on");
        return;
      }
      const act = el.dataset.act;
      if (act !== "more") sheet.classList.remove("on");
      if (act === "play") ctrl.ui.querySelector("#hospital-open").click();
      else if (act === "speed") ctrl.ui.querySelector("#clock-speed").click();
      else if (act === "build") ctrl.ui.querySelector("#center-build").click();
      else if (act === "alert") ctrl.ui.querySelector("#flow-goal").click();
      else if (act === "settings") ctrl.navigate("settings");
      else if (act === "sound") YC.toggleSound?.();
      else if (act === "goal") {
        const fl = ctrl.sim.flowConstraint?.();
        if (fl?.roomId && fl.waiting >= 3) ctrl.ui.querySelector("#flow-goal").click();
        else openTab(ctrl, "goals");
      }
      else if (act === "more") sheet.classList.toggle("on");
      else if (act.startsWith("tab:")) openTab(ctrl, act.slice(4));
    });
  }

  const setText = (el, v) => {
    if (el && el.textContent !== v) el.textContent = v;
  };
  const setHTML = (el, v) => {
    if (el && el.dataset.h !== v) {
      el.dataset.h = v;
      el.innerHTML = v;
    }
  };

  function popup(ctrl, text, neg) {
    const chip = ctrl.cxEls.hud.querySelector(".cx-cash");
    const p = document.createElement("span");
    p.className = "cx-pop" + (neg ? " neg" : "");
    p.textContent = text;
    chip.append(p);
    chip.classList.remove("bump");
    void chip.offsetWidth;
    chip.classList.add("bump");
    setTimeout(() => p.remove(), 1600);
  }

  const stateOf = (ctrl) => ctrl.sim.state;
  function update(ctrl) {
    const sim = ctrl.sim, t = sim.state, c = t.career;
    const q = (f) => ctrl.ui.querySelector(`[data-f=${f}]`);
    // cash (counts toward the real value; +$ / -$ popups for income and spending)
    const cashEl = q("cash");
    const shown = ctrl.cxShown ?? t.funds;
    const target = t.funds;
    if (ctrl.cxLastFunds === void 0) ctrl.cxLastFunds = target;
    const d = target - ctrl.cxLastFunds;
    ctrl.cxLastFunds = target;
    if (d > 0) ctrl.cxPos = (ctrl.cxPos ?? 0) + d;
    else if (d <= -40) popup(ctrl, "-" + kt(-d), true);
    if ((ctrl.cxPos ?? 0) >= 8 && performance.now() > (ctrl.cxPopAt ?? 0)) {
      popup(ctrl, "+" + kt(ctrl.cxPos), false);
      ctrl.cxPos = 0;
      ctrl.cxPopAt = performance.now() + 900;
    }
    ctrl.cxShown = Math.abs(target - shown) < 1 ? target : shown + (target - shown) * 0.25;
    setText(cashEl, kt(Math.round(ctrl.cxShown)));
    ctrl.cxEls.hud.querySelector(".cx-cash").classList.toggle("low", target < 300);
    const today = t.income - c.marks.income;
    setText(q("cashsub"), t.debt > 0 ? `Loan ${kt(t.debt)}` : today > 0 ? `+${kt(today)} today` : "Cash");
    // reputation ring
    const r = Math.max(0, Math.min(100, c.rep));
    const ring = ctrl.cxEls.hud.querySelector(".cx-rep .v");
    const dash = `${(r / 100) * 100.5} 100.5`;
    if (ring.getAttribute("stroke-dasharray") !== dash) ring.setAttribute("stroke-dasharray", dash);
    setText(q("rep"), Math.round(r) + "%");
    // mood
    const m = Math.round(c.happy);
    const kind = m >= 72 ? "good" : m >= 50 ? "ok" : "bad";
    const mood = ctrl.cxEls.hud.querySelector(".cx-mood");
    mood.className = "cx-chip cx-mood " + kind;
    setHTML(q("face"), ic(kind === "good" ? "happy" : kind === "ok" ? "meh" : "sad"));
    setText(q("mood"), m + "%");
    setText(q("pts"), `${t.patients.length}/${sim.careerCap()}`);
    // day + clock
    setText(q("day"), "Day " + c.day);
    const paused = t.paused || (!t.open && t.time === 0);
    setText(q("clock"), `${Yn(t.time)} · ${t.open || t.time > 0 ? (t.paused ? "Paused" : t.speed + "×") : "Closed"}`);
    ctrl.cxEls.hud.querySelector(".cx-day").classList.toggle("paused", paused);
    const f = Math.max(0, Math.min(1, (t.time - c.dayStart) / YC.DAY_LENGTH));
    const dp = q("dayprog");
    if (dp) dp.style.width = (f * 100).toFixed(1) + "%";

    // goal tracker
    const goals = sim.careerGoals();
    const done = goals.filter((g) => g.done).length;
    const next = goals.find((g) => !g.done);
    const step = YC.nextStep?.(sim);
    const snd = YC.sound?.sfx || YC.sound?.music;
    for (const id of ["snd", "snd2"]) {
      const b = ctrl.ui.querySelector(`[data-f=${id}]`);
      if (b) setHTML(b, ic(snd ? "sound" : "mute") + (id === "snd2" ? `<span>${snd ? "Sound on" : "Sound off"}</span>` : ""));
    }
    setHTML(q("stars"), [1, 2, 3].map((i) => ic("star", i <= c.stars ? "fill on" : "")).join(""));
    const maxed = c.stars >= YC.MAX_STARS;
    setText(q("goalhead"), step ? "Next step" : maxed ? "Center of Excellence" : `Star ${c.stars + 1} goals · ${done}/${goals.length}`);
    setText(q("goaltext"), step ?? (maxed ? "Keep growing: there is no ceiling" : next ? next.label : "All goals complete"));
    setHTML(q("seg"), goals.map((g) => `<i class="${g.done ? "on" : ""}"></i>`).join(""));

    // bottleneck alert
    const fl = sim.flowConstraint();
    const al = ctrl.cxEls.alert;
    al.classList.toggle("on", !!fl);
    if (fl) {
      setText(q("alerthead"), `${fl.department} · ${fl.waiting} waiting`);
      setText(q("alerttext"), fl.reason);
    }

    // dock state
    const play = ctrl.cxEls.dock.querySelector(".cx-play");
    const notStarted = !t.open && t.time === 0;
    setHTML(play, notStarted ? ic("play") + "<span>Open</span>" : t.paused ? ic("play") + "<span>Resume</span>" : ic("pause") + "<span>Pause</span>");
    play.classList.toggle("paused", !notStarted && t.paused);
    play.classList.toggle("first", notStarted);
    play.disabled = ctrl.ui.querySelector("#hospital-open").disabled;
    setHTML(ctrl.cxEls.dock.querySelector(".cx-speed"), `${t.speed}×<small>speed</small>`);
    const tab = !ctrl.panel.hidden && ctrl.panel.dataset.context === "career" ? ctrl.cxTab : null;
    ctrl.cxEls.dock.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    const tb = ctrl.cxEls.dock.querySelector('[data-f="teambadge"]');
    const seen = YC.marketSeen ?? 0;
    const fresh = c.market.day !== seen && c.market.list.length > 0;
    if (tab === "team") YC.marketSeen = c.market.day;
    tb.hidden = !fresh || tab === "team";
    const gb = ctrl.cxEls.dock.querySelector('[data-f="goalbadge"]');
    gb.hidden = !(done > 0 && done < goals.length);
    setText(gb, String(done));
    const rb = ctrl.cxEls.dock.querySelector('[data-f="resbadge"]');
    rb.hidden = !!c.research.current || !sim.researchList().some((p) => !p.done && !p.locked && t.funds >= p.cost);
  }

  const baseRender = proto.render;
  proto.render = function () {
    baseRender.call(this);
    const on = !!careerOn(this);
    document.body.classList.toggle("cx-modern", on);
    if (!on) return;
    try {
      mount(this);
      update(this);
    } catch (err) {
      if (!this.cxErr) console.error("modern ui", err), (this.cxErr = true);
    }
  };
})();
