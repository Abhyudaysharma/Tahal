// Dependency-free tests. Spins up a fake Ollama, so no model is needed.
const http = require('http');
const assert = require('assert');

// A deliberately messy "model answer": minutes don't add up, emoji and markdown inside spoken text,
// one stop with no speech at all.
const messy = {
  title: 'Teen Ped aur Ek Awaaz',
  intro: 'Chalo beta, **phone** jeb mein rakho 🌿.',
  stops: [
    { emoji: '🌳', kind: 'walk', title: 'Teen ped', say: 'Teen alag ped dhundo.', minutes: 10 },
    { emoji: '👂', kind: 'listen', title: 'Awaazein', say: 'Ek minute ruk ke awaazein ginो.', minutes: 10 },
    { emoji: '🍂', kind: 'banana', title: 'Patta', say: 'Sabse purana patta dhundo.', minutes: 10 },
    { emoji: '🪑', kind: 'sit', title: 'Khaali', say: '', minutes: 5 },
  ],
  outro: 'Wapas aao.',
  notice: 'Sabse door ki awaaz kaunsi thi?',
};

let lastChat = null;
const fake = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'gemma3:4b' }, { name: 'gemma3n:e2b' }] }));
    if (req.url === '/api/chat') {
      lastChat = JSON.parse(b);
      const isReflect = /"reflection"/.test(lastChat.messages[0].content);
      const content = isReflect ? JSON.stringify({ reflection: '**Ek kauwa** aur ek gilehri ki behes, wah. 🌿' }) : (lastChat.model === 'wrapped' ? 'Sure! ' + JSON.stringify(messy) + ' Enjoy.' : JSON.stringify(messy));
      return res.end(JSON.stringify({ message: { role: 'assistant', content } }));
    }
    res.statusCode = 404; res.end();
  });
});

(async () => {
  await new Promise((r) => fake.listen(0, r));
  process.env.OLLAMA_URL = `http://127.0.0.1:${fake.address().port}`;
  process.env.NO_WEATHER = '1';
  const app = require('../server.js');

  // ── astronomy (Greenwich solstice is published data; Aligarh is a regression guard)
  const near = (ms, h, m, label) => {
    const d = new Date(ms); const got = d.getUTCHours() * 60 + d.getUTCMinutes();
    assert(Math.abs(got - (h * 60 + m)) <= 12, `${label}: got ${d.toISOString()}, wanted ~${h}:${m} UTC`);
  };
  const g = app.sunTimes(51.4779, -0.0015, 2026, 5, 21);
  near(g.sunrise, 3, 43, 'Greenwich solstice sunrise'); near(g.sunset, 20, 21, 'Greenwich solstice sunset');
  const al = app.sunTimes(27.88, 78.08, 2026, 9, 8);
  near(al.sunrise, 0, 43, 'regression: Aligarh sunrise'); near(al.sunset, 12, 27, 'regression: Aligarh sunset');
  assert.strictEqual(app.sunTimes(80, 0, 2026, 5, 21).polar, 'day');

  // ── phase of day and ritu, at a fixed instant (Oct 8 2026, 17:30 IST = 12:00 UTC)
  const at = (h, m) => Date.UTC(2026, 9, 8, h, m);
  const ist = -330;
  assert.strictEqual(app.skyInfo(27.88, 78.08, at(8, 0), ist).phase, 'day');      // 13:30 IST
  assert.strictEqual(app.skyInfo(27.88, 78.08, at(11, 30), ist).phase, 'golden'); // 17:00 IST, ~57 min to sunset
  assert.strictEqual(app.skyInfo(27.88, 78.08, at(12, 40), ist).phase, 'dusk');   // 18:10 IST
  assert.strictEqual(app.skyInfo(27.88, 78.08, at(16, 0), ist).phase, 'night');   // 21:30 IST
  assert.strictEqual(app.skyInfo(27.88, 78.08, at(0, 50), ist).phase, 'dawn');    // 06:20 IST
  assert.strictEqual(app.skyInfo(27.88, 78.08, at(8, 0), ist).ritu.name, 'Sharad');
  assert.strictEqual(app.skyInfo(51.5, 0, at(8, 0), 0).ritu, null);               // no ritu outside India

  // ── minute fitting: always exactly the budget, never below 1 per stop
  for (const [mins, budget] of [[[10, 10, 10, 5], 30], [[1, 1, 1], 45], [[50, 1, 1, 1], 20], [[0, 0, 0, 0, 0], 17], [['x', null, undefined], 12]]) {
    const out = app.fitMinutes(mins.map((minutes) => ({ minutes })), budget);
    assert.strictEqual(out.reduce((a, b) => a + b, 0), budget, `fit ${mins} -> ${out}`);
    assert(out.every((n) => n >= 1));
  }

  // ── cleaning
  const w = app.cleanWalk(messy, 30);
  assert.strictEqual(w.stops.length, 3);                                  // the stop with no speech is dropped
  assert.strictEqual(w.stops.reduce((a, s) => a + s.minutes, 0), 30);
  assert.strictEqual(w.stops[2].kind, 'walk');                            // unknown kind falls back
  assert(!/[*🌿]/u.test(w.intro), w.intro);                               // markdown + emoji stripped from spoken text
  assert.strictEqual(app.cleanWalk({ stops: [{ say: 'one' }] }, 30), null);
  assert.strictEqual(app.cleanPlaces([{ name: '  Banyan ', note: 'old' }, { name: '' }, null]).length, 1);

  // ── prompt: places are the only allowed names; no places means no names
  const withPlaces = app.systemPrompt('jasoos', 'hinglish', [{ name: 'Sir Syed gate', note: 'old banyan on the left' }]);
  assert(/ONLY these/.test(withPlaces) && /Sir Syed gate/.test(withPlaces) && /noir detective/.test(withPlaces) && /Roman letters/.test(withPlaces));
  assert(/Do not name any specific place/.test(app.systemPrompt('dadi', 'en', [])));

  // ── end to end through the real HTTP server
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  const meta = await (await fetch(base + '/api/models')).json();
  assert.deepStrictEqual(meta.models, ['gemma3:4b', 'gemma3n:e2b']);
  assert.strictEqual(meta.personas.length, 4);
  assert.strictEqual(meta.default, 'gemma3:4b');

  let r = await post('/api/walk', { minutes: 40, persona: 'maun', lang: 'hinglish', interests: ['birds'], places: [{ name: 'Chai wala', note: 'under the neem' }], lat: 27.88, lon: 78.08, tzOffsetMin: -330, model: 'gemma3n:e2b' });
  let j = await r.json();
  assert.strictEqual(r.status, 200, JSON.stringify(j));
  assert.strictEqual(j.walk.stops.reduce((a, s) => a + s.minutes, 0), 40);
  assert.strictEqual(j.meta.model, 'gemma3n:e2b');                          // model swapping works
  assert.strictEqual(j.meta.tts, 'en-IN'); assert.strictEqual(j.meta.placesUsed, 1);
  assert.strictEqual(lastChat.format, 'json'); assert.strictEqual(lastChat.stream, false);
  assert(/Chai wala/.test(lastChat.messages[0].content) && /Quiet monk|very little/.test(lastChat.messages[0].content));
  assert(/40 minutes/.test(lastChat.messages[1].content) && /birds/.test(lastChat.messages[1].content) && /Sharad/.test(lastChat.messages[1].content));
  r = await post('/api/walk', { lang: 'hi' }); assert.strictEqual((await r.json()).meta.tts, 'hi-IN');
  r = await post('/api/walk', { model: 'wrapped' }); assert.strictEqual(r.status, 200);   // tolerant JSON extraction

  r = await post('/api/reflect', { note: 'Ek kauwa gilehri se ladh raha tha', persona: 'dadi', lang: 'hinglish', title: 'x', minutes: 20 });
  j = await r.json(); assert.strictEqual(r.status, 200); assert(!/[*🌿]/u.test(j.reflection), j.reflection);
  assert.strictEqual((await post('/api/reflect', { note: '   ' })).status, 400);

  j = await (await post('/api/sky', { lat: 27.88, lon: 78.08, tzOffsetMin: -330 })).json();
  assert(['dawn', 'day', 'golden', 'dusk', 'night'].includes(j.phase)); assert(j.sunrise && j.sunset);

  assert.strictEqual((await fetch(base + '/..%2Fserver.js')).status, 403);   // path traversal refused
  assert.strictEqual((await fetch(base + '/%E0%A4%A')).status, 400);          // malformed URL doesn't crash the server
  for (const f of ['/', '/app.js', '/style.css', '/sw.js', '/manifest.webmanifest', '/icon.svg']) assert.strictEqual((await fetch(base + f)).status, 200, f);

  fake.close();                                                                // Ollama goes away
  r = await post('/api/walk', { lat: 1, lon: 1 }); j = await r.json();
  assert.strictEqual(r.status, 503); assert(/ollama serve/.test(j.error), j.error);

  app.server.close();
  fake.unref();
  app.server.unref();
  console.log('all tests passed ✔');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
