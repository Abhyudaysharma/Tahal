# Field test checklist (about 20 minutes, and it's what wins the bonus points)

I could not run a real Gemma model or a phone from my side. This list is what only you can do. Do the steps in order, and jot answers as you go: they become the honest "How it went" section of your post, and I can fix anything that breaks.

## Before you go (5 min, at home, laptop + Wi-Fi)

1. `ollama pull gemma3:4b` (optional, to compare: `ollama pull gemma3n:e2b`)
2. `node server.js`, open http://localhost:3000
3. Open **Your neighbourhood** and add 2 or 3 *real* places you pass (a gate, a tree, a chai stall) with one detail each.
4. Set your location (tap **Use mine**, or type latitude, longitude).
5. Pick a guide and a language. Pack **two** walks to compare: Hindi vs Hinglish is the interesting pair.
6. Write down: **how many seconds** did Gemma take? Did it use only your places? Was the Hindi good or odd?

## Does the phone work? (5 min)

- Android: `adb reverse tcp:3000 tcp:3000`, open http://localhost:3000 in Chrome on the phone. Open one packed walk.
- Hear the intro. **Is there a Hindi voice?** (If not: Settings → text-to-speech → install Hindi.)

## Walk (10–20 min, outside)

- **Offline check:** before you leave, stop `node server.js` (or turn off Wi-Fi / unplug the USB cable). Reload or reopen the app and open a packed walk. It should still play.

- Tap **Start walking**, then pocket the phone.
- Note: did the voice keep going with the screen resting? Did it chime at each stop? Did it **keep going when you put the phone in your pocket / lock it**? (Most important thing to learn.)
- Press-and-hold to wake: easy or annoying?
- Photograph the one thing you actually noticed.

## After

- Write your one line, read the reflection, download the walk card.

## Send me, so I can fix it before you publish

1. Gemma's generation time and your laptop (RAM, GPU or not).
2. Anything the guide said that was wrong, awkward or too long.
3. Whether speech stopped when the screen turned off.
4. Anything in the UI that confused you.

## 45-second demo video shot list

1. (5 s) Phone on the home screen at your real time of day: show the sun arc and the sky colour.
2. (8 s) Add one place, choose the guide, tap **Pack my walk**.
3. (7 s) The preview path. Tap **Start walking**.
4. (15 s) You outside, phone in pocket, audio audible. Film what you notice.
5. (10 s) Back home: write the line, show the reflection and the walk card.
Tip: record screen separately and cut it together; the outdoor audio is the star.
