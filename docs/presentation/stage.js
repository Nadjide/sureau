// Mise en scène injectée dans la page pendant le tournage : curseur visible,
// légendes, cartes plein écran (titre, terminal) et zoom de caméra. Rien de
// tout cela ne fait partie de l'application ; l'interface filmée est réelle.
(() => {
  if (window.__stage) return;
  const css = `
  #__stage, #__stage * { box-sizing: border-box; }
  #__stage { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; font-family: 'Inter Variable', Inter, system-ui, sans-serif; }
  #__cursor { position: fixed; left: 0; top: 0; width: 28px; height: 28px; transform: translate(-100px,-100px); opacity: 0; transition: opacity .3s; filter: drop-shadow(0 2px 3px rgba(15,23,36,.35)); }
  #__cursor.on { opacity: 1; }
  #__ripple { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid #447cde; opacity: 0; }
  #__ripple.go { animation: __ripple .55s ease-out; }
  @keyframes __ripple { from { transform: scale(.3); opacity: .9 } to { transform: scale(1.35); opacity: 0 } }
  #__caption { position: fixed; left: 30px; bottom: 30px; display: flex; align-items: center; gap: 15px; max-width: 700px; padding: 14px 22px 14px 14px;
    background: rgba(15,23,36,.9); color: #fff; border-radius: 18px; box-shadow: 0 18px 50px rgba(15,23,36,.35); backdrop-filter: blur(8px);
    opacity: 0; transform: translateY(18px); transition: opacity .5s ease, transform .5s cubic-bezier(.2,.8,.2,1); }
  #__caption.on { opacity: 1; transform: none; }
  #__caption .n { flex: none; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: #447cde; font-weight: 700; font-size: 17px; letter-spacing: .02em; }
  #__caption strong { display: block; font-size: 21px; font-weight: 650; letter-spacing: -.01em; line-height: 1.2; }
  #__caption small { display: block; margin-top: 4px; font-size: 14.5px; color: #c9d4e3; line-height: 1.4; }
  #__card { position: fixed; inset: 0; display: grid; place-items: center; opacity: 0; transition: opacity .7s ease;
    background: radial-gradient(1200px 700px at 78% 18%, rgba(68,124,222,.32), transparent 60%), radial-gradient(900px 600px at 10% 95%, rgba(57,119,97,.22), transparent 60%), #0d1420; color: #fff; }
  #__card.on { opacity: 1; }
  #__card::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 48px 48px; mask-image: radial-gradient(ellipse at center, #000 30%, transparent 80%); }
  #__card .in { position: relative; text-align: center; }
  #__card .rise { opacity: 0; transform: translateY(16px); animation: __rise .9s cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes __rise { to { opacity: 1; transform: none; } }
  #__card .logo { width: 92px; height: 102px; margin: 0 auto 26px; }
  #__card h1 { margin: 0; font-size: 84px; font-weight: 700; letter-spacing: .32em; padding-left: .32em; }
  #__card .tag { margin-top: 18px; font-size: 32px; font-weight: 500; color: #e8eef7; letter-spacing: -.01em; }
  #__card .sub { margin-top: 14px; font-size: 20px; color: #9fb0c6; }
  #__card .chips { display: flex; gap: 12px; justify-content: center; margin-top: 34px; }
  #__card .chips span { padding: 9px 18px; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; font-size: 16px; color: #dbe5f2; background: rgba(255,255,255,.04); }
  #__card .scene { width: 1060px; text-align: left; }
  #__card .scene .kicker { display: flex; align-items: center; gap: 14px; font-size: 16px; letter-spacing: .14em; text-transform: uppercase; color: #8fb3f0; font-weight: 600; }
  #__card .scene .kicker b { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: #447cde; color: #fff; letter-spacing: 0; font-size: 17px; }
  #__card .scene h2 { margin: 16px 0 6px; font-size: 46px; font-weight: 700; letter-spacing: -.02em; }
  #__card .scene p { margin: 0 0 28px; font-size: 20px; color: #a9b8cc; }
  #__card .term { border-radius: 16px; overflow: hidden; background: #0a0f18; border: 1px solid rgba(255,255,255,.1); box-shadow: 0 30px 80px rgba(0,0,0,.45); }
  #__card .term .bar { display: flex; align-items: center; gap: 8px; padding: 13px 16px; background: #141b27; color: #7d8ca3; font-size: 13.5px; }
  #__card .term .bar i { width: 12px; height: 12px; border-radius: 50%; background: #3a4456; display: inline-block; }
  #__card .term .bar span { margin-left: 10px; }
  #__card .term pre { margin: 0; min-height: 300px; padding: 22px 26px; font: 18.5px/1.65 'Cascadia Mono', Consolas, ui-monospace, monospace; color: #d5deea; white-space: pre-wrap; }
  #__card .term .p { color: #6fd39b; } #__card .term .c { color: #fff; } #__card .term .ok { color: #6fd39b; } #__card .term .dim { color: #7d8ca3; } #__card .term .hl { color: #8fb3f0; }
  #__card .caret { display: inline-block; width: 10px; height: 21px; margin-left: 2px; vertical-align: -3px; background: #d5deea; animation: __blink 1s steps(1) infinite; }
  @keyframes __blink { 50% { opacity: 0; } }
  `;
  const cursorSvg = `<svg viewBox="0 0 28 28" width="28" height="28"><path d="M4 2.5v20.2l5.3-5 3.6 8.1 3.3-1.5-3.5-7.9h7.3z" fill="#fff" stroke="#0f1724" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  let nodes;
  function install() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = '__stage';
    root.innerHTML = `<div id="__card"></div><div id="__caption"><span class="n"></span><div><strong></strong><small></small></div></div><div id="__ripple"></div><div id="__cursor">${cursorSvg}</div>`;
    document.body.appendChild(root);
    nodes = { card: root.querySelector('#__card'), caption: root.querySelector('#__caption'), cursor: root.querySelector('#__cursor'), ripple: root.querySelector('#__ripple') };
    window.addEventListener('mousemove', (event) => { nodes.cursor.style.transform = `translate(${event.clientX - 4}px, ${event.clientY - 2}px)`; }, true);
    window.addEventListener('mousedown', (event) => {
      nodes.ripple.style.left = event.clientX + 'px'; nodes.ripple.style.top = event.clientY + 'px';
      nodes.ripple.classList.remove('go'); void nodes.ripple.offsetWidth; nodes.ripple.classList.add('go');
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();

  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const escape = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  // Même tracé que le composant Brand de l'application.
  const logo = `<svg class="logo rise" viewBox="0 0 30 34" fill="none"><path d="M2 3h26v18L15 31 2 21V3Z" stroke="#8fb3f0" stroke-width="1.6"/><path d="M9 10h12M9 16h8M13 22h8" stroke="#8fb3f0" stroke-width="2.2"/></svg>`;
  let zoomed = false;

  window.__stage = {
    cursor(on) { nodes.cursor.classList.toggle('on', on); },
    ripple(x, y) {
      nodes.ripple.style.left = x + 'px'; nodes.ripple.style.top = y + 'px';
      nodes.ripple.classList.remove('go'); void nodes.ripple.offsetWidth; nodes.ripple.classList.add('go');
    },
    fadeCardContent() { const inner = nodes.card.firstElementChild; if (inner) { inner.style.transition = 'opacity .5s'; inner.style.opacity = '0'; } },
    caption(number, title, subtitle) {
      nodes.caption.querySelector('.n').textContent = number;
      nodes.caption.querySelector('strong').textContent = title;
      nodes.caption.querySelector('small').textContent = subtitle;
      nodes.caption.classList.add('on');
    },
    hideCaption() { nodes.caption.classList.remove('on'); },
    intro() {
      nodes.card.innerHTML = `<div class="in">${logo}<h1 class="rise" style="animation-delay:.25s">SUREAU</h1>
        <div class="tag rise" style="animation-delay:.6s">Le matériel, dans son espace.</div>
        <div class="sub rise" style="animation-delay:.9s">Inventaire informatique et plans 3D, installés sur votre propre infrastructure.</div></div>`;
      nodes.card.classList.add('on');
    },
    outro() {
      nodes.card.innerHTML = `<div class="in">${logo}<h1 class="rise" style="animation-delay:.2s">SUREAU</h1>
        <div class="tag rise" style="animation-delay:.5s">Votre parc, vos espaces, votre infrastructure.</div>
        <div class="chips rise" style="animation-delay:.85s"><span>Auto-hébergé</span><span>Docker</span><span>Kubernetes</span><span>Sauvegardes vérifiées</span></div></div>`;
      nodes.card.classList.add('on');
    },
    hideCard() { nodes.card.classList.remove('on'); },
    async terminal(number, kicker, title, text, lines) {
      nodes.card.innerHTML = `<div class="scene"><div class="kicker rise"><b>${number}</b>${kicker}</div><h2 class="rise" style="animation-delay:.15s">${title}</h2>
        <p class="rise" style="animation-delay:.3s">${text}</p><div class="term rise" style="animation-delay:.45s"><div class="bar"><i></i><i></i><i></i><span>Terminal — sureau</span></div><pre></pre></div></div>`;
      nodes.card.classList.add('on');
      const pre = nodes.card.querySelector('pre');
      let html = '';
      const render = (caret) => { pre.innerHTML = html + (caret ? '<span class="caret"></span>' : ''); };
      await sleep(1000);
      for (const line of lines) {
        if (line.cmd) {
          html += '<span class="p">$ </span>';
          for (const char of line.cmd) { html += `<span class="c">${escape(char)}</span>`; render(true); await sleep(36); }
          await sleep(320);
          html += '\n'; render(true);
        } else {
          await sleep(line.delay ?? 260);
          html += `<span class="${line.cls ?? ''}">${escape(line.out)}</span>\n`; render(true);
        }
      }
      await sleep(500); render(true);
    },
    zoom(selector, maxScale = 1.45, padding = 24) {
      const app = document.getElementById('root');
      const target = document.querySelector(selector);
      if (!app || !target) return false;
      const r = target.getBoundingClientRect();
      const width = r.width + padding * 2, height = r.height + padding * 2;
      const scale = Math.max(1, Math.min(maxScale, innerWidth / width, innerHeight / height));
      let tx = innerWidth / 2 - (r.left + r.width / 2) * scale;
      let ty = innerHeight / 2 - (r.top + r.height / 2) * scale;
      tx = Math.min(0, Math.max(innerWidth - innerWidth * scale, tx));
      ty = Math.min(0, Math.max(innerHeight - innerHeight * scale, ty));
      app.style.transformOrigin = '0 0';
      app.style.transition = 'transform 1.3s cubic-bezier(.65,0,.35,1)';
      app.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      zoomed = true;
      return true;
    },
    unzoom() {
      const app = document.getElementById('root');
      if (app && zoomed) app.style.transform = 'none';
      zoomed = false;
    },
  };
})();
