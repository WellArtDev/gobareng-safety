# GoBareng Safety

> **"Go bareng, pergi bareng, pulang bareng dengan selamat."**
> *(Go together, return home safely.)*

## Why GoBareng exists

**We built GoBareng to help people — plain and simple.**

Every year in Indonesia, hiking groups and touring riders lose each other
on the trail: no headcount, no signal, and when something goes wrong,
help arrives too late. People get lost, injured, or stranded, and the
people who could help often don't even know something happened.

GoBareng exists so that never has to be the story. A leader creates a
trip in under a minute — hiking with mountain routes and checkpoints, or
touring with a map-picked destination — then watches the whole group
live on one map. One tap sends an SOS to nearby users within 2 km,
in-app and on WhatsApp, with or without a trip, by text, voice, or
photo. Leaders see every checkpoint, check-in, and the full headcount at
a glance, with an AI leader assistant summarizing it all. If a member
goes silent for 10 minutes, the leader is alerted. Offline, messages
queue and send automatically when signal returns, SOS first. Families
back home can follow that same live map through a share link, and
mountain managers and rescue teams get their own command center,
accessed by login, so every group on the mountain is watched from one
place.

That is the whole point: fewer people lost, faster help, and every
member of the group coming home safe.

**Solo developer:** WellArtDev
**Track:** Indie Developer Track — **Build for Your World**
**Built with Muse Spark Open.**

## What makes GoBareng different

GoBareng is not a generic group-chat app with a map bolted on. It is
built around the real risks of Indonesian mountains and roads:

- **Safety first, not engagement first.** Every design choice — the
  headcount, the silent-member alert, the SOS-first offline queue —
  exists to prevent a bad outcome, not to keep people scrolling.
- **It works where the signal doesn't.** Mountains eat mobile signal.
  GoBareng queues positions and messages on the device and flushes them
  automatically when signal returns, with SOS items jumping the queue
  and never expiring.
- **Help comes from whoever is actually nearby.** An SOS doesn't just
  go to a call center far away — it reaches verified nearby users
  within 2 km, in-app and on WhatsApp, because the nearest person is
  often the fastest help.
- **Leaders carry responsibility, so leaders get real tools.** Live
  positions, checkpoint check-ins, departed-vs-missing headcount, an AI
  assistant that summarizes it all, and a command center for managers
  and rescue teams watching many groups at once.
- **Honest AI, no fake output.** Where the model is unavailable,
  features degrade to explicit, deterministic answers instead of
  hallucinated text — so leaders always get trustworthy information in
  safety-critical moments.
- **Built for Indonesia.** Indonesian mountains, routes, and
  checkpoints; touring rides, not just hikes; OTP login by email or
  phone (no passwords to forget on the trail); Indonesian-first UI.

## Features

- **Trips in under a minute.** Hiking trips link a mountain route with
  ordered checkpoints (distance, elevation gain, estimated time); touring
  trips pick a destination on the map, with a meeting point.
- **Live map.** Every member's position on one map, with role markers
  (leader, sweeper, medic, member) and a blinking marker for an active SOS.
- **Headcount & check-in.** Meeting-point check-in marks members departed;
  leaders see departed vs missing at a glance.
- **SOS, trip or standalone.** One tap, by text, voice, or photo.
  Recipients are nearby users within 2 km, notified in-app and on
  WhatsApp. Hiking reasons: lost, injured, medical, other. Touring adds:
  vehicle breakdown, out of fuel, flat tire, accident. Max 3 general SOS
  per day, 10-minute cooldown.
- **Silent-member alert.** If a member's position hasn't moved for 10
  minutes, the leader is alerted.
- **Offline-first.** Positions and messages queue on the device and flush
  automatically when signal returns — SOS items jump the queue and never
  expire.
- **Invite vs share.** Invite makes someone a trip member (leader-only,
  while the trip is still planned, quota-aware). Share is a watch-only
  live link for anyone following the trip.
- **AI, powered by Meta (see below).** SOS voice transcription and reason
  classification, SOS photo descriptions, leader-assistant narration,
  member Q&A grounded strictly in trip data (including route facts and
  the distance to the next post, computed on the server — and, for
  touring trips, the distance to the nearest checkpoint), post-trip
  reports, and AI trip summaries for closed trips.
- **Paid trips.** Joining a paid trip creates a payment record the leader
  confirms manually. The platform is not a transaction party.
- **Mountain catalog.** 125 mountains, 305 routes, and route checkpoints
  for the hiking trip wizard.
- **Admin dashboard.** Organizer verification, mountain/route
  management, global notification settings, and per-module AI toggles.

## Live demo

- Web dashboard (command center + live map): https://posko.gobareng.app
- API: https://jalur.gobareng.app (REST endpoints under `/api/v1`)
- Mobile app: React Native + Expo, built from `apps/mobile`

Login is passwordless OTP (email or phone). Registration is open.

## Android app (APK)

The latest Android build is attached to the
[GitHub Release](https://github.com/WellArtDev/gobareng-safety/releases)
for this snapshot, with a Google Drive mirror here:

- https://drive.google.com/file/d/164hjWVZ9zd00fFqo9WaFiHUtPqaGHshy/view?usp=drivesdk

(The APK is distributed as a release asset, not committed to git.)

## Built with Meta

- **Meta Model API** + **Meta Muse Spark** — the intelligence layer of
  GoBareng, not a demo add-on. Muse Spark classifies SOS voice reports,
  describes SOS photos so leaders understand a situation without opening
  every image, narrates the leader assistant's headcount and checkpoint
  summary, answers member questions grounded strictly in trip data, and
  writes post-trip reports.
- **Honest fallbacks, no fake output.** Where the model is unavailable,
  features degrade to explicit, deterministic answers instead of
  hallucinated text — so leaders always get trustworthy information in
  safety-critical moments. Without a Meta Model API key, AI endpoints
  return an explicit `AI_NOT_CONFIGURED` state; voice SOS without an
  STT provider configured returns `STT_NOT_CONFIGURED`. AI features can
  also be switched off per module by an admin.

## The Beacon problem — and what comes next

The hardest safety problem on a mountain is not the app — it is the
signal. There are long stretches of trail with no mobile coverage at
all, where no phone-based SOS can get out, no matter how good the app
is. That is the problem we want to solve next.

**Planned, not yet built — stated honestly:** a Beacon device and
chat-over-LoRa / SOS-over-LoRa, so groups can reach each other and call
for help even where there is no mobile signal at all. Beacon work is
currently on hold (an early skeleton only); it is a direction for the
future of GoBareng, not a feature in this snapshot. If we win, GoBareng
does not stop here: we will keep building it until it is genuinely
useful for real hikers, riders, families, and rescue teams — not a
one-off hackathon project.

Other items on the real backlog:

- Completing the mountain catalog photos (some mountains still have no
  confidently matching photo).
- Transfer-proof upload for paid trips (today the leader confirms
  payment manually).
- An in-app voice guide for trip-assistant answers.
- A true trip-duration field on the API (today's duration is derived,
  not stored).

## Honest status

GoBareng is **about 85–90% complete — not 100%, and we would rather say
so than claim perfection.** What works today is real: trips, live
tracking, headcount, SOS, offline queue, the AI assistant, Q&A, and the
command center are all live on the demo links above. Known gaps, stated
plainly:

- The live end-to-end voice-SOS test with a real phone recording is
  still pending (server-side transcription and transcoding are built).
- Beacon / LoRa messaging is planned, not built (see above).
- Some mountain catalog photos are still missing.
- A few polish items (paid-trip transfer proof, trip duration) remain
  on the backlog above.

## Tech stack

| Layer | Technology |
|---|---|
| Web dashboard | SvelteKit + TypeScript + Tailwind |
| API | Bun + Express + Prisma + Socket.IO (+ Redis adapter) |
| Mobile | React Native + Expo SDK 58 |
| Data | PostgreSQL 16, Redis 7 |
| AI | Meta Model API (Muse Spark), optional OpenAI-compatible STT provider |

## Repository structure

```
apps/
  api/        # Bun + Express + Prisma + Socket.IO API
  mobile/     # React Native + Expo SDK 58 app
  web/        # SvelteKit dashboard (command center + live map)
```

This repository contains only the hackathon-period build: the three
apps and this README.

## Running locally

### Prerequisites

- Bun (API, web)
- Node.js (mobile tooling) + `npm`
- PostgreSQL 16 and Redis 7

### API

```bash
cd apps/api
bun install
bunx prisma generate
bunx prisma migrate deploy
bun run dev        # starts src/index.ts; see PORT in .env
```

### Web dashboard

```bash
cd apps/web
bun install
bun run dev
```

### Mobile app

```bash
cd apps/mobile
npm ci
npx expo start
```

Copy `.env.example` files to `.env` and fill in your own values. Never
commit real secrets or credentials. The mobile app requires a
`google-services.json` for push notifications; it is intentionally not
included in this repository.
