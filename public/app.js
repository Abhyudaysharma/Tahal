(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const qs = new URLSearchParams(location.search);
  const FAST = qs.get('fast') === '1';                 // dev flag: one "minute" lasts 2 seconds
  const MIN_MS = FAST ? 2000 : 60000;
  const IDLE_MS = FAST ? 2500 : 12000;                 // screen rests after this long without a touch
  const RING = 578.05;                                 // 2π × 92
  const JSON_HEADERS = { 'content-type': 'application/json' };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(k, d) { try { const v = localStorage.getItem('tahal:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('tahal:' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  const INTERESTS = ['birds', 'trees and leaves', 'sky and light', 'sounds', 'street life', 'plants'];
  const FALLBACK_META = {
    ok: false, models: [], default: 'gemma3:4b', home: { name: 'home', lat: 27.88, lon: 78.08 },
    languages: [{ id: 'en', label: 'English', tts: 'en-IN' }, { id: 'hi', label: 'हिन्दी', tts: 'hi-IN' }, { id: 'hinglish', label: 'Hinglish', tts: 'en-IN' }],
    personas: [{ id: 'dadi', name: 'Dadi ji', glyph: 'दादी', blurb: 'A warm storyteller who calls you beta.', rate: 0.92 }],
  };

  const S = {
    meta: store.get('meta', FALLBACK_META),
    prefs: Object.assign({ minutes: 30, persona: 'dadi', lang: 'en', interests: [], where: '', model: null }, store.get('prefs', {})),
    places: store.get('places', []),
    packed: store.get('packed', []),
    journal: store.get('journal', []),
    walk: null, wmeta: null, sky: null, outMins: 0, lastEntry: null,
  };
  const P = { active: false, run: 0, i: -1, total: 0, endsAt: 0, left: 0, paused: false, timer: null, idle: null, started: 0, wl: null, ac: null };

  // ───────────── tiny helpers ─────────────
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v === true) n.setAttribute(k, ''); else if (v !== false && v != null) n.setAttribute(k, v);
    }
    kids.flat().forEach((c) => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
    return n;
  };
  const persist = () => store.set('prefs', S.prefs);
  const personaOf = (id) => S.meta.personas.find((p) => p.id === id) || S.meta.personas[0];
  const langOf = (id) => S.meta.languages.find((l) => l.id === id) || S.meta.languages[0];
  const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : `${m} min`);
  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

  function loc() {
    const m = (S.prefs.where || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    return m ? { lat: Number(m[1]), lon: Number(m[2]) } : { lat: S.meta.home.lat, lon: S.meta.home.lon };
  }

  const SCREENS = ['home', 'preview', 'backHome'];
  function show(name) {
    SCREENS.forEach((s) => ($('#' + s).hidden = s !== name));
    document.body.classList.toggle('compact', name !== 'home');
    window.scrollTo(0, 0);
  }

  // ───────────── the sky ─────────────
  async function refreshSky() {
    const l = loc();
    try {
      const r = await fetch('/api/sky', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ lat: l.lat, lon: l.lon, tzOffsetMin: new Date().getTimezoneOffset() }) });
      S.sky = r.ok ? await r.json() : null;
    } catch { S.sky = null; }
    paintSky();
  }

  let sunAnim = 0;
  function arcPoint(t) {
    const u = 1 - t;
    return { x: u * u * 20 + 2 * u * t * 160 + t * t * 300, y: u * u * 100 + 2 * u * t * -40 + t * t * 100 };
  }
  function paintSky() {
    const sky = S.sky;
    const phase = qs.get('phase') || (sky && sky.phase) || 'day';
    document.body.dataset.phase = phase;
    const dot = $('#sunDot'), moon = $('#moonDot'), line = $('#skyline');
    let t = 0.5;
    if (sky && sky.sunrise && sky.sunset) t = (Date.now() - sky.sunrise) / (sky.sunset - sky.sunrise);
    const night = phase === 'night';
    dot.style.display = night ? 'none' : ''; moon.toggleAttribute('hidden', !night);
    const target = Math.min(1, Math.max(0, t));
    const place = (f) => { const p = arcPoint(f); dot.setAttribute('cx', p.x.toFixed(1)); dot.setAttribute('cy', p.y.toFixed(1)); };
    cancelAnimationFrame(sunAnim);
    if (reduceMotion || night) place(target);
    else {
      const t0 = performance.now();
      const step = (now) => { const k = Math.min(1, (now - t0) / 1100); place(target * (1 - Math.pow(1 - k, 3))); if (k < 1) sunAnim = requestAnimationFrame(step); };
      sunAnim = requestAnimationFrame(step);
    }
    if (!sky) line.textContent = 'The sky needs the Tahal server. Packed walks still work.';
    else if (sky.polar) line.textContent = sky.polar === 'day' ? 'The sun stays up all day here.' : 'The sun stays down all day here.';
    else if (Date.now() < sky.sunrise) line.textContent = `Sunrise at ${clock(sky.sunrise)}.`;
    else if (sky.minutesLeft > 0) line.textContent = `Sunset at ${clock(sky.sunset)}, so about ${dur(sky.minutesLeft)} of light left.`;
    else line.textContent = `The sun set at ${clock(sky.sunset)}.`;
    if (sky && sky.ritu) line.textContent += ` It is ${sky.ritu.name} now, the season of ${sky.ritu.gist}.`;
  }

  // ───────────── plan form ─────────────
  function renderPlan() {
    $('#mins').value = S.prefs.minutes; $('#minsOut').textContent = S.prefs.minutes;

    $('#personas').replaceChildren(...S.meta.personas.map((p) => el('label', { class: 'tile' },
      el('input', { type: 'radio', name: 'persona', value: p.id, checked: p.id === S.prefs.persona }),
      el('span', { class: 'body' }, el('span', { class: 'glyph', lang: 'hi', text: p.glyph }), el('span', { class: 'name', text: p.name }), el('span', { class: 'blurb', text: p.blurb })))));
    $('#langs').replaceChildren(...S.meta.languages.map((l) => el('label', {},
      el('input', { type: 'radio', name: 'lang', value: l.id, checked: l.id === S.prefs.lang }), el('span', { text: l.label }))));
    $('#interests').replaceChildren(...INTERESTS.map((i) => el('label', { class: 'chip' },
      el('input', { type: 'checkbox', value: i, checked: S.prefs.interests.includes(i) }), el('span', { text: i }))));
    $('#where').value = S.prefs.where;
    renderPlaces();
  }

  function renderPlaces() {
    $('#hoodCount').textContent = S.places.length ? `${S.places.length} saved` : '';
    $('#places').replaceChildren(...S.places.map((p, i) => el('li', {},
      el('span', {}, el('b', { text: p.name }), p.note ? el('span', { class: 'note', text: p.note }) : null),
      el('button', { class: 'link', type: 'button', 'aria-label': `Remove ${p.name}`, text: 'Remove', onclick: () => { S.places.splice(i, 1); store.set('places', S.places); renderPlaces(); } }))));
    if (!S.places.length) $('#places').append(el('li', {}, el('span', { class: 'small', text: 'Nothing yet. Add a chai stall, a gate, a tree you always pass.' })));
  }

  function addPlace() {
    const name = $('#plName').value.trim(); if (!name) { $('#plName').focus(); return; }
    S.places.push({ name: name.slice(0, 40), note: $('#plNote').value.trim().slice(0, 80) });
    store.set('places', S.places); $('#plName').value = ''; $('#plNote').value = ''; renderPlaces(); $('#plName').focus();
  }

  async function loadMeta() {
    try {
      const m = await (await fetch('/api/models')).json();
      S.meta = m; store.set('meta', m);
    } catch { /* keep cached meta; packed walks still work */ }
    const m = S.meta;
    if (!m.personas.some((p) => p.id === S.prefs.persona)) S.prefs.persona = m.personas[0].id;
    renderPlan();
    $('#dot').className = 'dot ' + (m.ok ? 'ok' : 'bad');
    const sel = $('#model');
    if (!m.ok) { $('#statusText').textContent = 'Ollama is not running here. Start it with “ollama serve”.'; sel.hidden = true; return; }
    const models = m.models.length ? m.models : [m.default];
    sel.replaceChildren(...models.map((n) => el('option', { value: n, text: n })));
    sel.value = models.includes(S.prefs.model) ? S.prefs.model : (models.find((n) => /gemma/i.test(n)) || models[0]);
    S.prefs.model = sel.value; sel.hidden = false;
    $('#statusText').textContent = m.models.length ? 'Local model ready:' : `No models yet. Run “ollama pull ${m.default}”. Model:`;
  }

  // ───────────── packing a walk ─────────────
  async function pack(ev) {
    ev.preventDefault();
    const btn = $('#go'), err = $('#err');
    err.hidden = true; btn.disabled = true; btn.setAttribute('aria-busy', 'true');
    const t0 = Date.now();
    const tick = setInterval(() => { btn.textContent = `Gemma is writing your walk… ${Math.round((Date.now() - t0) / 1000)} s`; }, 500);
    btn.textContent = 'Gemma is writing your walk…';
    const l = loc();
    try {
      const r = await fetch('/api/walk', {
        method: 'POST', headers: JSON_HEADERS,
        body: JSON.stringify({ minutes: S.prefs.minutes, persona: S.prefs.persona, lang: S.prefs.lang, interests: S.prefs.interests, places: S.places, lat: l.lat, lon: l.lon, tzOffsetMin: new Date().getTimezoneOffset(), model: S.prefs.model || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Something went wrong while writing the walk.');
      S.walk = d.walk; S.wmeta = d.meta;
      savePacked();
      renderPreview(); show('preview');
    } catch (e) {
      err.textContent = e instanceof TypeError ? 'Can’t reach the Tahal server. Check that “node server.js” is still running.' : e.message;
      err.hidden = false;
    } finally {
      clearInterval(tick); btn.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = 'Pack my walk';
    }
  }

  function savePacked() {
    const id = Date.now().toString(36);
    S.packed.unshift({ id, ts: Date.now(), walk: S.walk, meta: S.wmeta });
    S.packed = S.packed.slice(0, 8); store.set('packed', S.packed); renderPacked();
  }
  function renderPacked() {
    $('#packed').hidden = !S.packed.length;
    $('#packedList').replaceChildren(...S.packed.map((p) => el('li', {},
      el('span', {}, el('span', { class: 't', text: p.walk.title }), el('span', { class: 'm', text: `${p.meta.minutes} minutes with ${personaOf(p.meta.persona).name}, in ${langOf(p.meta.lang).label}` })),
      el('span', {},
        el('button', { class: 'btn', type: 'button', text: 'Open', onclick: () => { S.walk = p.walk; S.wmeta = p.meta; renderPreview(); show('preview'); } }),
        el('button', { class: 'link', type: 'button', 'aria-label': `Delete ${p.walk.title}`, text: 'Delete', onclick: () => { S.packed = S.packed.filter((x) => x.id !== p.id); store.set('packed', S.packed); renderPacked(); } })))));
  }

  // ───────────── voice ─────────────
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voices = [];
  const loadVoices = () => { voices = synth ? synth.getVoices() : []; if (!$('#preview').hidden) renderVoiceNote(); };
  if (synth) { synth.onvoiceschanged = loadVoices; loadVoices(); }

  function pickVoice(tag) {
    const base = tag.split('-')[0].toLowerCase();
    const norm = (v) => v.lang.replace('_', '-').toLowerCase();
    return voices.find((v) => norm(v) === tag.toLowerCase()) || voices.find((v) => norm(v).startsWith(base)) ||
      (base === 'hi' ? null : voices.find((v) => norm(v).startsWith('en'))) || null;
  }
  const canSpeak = (tag) => Boolean(synth) && !(tag.startsWith('hi') && !pickVoice(tag));

  function speak(text, tag, rate) {
    return new Promise((resolve) => {
      if (!text || !canSpeak(tag)) return resolve();
      const v = pickVoice(tag);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = v ? v.lang : tag; if (v) u.voice = v; u.rate = rate || 1;
      let done = false;
      const fin = () => { if (done) return; done = true; clearTimeout(guard); resolve(); };
      const guard = setTimeout(fin, FAST ? 700 : (text.split(/\s+/).length * 650) / (rate || 1) + 4000);
      u.onend = fin; u.onerror = fin; P.utter = u;   // keep a reference so it isn't garbage-collected mid-sentence
      synth.speak(u);
    });
  }
  const stopSpeaking = () => { try { synth && synth.cancel(); } catch { /* ignore */ } };

  function renderVoiceNote() {
    const tag = S.wmeta ? S.wmeta.tts : 'en-IN';
    const v = pickVoice(tag);
    $('#voiceNote').textContent = !synth ? 'This browser can’t speak, so Tahal will show each stop and chime instead.'
      : (!v && tag.startsWith('hi')) ? 'This device has no Hindi voice. Tahal will show text and chime instead. Install a Hindi voice in your system settings, or write the walk in Hinglish.'
      : v ? `Voice: ${v.name}.` : 'Using your device’s default voice.';
  }

  function chime() {
    try {
      const c = P.ac || (P.ac = new (window.AudioContext || window.webkitAudioContext)());
      const now = c.currentTime;
      [523.25, 783.99].forEach((f, k) => {
        const o = c.createOscillator(), g = c.createGain(), at = now + k * 0.2;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.18, at + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.2);
        o.connect(g).connect(c.destination); o.start(at); o.stop(at + 1.3);
      });
    } catch { /* audio not available */ }
  }

  // ───────────── preview ─────────────
  function renderPreview() {
    const w = S.walk, m = S.wmeta;
    $('#pvTitle').textContent = w.title;
    $('#pvIntro').textContent = w.intro;
    $('#pvIntro').lang = m.lang === 'hi' ? 'hi' : 'en';
    $('#pvStops').replaceChildren(...w.stops.map((s) => el('li', {},
      el('span', { class: 'pin', 'aria-hidden': 'true', text: s.emoji }),
      el('div', {}, el('p', { class: 'st', text: s.title }), el('p', { class: 'say', text: s.say })),
      el('span', { class: 'when', text: `${s.minutes} min` }))));
    const where = m.placesUsed ? ` Built around ${m.placesUsed} of your places.` : '';
    $('#pvMeta').textContent = `${m.minutes} minutes with ${personaOf(m.persona).name}, in ${langOf(m.lang).label}. Written by ${m.model} on your own machine${m.ms ? ' in ' + Math.max(1, Math.round(m.ms / 1000)) + (Math.round(m.ms / 1000) <= 1 ? ' second' : ' seconds') : ''}.${where} Saved to your packed walks.`;
    renderVoiceNote();
  }

  // ───────────── the walk: pocket mode ─────────────
  async function lockScreen() { try { if ('wakeLock' in navigator) P.wl = await navigator.wakeLock.request('screen'); } catch { /* optional */ } }
  function unlockScreen() { try { P.wl && P.wl.release(); } catch { /* ignore */ } P.wl = null; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && P.active) lockScreen(); });

  function startWalk() {
    const w = S.walk, m = S.wmeta, run = ++P.run;
    P.active = true; P.paused = false; P.started = Date.now(); P.i = -1;
    chime(); lockScreen();
    $('#player').hidden = false; document.body.style.overflow = 'hidden';
    $('#pDots').replaceChildren(...w.stops.map(() => el('i')));
    $('#pPause').textContent = 'Pause';
    $('#pCount').textContent = 'Setting out'; $('#pEmoji').textContent = '🚶'; $('#pClock').textContent = '';
    $('#pTitle').textContent = w.title; $('#pSay').textContent = w.intro; $('#pRing').style.strokeDashoffset = RING;
    const go = () => { if (P.run === run && P.active) beginStop(0); };
    if (canSpeak(m.tts)) speak(w.intro, m.tts, personaOf(m.persona).rate).then(() => setTimeout(go, 1200));
    else setTimeout(go, 4500);
    resetIdle();
  }

  function beginStop(i) {
    const w = S.walk, m = S.wmeta, st = w.stops[i];
    P.i = i; P.total = st.minutes * MIN_MS; P.left = P.total; P.endsAt = Date.now() + P.left; P.paused = false;
    $('#pPause').textContent = 'Pause';
    $('#pCount').textContent = `Stop ${i + 1} of ${w.stops.length}`;
    $('#pEmoji').textContent = st.emoji; $('#pTitle').textContent = st.title; $('#pSay').textContent = st.say;
    $('#pSay').lang = m.lang === 'hi' ? 'hi' : 'en';
    [...$('#pDots').children].forEach((d, k) => { d.className = k < i ? 'done' : k === i ? 'now' : ''; });
    stopSpeaking(); chime();
    try { navigator.vibrate && navigator.vibrate([140]); } catch { /* ignore */ }
    setTimeout(() => { if (P.active && P.i === i && !P.paused) speak(st.say, m.tts, personaOf(m.persona).rate); }, 900);
    clearInterval(P.timer); P.timer = setInterval(tick, 200); tick();
  }

  function tick() {
    if (!P.active || P.paused) return;
    const left = P.endsAt - Date.now();
    $('#pClock').textContent = mmss(left);
    $('#pRing').style.strokeDashoffset = String(RING * (1 - Math.min(1, Math.max(0, 1 - left / P.total))));
    if (left <= 0) nextStop();
  }

  function nextStop() {
    if (P.i + 1 < S.walk.stops.length) beginStop(P.i + 1); else finishWalk();
  }

  async function finishWalk() {
    const run = P.run, m = S.wmeta;
    clearInterval(P.timer); stopSpeaking(); chime();
    $('#pCount').textContent = 'All done'; $('#pEmoji').textContent = '🌿'; $('#pClock').textContent = '';
    $('#pTitle').textContent = 'You made it'; $('#pSay').textContent = S.walk.outro;
    [...$('#pDots').children].forEach((d) => (d.className = 'done'));
    wake();
    await speak(S.walk.outro, m.tts, personaOf(m.persona).rate);
    await new Promise((r) => setTimeout(r, 1500));
    if (P.run === run && P.active) endWalk();
  }

  function endWalk() {
    P.run++; P.active = false; clearInterval(P.timer); clearTimeout(P.idle); stopSpeaking(); unlockScreen();
    $('#player').hidden = true; $('#sleep').hidden = true; document.body.style.overflow = '';
    S.outMins = Math.max(1, Math.round((Date.now() - P.started) / MIN_MS));
    $('#bkLine').textContent = `You were out for ${S.outMins} ${S.outMins === 1 ? 'minute' : 'minutes'}.`;
    $('#bkNotice').textContent = S.walk.notice ? `You were carrying a question: ${S.walk.notice}` : '';
    $('#bkNote').value = ''; $('#bkSave').hidden = false; $('#bkSave').disabled = false; $('#bkReflect').hidden = true; $('#bkCard').hidden = true; $('#bkErr').hidden = true;
    $('#bkDone').textContent = 'Skip and go home';
    show('backHome');
  }

  // pocket-safe resting screen: black, and it takes a press-and-hold to wake
  function resetIdle() { clearTimeout(P.idle); if (P.active) P.idle = setTimeout(rest, IDLE_MS); }
  function rest() { if (P.active) $('#sleep').hidden = false; }
  function wake() { $('#sleep').hidden = true; resetIdle(); }
  (() => {
    const sl = $('#sleep'); let hold = 0;
    sl.tabIndex = 0; sl.setAttribute('role', 'button');
    sl.addEventListener('pointerdown', () => { hold = setTimeout(wake, FAST ? 150 : 600); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => sl.addEventListener(ev, () => clearTimeout(hold)));
    sl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wake(); } });
    $('#player').addEventListener('pointerdown', resetIdle);
    $('#player').addEventListener('keydown', resetIdle);
  })();

  function togglePause() {
    if (!P.active || P.i < 0) return;
    if (!P.paused) { P.paused = true; P.left = P.endsAt - Date.now(); stopSpeaking(); $('#pPause').textContent = 'Resume'; }
    else { P.paused = false; P.endsAt = Date.now() + P.left; $('#pPause').textContent = 'Pause'; }
  }

  // ───────────── coming back: journal, reflection, walk card ─────────────
  async function saveJournal() {
    const note = $('#bkNote').value.trim();
    const entry = { ts: Date.now(), title: S.walk.title, mins: S.outMins, note, persona: S.wmeta.persona, lang: S.wmeta.lang, phase: document.body.dataset.phase, ritu: S.wmeta.ritu };
    S.journal.unshift(entry); S.lastEntry = entry; store.set('journal', S.journal.slice(0, 200));
    $('#bkSave').hidden = true; $('#bkCard').hidden = false; $('#bkDone').textContent = 'Go home'; renderJournal();
    if (!note) return;
    $('#bkReflect').hidden = false; $('#bkText').textContent = 'Listening…'; $('#bkWho').textContent = '';
    try {
      const r = await fetch('/api/reflect', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ note, title: entry.title, minutes: entry.mins, persona: entry.persona, lang: entry.lang, model: S.prefs.model || undefined }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      entry.reflection = d.reflection; store.set('journal', S.journal.slice(0, 200));
      $('#bkText').textContent = d.reflection; $('#bkWho').textContent = `From ${personaOf(entry.persona).name}, written by your local model.`;
    } catch { $('#bkReflect').hidden = true; }
  }

  function renderJournal() {
    const j = S.journal;
    $('#journalList').hidden = !j.length;
    if (!j.length) return;
    const total = j.reduce((a, e) => a + (e.mins || 0), 0);
    const days = new Set(j.map((e) => new Date(e.ts).toDateString())).size;
    $('#stats').textContent = `${j.length} ${j.length === 1 ? 'walk' : 'walks'}, ${total} minutes outside, across ${days} ${days === 1 ? 'day' : 'days'}.`;
    $('#journalItems').replaceChildren(...j.slice(0, 5).map((e) => el('li', {},
      el('span', {}, el('span', { class: 't', text: e.title }), el('span', { class: 'm', text: `${new Date(e.ts).toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${e.mins} min with ${personaOf(e.persona).name}` }), e.note ? el('span', { class: 'n', text: e.note }) : null))));
  }

  const CARD = {
    dawn: ['#f4c9b5', '#d8ddf5', '#2a2540'], day: ['#bfddf2', '#f2f6f9', '#14213d'], golden: ['#f9d38a', '#f6e9d2', '#2b1e12'],
    dusk: ['#2f3470', '#e0866f', '#fff4e6'], night: ['#0e1230', '#232b5c', '#eaedff'],
  };
  function wrap(ctx, text, maxW) {
    const words = text.split(/\s+/), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  }
  function downloadCard() {
    const e = S.lastEntry; if (!e) return;
    const cv = $('#card'), ctx = cv.getContext('2d'), [c1, c2, ink] = CARD[e.phase] || CARD.day;
    const serif = '"Iowan Old Style", Palatino, Georgia, "Noto Serif Devanagari", "Kohinoor Devanagari", serif';
    const g = ctx.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, c1); g.addColorStop(0.7, c2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1350);
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.35; ctx.setLineDash([3, 14]); ctx.lineCap = 'round'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(90, 330); ctx.quadraticCurveTo(540, -140, 990, 330); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = '#f5a524'; ctx.strokeStyle = ink; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(760, 130, 44, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink; ctx.textBaseline = 'alphabetic';
    ctx.font = `700 150px ${serif}`; ctx.fillText('टहल', 90, 520);
    ctx.font = `600 70px ${serif}`; let y = 650;
    for (const l of wrap(ctx, e.title, 900)) { ctx.fillText(l, 90, y); y += 82; }
    ctx.font = `500 36px system-ui, sans-serif`; ctx.globalAlpha = 0.75;
    ctx.fillText(`${e.mins} ${e.mins === 1 ? 'minute' : 'minutes'} outside, with ${personaOf(e.persona).name}`, 90, y + 10); ctx.globalAlpha = 1; y += 100;
    if (e.note) { ctx.font = `italic 46px ${serif}`; for (const l of wrap(ctx, '“' + e.note + '”', 900).slice(0, 6)) { ctx.fillText(l, 90, y); y += 62; } y += 20; }
    if (e.reflection) { ctx.font = `400 36px ${serif}`; ctx.globalAlpha = 0.8; for (const l of wrap(ctx, e.reflection, 900).slice(0, 4)) { ctx.fillText(l, 90, y); y += 50; } ctx.globalAlpha = 1; }
    ctx.font = `500 30px system-ui, sans-serif`; ctx.globalAlpha = 0.7;
    wrap(ctx, 'Walked with Tahal. The guide was an open Gemma model running on my own laptop.', 900).forEach((l, k) => ctx.fillText(l, 90, 1236 + k * 42)); ctx.globalAlpha = 1;
    cv.toBlob((b) => {
      const a = el('a', { href: URL.createObjectURL(b), download: `tahal-walk-${new Date(e.ts).toISOString().slice(0, 10)}.png` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
  }

  // ───────────── wiring ─────────────
  $('#mins').addEventListener('input', (e) => { S.prefs.minutes = Number(e.target.value); $('#minsOut').textContent = e.target.value; persist(); });
  $('#personas').addEventListener('change', (e) => { S.prefs.persona = e.target.value; persist(); });
  $('#langs').addEventListener('change', (e) => { S.prefs.lang = e.target.value; persist(); });
  $('#interests').addEventListener('change', () => { S.prefs.interests = [...document.querySelectorAll('#interests input:checked')].map((i) => i.value); persist(); });
  $('#model').addEventListener('change', (e) => { S.prefs.model = e.target.value; persist(); });
  $('#where').addEventListener('change', (e) => { S.prefs.where = e.target.value.trim(); persist(); refreshSky(); });
  $('#plAdd').addEventListener('click', addPlace);
  ['#plName', '#plNote'].forEach((s) => $(s).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPlace(); } }));
  $('#locate').addEventListener('click', () => {
    const b = $('#locate');
    if (!navigator.geolocation) { b.textContent = 'Type it in'; return; }
    b.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition(
      (p) => { S.prefs.where = `${p.coords.latitude.toFixed(3)}, ${p.coords.longitude.toFixed(3)}`; $('#where').value = S.prefs.where; persist(); b.textContent = 'Got it'; refreshSky(); },
      () => { b.textContent = 'Blocked. Type it in'; }, { timeout: 8000, maximumAge: 600000 });
  });
  $('#plan').addEventListener('submit', pack);
  $('#startWalk').addEventListener('click', startWalk);
  $('#hearIt').addEventListener('click', () => { stopSpeaking(); speak(S.walk.intro, S.wmeta.tts, personaOf(S.wmeta.persona).rate); });
  $('#another').addEventListener('click', () => { stopSpeaking(); show('home'); $('#plan').requestSubmit(); });
  $('#pvBack').addEventListener('click', () => { stopSpeaking(); show('home'); });
  $('#pPause').addEventListener('click', togglePause);
  $('#pSkip').addEventListener('click', () => { if (P.active && P.i >= 0) nextStop(); });
  $('#pEnd').addEventListener('click', endWalk);
  $('#bkSave').addEventListener('click', saveJournal);
  $('#bkCard').addEventListener('click', downloadCard);
  $('#bkDone').addEventListener('click', () => show('home'));

  // ───────────── start ─────────────
  renderPlan(); renderPacked(); renderJournal(); show('home');
  loadMeta().then(refreshSky);
  setInterval(refreshSky, 5 * 60 * 1000);
  if ('serviceWorker' in navigator && window.isSecureContext && !FAST) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
