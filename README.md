[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/anisakansa/best-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/anisakansa/best-flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

# Tradewind Courier

A deterministic cargo-pilot flight game for the make.fun **"Make the best
flight game"** bounty. Fly a bush plane across the Meridian archipelago —
twelve kilometres of sea, seven islands, two airstrips, one squall line.

## Play

Open `game/index.html` in a desktop browser (no build step, no network —
everything is local), or serve the folder:

```sh
node serve.ts   # http://localhost:8080
```

| Key | Action |
| --- | ------ |
| ↑ / ↓ | Pitch |
| ← / → | Bank |
| Shift / Ctrl | Throttle up / down |
| Space | Airbrake |
| B | Drop crate (Medicine Run) |
| C | Camera near / far |
| P | Pause · R: restart · 1–5: missions · Enter: start |

## Missions

1. **Coral Ring Sprint** — thread 6 rings against a 150 s par.
2. **Kaimana Short Strip** — put it down gently on a 340 m island strip.
3. **Medicine Run** — drop 2 crates on Karang Island, low and slow, then fly home.
4. **Through the Squall** — cross the storm band to the beacon on Beacon Rock.

Fuel burns faster at high throttle, damage comes from hard landings,
terrain strikes, overspeed and flying too fast inside the storm, and the
wing quits below 26 m/s. Best scores are saved locally.

## How it is built

Canvas 2D with a hand-written perspective projector — no libraries. The
world (seeded terrain, weather, physics) is a fixed 1/60 s step with a
seeded RNG, so the same inputs always fly the same line. One file per
job under `game/src/`: terrain, flight physics, aircraft, camera,
weather, particles, rendering, missions, HUD, input, audio, world, and
the screenshot autopilot.

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to
`/output` and writes `/output/dossier.json` via the vendored
`vendor/makefun-game.ts`. It runs byte-identically twice.

## License

MIT — see `LICENSE`.
