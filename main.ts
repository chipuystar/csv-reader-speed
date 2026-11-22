// Driver for the csv-reader-speed entry: the harness runs `node /bot/main.ts`.
// It reads every case from /input/cases.json, answers each one with run() from
// solve.js, and writes the answers, in the cases' order, to /output/answers.json.
// Outside a container, MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR stand in for
// /input and /output (the same overrides the kit's local grader uses).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Turn V8's incremental marking off before solve.js loads, so the parser runs
// under it from the first byte (the house baseline is timed the same way).
setFlagsFromString('--no-incremental-marking');

const { run } = (await import(
  new URL('./solve.js', import.meta.url).href,
)) as { run: (input: unknown) => unknown };

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(
  readFileSync(join(inputDir, 'cases.json'), 'utf8'),
) as { id: string; input: unknown }[];

// Preallocated: one slot per case, filled in order, so the answers array is
// never grown while the cases run.
const answers: unknown[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) answers[i] = run(cases[i].input);

writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
