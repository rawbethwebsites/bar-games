# The Bar Games

A suite of 5 short, addictive, law-flavoured party games for a Call to Bar dinner.

## Quick start

```bash
npm install
npm start
```

Open `http://localhost:3000` on the big screen.

## Current scope

- Same-screen split play for Game 1: **Guilty or Not Guilty**
- QR phone join scaffold (rooms + Socket.IO relay) — controllers coming next
- 5-game lobby skeleton with Game 1 wired in

## Controls

**Game 1 — Guilty or Not Guilty**
- Left player: `A` = Real lawsuit, `S` = Fake lawsuit
- Right player: `L` = Real lawsuit, `K` = Fake lawsuit

## Project layout

```
bar-games/
├─ server.js                # Express + Socket.IO
├─ package.json
├─ public/
│  ├─ index.html            # Lobby / home
│  ├─ host.js               # Host screen game runner
│  ├─ styles.css            # Courtroom design system
│  ├─ shared.js             # Score bar, countdown, verdict utilities
│  ├─ games/
│  │  ├─ guilty.js          # Game 1 logic
│  │  └─ guilty.json        # Case bank
│  └─ controller.html       # Phone controller (stub)
```
