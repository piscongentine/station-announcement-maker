/* Station Announcement Maker - audio engine.
 * Decodes any format the Edge engine knows (MP3, M4A/AAC, OGG/Opus, FLAC, WAV, WebM),
 * resamples with an OfflineAudioContext and writes plain RIFF/WAVE 16-bit PCM
 * (WAVE_FORMAT_PCM = 1, 44-byte header, no extra chunks) - the format MSTS and Open Rails read.
 */
const SAMAudio = (() => {
  let ctx = null;
  const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

  async function decode(file, opts = {}) {
    const buf = await file.arrayBuffer();
    try {
      return await ac().decodeAudioData(buf.slice(0));
    } catch (e) {
      if (!opts.fallback) throw new Error(`Can't decode ${file.name} (${e.message || 'unsupported format'})`);
      // FFmpeg fallback on the backend (only works when FFmpeg is installed)
      const wav = await opts.fallback(buf, file.name);
      return await ac().decodeAudioData(wav);
    }
  }

  async function render(buffer, rate, channels) {
    const len = Math.max(1, Math.ceil(buffer.duration * rate));
    const off = new OfflineAudioContext(channels, len, rate);
    const src = off.createBufferSource();
    src.buffer = buffer;
    src.connect(off.destination); // destination channelCount == channels -> speaker down/up-mix
    src.start();
    return await off.startRendering();
  }

  function encodeWav(buf) {
    const ch = buf.numberOfChannels, rate = buf.sampleRate, n = buf.length;
    const dataLen = n * ch * 2;
    const out = new ArrayBuffer(44 + dataLen);
    const v = new DataView(out);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, dataLen, true);
    const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        let s = chans[c][i];
        s = s > 1 ? 1 : s < -1 ? -1 : s;
        v.setInt16(o, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
        o += 2;
      }
    }
    return new Uint8Array(out);
  }

  function peaks(buf, count = 600) {
    const d = buf.getChannelData(0), d2 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    const step = Math.max(1, Math.floor(d.length / count)), out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      let m = 0;
      const s = i * step, e = Math.min(d.length, s + step);
      for (let j = s; j < e; j += 4) {
        const a = Math.abs(d[j]); if (a > m) m = a;
        if (d2) { const b = Math.abs(d2[j]); if (b > m) m = b; }
      }
      out[i] = m;
    }
    const max = Math.max(0.01, ...out);
    return out.map(x => x / max);
  }

  /* Full conversion: File -> {wav: Uint8Array, url, peaks, duration, rate, channels, srcInfo} */
  async function convert(file, rate, channels, fallback) {
    const decoded = await decode(file, { fallback });
    const head = new DataView(await file.slice(0, 64).arrayBuffer());
    const tag = n => String.fromCharCode(...new Uint8Array(head.buffer, n, 4));
    const ext = (file.name.match(/\.([^.]+)$/) || [, 'audio'])[1].toUpperCase();
    let srcInfo = `${ext} · ${decoded.numberOfChannels === 1 ? 'mono' : 'stereo'}`;
    if (head.byteLength >= 36 && tag(0) === 'RIFF' && tag(12) === 'fmt ') {
      const fmt = head.getUint16(20, true);
      srcInfo = `WAV ${fmt === 1 ? 'PCM' : fmt === 85 ? 'MP3-in-WAV' : 'fmt ' + fmt} · ${head.getUint32(24, true)} Hz · ${head.getUint16(22, true) === 1 ? 'mono' : 'stereo'}${fmt === 1 ? ' · ' + head.getUint16(34, true) + '-bit' : ''}`;
    }
    const rendered = await render(decoded, rate, channels);
    const wav = encodeWav(rendered);
    const blob = new Blob([wav], { type: 'audio/wav' });
    return { wav, blob, url: URL.createObjectURL(blob), peaks: peaks(rendered), duration: rendered.duration,
             rate, channels, srcInfo, size: wav.length };
  }

  async function peaksFromUrl(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('could not load audio');
    const b = await ac().decodeAudioData(await r.arrayBuffer());
    return { peaks: peaks(b, 300), duration: b.duration };
  }

  function drawWave(canvas, pk, progress = 0) {
    if (!canvas || !pk) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const cs = getComputedStyle(document.documentElement);
    const base = cs.getPropertyValue('--wave').trim(), on = cs.getPropertyValue('--wave-on').trim();
    const bar = 2, gap = 1, bars = Math.floor(w / (bar + gap));
    for (let i = 0; i < bars; i++) {
      const v = pk[Math.floor(i / bars * pk.length)] || 0;
      const bh = Math.max(2, v * (h - 4));
      g.fillStyle = i / bars < progress ? on : base;
      g.fillRect(i * (bar + gap), (h - bh) / 2, bar, bh);
    }
  }

  /* One <audio> element per player; only one player sounds at a time. */
  const players = new Set();
  function player(el, opts = {}) {
    const btn = el.querySelector('.play-btn'), canvas = el.querySelector('canvas'),
          wrap = el.querySelector('.wave-wrap'), prog = el.querySelector('.wave-progress'),
          time = el.querySelector('.time');
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = opts.volume ?? 0.8;
    let pk = null, raf = 0;
    const fmt = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';
    const paint = () => {
      const p = audio.duration ? audio.currentTime / audio.duration : 0;
      drawWave(canvas, pk, p);
      if (prog) prog.style.width = (p * 100) + '%';
      if (time) time.textContent = `${fmt(audio.currentTime)} / ${fmt(audio.duration || opts.duration || 0)}`;
    };
    const loop = () => { paint(); if (!audio.paused) raf = requestAnimationFrame(loop); };
    const setIcon = () => { btn.innerHTML = `<svg><use href="#i-${audio.paused ? 'play' : 'pause'}"/></svg>`; el.classList.toggle('playing', !audio.paused); };
    audio.addEventListener('play', () => { setIcon(); loop(); opts.onState?.(true); });
    audio.addEventListener('pause', () => { setIcon(); paint(); opts.onState?.(false); });
    audio.addEventListener('ended', () => { audio.currentTime = 0; setIcon(); paint(); });
    audio.addEventListener('loadedmetadata', paint);
    btn.addEventListener('click', async () => {
      if (opts.lazy && !audio.src) { await opts.lazy(api); }
      if (audio.paused) { players.forEach(p => p !== api && p.pause()); audio.play().catch(e => opts.onError?.(e)); }
      else audio.pause();
    });
    wrap?.addEventListener('click', e => {
      if (!audio.duration) return;
      const r = wrap.getBoundingClientRect();
      audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
      paint();
    });
    const api = {
      el, audio,
      load(url, peaks, duration) { audio.src = url; pk = peaks; opts.duration = duration; btn.disabled = false; requestAnimationFrame(paint); },
      setPeaks(p) { pk = p; paint(); },
      pause() { audio.pause(); },
      redraw: paint,
      destroy() { audio.pause(); audio.removeAttribute('src'); players.delete(api); cancelAnimationFrame(raf); },
    };
    players.add(api);
    return api;
  }

  const redrawAll = () => players.forEach(p => p.redraw());
  window.addEventListener('resize', redrawAll);

  function toBase64(u8) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(new Blob([u8]));
    });
  }

  return { convert, decode, render, encodeWav, peaks, peaksFromUrl, drawWave, player, redrawAll, toBase64, players };
})();
