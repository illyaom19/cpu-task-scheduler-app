# CPU Task Scheduler App

A zero-compile browser simulator for Look-Ahead Conserving EDF scheduling. It is built as a self-contained static web app with plain HTML, CSS, and vanilla JavaScript ES modules.

## Run

Open `index.html` in a modern browser.

No install, build, package manager, transpiler, or server is required for normal use.

## What It Does

- Defines periodic real-time tasks with release time, WCET, actual execution time, period, deadline, color, and enabled state.
- Generates job instances through a finite simulation horizon.
- Runs a Look-Ahead Conserving EDF simulation with conservative WCET reservations.
- Uses discrete P-states: `0`, `0.25`, `0.5`, `0.75`, and `1.0`.
- Reclaims slack when actual execution finishes before WCET.
- Renders an SVG schedule timeline and frequency track.
- Reports deadline misses, idle time, preemptions, utilization, deferred work, and reclaimed slack.
- Supports built-in ECU-style scenarios, task presets, and JSON import/export.

## Test

The core scheduler tests are dependency-free:

```sh
node tests/scheduler.test.mjs
```

The tests exercise job generation, validation, EDF/P-state behavior, deadline miss reporting, slack reclamation, trace interval sanity, and disabled task exclusion.

## Project Rules

Read `AGENTS.md` before planning or making changes. Any agent that plans or works in this repo must append a brief entry to `agents_log`.
