# 🪖 Iron Form Fitness

**At-home, military-style workouts that build a safe, realistic weight-loss plan around your body, your equipment and your sore spots, with an animated trainer who works out alongside you.**

Iron Form is an installable web app (PWA) with no build step and no backend. Plain JavaScript runs entirely in your browser.

> ⚠️ Iron Form gives general fitness guidance, not medical advice. Check with a doctor before starting a new exercise or diet programme. Stop if you feel pain, dizziness or chest discomfort.

---

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [How to use it](#how-to-use-it)
- [How the app keeps you safe](#how-the-app-keeps-you-safe)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Data & privacy](#data--privacy)
- [The story: what problem this solves](#the-story-what-problem-this-solves)
- [How we built it](#how-we-built-it)
- [Challenges we ran into](#challenges-we-ran-into)
- [Metric standardization](#metric-standardization)
- [Accomplishments that we're proud of](#accomplishments-that-were-proud-of)
- [What we learned](#what-we-learned)
- [What's next](#whats-next)
- [License](#license)

---

## Features

**A plan built around you**
- Sign-up collects height, weight, age, sex, daily activity, a weight-loss goal and target date, fitness level (beginner / intermediate / advanced), multiple focus areas, problem areas (knees, lower back, shoulders, neck, wrists, elbows, hips, ankles), available equipment, **the dumbbell weights you own**, minutes per workout and training days per week.
- **Honest goal assessment.** If the goal isn't safely achievable by your date, the app says so and offers two fixes: the realistic amount by that date, or the date by which the full goal is achievable.
- A weekly rotation of upper, lower and full-body strength, cardio intervals, **dance cardio**, **yoga & mobility** and **rest days**.
- Progressive overload: volume rises for 3 weeks, then every 4th week is a lighter "deload" week.
- **An adaptive week.** Missed workouts aren't lost: the week is rearranged so the most important ones still happen (strength → cardio → dance → yoga). A rest day is used for training only when it's safe. Catch-up sessions add up to 10 minutes and 10% volume so the goal date doesn't move.

**Training with Sgt. Iron**
- One consistent animated trainer demonstrates **94 exercises** and does each rep *with you*, in time with the rep counter.
- Sets, reps, timers, rest countdowns, dumbbell weight, side 1 / side 2, and a "next up" demo while you get into position.
- Three coach voices (Sgt. Steel, Capt. Nova, Coach Sage) or text-only. Reps counted aloud, plus countdown beeps.
- **30-second motivational briefing and debrief** every session. They use your real streak and progress, and none ever repeats.
- **Original workout music** generated live in the browser in five genres (EDM, Hip-Hop, Rock, Latin, Lo-fi). It dips automatically whenever the coach speaks.

**After every workout**
- Muscles targeted, calorie-burn estimate, sets completed, streak, military rank, and progress toward your goal.
- A projection of where you'll be on your target date. It blends your planned calorie deficit, your *actual* workout burn and your weigh-in trend, and **tells you when that projection changes**.
- A "How did that feel?" rating that tunes future volume by ±5%.

## Quick start

Requires [Node.js](https://nodejs.org/) 18+ (only to serve files and run tests; there are no npm dependencies).

```bash
git clone https://github.com/nami1000/Iron-Form-Fitness.git
cd Iron-Form-Fitness
npm start          # serves the app at http://localhost:8080
npm test           # runs the engine test suite
```

Any static file server works too (for example `python3 -m http.server`). To use it on your phone, host the folder on any static host (GitHub Pages, Netlify, …). Then, in your phone's browser, choose **Add to Home Screen** to install it.

## How to use it

1. **Enlist:** answer the sign-up questions (about 3 minutes).
2. **Review your mission assessment:** accept it, or adjust the goal or date.
3. **Base screen:** your streak, today's mission, goal progress, the week at a glance, and your weekly weigh-in reminder.
4. **Start mission:** briefing → warm-up → main block → cool-down → debrief → full report.
5. **During a workout:** *Pause*, *Skip*, *Back*, *Done set*, and **🩹 Something hurts**.
6. **Settings:** change voice, music, rest time (20/30/45/60 s), removed exercises and backups, or rebuild your plan.

## How the app keeps you safe

Injury prevention is the top design priority. Every rule below is enforced in [`js/engine/planner.js`](js/engine/planner.js) and covered by tests.

| Rule | How |
|---|---|
| Problem areas are protected | Every exercise has a 0–3 load rating per joint. Anything scoring ≥ 2 on one of your problem areas is **never scheduled**. A score of 1 is allowed, with an on-screen "go gentle" note. |
| No jumping when it's risky | Impact moves are removed for beginners and for knee, ankle, hip or lower-back issues. |
| Health readiness | A PAR-Q+-style questionnaire. Any "yes" caps training at beginner level with no jumping and at least 45 s rest, and recommends medical clearance. |
| Safe dumbbell loads | Weights are chosen from the ones you own, with a per-level cap per exercise type. If every weight you own is too heavy, the exercise is skipped rather than overloaded. |
| Pain reporting | **Something hurts** asks *where* (body-area chips), *how bad* (mild / moderate / sharp) and *what it feels like* (free text, scanned for body parts and warning signs such as chest pain, dizziness, numbness, a pop or swelling). The area is then protected like a sign-up problem area: removed from the rest of today, this week and future weeks, and the exercise is paused. Sharp pain or warning words show a clear "stop and get checked" message. |
| Recovery check-ins | 14 days after a report, the home screen asks how it is. *Feeling good* brings the paused exercises back; *Not ready yet* or *Worse* keeps them paused and asks again in another 14 days, for as long as needed. Settings → Pain & recovery shows every report, what's paused and the next check-in. |
| Catching up after missed days | Missed workouts roll forward by priority, but rest days are used **only** if there's no health-check flag, no pain report in the last 3 days and the last workout wasn't rated "Too hard". At least one day off per week is kept, hard days in a row are capped (4 / 5 / 6 by level), and the same muscles are never trained two days running. Catch-up adds at most +10 min / +10% volume. |
| Recovery | Every session has a warm-up and a cool-down. The cool-down stretches the muscles you actually trained. Every template includes a rest day, and every 4th week is a deload week. |
| Safe weight loss | At most ~1% of body weight (≤ 1 kg) per week, intake never planned below 1,200 kcal (women) / 1,500 kcal (men), and never a goal below a healthy BMI. It warns if you're losing too fast. |

## Project structure

```
index.html              App shell
css/app.css             Military-themed styles
js/app.js               Router & bootstrap
js/nav.js               In-memory navigation (works in sandboxed hosts)
js/store.js             Local storage + optional private cloud sync
js/service.js           Glue between state and the engine
js/trainer.js           "Sgt. Iron" SVG skeleton animator
js/voice.js             Coach voices (Web Speech API) + beeps
js/music.js             Live-synthesised workout music (Web Audio API)
js/data/exercises.js    94 exercises: equipment, joint stress, MET, cues, keyframes
js/engine/calc.js       BMR/TDEE, goal feasibility, dumbbell safety caps
js/engine/planner.js    Safety filter, weekly schedule, session builder, progression
js/engine/progress.js   Streaks, ranks, weight trend, projection
js/engine/pep.js        Unique 30-second pep-talk generator
js/engine/injury.js     Pain reports, area protection and 2-weekly check-ins
js/engine/units.js      Unit conversion (metric internally)
js/ui/*.js              Screens: onboarding, home, player, summary, progress, library, settings
tests/engine.test.mjs   Engine test suite (node:test)
dev/gallery.html        Visual check of every exercise pose
dev/sides.html          Visual check of side 1 / side 2 for one-sided moves
scripts/serve.mjs       Zero-dependency dev server
sw.js, manifest.webmanifest   Offline support & installability
```

## Testing

```bash
npm test
```

The 39 tests cover: unit conversions, the BMR formula, goal assessment (comfortable / ambitious / unrealistic, minimum calories, healthy-BMI floor), dumbbell safety caps, **one test per problem area** confirming no loading exercise is ever scheduled across 4 weeks, no jumping for knee issues or beginners, the health-readiness cap, the equipment filter, the pain-report filter, session length for every level and duration, rest days, streak rules, weight-trend projection, projection-change notices, cool-down muscle coverage (92% of trained volume across 120 generated sessions), 30-second rest, the adaptive week (missed days rescheduled, rest days reused only when safe, no back-to-back same-muscle days, hard-day caps), catch-up session limits, pain-report text analysis, the reported area being protected across future weeks, the 14-day check-in cycle, and that 300 consecutive pep talks are all unique.

For visual checks, run `npm start` and open `/dev/gallery.html` (every pose) or `/dev/sides.html` (one-sided moves, both sides).

## Data & privacy

- Everything is stored **on your device** (browser `localStorage`). There are no accounts, analytics or trackers.
- When hosted as a private Claude artifact, data is also synced to that artifact's **per-user private storage**, which only you can read.
- Settings has **Export / Copy / Import backup** (JSON).
- Voices use your device's built-in speech engine. Music is generated locally. No audio leaves the device.

---

## The story: what problem this solves

I wanted to lose weight at home, safely, with the gear I already own: a few dumbbells, resistance bands, two yoga blocks, an ab wheel, a mat and a wall.

Most workout apps fell short in the same ways:

- **They promise results without checking whether they're realistic.** Pick a date, and they'll happily build a plan for an unsafe rate of loss.
- **They ignore injuries.** If your knees complain, you still get jump squats and burpees. Getting hurt is the fastest way to lose all your momentum.
- **They assume a gym.** Plans call for equipment and weights I don't have.
- **They lose the human element.** No one shows you the move, counts with you, or tells you it's OK to stop.

Iron Form flips that around. It **asks** about your body and your equipment first, tells you **honestly** what's achievable by your date, **filters out** anything that would load a problem area, and puts a drill sergeant beside you, who demonstrates every rep, counts with you and stops when something hurts. The goal is steady, safe weight loss you can stick with, without getting injured along the way.

This first version is built for me. If it delivers real results over the next 3–6 months, the plan is to open it up to others.

## How we built it

- **Built with [Claude Code](https://claude.ai/code)** in a pair-programming style: I set the requirements and tested every version on my phone, and Claude wrote the code, tests and visual checks.
- **Vanilla JavaScript ES modules**, no framework and no build step, so it's easy to read, host anywhere and run offline as a PWA.
- **A custom 2D animation system** for the trainer: each exercise is a few keyframes of joint angles. The renderer interpolates them, keeps the figure on the floor automatically, pins planted hands and feet so they don't slide, and mirrors poses for side 2.
- **Rules-based planning engine:** joint-stress ratings, equipment and level filters, a time-budgeted session builder, and progressive overload with deload weeks.
- **Web Speech API** for coach voices and **Web Audio API** for live-synthesised music. There are no audio files and no licensing issues.
- **Test-first safety:** the safety rules are written as automated tests, and every screen was checked end-to-end in a headless browser with screenshots.

## Challenges we ran into

- **Making a stick figure look like a real trainer.** Posing 94 exercises by joint angle meant lots of trigonometry and visual review. Auto-grounding and contact pinning made the poses believable.
- **Mirroring one-sided moves.** On "side 2" the dumbbell initially stayed in the wrong hand, and front-view leans didn't flip. The fix mirrors the whole pose, including props and wall supports.
- **iPhone audio.** The coach's voice worked but the music was silent. iOS mutes Web Audio under the silent switch and only lets audio start inside a tap. The fix unlocks audio on each tap and switches the page to media playback.
- **Sandboxed hosting.** The private test host blocks URL-hash routes, service workers and downloads. That led to in-memory navigation, private cloud sync and a permission-based backup export.
- **A navigation name clash** silently blanked the post-workout debrief. It was caught in real-world testing and is now covered by an end-to-end test that runs a full workout through to the report.
- **Matching the cool-down to the workout.** A full-body day can work 12 muscle groups, but only about four stretches fit in a cool-down. A greedy "most-worked muscle first" picker now stretches ~92% of the trained volume.
- **Honest numbers.** Exercise alone rarely creates a big enough calorie deficit, so the app is upfront that food matters most and shows the split between food and exercise.

## Metric standardization

All values are stored internally in **metric units**: kilograms, centimetres, kilocalories and seconds. Conversion to lb / ft-in happens only at the UI edge (input and display), so mixing units can never corrupt the maths.

| Quantity | Standard used |
|---|---|
| Body & dumbbell weight | kg internally; 1 lb = 0.45359237 kg exactly |
| Height | cm internally; 1 in = 2.54 cm exactly |
| Resting energy (BMR) | **Mifflin–St Jeor**: 10·kg + 6.25·cm − 5·age + 5 (male) / −161 (female) / −78 (unspecified) |
| Daily energy (TDEE) | BMR × activity factor: 1.2 sedentary · 1.375 light · 1.55 active |
| Exercise calories | **MET method** (ACSM): kcal/min = MET × 3.5 × kg ÷ 200. Each exercise carries a MET value from the Compendium of Physical Activities range; rest time is counted at 1.8 MET |
| Energy per kg of fat | 7,700 kcal |
| Safe loss ceiling | min(1% body weight, 1.0 kg) per week |
| Comfortable pace | ≈ 0.75% body weight per week (≤ 0.75 kg) |
| Max planned deficit | 1,000 kcal/day |
| Minimum planned intake | 1,200 kcal (female) · 1,500 kcal (male) · 1,350 kcal (unspecified) |
| Healthy-weight floor | BMI 18.5 |
| Rest between sets | 30 s default (user-adjustable 20–60 s); ≥ 45 s when the health check is flagged |
| Stretch holds | 30 s; 20 s per side for one-sided stretches (within the 10–30 s guideline) |
| Joint stress scale | 0 none · 1 minimal (allowed, with caution) · 2 moderate (excluded for that area) · 3 high |
| Levels | 1 Beginner · 2 Intermediate · 3 Advanced |
| Projection | Energy model (plan deficit + actual workout burn) until ≥ 3 weigh-ins over ≥ 10 days, then 60% measured trend + 40% model, capped at the safe ceiling |
| Pain check-ins | Every 14 days from the report (or the last check-in) until the user answers "ready"; re-reporting the same area restarts the clock |
| Adaptive week | Priority: strength 1 · cardio 2 · dance 3 · yoga 4. ≥ 1 non-training day per plan week; max hard days in a row 4 / 5 / 6 (yoga & dance are light days); catch-up = +10 min and ×1.1 volume (capped at 1.5× base) |
| Dates | Local calendar days (`YYYY-MM-DD`); weeks start on the plan's start day |

## Accomplishments that we're proud of

- **Safety rules that can be checked:** one automated test per joint confirms no loading exercise is ever scheduled for a problem area.
- **An honest goal checker** that says "not safely achievable" and offers a realistic alternative instead of a false promise.
- **A single, consistent animated trainer** across 94 exercises that actually does the reps with you.
- **Pep talks that never repeat**, built from your real streak and progress.
- **Original music generated in the browser:** five genres, no licensing, and it ducks under the coach.
- **Zero dependencies and offline-capable**, with private data that stays on your device.

## What we learned

- Safety needs to be a **data model**, not an afterthought: per-joint stress ratings made "avoid anything that hurts my knees" a simple, testable filter.
- **Real-device testing matters.** Two of the biggest bugs (iPhone audio and the blank debrief) only showed up on a phone.
- In weight loss, **food does most of the work**, and the most useful thing an app can be is honest about pace.
- Small motivational touches (streaks, ranks, a coach who knows your name) add up to consistency.

## What's next

- **Multi-user version** (after 3–6 months of personal testing): accounts, onboarding for others, and sharing.
- More exercises and variations, with an "easier / harder" swap button on each move.
- Optional real-video demos alongside the animated trainer.
- Smarter adaptation: adjust volume from rep completion and ratings over time, and carry calorie catch-up across weeks.
- Nutrition helpers: simple calorie and protein tracking against the daily target.
- Smart-scale and health-app integration (Apple Health / Google Fit) for automatic weigh-ins.
- Reminders and notifications for workouts and weekly weigh-ins.
- Pick-your-own playlist integration alongside the generated beats.

## License

© 2026 Nami. **All rights reserved.** No license is granted to copy, modify or distribute this code. An open-source license may be added later.

## Credits

Created by **Nami** ([@nami1000](https://github.com/nami1000)), built with [Claude Code](https://claude.ai/code).
