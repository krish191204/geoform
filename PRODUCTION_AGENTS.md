# Geoform — production goal, loop, and agents

Productionize **Geoform** at `~/Projects/geoform` into a geography-aware worldbuilding product. Keep **WorldEngine** as the geography backend. Prefer small incremental changes. Do not rewrite from scratch. Ignore git unless explicitly asked.

---

## Goal

Turn Geoform into a production-grade geography-aware worldbuilding product.

### Definition of done

- Reliable local + deployable stack (UI + WorldEngine API), documented one-command/dev and production run
- Authoritative WorldEngine generate/recompute with clear loading/error states; no silent failures
- Persist worlds beyond fragile localStorage (export/import + durable store; versioned save schema with migrations)
- Map UX that feels production: readable relief/biomes, responsive sculpt→recompute, undo, brush feedback
- Settlement rules tested; override path explicit; inspector always explains cell state
- Automated tests for API serialize/recompute contract + client suitability/persist; basic CI
- Security/perf basics: input validation, bounded map sizes, no secrets in repo, sensible timeouts
- README is accurate technical docs; WorldEngine install path is reproducible

### Constraints

- Keep WorldEngine as geography backend
- Prefer small incremental changes
- Do not rewrite from scratch
- Ignore git unless asked

---

## Loop prompt

Use with a fixed cadence, e.g. `/loop 20m`, plus the text below.

```text
Productionize Geoform at ~/Projects/geoform toward the goal in PRODUCTION_AGENTS.md.
Ignore git unless explicitly asked.

Each tick:
1. Assess what’s broken/missing vs production-ready (build, API health, obvious UX gaps).
2. Pick the single highest-leverage gap (reliability > correctness > UX > polish).
3. Implement a small vertical slice; keep the app runnable.
4. Verify (typecheck/build; generate or recompute if API is up).
5. Short status: done this tick, next target, blockers.

Stop when definition of done is met, or ask if blocked on credentials/deploy.
```

### Orchestrator loop (multi-agent lead)

```text
You are the Geoform production orchestrator for ~/Projects/geoform.
Ignore git unless asked.

Each tick:
1. Score gaps vs definition of done (Platform, Contract, Persist, Editor, Render, Settlement, Quality, Docs).
2. Dispatch or personally execute ONLY the highest-leverage agent lane.
3. Require: app still runs; verify that lane (build and/or API smoke).
4. Report: lane, change, proof, next lane.

Prefer one lane per tick. Do not parallel-edit the same files across lanes.
```

---

## Agentic breakdown

Run these as **separate agents** (or sequential personas). Each owns one surface. Hand off via short status notes. Avoid overlapping edits on the same files.

| Agent | Owns | Does | Does not |
|-------|------|------|----------|
| **1. Platform** | `server/`, WorldEngine install, run scripts, Docker/procfile | One-command/dev + prod start; health checks; timeouts; map-size limits; crash-safe API; install docs | UI polish, city rules |
| **2. Simulation contract** | `server/worldengine_api.py`, `src/world/worldengine.ts`, types | Stable JSON schema (versioned); generate/recompute correctness; calibration round-trip; error payloads | Canvas look, save UI |
| **3. Persistence** | `src/world/persist.ts` + save UI | Versioned saves; migrations; export/import; optional durable store (IndexedDB/files); autosave reliability | Climate math |
| **4. Interaction / editor** | `src/main.ts` tools, brush debounce, undo stack | Raise/lower UX; sculpt→recompute feedback; undo/redo; busy/error states; Shift-override clarity | Backend, shaders |
| **5. Renderer** | `src/render/draw.ts`, map CSS | Production map look (relief, coasts, rivers, layers); perf (don’t tank FPS); brush preview | WorldEngine calls |
| **6. Settlement** | `src/world/climate.ts` suitability + inspector copy | Deterministic scores; unit tests; clear block reasons; tune thresholds | Generation pipeline |
| **7. Quality** | tests, CI config, smoke scripts | API contract tests; suitability/persist tests; smoke generate; typecheck/build gate | Feature invention |
| **8. Docs / DX** | `README.md`, runbooks | Accurate architecture, run, troubleshoot; no stale claims | Code refactors |

### Suggested order

1. Platform  
2. Simulation contract  
3. Persistence  
4. Interaction / editor  
5. Renderer  
6. Settlement  
7. Quality  
8. Docs / DX  

Revisit Renderer/Editor anytime UX is the blocker. Do not skip Contract before Persist.

---

## Per-agent prompts

### 1. Platform

```text
Harden Geoform run/deploy at ~/Projects/geoform. Make UI+WorldEngine API reliably startable, healthy, sized/timeouts bounded, and documented. Don’t redesign the map UI.
```

### 2. Simulation contract

```text
Lock the WorldEngine↔UI JSON contract for generate/recompute. Version it, validate inputs, fix elevation calibration round-trips, return clear errors. Don’t touch rendering aesthetics.
```

### 3. Persistence

```text
Make Geoform saves production-grade: versioned schema, migrations, solid autosave, export/import, stronger durable storage if needed. Don’t change climate simulation.
```

### 4. Interaction / editor

```text
Improve sculpt/city interaction: undo, clear recompute/busy/error UX, brush feedback. Keep WorldEngine as authority after debounce.
```

### 5. Renderer

```text
Make the map look and feel production-grade and stay performant. Layers are views only; don’t change simulation APIs.
```

### 6. Settlement

```text
Harden city suitability: deterministic rules, tests, clear inspector reasons, explicit force-override. No generate pipeline changes.
```

### 7. Quality

```text
Add tests and smoke checks for API contract, persist round-trip, suitability. Wire a minimal CI/typecheck+test path. No feature work.
```

### 8. Docs / DX

```text
Rewrite README/run docs to match the real stack and failure modes. No behavior changes unless fixing doc-breaking lies.
```

---

## Priority rule (every tick)

**Reliability → correctness → UX → polish**

One lane per tick. Keep the app runnable after every change.
