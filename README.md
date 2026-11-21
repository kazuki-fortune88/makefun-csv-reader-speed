# makefun-csv-reader-speed

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/kazuki-fortune88/makefun-csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/kazuki-fortune88/makefun-csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: it answers exactly as
csv-reader does on every input (`{columns, rows, errors}` for `{text, header}`),
including its broken-row policy (BOM, CRLF/LF, stray CRs, quoted fields,
doubled quotes, quote junk, unterminated quotes, short/long rows) — but reads
the text with native `indexOf`/`slice` scans instead of one character at a
time, so it runs several times faster on the practice set.

## How it works

- `solve.js` — dependency-free ES module exporting `run(input)`. Plain lines
  (no quote opening a field, no stray CR) are split in one native pass;
  every other field is scanned with bounded `indexOf` searches for the next
  comma, line break or quote, so no scan ever runs past the field it reads.
- `main.ts` — the harness driver: reads `/input/cases.json`, answers each
  case with `run()`, writes `/output/answers.json`. It turns V8's incremental
  marking off (`--no-incremental-marking`) before importing `solve.js`, as
  the house baseline's driver does.

## Run it

```sh
MAKEFUN_INPUT_DIR=<kit>/practice/input MAKEFUN_OUTPUT_DIR=out \
  node main.ts
```

Node 22 or later. No dependencies, nothing to install.

## Referral

Built for the make.fun bounty with referral `4fxhr3y1`.

## License

MIT — see [LICENSE](LICENSE).
