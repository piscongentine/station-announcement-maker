/* Station Announcement Maker - UI logic (plain JS, no build step). */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n, cls = '') => `<svg class="${cls}"><use href="#i-${n}"/></svg>`;
const spinner = () => `<span class="spinner"><span class="wheel"></span><span class="sig"><i></i><i></i><i></i></span></span>`;
const TOKEN = new URLSearchParams(location.search).get('t') || sessionStorage.getItem('samToken') || '';
sessionStorage.setItem('samToken', TOKEN);
if (location.search) history.replaceState(null, '', location.pathname + location.hash);

let S = { settings: {}, root: { ok: false }, routes: [], detected: '' };
const extraRoutes = new Map();   // browsed routes outside ROUTES

/* ------------------------------------------------------------ backend */
async function api(path, body = {}) {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SAM-Token': TOKEN }, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch { /* ignore */ }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
const audioUrl = p => `/api/audio?t=${encodeURIComponent(TOKEN)}&path=${encodeURIComponent(p)}&v=${Date.now()}`;
async function ffmpegFallback(buf, name) {
  const r = await fetch('/api/convert', { method: 'POST', body: buf, headers: { 'X-SAM-Token': TOKEN, 'X-Rate': '44100', 'X-Channels': '2', 'X-Name': encodeURIComponent(name) } });
  if (!r.ok) { let j = {}; try { j = await r.json(); } catch {} throw new Error(j.error || 'conversion failed'); }
  return await r.arrayBuffer();
}
setInterval(() => api('ping').catch(() => {}), 15000);
window.addEventListener('pagehide', () => { fetch('/api/bye', { method: 'POST', keepalive: true, headers: { 'X-SAM-Token': TOKEN, 'Content-Type': 'application/json' }, body: '{}' }); });
['dragover', 'drop'].forEach(ev => window.addEventListener(ev, e => e.preventDefault()));

/* ------------------------------------------------------------ toasts & modal */
function toast(msg, kind = 'info', ms = 4200) {
  const ic = { ok: 'check', warn: 'warn', err: 'warn', info: 'info' }[kind];
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = icon(ic) + `<div>${msg}</div>`;
  $('#toasts').append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, ms);
}
function modal(html, actions) {
  return new Promise(res => {
    const ov = $('#overlay'), m = $('#modal');
    m.innerHTML = html + `<div class="modal-actions">${actions.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}">${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div>`;
    ov.hidden = false;
    const close = v => { ov.hidden = true; m.innerHTML = ''; res(v); };
    $$('.modal-actions button', m).forEach(b => b.onclick = () => { const a = actions[+b.dataset.i]; if (a.click) a.click(); if (a.keep) return; close(a.value); });
    ov.onclick = e => { if (e.target === ov) close(null); };
  });
}
const confirmBox = (title, body, ok = 'Continue', cls = '') =>
  modal(`<h3>${icon('warn')}${esc(title)}</h3><div class="lead">${body}</div>`, [{ label: 'Cancel', cls: 'ghost', value: false }, { label: ok, value: true, cls }]);

/* ------------------------------------------------------------ theme & motion */
const mq = matchMedia('(prefers-color-scheme: light)');
function applyTheme() {
  const t = S.settings.theme || 'dark';
  document.documentElement.dataset.theme = t === 'system' ? (mq.matches ? 'light' : 'dark') : t;
  document.documentElement.dataset.motion = S.settings.motion || 'full';
  setTimeout(SAMAudio.redrawAll, 50);
}
mq.addEventListener('change', applyTheme);
$('#theme-switch').onclick = () => {
  const now = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  saveSettings({ theme: now });
};
$('#btn-yt').onclick = () => api('open-yt').then(() => toast('Opened <b>audioforges.com</b> in your browser. Download the WAV, then drop it here.'));

let saveTimer = null, pendingSave = {};
function saveSettings(patch, immediate = true) {
  Object.assign(S.settings, patch);
  Object.assign(pendingSave, patch);
  applyTheme(); renderSettings();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const p = pendingSave; pendingSave = {};
    try { const st = await api('settings', p); S = st; renderAllDest(); renderSettings(); }
    catch (e) { toast('Could not save settings: ' + esc(e.message), 'err'); }
  }, immediate ? 0 : 450);
}

/* ------------------------------------------------------------ tabs */
function moveIndicator() {
  const b = $('#tabs button.active'), ind = $('#tab-indicator');
  if (!b) return;
  ind.style.width = b.offsetWidth + 'px';
  ind.style.transform = `translateX(${b.offsetLeft}px)`;
}
$$('#tabs button').forEach(b => b.onclick = () => {
  $$('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('.tab-page').forEach(p => p.classList.toggle('active', p.id === 'page-' + b.dataset.tab));
  moveIndicator();
  if (b.dataset.tab === 'routes') ensureRouteScan();
  if (b.dataset.tab === 'settings') runDiagnostics();
  window.SAMEditor?.onTab(b.dataset.tab);
  setTimeout(SAMAudio.redrawAll, 30);
});
window.addEventListener('resize', moveIndicator);

/* ------------------------------------------------------------ names */
function sanitize(display) {
  let s = (display || '').trim().replace(/\.(wav|sms|mp3|m4a|ogg|flac|aac|wma)$/i, '');
  s = s.replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/_+/g, '_').replace(/^[_-]+|[_-]+$/g, '');
  if (!s) s = 'Announcement';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s += '_1';
  return s.slice(0, 60).replace(/[_-]+$/, '');
}
const prettyFromFile = n => n.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
const fmtDur = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '?';
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

/* ------------------------------------------------------------ root setup card */
function rootSetupHtml() {
  return `<div class="setup-card">
    <h4>${icon('warn')}MSTS / Open Rails folder not set</h4>
    <p>Pick the folder that contains <span class="mono">ROUTES</span>. It is saved in Settings for good.</p>
    <div class="row wrap">
      <button class="btn" data-act="pick-root">${icon('folder')}Choose folder…</button>
      ${S.detected ? `<button class="btn ghost" data-act="use-detected">${icon('check')}Use <span class="mono">${esc(S.detected)}</span></button>` : ''}
    </div></div>`;
}
async function pickRoot(path) {
  try {
    if (!path) {
      const r = await api('pick-folder', { title: 'Choose your MSTS / Open Rails folder', initial: S.settings.root || S.detected || 'C:\\' });
      path = r.path;
      if (!path) return;
    }
    const v = await api('verify-root', { root: path });
    if (!v.ok) { toast(`<b>${esc(path)}</b> has no ROUTES folder with routes in it.`, 'err', 6000); return; }
    S = await api('settings', { root: path });
    toast(`Verified MSTS/OR directory · <b>${v.routes}</b> routes loaded`, 'ok');
    renderAllDest(); renderSettings(); renderRouteSelect(); ensureRouteScan(true);
  } catch (e) { toast(esc(e.message), 'err'); }
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.act === 'pick-root') pickRoot();
  if (a.dataset.act === 'use-detected') pickRoot(S.detected);
});
function allRoutes() {
  const list = [...S.routes];
  extraRoutes.forEach(r => { if (!list.some(x => x.path.toLowerCase() === r.path.toLowerCase())) list.push(r); });
  return list;
}
async function browseRoute() {
  const r = await api('pick-folder', { title: 'Choose a route folder (contains the .trk file)', initial: S.settings.root || '', route: true });
  if (!r.path) return null;
  const name = r.path.split(/[\\/]/).pop();
  const info = { name: name + ' (browsed)', path: r.path };
  extraRoutes.set(r.path.toLowerCase(), info);
  return info;
}

/* ------------------------------------------------------------ destination panel */
const dests = {};
function makeDest(key, card, label, onGenerate) {
  const st = { mode: null, route: S.settings.lastRoute || '', folder: S.settings.outputFolder || '',
               act: null, deact: null, vol: null };
  const d = { st, card, render, onGenerate, label, busy: false };
  dests[key] = d;
  function render() {
    const sset = S.settings;
    if (!st.folder) st.folder = sset.outputFolder || '';
    if (!st.mode) st.mode = S.root.ok ? 'route' : (sset.outputFolder ? 'folder' : 'route');
    const routes = allRoutes();
    if (st.mode === 'route' && S.root.ok && !routes.some(r => r.path === st.route)) st.route = (routes.find(r => r.path === sset.lastRoute) || routes[0] || {}).path || '';
    const r = routes.find(x => x.path === st.route);
    let body;
    if (st.mode === 'folder') {
      body = `<div class="row"><div class="path-box mono ${st.folder ? 'set' : ''}" title="${esc(st.folder)}">${esc(st.folder || 'No folder chosen')}</div>
        <button class="btn ghost" data-d="folder">${icon('folder')}Browse…</button></div>
        <p class="muted small">The .wav and .sms are written here. Copy them into a route's SOUND folder and add the ssource.dat line yourself.</p>`;
    } else if (!S.root.ok && !extraRoutes.size) {
      body = rootSetupHtml() + `<div class="row" style="margin-top:10px"><button class="btn ghost" data-d="browse-route">${icon('route')}Or browse to a single route…</button></div>`;
    } else {
      body = `<div class="row"><select data-d="route">${routes.map(x => `<option value="${esc(x.path)}" ${x.path === st.route ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
          <button class="btn ghost" data-d="browse-route" title="Browse to another route">${icon('folder')}</button></div>
        ${r ? `<div class="route-meta">
          <div><span class="k">Sound folder</span><span class="v mono" title="${esc(r.sound || r.path + '\\SOUND')}">${esc(r.sound || r.path + '\\SOUND (will be created)')}</span></div>
          <div><span class="k">ssource.dat</span><span class="v mono">${r.ssource ? esc(r.ssource) : 'missing - a new one will be created'}</span></div>
          <div><span class="k">Backup</span><span class="v">${sset.backupSsource ? '<span class="badge ok">' + icon('shield') + 'ssource.dat.bak before writing</span>' : '<span class="badge warn">backup off</span>'}</span></div>
        </div>` : ''}`;
    }
    card.innerHTML = `<div class="card-title">${icon('route')}Destination</div>
      <div class="dest-switch">
        <button class="dest-opt ${st.mode === 'folder' ? 'active' : ''}" data-mode="folder"><b>${icon('folder')}Custom Output Folder</b><span>Save .wav + .sms anywhere</span></button>
        <button class="dest-opt ${st.mode === 'route' ? 'active' : ''}" data-mode="route"><b>${icon('bolt')}Smart Direct Route Integration</b><span>Write into the route + ssource.dat</span></button>
      </div>
      <div class="dest-body">${body}</div>
      <div class="field"><label>.sms settings for this job</label>
        <div class="sms-mini">
          <div class="field"><input type="number" data-d="act" min="60" max="5000" step="10" value="${st.act ?? sset.activation}" title="Activation distance (m)"><span class="muted small">Activation m</span></div>
          <div class="field"><input type="number" data-d="deact" min="60" max="5000" step="10" value="${st.deact ?? sset.deactivation}" title="Deactivation distance (m)"><span class="muted small">Deactivation m</span></div>
          <div class="field"><input type="number" data-d="vol" min="0" max="1" step="0.05" value="${st.vol ?? sset.volume}" title="Volume 0-1"><span class="muted small">Volume</span></div>
        </div></div>
      <div class="field"><label>Audio output</label><span class="badge info">${icon('wave')}${sset.sampleRate} Hz · ${sset.channels == 2 ? 'stereo' : 'mono'} · 16-bit PCM</span> <span class="muted small">change in Settings</span></div>
      <div class="gen-area">
        <button class="btn big" data-d="go">${icon('bolt')}${esc(d.label)}</button>
        <div class="gen-progress" hidden><div class="progress"><div></div></div><div class="progress-label"><span class="pl-text"></span><span class="pl-pct"></span></div></div>
      </div>`;
    $$('.dest-opt', card).forEach(b => b.onclick = () => { st.mode = b.dataset.mode; render(); });
    const q = s => card.querySelector(`[data-d="${s}"]`);
    q('folder') && (q('folder').onclick = async () => {
      const res = await api('pick-folder', { title: 'Choose output folder', initial: st.folder || sset.outputFolder, output: true });
      if (res.path) { st.folder = res.path; if (!sset.outputFolder) saveSettings({ outputFolder: res.path }); render(); }
    });
    q('route') && (q('route').onchange = e => { st.route = e.target.value; updateHeaderRoute(st.route); render(); });
    q('browse-route') && (q('browse-route').onclick = async () => {
      try { const r2 = await browseRoute(); if (r2) { st.route = r2.path; st.mode = 'route'; renderAllDest(); renderRouteSelect(); } }
      catch (e) { toast(esc(e.message), 'err'); }
    });
    ['act', 'deact', 'vol'].forEach(k => q(k).oninput = e => { st[k] = e.target.value === '' ? null : +e.target.value; });
    q('go').onclick = () => !d.busy && onGenerate();
  }
  d.destination = () => {
    if (st.mode === 'folder') {
      if (!st.folder) throw new Error('Choose an output folder first.');
      return { mode: 'folder', folder: st.folder };
    }
    if (!st.route) throw new Error('Pick a route first (set the MSTS/OR folder or browse to a route).');
    return { mode: 'route', route: st.route };
  };
  d.sms = () => ({ activation: st.act ?? S.settings.activation, deactivation: st.deact ?? S.settings.deactivation, volume: st.vol ?? S.settings.volume });
  d.progress = (frac, text) => {
    const gp = card.querySelector('.gen-progress');
    if (frac == null) { gp.hidden = true; d.busy = false; card.querySelector('[data-d="go"]').disabled = false; return; }
    d.busy = true; card.querySelector('[data-d="go"]').disabled = true;
    gp.hidden = false;
    gp.querySelector('.progress>div').style.width = Math.round(frac * 100) + '%';
    gp.querySelector('.pl-text').innerHTML = text || '';
    gp.querySelector('.pl-pct').textContent = Math.round(frac * 100) + '%';
  };
  render();
  return d;
}
function renderAllDest() { Object.values(dests).forEach(d => !d.busy && d.render()); updateHeaderRoute(); }
function updateHeaderRoute(path) {
  const p = path || S.settings.lastRoute;
  $('#hdr-route').textContent = p ? 'Route: ' + p.split(/[\\/]/).pop() : (S.root.ok ? `${S.root.routes} route${S.root.routes === 1 ? '' : 's'}` : 'no MSTS folder set');
}

/* ------------------------------------------------------------ generation (shared) */
async function generate(dest, items, onStep) {
  // items: [{display, stem, wav(Uint8Array)}]
  const target = dest.destination();
  // de-duplicate stems in this job
  const seen = new Set();
  items.forEach(it => { let s = it.stem, n = 2; while (seen.has(s.toLowerCase())) s = `${it.stem}_${n++}`; it.stem = s; seen.add(s.toLowerCase()); });
  const pre = await api('generate', { dest: target, dryRun: true, items: items.map(i => ({ display: i.display, stem: i.stem })) });
  let overwrite = false;
  if (pre.conflict) {
    const ok = await confirmBox('Files already exist', `These will be overwritten:<pre class="code mono">${pre.files.map(esc).join('\n')}</pre>`, 'Overwrite', '');
    if (!ok) return null;
    overwrite = true;
  }
  const all = { created: [], ssourceAdded: [], ssourceSkipped: [] };
  let backedUp = false;
  for (let i = 0; i < items.length; i++) {
    onStep?.(i, items.length, items[i]);
    const wav = await SAMAudio.toBase64(items[i].wav);
    const r = await api('generate', { dest: target, overwrite, sms: dest.sms(), backup: !backedUp,
                                     items: [{ display: items[i].display, stem: items[i].stem, wav }] });
    all.created.push(...r.created);
    if (r.backup || (r.ssourceAdded || []).length) backedUp = true;
    ['ssourceAdded', 'ssourceSkipped'].forEach(k => all[k].push(...(r[k] || [])));
    ['mode', 'folder', 'ssource', 'route', 'routeName', 'ssourceEntries', 'ssourceValid'].forEach(k => { if (r[k] !== undefined) all[k] = r[k]; });
    if (r.backup) all.backup = r.backup;
    if (r.ssourceCreated) all.ssourceCreated = true;
  }
  onStep?.(items.length, items.length);
  if (all.route) { S = await api('state'); renderAllDest(); renderRouteSelect(); routeScanned = null; }
  showSummary(all);
  return all;
}

function showSummary(r) {
  let i = 0;
  const li = (what, path, skip) => `<li style="animation-delay:${(i++) * 0.09}s"><span class="ck ${skip ? 'skip' : ''}" style="animation-delay:${(i) * 0.09}s">${icon(skip ? 'warn' : 'check')}</span><div><div class="what">${what}</div><div class="path mono">${esc(path)}</div></div></li>`;
  let rows = '';
  r.created.forEach(c => {
    rows += li(`Created ${esc(c.wav.split(/[\\/]/).pop())} <span class="badge ok">${c.rate} Hz · ${c.channels == 2 ? 'stereo' : 'mono'} · 16-bit · ${fmtDur(c.duration)}</span>`, c.wav);
    rows += li(`Created ${esc(c.sms.split(/[\\/]/).pop())}`, c.sms);
  });
  if (r.mode === 'route') {
    if (r.backup) rows += li('Backed up ssource.dat', r.backup);
    if (r.ssourceCreated) rows += li('Created a new ssource.dat', r.ssource);
    if (r.ssourceAdded.length) rows += li(`ssource.dat updated · ${r.ssourceAdded.length} entr${r.ssourceAdded.length > 1 ? 'ies' : 'y'} added · ${r.ssourceEntries} total · ${r.ssourceValid ? 'parses OK' : 'CHECK FILE'}`, r.ssource);
    r.ssourceSkipped.forEach(s => rows += li(`Already in ssource.dat, left as is: ${esc(s)}`, r.ssource, true));
  }
  const added = r.ssourceAdded.length ? `<details class="code-peek" open><summary>Lines appended to ssource.dat</summary><pre class="mono">${r.ssourceAdded.map(esc).join('\n')}</pre></details>` : '';
  const note = r.mode === 'route'
    ? `<div class="tsre-note">${icon('train')}<div><b>Ready to place in TSRE5.</b> Open <b>${esc(r.routeName)}</b> in TSRE5, choose <i>Sound sources</i> and pick <b>${r.created.map(c => esc(c.display)).join('</b>, <b>')}</b> from the list, then place it at the station. Restart TSRE5 if it was already open so it re-reads ssource.dat.</div></div>`
    : `<div class="tsre-note">${icon('folder')}<div>Files saved to <span class="mono">${esc(r.folder)}</span>.</div></div>`;
  modal(`<div class="row"><span class="big-check">${icon('check')}</span><div><h3>${r.created.length} announcement${r.created.length > 1 ? 's' : ''} generated</h3><p class="lead" style="margin:0">${r.mode === 'route' ? 'Written straight into the route.' : 'Written to your output folder.'}</p></div></div>
    <ul class="sum-list" style="margin-top:16px">${rows}</ul>${added}${note}`,
    [{ label: 'Open folder', cls: 'ghost', icon: 'open', keep: true, click: () => api('reveal', { path: r.created[0]?.wav || r.folder }) },
     { label: 'Done', value: true, icon: 'check' }]);
}

/* ------------------------------------------------------------ drop zones */
function wireDrop(zone, input, onFiles) {
  zone.addEventListener('dragenter', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag'); });
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag'); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); });
  input.addEventListener('change', () => { if (input.files.length) onFiles([...input.files]); input.value = ''; });
}
const isAudio = f => /^audio\/|^video\/(mp4|webm)/.test(f.type) || /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|wma|webm|mp4|aiff?)$/i.test(f.name);

/* ------------------------------------------------------------ SINGLE */
const single = { file: null, res: null, nameTouched: false, job: 0 };
const singlePlayer = SAMAudio.player($('#single-player'), { onError: e => toast('Playback failed: ' + esc(e.message), 'err') });
function badge(el, kind, html) { el.className = 'badge ' + kind; el.innerHTML = html; }
async function singleConvert() {
  if (!single.file) return;
  const job = ++single.job, b = $('#single-badge');
  single.res = null;
  singlePlayer.pause();
  $('#single-player .play-btn').disabled = true;
  badge(b, 'info busy', 'Converting…');
  $('#single-info').innerHTML = `${fmtSize(single.file.size)} · ${spinner()} decoding`;
  try {
    const r = await SAMAudio.convert(single.file, S.settings.sampleRate, S.settings.channels, ffmpegFallback);
    if (job !== single.job) return;
    single.res = r;
    singlePlayer.load(r.url, r.peaks, r.duration);
    badge(b, 'ok', icon('check') + 'Converted');
    $('#single-info').textContent = `${r.srcInfo} → ${r.rate} Hz · ${r.channels === 2 ? 'stereo' : 'mono'} · 16-bit PCM · ${fmtDur(r.duration)} · ${fmtSize(r.size)}`;
  } catch (e) {
    if (job !== single.job) return;
    badge(b, 'err', icon('warn') + 'Failed');
    $('#single-info').textContent = e.message;
    toast(esc(e.message), 'err', 7000);
  }
}
function updateSingleNames() {
  const v = $('#single-name').value.trim();
  const st = v ? sanitize(v) : '—';
  $('#single-files').innerHTML = `<span>${esc(st)}.wav</span><span>${esc(st)}.sms</span>`;
}
wireDrop($('#single-drop'), $('#single-file'), files => {
  const f = files.find(isAudio) || files[0];
  if (!isAudio(f)) toast(`<b>${esc(f.name)}</b> doesn't look like audio - trying anyway.`, 'warn');
  single.file = f;
  $('#single-panel').hidden = false;
  $('#single-orig').textContent = f.name;
  if (!single.nameTouched || !$('#single-name').value) { $('#single-name').value = prettyFromFile(f.name); single.nameTouched = false; }
  updateSingleNames();
  singleConvert();
  if (files.length > 1) toast('Single mode takes one file - use the Batch tab for many.', 'warn');
});
$('#single-name').addEventListener('input', () => { single.nameTouched = true; updateSingleNames(); });
$('#single-clear').onclick = () => { singlePlayer.pause(); single.file = single.res = null; single.job++; $('#single-panel').hidden = true; };
const singleDest = makeDest('single', $('#single-dest-card'), 'Generate Announcement', async () => {
  try {
    if (!single.file) throw new Error('Drop an audio file first.');
    if (!single.res) throw new Error('Wait for the conversion to finish.');
    const display = $('#single-name').value.trim();
    if (!display) throw new Error('Give the announcement a name.');
    singleDest.progress(0.15, spinner() + ' Writing files…');
    const r = await generate(singleDest, [{ display, stem: sanitize(display), wav: single.res.wav }], (i, n) => singleDest.progress(0.2 + 0.8 * i / n, spinner() + ' Writing files…'));
    if (r) toast(`<b>${esc(display)}</b> generated`, 'ok');
  } catch (e) { toast(esc(e.message), 'err', 6000); }
  finally { singleDest.progress(null); }
});

/* ------------------------------------------------------------ BATCH */
const queue = [];
let qid = 0, converting = 0;
function batchCounts() {
  const ready = queue.filter(q => q.res).length;
  $('#batch-count').hidden = !queue.length;
  $('#batch-count').textContent = queue.length;
  $('#batch-empty').hidden = !!queue.length;
  $('#batch-summary').textContent = queue.length ? `· ${ready}/${queue.length} converted` : '';
}
function addToQueue(files) {
  files.filter(f => { if (!isAudio(f)) { toast(`Skipped <b>${esc(f.name)}</b> (not audio)`, 'warn'); return false; } return true; }).forEach(f => {
    const it = { id: ++qid, file: f, res: null, name: prettyFromFile(f.name), status: 'wait' };
    const row = document.createElement('div');
    row.className = 'qrow';
    row.style.animationDelay = Math.min(queue.length, 10) * 0.04 + 's';
    row.innerHTML = `<button class="play-btn sm" disabled>${icon('play')}</button>
      <div class="orig"><div title="${esc(f.name)}">${esc(f.name)}</div><span class="mono">${fmtSize(f.size)} · <span class="st">queued</span></span></div>
      <input type="text" value="${esc(it.name)}" spellcheck="false" title="Announcement name (file name: ${esc(sanitize(it.name))})">
      <span class="badge">Queued</span>
      <button class="icon-btn danger" title="Remove">${icon('trash')}</button>
      <div class="wave-wrap sm"><canvas class="wave"></canvas><div class="wave-progress"></div></div>`;
    it.row = row;
    it.player = SAMAudio.player(row, { onError: e => toast('Playback failed: ' + esc(e.message), 'err') });
    $('input', row).oninput = e => { it.name = e.target.value; e.target.title = 'File name: ' + sanitize(it.name); };
    $('.icon-btn', row).onclick = () => {
      it.player.destroy(); queue.splice(queue.indexOf(it), 1);
      row.classList.add('removing'); setTimeout(() => row.remove(), 300); batchCounts();
    };
    $('#batch-queue').append(row);
    queue.push(it);
  });
  batchCounts(); pumpQueue();
}
async function convertItem(it) {
  const b = $('.badge', it.row), st = $('.st', it.row);
  it.status = 'busy'; it.res = null; it.player.pause();
  $('.play-btn', it.row).disabled = true;
  badge(b, 'info busy', 'Converting');
  try {
    const r = await SAMAudio.convert(it.file, S.settings.sampleRate, S.settings.channels, ffmpegFallback);
    if (!queue.includes(it)) return;
    it.res = r; it.status = 'ok';
    it.player.load(r.url, r.peaks, r.duration);
    badge(b, 'ok', icon('check') + 'Converted');
    st.textContent = `${fmtDur(r.duration)} · ${r.rate} Hz ${r.channels === 2 ? 'stereo' : 'mono'}`;
  } catch (e) {
    it.status = 'err';
    badge(b, 'err', icon('warn') + 'Failed');
    st.textContent = e.message;
  }
  batchCounts();
}
function pumpQueue() {
  while (converting < 2) {
    const it = queue.find(q => q.status === 'wait');
    if (!it) return;
    converting++;
    convertItem(it).finally(() => { converting--; pumpQueue(); });
  }
}
wireDrop($('#batch-drop'), $('#batch-file'), addToQueue);
const batchDest = makeDest('batch', $('#batch-dest-card'), 'Generate All', async () => {
  try {
    if (!queue.length) throw new Error('Add some audio files first.');
    if (queue.some(q => q.status === 'busy' || q.status === 'wait')) throw new Error('Wait until every file is converted.');
    const ready = queue.filter(q => q.res);
    if (!ready.length) throw new Error('No file converted successfully.');
    if (ready.some(q => !q.name.trim())) throw new Error('Every row needs a name.');
    const failed = queue.length - ready.length;
    if (failed && !(await confirmBox('Some files failed', `${failed} file(s) could not be converted and will be skipped.`, 'Generate the rest'))) return;
    batchDest.progress(0.02, spinner() + ' Checking names…');
    const r = await generate(batchDest, ready.map(q => ({ display: q.name.trim(), stem: sanitize(q.name), wav: q.res.wav })),
      (i, n, item) => batchDest.progress(i / n, item ? `${spinner()} ${i + 1} / ${n} · ${esc(item.display)}` : 'Finishing…'));
    if (r) toast(`Batch done · <b>${r.created.length}</b> announcements`, 'ok');
  } catch (e) { toast(esc(e.message), 'err', 6000); }
  finally { batchDest.progress(null); }
});

/* re-convert everything when the WAV defaults change */
let lastFmt = '';
function fmtChanged() {
  const f = `${S.settings.sampleRate}/${S.settings.channels}`;
  if (lastFmt && f !== lastFmt) {
    if (single.file) singleConvert();
    queue.forEach(q => { q.status = 'wait'; });
    pumpQueue();
  }
  lastFmt = f;
}

/* ------------------------------------------------------------ ROUTE MANAGER */
let routeScanned = null, rmCards = [], rmFilter = 'route';
const rmPlayers = [];
function renderRouteSelect() {
  const sel = $('#rm-route'), routes = allRoutes();
  const cur = sel.value || S.settings.lastRoute;
  sel.innerHTML = routes.length ? routes.map(r => `<option value="${esc(r.path)}">${esc(r.name)}</option>`).join('') : '<option value="">No routes</option>';
  if (routes.some(r => r.path === cur)) sel.value = cur;
  $('#rm-setup').innerHTML = !S.root.ok && !extraRoutes.size ? rootSetupHtml() : '';
}
$('#rm-route').onchange = () => scanRoute($('#rm-route').value);
$('#rm-rescan').onclick = () => scanRoute($('#rm-route').value, true);
$('#rm-browse').onclick = async () => {
  try { const r = await browseRoute(); if (r) { renderRouteSelect(); $('#rm-route').value = r.path; scanRoute(r.path); renderAllDest(); } }
  catch (e) { toast(esc(e.message), 'err'); }
};
function ensureRouteScan(force) {
  const p = $('#rm-route').value;
  if (p && (force || routeScanned !== p)) scanRoute(p);
}
async function scanRoute(path) {
  if (!path) return;
  rmPlayers.splice(0).forEach(p => p.destroy());
  $('#rm-grid').innerHTML = `<div class="empty-note" style="grid-column:1/-1">${spinner()} Reading ssource.dat and the SOUND folder…</div>`;
  try {
    const r = await api('route/scan', { route: path });
    routeScanned = path; rmCards = r.cards;
    S.settings.lastRoute = path; updateHeaderRoute(path);
    $('#rm-paths').textContent = `${r.route.ssource || 'no ssource.dat'}   ·   ${r.route.sound || 'no SOUND folder'}`;
    const wavs = rmCards.flatMap(c => c.wavs);
    const bad = rmCards.filter(needsAttention).length;
    $('#rm-stats').innerHTML = `<div class="stat"><b>${rmCards.length}</b><span>entries</span></div>
      <div class="stat ok"><b>${rmCards.filter(c => c.where === 'route').length}</b><span>route sounds</span></div>
      <div class="stat"><b>${wavs.length}</b><span>wav files</span></div>
      <div class="stat ${bad ? 'warn' : 'ok'}"><b>${bad}</b><span>need attention</span></div>`;
    renderCards();
  } catch (e) {
    $('#rm-grid').innerHTML = '';
    toast(esc(e.message), 'err');
  }
}
const NOT_ANN = /bridge|bird|crossing|signal|traf|town|city|farm|watr|water|ingame|track|horn|wind|cicada|cow|horse|koala|sawmill|thunder|rain|forest|insect|dog|crow|galah|sparrow|whip|ding|default/i;
const isAnnouncement = c => c.where === 'route' && c.trigger === 'StartLoop' && c.wavs.length === 1 && !NOT_ANN.test(c.name + ' ' + c.sms);
const needsAttention = c => c.where === 'missing' || c.error || c.wavs.some(w => !w.ok) || (c.sms_path && !c.wavs.length);
function renderCards() {
  rmPlayers.splice(0).forEach(p => p.destroy());
  const q = $('#rm-search').value.trim().toLowerCase();
  const list = rmCards.filter(c => {
    if (rmFilter === 'route' && c.where !== 'route') return false;
    if (rmFilter === 'ann' && !isAnnouncement(c)) return false;
    if (rmFilter === 'bad' && !needsAttention(c)) return false;
    if (!q) return true;
    return (c.name + ' ' + c.sms + ' ' + c.wavs.map(w => w.name).join(' ')).toLowerCase().includes(q);
  });
  $('#rm-empty').hidden = !!list.length;
  $('#rm-empty').textContent = rmCards.length ? 'Nothing matches this filter.' : 'This route has no ssource.dat entries.';
  const grid = $('#rm-grid');
  grid.innerHTML = '';
  list.forEach((c, n) => {
    const el = document.createElement('div');
    el.className = 'ann';
    el.style.animationDelay = Math.min(n, 18) * 0.025 + 's';
    const whereBadge = c.where === 'route' ? '<span class="badge info">route</span>' : c.where === 'global' ? '<span class="badge">MSTS SOUND</span>' : '<span class="badge err">.sms missing</span>';
    el.innerHTML = `<div class="ann-head"><div class="ann-ic ${c.where}">${icon(c.where === 'missing' ? 'warn' : isAnnouncement(c) ? 'horn' : 'wave')}</div>
      <div class="ann-title"><b title="${esc(c.name)}">${esc(c.name)}</b><span class="mono" title="${esc(c.sms_path || c.sms)}">${esc(c.sms)}</span></div>${whereBadge}</div>
      ${c.wavs.map((w, i) => `<div class="ann-wav" data-w="${i}"><div class="top"><span class="name mono" title="${esc(w.path || w.name)}">${esc(w.name)}</span>
        ${w.ok ? `<span class="badge ok">${w.rate / 1000} kHz · ${w.channels === 2 ? 'st' : 'mono'} · ${w.bits}b</span>` : `<span class="badge ${w.exists ? 'warn' : 'err'}" title="${esc(w.problem)}">${icon('warn')}${esc(w.problem.split(' - ')[0])}</span>`}</div>
        ${w.exists ? `<div class="player"><button class="play-btn sm">${icon('play')}</button><div class="wave-wrap sm"><canvas class="wave"></canvas><div class="wave-progress"></div></div><span class="time mono">${w.duration ? '0:00 / ' + fmtDur(w.duration) : ''}</span></div>` : ''}
        </div>`).join('')}
      ${!c.wavs.length && c.sms_path ? '<div class="muted small">No .wav referenced in this .sms</div>' : ''}
      <div class="ann-foot">${c.wavs.filter(w => w.exists).map((w, i) => `<button class="btn ghost" data-rep="${c.wavs.indexOf(w)}">${icon('replace')}Replace Audio${c.wavs.length > 1 ? ' ' + (c.wavs.indexOf(w) + 1) : ''}</button>`).join('')}
        <span class="muted">${c.activation ? c.activation + ' m · ' : ''}${c.trigger || ''}${c.duplicate ? ' · duplicate entry' : ''}</span></div>`;
    grid.append(el);
    c.wavs.forEach((w, i) => {
      const box = el.querySelector(`.ann-wav[data-w="${i}"] .player`);
      if (!box) return;
      const p = SAMAudio.player(box, { duration: w.duration, onError: () => toast(`Can't play ${esc(w.name)} here (${esc(w.problem || 'unsupported')})`, 'warn'),
        lazy: async pl => { pl.load(audioUrl(w.path), null, w.duration); SAMAudio.peaksFromUrl(audioUrl(w.path)).then(r => pl.setPeaks(r.peaks)).catch(() => {}); } });
      rmPlayers.push(p);
    });
    $$('[data-rep]', el).forEach(b => b.onclick = () => replaceAudio(c, c.wavs[+b.dataset.rep], el));
  });
}
$('#rm-search').addEventListener('input', () => renderCards());
$$('#rm-chips button').forEach(b => b.onclick = () => { $$('#rm-chips button').forEach(x => x.classList.toggle('active', x === b)); rmFilter = b.dataset.f; renderCards(); });

function pickFile() {
  return new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = $('#single-file').accept;
    inp.onchange = () => res(inp.files[0] || null);
    inp.click();
  });
}
async function replaceAudio(card, w, el) {
  const f = await pickFile();
  if (!f) return;
  const rate = w.ok ? w.rate : S.settings.sampleRate, ch = w.ok ? w.channels : S.settings.channels;
  const t = document.createElement('div'); t.className = 'muted small'; t.innerHTML = `${spinner()} Converting ${esc(f.name)}…`;
  el.querySelector('.ann-foot').before(t);
  try {
    const r = await SAMAudio.convert(f, rate, ch, ffmpegFallback);
    t.remove();
    const ok = await confirmBox('Replace audio?', `<b>${esc(w.name)}</b> in <b>${esc(card.name)}</b> will be overwritten with <b>${esc(f.name)}</b> (${r.rate} Hz · ${r.channels === 2 ? 'stereo' : 'mono'} · 16-bit · ${fmtDur(r.duration)}).<br><br>
      The .sms and ssource.dat are not touched. The old file is kept in the app's <span class="mono">replaced</span> folder.<pre class="code mono">${esc(w.path)}</pre>`, 'Replace');
    if (!ok) return;
    const res = await api('replace', { target: w.path, wav: await SAMAudio.toBase64(r.wav) });
    Object.assign(w, res.info);
    toast(`Replaced <b>${esc(w.name)}</b>`, 'ok');
    renderCards();
    const again = [...$('#rm-grid').children].find(x => x.querySelector('.ann-title b')?.textContent === card.name);
    again?.classList.add('flash');
  } catch (e) { t.remove(); toast(esc(e.message), 'err', 6000); }
}

/* ------------------------------------------------------------ SETTINGS */
function tplPreview() {
  const a = Math.max(60, +S.settings.activation || 550), start = a - 50;
  $('#tpl-start').textContent = start; $('#tpl-rel').textContent = start + 10; $('#tpl-full').textContent = Math.round(start * 0.6);
  const d = Math.max(60, +S.settings.deactivation || 550), v = (+S.settings.volume).toFixed(1);
  $('#tpl-preview').textContent = `SIMISA@@@@@@@@@@JINX0x1t______\n\nTr_SMS (\n\tScalabiltyGroup( 3\n\t\tActivation (\n\t\t\tExternalCam ()\n\t\t\tDistance    (${a})\n\t\t)\n\t\tDeactivation (\n\t\t\tPassengerCam\t()\n\t\t\tCabCam\t\t\t()\n\t\t\tDistance    \t(${d})\n\t\t)\n\t\tVolume ( ${v})\n\t\tStereo ( )\n\t\tStreams ( 1\n\t\t\tStream (\n\t\t\t\tPriority ( 2 )\n\t\t\t\tTriggers ( 2\n\t\t\t\t\tVariable_Trigger ( Distance_Dec_Past ${start}\n\t\t\t\t\t\tStartLoop ( 1\n\t\t\t\t\t\t\tFile ( "Name.wav" -1 )\n\t\t\t\t\t\t\tSelectionMethod ( RandomSelection )\n\t\t\t\t\t\t)\n\t\t\t\t\t)\n\t\t\t\t\tVariable_Trigger ( Distance_Inc_Past ${start + 10}\n\t\t\t\t\t\tReleaseLoopRelease ( )\n\t\t\t\t\t)\n\t\t\t\t)\n\t\t\t\tVolumeCurve(\n\t\t\t\t\tDistanceControlled\n\t\t\t\t\tCurvePoints ( 3\n\t\t\t\t\t\t 0.0\t1.0\n\t\t\t\t\t\t${Math.round(start * 0.6)}.0\t1.0\n\t\t\t\t\t\t${start - 10}.0\t0.0\n\t\t\t\t\t)\n\t\t\t\t\tGranularity (0.01)\n\t\t\t\t)\n\t\t\t)\n\t\t)\n\t)\n)`;
}
function renderSettings() {
  const s = S.settings;
  const rb = $('#set-root');
  rb.textContent = s.root || 'Not set'; rb.classList.toggle('set', !!s.root); rb.title = s.root || '';
  const ob = $('#set-out');
  ob.textContent = s.outputFolder || 'Not set'; ob.classList.toggle('set', !!s.outputFolder);
  const has = S.root.has || {};
  $('#set-root-badges').innerHTML = S.root.ok
    ? `<span class="verified">${icon('shield')}Verified MSTS/OR Directory</span><span class="badge info">${icon('route')}${S.root.routes} route${S.root.routes === 1 ? '' : 's'}</span>` +
      ['TRAINS', 'GLOBAL', 'SOUND'].map(k => `<span class="badge ${has[k] ? 'ok' : 'warn'}">${icon(has[k] ? 'check' : 'warn')}${k}</span>`).join('')
    : (s.root ? `<span class="badge err">${icon('warn')}No ROUTES with routes found here</span>` : `<span class="badge warn">${icon('warn')}Not set yet</span>`) +
      (S.detected ? ` <button class="btn ghost" data-act="use-detected">${icon('check')}Use detected <span class="mono">${esc(S.detected)}</span></button>` : '');
  $$('.seg').forEach(seg => $$('button', seg).forEach(b => b.classList.toggle('active', String(s[seg.dataset.key]) === b.dataset.v)));
  const setv = (id, v) => { const e = $(id); if (document.activeElement !== e) e.value = v; };
  $('#set-backup-world').checked = s.backupWorld !== false;
  const tb = $('#set-tsre');
  tb.textContent = S.tsre || (s.tsrePath ? s.tsrePath + '  (missing — choose again)' : 'Not found — click the folder button and choose your TSRE .exe');
  tb.title = S.tsre ? (s.tsrePath && S.tsre === s.tsrePath ? 'Chosen by you' : 'Found automatically') : '';
  tb.classList.toggle('set', !!S.tsre);
  setv('#set-act', s.activation); setv('#set-deact', s.deactivation); setv('#set-vol', s.volume);
  $('#set-backup').checked = !!s.backupSsource;
  tplPreview(); fmtChanged();
}
$$('.seg').forEach(seg => $$('button', seg).forEach(b => b.onclick = () => {
  const k = seg.dataset.key, v = /^\d+$/.test(b.dataset.v) ? +b.dataset.v : b.dataset.v;
  saveSettings({ [k]: v });
  if (k === 'sampleRate' || k === 'channels') renderAllDest();
}));
[['#set-act', 'activation'], ['#set-deact', 'deactivation'], ['#set-vol', 'volume']].forEach(([id, k]) =>
  $(id).addEventListener('input', e => { if (e.target.value !== '') { saveSettings({ [k]: +e.target.value }, false); } }));
$('#set-backup').onchange = e => saveSettings({ backupSsource: e.target.checked });
$('#set-backup-world').onchange = e => saveSettings({ backupWorld: e.target.checked });
$('#set-tsre-browse').onclick = async () => {
  try {
    const r = await api('pick-tsre', {});
    if (r.path) { S = r.state; renderSettings(); toast('TSRE set to <span class="mono">' + esc(r.path) + '</span>', 'ok'); }
  } catch (e) { toast(esc(e.message), 'err'); }
};
$('#set-root-browse').onclick = () => pickRoot();
$('#set-out-browse').onclick = async () => {
  const r = await api('pick-folder', { title: 'Default output folder', initial: S.settings.outputFolder, output: true });
  if (r.path) { saveSettings({ outputFolder: r.path }); Object.values(dests).forEach(d => d.st.folder = r.path); renderAllDest(); }
};

async function runDiagnostics() {
  const ul = $('#diag-list'), btn = $('#diag-refresh');
  btn.querySelector('svg').style.animation = 'spin .8s linear infinite';
  const row = (ok, label, detail) => `<li><span class="badge ${ok === true ? 'ok' : ok === false ? 'err' : 'warn'}">${icon(ok === true ? 'check' : 'warn')}${ok === true ? 'OK' : ok === false ? 'Fail' : 'Info'}</span><div class="lbl">${label}<small>${esc(detail || '')}</small></div></li>`;
  try {
    const d = await api('diagnostics');
    let engine = false, detail = '';
    try {
      const a = new Audio();
      const fmts = { MP3: 'audio/mpeg', M4A: 'audio/mp4; codecs="mp4a.40.2"', OGG: 'audio/ogg; codecs="vorbis"', Opus: 'audio/ogg; codecs="opus"', FLAC: 'audio/flac', WAV: 'audio/wav' };
      const okF = Object.entries(fmts).filter(([, m]) => a.canPlayType(m)).map(([k]) => k);
      const t = new OfflineAudioContext(1, 2205, 22050); await t.startRendering();
      engine = okF.includes('MP3'); detail = 'Edge Web Audio · decodes ' + okF.join(', ');
    } catch (e) { detail = e.message; }
    ul.innerHTML = row(engine, 'Audio engine', detail) +
      row(d.ffmpeg ? true : null, 'FFmpeg (optional fallback)', d.ffmpeg ? d.ffmpegVersion : 'not installed - not needed for MP3/M4A/OGG/FLAC/WAV') +
      row(d.rootWritable, 'Write permission: ROUTES folder', S.settings.root ? S.settings.root + '\\ROUTES' : 'MSTS/OR folder not set') +
      (d.outputWritable !== null ? row(d.outputWritable, 'Write permission: output folder', S.settings.outputFolder) : '') +
      row(!!d.edge, 'App window (Microsoft Edge)', d.edge) +
      row(true, 'Backend', 'Python ' + d.python + ' · data in ' + d.dataDir) +
      row(d.gpu && d.gpu.adapters && d.gpu.adapters.some(g => !g.basic) ? true : false, '3D graphics chip', (d.gpu?.choice || '') + ' · WebGL: ' + webglRenderer()) +
      row(d.tsre ? true : null, 'TSRE5', d.tsre || 'not found - set it in Graphics & 3D editor');
    const ad = (d.gpu?.adapters || []).map(g => `${g.name}${g.dedicated ? ' (dedicated)' : g.basic ? ' (no driver)' : ' (integrated)'}`).join(' · ');
    $('#set-gpu-info').textContent = `Found: ${ad || 'no graphics adapter'}. Now using: ${d.gpu?.choice || 'decided at start'}. WebGL: ${webglRenderer()}`;
    $('#set-datadir').textContent = d.dataDir;
  } catch (e) { ul.innerHTML = row(false, 'Backend', e.message); }
  btn.querySelector('svg').style.animation = '';
}
$('#diag-refresh').onclick = runDiagnostics;

/* ------------------------------------------------------------ help links */
document.addEventListener('click', e => {
  const a = e.target.closest('[data-link]');
  if (!a) return;
  e.preventDefault();
  const key = a.dataset.link;
  api('open-link', { key })
    .then(() => toast(key === 'mail' ? 'Opening your email app with a pre-filled report to <b>shwetpurwar0911@gmail.com</b>…' : 'Opened in your browser.', 'ok'))
    .catch(err => toast(esc(err.message), 'err'));
});

/* ------------------------------------------------------------ boot */
(async function boot() {
  try {
    S = await api('state');
  } catch (e) {
    document.documentElement.classList.remove('booting');
    document.body.innerHTML = `<div style="padding:40px;font:15px Inter,sans-serif;color:#e2e8f0">Can't reach the Station Announcement Maker backend (${esc(e.message)}). Start it from the desktop shortcut.</div>`;
    return;
  }
  applyTheme(); renderSettings(); renderRouteSelect(); renderAllDest(); batchCounts();
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('booting')));
  const want = location.hash.slice(1).split('&')[0];
  if (want) $(`#tabs [data-tab="${CSS.escape(want)}"]`)?.click();
  requestAnimationFrame(moveIndicator);
  document.fonts.ready.then(moveIndicator);
  if (!S.root.ok) toast('Set your MSTS / Open Rails folder once to enable direct route integration.', 'warn', 6000);
})();
function webglRenderer() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'not available';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).replace(/^ANGLE \((.*)\)$/, '$1') : 'available';
  } catch { return 'not available'; }
}
window.SAM = { get state() { return S; }, set state(v) { S = v; }, queue, single, dests, scanRoute, toast, api, esc, icon, spinner,
  confirmBox, modal, audioUrl, allRoutes, browseRoute, renderSettings, saveSettings, sanitize, webglRenderer, updateHeaderRoute };
})();
