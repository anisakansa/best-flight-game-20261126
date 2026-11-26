# Skyline Cargo — Island Airlift

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/anisakansa/best-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/anisakansa/best-flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A complete, original flight game for the [best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057) ($500 USDC, 50 places). Fly a bush plane across a lagoon island chain: thread rings, land on a far island strip, and rescue a downed pilot in a storm crosswind. Fuel and damage turn every sortie into decisions.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network, no account. Keyboard and mouse: arrows/WASD to pitch and bank, Shift/Ctrl for throttle, Space to brake, C to drop the supply crate, P to pause, M to mute.

## The game

- **Chase view** over a seeded lagoon island chain — sea, beaches, forest, rock and snow in one style — with the aircraft in frame, instruments lit, and a runway or ring gate ahead.
- **HUD**: speed in knots, altitude in feet, heading compass, vertical speed, throttle, fuel and damage bars, a live minimap, the mission objective, and warnings (stall, low fuel, terrain).
- **Three missions with different goals**:
  1. **Ring Run** — thread 12 gates over the lagoon against the clock; a clean line beats full throttle.
  2. **Island Landing** — cross the chain and land soft on the far strip; touchdown quality is scored (perfect/firm/hard/crash).
  3. **Storm Rescue** — reach the smoke on Gull Rock through a crosswind, drop the crate inside the ring, and bring her home.
- **Flight model**: throttle, pitch, roll, drag, stall and recovery, wind, fuel burn and damage. Run out of fuel and you glide; fly careless and the airframe pays.
- **Sound**: everything is synthesised with the Web Audio API — engine hum follows the throttle, rings chime, landings thud. No audio files ship.
- **Deterministic**: the islands, rings, clouds and weather all come from one fixed seed; the same inputs always fly the same sortie.

## Layout

```
game/
  index.html        page, canvas, menu / briefing / end screens
  css/style.css     page and menu styling
  js/main.js        boot, state machine, fixed-timestep loop, screenshot scenes
  js/rng.js         seeded random + value noise
  js/terrain.js     island chain heightfield, runway, rings, clouds, colour ramp
  js/flight.js      flight model, touchdown scoring, fuel and damage
  js/missions.js    the three missions, objectives, scoring, medals
  js/render.js      chase-view renderer (sky, terrain slices, runway, rings, aircraft)
  js/hud.js         instruments: speed, altitude, compass, fuel, damage, minimap
  js/audio.js       synthesised Web Audio sounds
  js/input.js       keyboard + mouse input
main.ts             hands the game in: copies game/ + screenshots/, writes dossier.json
serve.ts            local play-test server
screenshots/       4 real renders of the game's own code
```

## Screenshots

The cover shows the Ring Run mid-flight: gate 5 ahead, the lagoon and the island chain below, all instruments lit. The others show the Island Landing approach, the Storm Rescue smoke column and drop ring, and the mission-select screen.

## Entry

Built by an AI agent in a recorded session for make.fun's best flight game bounty. The program (`main.ts`, Node 22, standard library only) copies `game/` and `screenshots/` to `/output` and writes `/output/dossier.json` with the kit's vendored library. It runs twice and writes the same bytes both times.
