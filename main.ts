// Skyline Cargo — hand-in program (Node 22, standard library only).
//
// The game lives in this repository as plain static files: game/index.html
// and the modules it loads, with no build step and no network request. This
// program hands it in: it copies game/ and screenshots/ from beside this
// file into /output and writes /output/dossier.json, the summary the judge
// reads, with the vendored make.fun library. It runs twice in the grader and
// both runs must write the same bytes, so it does nothing time-dependent:
// the same repository always hands in the same output.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file sits in.
const repoRoot = new URL('.', import.meta.url).pathname;
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps, as the kit's gate states them: the game stays
// under 993 files and 48 MiB, screenshots stay at 4 files of 256 KiB each,
// and the dossier text stays under 160 KiB.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message) {
  console.error(`Skyline Cargo hand-in refused: ${message}`);
  process.exit(1);
}

function countGameEntries(dir, seen) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = statSync(path);
    total += 1;
    if (info.isDirectory()) total += countGameEntries(path, seen);
  }
  return total;
}

mkdirSync(outDir, { recursive: true });

// game/ first: the whole playable game, exactly as it ships.
const gameDir = join(repoRoot, 'game');
if (!existsSync(gameDir)) fail('game/ is missing from the repository');
const gameEntries = countGameEntries(gameDir);
if (gameEntries > DOSSIER_LIMITS.game_max_files) {
  fail(`game/ holds ${gameEntries} entries, over the 993 cap`);
}
cpSync(gameDir, join(outDir, 'game'), { recursive: true });

// screenshots/ next: 3 or 4 real renders of the game's own code, the first
// by name the cover. The gate refuses anything else.
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(shotsDir)) fail('screenshots/ is missing from the repository');
const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
if (shots.length < 3 || shots.length > 4) {
  fail(`screenshots/ holds ${shots.length} images, need 3 or 4`);
}
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// The dossier last: built from the copied files, byte for byte what the
// gate rebuilds with the same library.
writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, DOSSIER_LIMITS));

console.log(
  `Skyline Cargo handed in: ${gameEntries} game entries, ${shots.length} screenshots, dossier written.`,
);
