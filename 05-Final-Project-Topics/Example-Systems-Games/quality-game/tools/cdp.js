// Minimal Chrome DevTools Protocol helper for headless UI tests (Node 22+, global WebSocket).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launch(url, port) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'qg-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir,
    '--no-first-run', '--no-default-browser-check', '--window-size=1366,900', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); if (targets.length) break; } catch (e) { /* not ready */ }
    await sleep(200);
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let seq = 0;
  const pending = new Map();
  const events = { requests: [], errors: [] };
  ws.addEventListener('message', m => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Network.requestWillBeSent') events.requests.push(msg.params.request.url);
    if (msg.method === 'Runtime.exceptionThrown') events.errors.push(JSON.stringify(msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text));
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') events.errors.push(msg.params.args.map(a => a.value || a.description).join(' '));
  });
  const send = (method, params) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(800);
  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) throw new Error('eval failed: ' + expr + '\n' + (r.result.exceptionDetails.exception || {}).description);
    return r.result.result.value;
  }
  const KEYS = { w: ['KeyW', 87], a: ['KeyA', 65], s: ['KeyS', 83], d: ['KeyD', 68], e: ['KeyE', 69], x: ['KeyX', 88],
    Escape: ['Escape', 27], ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39] };
  async function key(k) {
    const [code, vk] = KEYS[k];
    const text = k.length === 1 ? k : undefined;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
    await sleep(30);
  }
  async function waitFor(expr, ms) {
    const end = Date.now() + (ms || 8000);
    while (Date.now() < end) { if (await ev(expr)) return; await sleep(100); }
    throw new Error('timeout waiting for: ' + expr);
  }
  async function shot(file) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  }
  async function close() { try { ws.close(); } catch (e) { /* ignore */ } proc.kill(); }
  return { ev, key, waitFor, shot, close, events, send, sleep };
}

// Page-side helpers injected before each test run.
const PAGE_HELPERS = `
window.T = {
  at(x, y, dir) { gameState.player = { x, y, dir }; render(); },
  btn(text) {
    const bs = [...document.querySelectorAll('#modal button, #title-screen button, #hud button')].filter(b => b.offsetParent !== null || b.closest('dialog[open]'));
    const b = bs.find(b => b.textContent.trim().startsWith(text) && !b.disabled);
    if (!b) throw new Error('no button "' + text + '"; have: ' + bs.map(b => b.textContent.trim()).join(' | '));
    b.click(); return true;
  },
  click(css) { const el = document.querySelector(css); if (!el) throw new Error('missing ' + css); el.click(); return true; },
  set(css, v) { const el = document.querySelector(css); if (!el) throw new Error('missing ' + css); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; },
  submit(css) { document.querySelector(css).requestSubmit(); return true; },
  modal() { return document.querySelector('#modal').open ? document.querySelector('#modal-title').textContent + '\\n' + document.querySelector('#modal-body').innerText : ''; },
  open() { return document.querySelector('#modal').open; },
  idle(id) { const n = gameState.npcs[id]; return n && !n.walking; },
  radio(name, value) { const r = [...document.querySelectorAll('input[name="' + name + '"]')].find(i => i.value === value); r.click(); return true; }
};
true;`;

module.exports = { launch, PAGE_HELPERS, sleep };
