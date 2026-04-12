# AGENTS.md

## Agent Landing Brief

This repository is for a zero-compile, self-contained web application for an Interactive Look-Ahead Conserving EDF Scheduling Simulator.

Read in this order before planning or making changes:

1. `PROJECT_VISION.md`
2. `PROJECT_SPECS.md`
3. `agents_log`

## Mandatory Agent Log Rule

Every agent must append a brief entry to the root-level `agents_log` file whenever the agent creates a plan or conducts any work.

This includes:

1. Investigation or repo exploration
2. Planning or proposed implementation plans
3. Code or documentation edits
4. Test, build, lint, or verification commands
5. Debugging attempts
6. Handoff or completion summaries

Log even when no files are changed.

## Log Format

Use this format:

```text
YYYY-MM-DD HH:MM TZ - Agent: <name/model if known>
Action: <plan | investigation | edit | test | handoff>
Summary: <1-3 concise sentences>
Files touched: <paths or "none">
Verification: <commands/results or "not run">
```

Keep log entries concise, factual, and append-only.

## Project Constraints

- The app must remain self-contained and zero-compile.
- Use plain HTML, CSS, and vanilla JavaScript ES modules.
- Do not add a package manager, bundler, transpiler, framework, or generated build artifacts unless the user explicitly changes this constraint.
- The app should run by opening `index.html` directly in a modern browser.
- GitHub Pages compatibility is acceptable, but must not require a build step.

## Planning vs Execution

If the user asks for a plan, do not implement the plan unless explicitly asked in a later message.

If the user asks for implementation, keep changes scoped to the requested work and update `agents_log` before handoff.

## Documentation Constraints

- Keep root documentation minimal.
- `PROJECT_VISION.md` and `PROJECT_SPECS.md` are source-of-truth project documents.
- `AGENTS.md` is the source of truth for agent behavior.
- `agents_log` is the chronological record of agent activity.
