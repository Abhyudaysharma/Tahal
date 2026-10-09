---
title: Tahal: a walk guide that talks, so your phone can stay in your pocket
published: false
tags: devchallenge, hf26challenge
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05)*

> ✍️ **Before you publish:** search for `TODO`. There are 4 spots only you can fill: demo video, repo link, your real field test, and (optionally) the agent-session link. Edit anything in my draft that isn't true to your own experience. Delete this note.

## What I Built

Every "go outside" app has the same flaw: to use it, you have to look at it.

**Tahal** (टहल, Hindi for *a stroll*, the thing someone's grandmother tells them to do after dinner) is a walk guide you listen to instead. You say how long you have, pick who should guide you, pick a language, and an open Gemma model running on your own laptop writes a short walk. Then you put the phone in your pocket and the walk is *spoken* to you, one stop at a time, with a soft chime between stops. The app never asks for your eyes again.

A stop looks something like this:

> 👂 **One minute of quiet.** *Stop. Cup your ears and count how many different sounds you can find. Don't name them, just count.*
> *(timer: 3 minutes, then a chime, then the next stop)*

Who guides you is a personality, not a setting:

- **Dadi ji** calls you *beta* and teases you about your phone.
- **Birdwatcher** is far too excited about leaves.
- **Gully detective** treats your walk like a case. The culprit is, reliably, a squirrel.
- **Quiet monk** says almost nothing and leaves long silences for you to fill.

And it speaks **English, हिन्दी or Hinglish**, because "touch grass" sounds different when your dadi says it.

The design rule I held myself to: *the screen is the shortest part of the experience.* Setting up takes about twenty seconds. The walk takes as long as you like and needs the screen for none of it.

## Demo

<!-- TODO 1: add your demo video (30-60 seconds; see FIELD-TEST.md for a shot list). A real clip of you outdoors beats any screenshot. -->

The app wears the actual sky. This is the same screen at golden hour, dusk and night, with the sun placed where it really is for your coordinates:

<!-- TODO: upload docs/home.png, docs/home-dusk.png, docs/home-night.png, docs/player.png, docs/pocket-rest.png, docs/walk-card.png -->

## Code

<!-- TODO 2: your repo: {% github YOUR_USERNAME/tahal %} -->

Zero dependencies. No `npm install`. Plain Node on the server, vanilla JS in the browser, system fonts only, nothing loaded from a CDN.

## How I Built It

**The open pieces:** [Gemma](https://ai.google.dev/gemma) (default `gemma3:4b`, with `gemma3n:e2b` as the lighter option) served locally by Ollama. The server talks to it over `localhost`. Nothing in the app calls a hosted LLM.

A few decisions that mattered more than I expected:

**1. Small models get a short leash.** Gemma 4B is good, not magic. So the server doesn't trust it:
- Ollama's JSON mode, plus a fallback that digs the first `{…}` out of chatty answers.
- A small model is bad at arithmetic, and "the stops must add up to 30 minutes" is arithmetic. The server rescales the stop times so they sum to your budget *exactly*.
- Spoken text gets stripped of emoji, asterisks and markdown, because a text-to-speech voice reading "asterisk asterisk phone asterisk asterisk" is a bad time.

**2. It can only name places you taught it.** Models love inventing a lovely "Maple Grove Trail". For a hyperlocal guide that's worse than useless. So there's a **Your neighbourhood** list: you add the gate, the banyan, the chai stall, and the prompt says *if you mention any place, use only these, by exactly this name.* With no places added, it names none and talks only about what anyone would find outside. The map is a list in your browser. It never leaves your machine.

**3. The sky is the interface.** Sunrise and sunset come from about 30 lines of solar maths, computed on-device (my tests check them against published Greenwich solstice times). From that I get five phases (dawn, day, golden hour, dusk, night) that tint the whole UI, and the same sunset and golden-hour information goes into the prompt, so the guide knows how much light you actually have left. It also knows the Indian season (*ritu*): in October it's *Sharad*, the clear skies after the monsoon.

**4. Pocket mode.** Phones in pockets get touched. So after a few seconds the screen goes pure black with one slowly breathing dot, and **a tap does nothing; you press and hold to wake it.** The screen wake lock is requested where the browser allows it.

**5. Pack at home, walk offline.** Walks are generated while you're on Wi-Fi next to your laptop, saved on the phone, and played back using only browser APIs (speech synthesis, Web Audio, timers). The model isn't needed on the trail.

When you get back, you write one line about what you noticed. Gemma answers in your guide's voice, and you can download a shareable walk card.

**Testing:** a dependency-free test suite runs against a *fake Ollama* (sun maths, phase-of-day, minute fitting, output cleaning, the place whitelist, model swapping, error paths), and I drove the whole flow in headless Chromium: pack, walk, pocket rest, press-and-hold wake, journal, walk card.

### What I haven't verified yet (the honest part)

<!-- TODO 3: THE BONUS-POINTS SECTION. Replace this block with your real field test. Use FIELD-TEST.md. Suggested shape:

**Field test.** I took Tahal out at ___ (time) in/near ___ (place) with ___ (guide) in ___ (language), on gemma3:4b / gemma3n:e2b on a ___ laptop. Packing took ___ seconds. The walk was "___".
What worked: ___
What broke or was silly: ___ (be specific: judges love an honest failure)
Did speech keep going with the screen resting / phone in my pocket? ___
Hindi voice on my phone: ___
One thing I actually noticed: ___ (add the photo)

Delete the sentence below once you've written this. -->

My tests use a fake model, so Gemma's real walk quality, its Hindi, its generation time on a laptop, speech continuing with the screen resting on a phone, and playing a packed walk with the laptop switched off are all things I checked by hand on the day, not things I'm assuming. See the field test above.

## Why Does Open Innovation Matter?

I tried to answer this by asking what would break if the model were a closed API:

- **The trail has no signal.** The point of the app is to be outside. Once a walk is packed it needs no connection and no model at all. A guide that only works while a data centre is reachable is a guide for the sofa.
- **Your neighbourhood is yours.** The list of places you pass every day, the note you write when you get back, and where you were at 5 p.m. are the most personal things an app can hold. Here the model, the server and the journal all live on my machine. The only thing that can leave it is an optional weather lookup with coordinates rounded to ~1 km, and `NO_WEATHER=1` switches that off completely.
- **Rerolling is free.** Asking for a different walk ten times because the first one said "find a bench" costs nothing. There's no key, no quota, no bill.
- **I can change how it behaves.** One dropdown swaps the model. One edited string gives you a new guide. When Gemma's Hindi is stiff, that's a prompt I can fix myself tonight rather than a request in some provider's queue. And because the weights are open, fine-tuning a Hindi-conversational Gemma is a real next step.
- **Anyone can fork it for their city.** Swap the default location, add your own ritu names, write a guide in Tamil or Bengali.

Where a closed model would honestly win: raw eloquence and the very best Hindi. A 4B model writes decent walks, not poetry. For *this* job I'll take private, free, offline and editable over a slightly nicer sentence.

## My Agent Session

<!-- TODO 4 (optional): if you're sharing the agent session behind this project (DevRelay / Entire), embed or link it here. Otherwise delete this section. -->

## Prize Categories

**Best Use of Gemma.** Gemma runs locally (via Ollama) as the core of the app, writes every walk and reflection, is swappable in the UI between Gemma variants, and is steered by persona/language/place-whitelist prompts built around it.

---

*Go for a tahal. The app will be here when you get back.* 🌿
