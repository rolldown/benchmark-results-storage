# benchmark-results-storage

Benchmark results of the [rolldown](https://github.com/rolldown/rolldown) repo, stored as append-only JSON Lines — one line per measurement.

## Files

| File | Contents |
| --- | --- |
| `benchmark-node-output.jsonl` | Canonical, append-only. One line per (build × bench case × metric) from the `Benchmarks Node` workflow on rolldown main. |
| `benchmark-legacy.jsonl` | Archived series from before 2024-04-16 (earlier runner setup, different case set). Never appended to. |
| `benchmark-node-output.json` | Legacy nested format (the `github-action-benchmark` data file). Dual-written during the migration window, frozen afterwards. |
| `scripts/migrate.mjs` | The one-time converter that produced the `.jsonl` files. Self-checking (counts, endpoints, spot samples); safe to rerun. |

## Line schema

The same `Entry` schema [rolldown/metric](https://github.com/rolldown/metric) uses for its `metric.json`:

```json
{"case":"threejs10x (default)","metric":"production build time","timestamp":1713278381040,"commit":"0c3f2baa25c141cb91392074e38171e74ef96b5a","unit":"ms","records":{"rolldown":297.49},"repoUrl":"https://github.com/rolldown/rolldown"}
```

- `case` — benchmark case name
- `metric` — `production build time` (unit `ms`) or `peak memory` (unit `byte`, Rust-side peak from rolldown's tracking allocator)
- `timestamp` — unix ms of the benchmark run
- `commit` — the rolldown commit the run measured
- `records` — value per bundler, keyed by name (currently only `rolldown`)

Lines are append-only and each workflow run appends all of its lines in one commit, so a commit is one benchmark run.

- Writer: `.github/workflows/benchmark-node.yml` in rolldown/rolldown
- Reader: <https://rolldown.github.io/metric/> (rolldown/metric)
