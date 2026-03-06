# CodeTerrarium

CodeTerrarium is a VS Code extension that visualizes AI coding agents as creatures in a living pixel-art terrarium.

## Setup

### Prerequisites

- Node.js 18+ and npm
- VS Code 1.96.0+

### Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build extension + webview:

   ```bash
   npm run build
   ```

3. Open this repo in VS Code and press `F5` to launch an Extension Development Host.

4. In the Extension Development Host, run:
   - `CodeTerrarium: Add Agent` (configure at least one transcript source)
   - `CodeTerrarium: Open Terrarium`

## Configuration

CodeTerrarium reads settings from the `codeterrarium` namespace in workspace settings.

### Settings Reference

- `codeterrarium.maxFps` (`number`, default `30`, min `1`, max `30`)
- `codeterrarium.weatherEnabled` (`boolean`, default `true`)
- `codeterrarium.agents` (`AgentConfig[]`, default `[]`)

Each agent entry supports:

- `id` (required): stable agent id
- `name` (required): display name
- `transcriptPath` (required): absolute file or directory path
- `creatureType` (required): `fox` | `otter` | `slime` | `bird`
- `sourceAdapter` (optional): adapter id, defaults to `jsonl`
- `color` (optional): hex tint override

### Example `settings.json`

```json
{
  "codeterrarium.maxFps": 24,
  "codeterrarium.weatherEnabled": true,
  "codeterrarium.agents": [
    {
      "id": "codex",
      "name": "Codex",
      "sourceAdapter": "jsonl",
      "transcriptPath": "/absolute/path/to/transcripts/codex.jsonl",
      "creatureType": "fox",
      "color": "#F97316"
    },
    {
      "id": "copilot",
      "name": "Copilot",
      "transcriptPath": "/absolute/path/to/transcripts",
      "creatureType": "bird"
    }
  ]
}
```

## Transcript Format (JSONL)

The built-in `jsonl` adapter expects newline-delimited JSON, one event object per line.

### Required Event Data

- `action` or `kind` (string): event action
- `agentId` (string): required unless omitted and resolved from configured agent fallback

### Optional Common Fields

- `ts`, `timestamp`, or `time`: unix seconds, unix milliseconds, numeric string, or ISO datetime string
- `agentName`
- `metadata` (object of string/number/boolean/null scalars)

### Supported Actions

- `read` / `reading`
- `write` / `writing`
- `test_run` / `testrun`
- `test_pass` / `testpass` / `pass`
- `test_fail` / `testfail` / `fail`
- `terminal` / `bash`
- `idle` / `waiting`
- `error` / `crash`
- `complete` / `completed`
- `deploy` / `deployment`

### Example Transcript Lines

```json
{"action":"read","agentId":"codex","path":"src/extension/activate.ts","ts":"2026-03-06T11:00:00Z"}
{"action":"write","agentId":"codex","path":"src/webview/scenes/TerrariumScene.ts","bytesWritten":481,"ts":1741258861}
{"action":"test_run","agentId":"copilot","suite":"unit","timestamp":1741258865123}
{"action":"test_pass","agentId":"copilot","passed":26,"metadata":{"command":"npm test"}}
{"action":"terminal","agentId":"codex","command":"npm run build","exitCode":0}
{"action":"complete","agentId":"codex","taskId":"readme-checklist-2"}
```

### File/Directory Watching Behavior

- If `transcriptPath` points to a file, CodeTerrarium watches appended lines in that file.
- If `transcriptPath` points to a directory, only `*.jsonl` files are watched.
- Existing content is treated as historical baseline; visuals update from newly appended events.

## Commands

- `CodeTerrarium: Open Terrarium`
- `CodeTerrarium: Add Agent`
- `CodeTerrarium: Reset Ecosystem`

## Development Commands

- `npm run typecheck` - strict TypeScript checks
- `npm test` - Vitest unit tests
- `npm run test:integration` - `@vscode/test-electron` lifecycle/messaging tests
- `npm run build` - production extension + webview build
- `npm run package` - create VSIX package

Note: `npm run test:integration` downloads a VS Code test binary into `.vscode-test/` on first run.

## Persistence

- Creature state is stored per workspace at `.codeterrarium/stats.json`.
- `CodeTerrarium: Reset Ecosystem` clears persisted state and re-syncs the webview.

## Current Status (March 6, 2026)

### Working

- Extension activation and command registration are in place.
- Transcript watching and JSONL event parsing are implemented.
- Extension/webview message bridge is implemented with typed message guards.
- Webview scene loop, creature state updates, weather/flora/day-night systems, and HUD rendering are implemented.
- Creature stats persistence to workspace `.codeterrarium/stats.json` is implemented.
- Integration tests with `@vscode/test-electron` now cover activation lifecycle and webview messaging.
- VSIX packaging footprint has been tightened by excluding non-runtime files (`.vscode`, sourcemaps, test artifacts) and slimming the bundled Phaser runtime path.
- Quality checks currently pass:
  - `npm run typecheck`
  - `npm test`
  - `npm run test:integration`
  - `npm run build`
  - `npm run package`

### Known Gaps

- Webview bundle still triggers a large-file warning during packaging (`dist/webview/main.js`, Phaser-heavy runtime).

## Next Steps Checklist

- [x] Wire `codeterrarium.maxFps` into Phaser runtime (remove hardcoded FPS assumptions).
- [x] Wire `codeterrarium.weatherEnabled` to enable/disable weather system behavior.
- [x] Add adapter architecture for configurable agent transcript sources (beyond direct JSONL watcher parsing).
- [x] Implement `Tooltip` UI module and connect it to creature hover/selection state.
- [x] Replace placeholder generated textures with real sprite/tilemap/audio assets from `src/assets`.
- [x] Add integration tests with `@vscode/test-electron` for extension lifecycle and webview messaging.
- [x] Tighten VSIX packaging footprint and review ignored files.
- [x] Expand README with setup, configuration examples, transcript format examples, and troubleshooting.
- [ ] Add release checklist for versioning/changelog/package validation.

## Troubleshooting

### No creatures appear

- Verify `codeterrarium.agents` contains at least one valid agent object.
- Confirm `transcriptPath` is absolute and exists.
- Append a new JSON line to the transcript after opening the panel.

### Events are ignored

- Ensure each line is valid JSON (one object per line).
- Ensure action is one of the supported action aliases listed above.
- Ensure numeric fields (`bytesWritten`, `passed`, `failed`, `exitCode`) are numbers, not strings.

### Unknown adapter warning

- If `sourceAdapter` is unknown, CodeTerrarium falls back to `jsonl` and shows a warning.
- Set `sourceAdapter` to `jsonl` unless you have registered a custom adapter in extension code.

### Integration tests fail on first run

- Network access is required once to download the VS Code test binary.
- Re-run `npm run test:integration` after the initial download completes.

### Webview looks stale after config changes

- Run `CodeTerrarium: Open Terrarium` again.
- If needed, close the panel and reopen it to force a fresh `init` sync.
