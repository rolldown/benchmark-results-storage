// One-time migration: convert `benchmark-node-output.json` (the nested
// github-action-benchmark data file) into append-only JSON Lines in the Entry
// schema that rolldown/metric's `metric.json` already uses:
//
//   {"case","metric","timestamp","commit","unit","records":{"rolldown":n},"repoUrl"}
//
// Outputs (repo root):
//   - benchmark-node-output.jsonl  — the "Node Benchmark" series (live)
//   - benchmark-legacy.jsonl       — the "Benchmark" series (retired 2024-04-16)
//
// Bench-row mapping (same rules the workflow writer applies going forward):
//   unit "ms / ops" or "ms"             -> metric "production build time", unit "ms"
//     ("ms" appears only in the first 2 entries of the retired series, 2024-04-03)
//   unit "bytes" + name "… (peak memory)" -> metric "peak memory", unit "byte",
//                                            case = name without the suffix
//
// The script is deterministic and self-checking: it re-reads what it wrote and
// verifies counts, endpoints, and fixed spot samples against the source.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'benchmark-node-output.json');
const FALLBACK_REPO_URL = 'https://github.com/rolldown/rolldown';
const PEAK_MEMORY_SUFFIX = ' (peak memory)';

const SERIES = [
  { name: 'Node Benchmark', file: 'benchmark-node-output.jsonl' },
  { name: 'Benchmark', file: 'benchmark-legacy.jsonl' },
];

function mapBench(bench) {
  const value = Number(bench.value);
  if (!Number.isFinite(value)) {
    throw new Error(`non-numeric value ${JSON.stringify(bench)}`);
  }
  if (bench.unit === 'bytes' && bench.name.endsWith(PEAK_MEMORY_SUFFIX)) {
    return {
      caseName: bench.name.slice(0, -PEAK_MEMORY_SUFFIX.length),
      metric: 'peak memory',
      unit: 'byte',
      value,
    };
  }
  if (bench.unit === 'ms / ops' || bench.unit === 'ms') {
    return { caseName: bench.name, metric: 'production build time', unit: 'ms', value };
  }
  throw new Error(`unmapped unit ${JSON.stringify(bench)}`);
}

function entryLines(entry) {
  const repoUrl = entry.commit?.url?.split('/commit/')[0] ?? FALLBACK_REPO_URL;
  if (!entry.commit?.id || !entry.date) {
    throw new Error(`entry missing commit id or date: ${JSON.stringify(entry).slice(0, 200)}`);
  }
  return entry.benches.map((bench) => {
    const { caseName, metric, unit, value } = mapBench(bench);
    return JSON.stringify({
      case: caseName,
      metric,
      timestamp: entry.date,
      commit: entry.commit.id,
      unit,
      records: { rolldown: value },
      repoUrl,
    });
  });
}

const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));

for (const series of SERIES) {
  const entries = source.entries[series.name];
  if (!entries) throw new Error(`series not found: ${series.name}`);
  const lines = entries.flatMap(entryLines);
  const outPath = path.join(ROOT, series.file);
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

  // --- gates ---
  const expected = entries.reduce((n, e) => n + e.benches.length, 0);
  const written = fs.readFileSync(outPath, 'utf8').split('\n').filter(Boolean);
  if (written.length !== expected) {
    throw new Error(`${series.file}: wrote ${written.length} lines, expected ${expected}`);
  }
  const parsed = written.map((l) => JSON.parse(l));
  const first = parsed[0];
  const last = parsed.at(-1);
  if (first.commit !== entries[0].commit.id || first.timestamp !== entries[0].date) {
    throw new Error(`${series.file}: first line does not match first entry`);
  }
  if (last.commit !== entries.at(-1).commit.id || last.timestamp !== entries.at(-1).date) {
    throw new Error(`${series.file}: last line does not match last entry`);
  }
  // Fixed spot samples: first entry / middle entry / last entry, first bench each.
  for (const idx of [0, Math.floor(entries.length / 2), entries.length - 1]) {
    const entry = entries[idx];
    const lineIdx = entries.slice(0, idx).reduce((n, e) => n + e.benches.length, 0);
    const line = parsed[lineIdx];
    if (line.records.rolldown !== Number(entry.benches[0].value)) {
      throw new Error(`${series.file}: value mismatch at entry ${idx}`);
    }
  }
  console.log(
    `${series.file}: ${written.length} lines from ${entries.length} entries ` +
      `(${new Date(first.timestamp).toISOString().slice(0, 10)} .. ` +
      `${new Date(last.timestamp).toISOString().slice(0, 10)}), all gates pass`,
  );
}
