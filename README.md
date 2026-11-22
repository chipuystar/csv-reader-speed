# csv-reader-speed

A fast drop-in for csv-reader 1.0.0 — make.fun's own CSV reader — written for the [Read broken CSV files faster](https://make.fun/bounty/csv-reader-speed-01-run-20261121) bounty.

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/chipuystar/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/chipuystar/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

`solve.js` exports `run(input)`, which returns exactly the answer csv-reader 1.0.0 returns for `{text, header}` — `{columns, rows, errors}` — including every broken-row case the reference reports. `main.ts` is the harness driver: it reads every case from `/input/cases.json` and writes the answers to `/output/answers.json`.

## How it works

The reference reads one character at a time and builds every field a character at a time. This reader keeps the reference's answers exactly and gets its speed from three changes:

- **Whole clean records in one go.** A record with no quote before its line break cannot have a quoted field open, so the whole line is sliced out and split on commas by the engine's native `split`. Stray CRs inside it are dropped and reported, in order.
- **Jumps, not steps.** Unquoted fields are found by walking to the next comma, LF or CR (the walk stops at the first one), and quoted fields are found with `indexOf` jumps to the next quote that is not doubled. Characters are sliced out in runs, never one by one.
- **Quoted fields sliced whole.** A quoted field's region is sliced out once; line breaks inside it are counted and normalised with native `replace` calls, and doubled quotes are unescaped with `replaceAll`.

Every error the reference records — `stray_cr`, `quote_junk`, `unterminated_quote`, `short_row`, `long_row` — is recorded here with the same line and row, in the same order.

## Local benchmark

On this machine (Node 24, practice set, 6 cases, ~10.2 MB of CSV), median of 9 runs per case, `run()` only:

| case | this entry | csv-reader 1.0.0 | speedup |
|------|-----------:|-----------------:|--------:|
| g-0001 | 18.0 ms | 97.5 ms | 5.41x |
| g-0002 | 25.4 ms | 95.2 ms | 3.75x |
| g-0003 | 13.9 ms | 84.8 ms | 6.08x |
| g-0004 | 18.8 ms | 93.2 ms | 4.95x |
| g-0005 | 45.8 ms | 84.9 ms | 1.85x |
| g-0006 | 19.5 ms | 70.5 ms | 3.62x |
| **total** | **141.5 ms** | **526.1 ms** | **3.72x** |

End to end (`main.ts`, including reading and parsing `cases.json` and writing `answers.json`): ~1.15 s vs ~2.27 s for the baseline. These are local numbers for comparison side by side on one machine; the contest times entries on its own hardware.

## Correctness

- Kit grader (`grade-local`): 6 of 6 practice cases identical, and the two executions' outputs reproduced byte for byte.
- 61 hand-made edge cases (every error kind, BOM, CRLF/LF mixes, unterminated quotes, multiline quoted fields, Unicode) — all identical to the reference.
- 20,000 randomised differential fuzz cases — all identical to the reference.

