# The Bar Games — Neon Edition

Five short, addictive, law-flavoured party games for two players, built for a **Call to Bar dinner**. Neon-arcade styling, same-screen split play, no server required — every file is self-contained HTML/CSS/JS.

## Play

Just open **`index.html`** in any modern browser, or host the folder anywhere static (GitHub Pages, Netlify, Vercel). From the home screen, pick a game.

Nothing to install — no build step, no dependencies.

## The games

| # | Game | What you do | Controls |
|---|------|-------------|----------|
| 01 | **Guilty or Not Guilty** | Real lawsuit or made up? Slam your verdict, fastest correct scores most. | L: `A` real / `S` made up · R: `K` real / `L` made up |
| 02 | **Objection!** | Wait for the flash, first to buzz wins. Don't jump early or fall for SUSTAINED. | L: `A` · R: `L` (or tap your side) |
| 03 | **Sustained** | Same question both sides, first correct locks the point. | L: `Q W A S` · R: `U I J K` |
| 04 | **Order in the Court** | Finish the ridiculous line; the room votes the funnier. | Pick: `Q W A S` / `U I J K` · Vote: `←` `→` |
| 05 | **Beat the Gavel** | Stop the sweeping needle in the shrinking green zone. | L: `A` · R: `L` |

Every game also supports mouse click / touch, and returns to the home page via the ⚖️ Home button.

## Structure

```
neon-edition/
├─ index.html            # Home / game select (neon arcade)
├─ game1-guilty.html     # Guilty or Not Guilty
├─ game2-objection.html  # Objection!
├─ game3-sustained.html  # Sustained
├─ game4-order.html      # Order in the Court
└─ game5-gavel.html      # Beat the Gavel
```

## Note on content

The "real" lawsuits in Game 1 are well-known documented cases, but verify the details before quoting them at the dinner. Trivia and prompt content is written to be light and accessible — no legal knowledge needed to play.

---

Red = **Prosecution** · Blue = **Defence**. A toast to the newest barrister in the room. ⚖️
