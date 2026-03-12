# CodeOrbit

CodeOrbit is a VS Code extension that visualizes AI coding agents as crew units moving through a pixel-art space station.

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
   - `CodeOrbit: Add Agent` (configure at least one transcript source)
   - `CodeOrbit: Open Station`
   - Hover any spacecraft to inspect live `NOW` activity, last event age, and stream source details.
   - Or inside the station HUD, use `+ ADD AGENT` (or press `N`) to trigger the same VS Code/Cursor add-agent flow.
   - In Cursor, when `codeorbit.cursorNativeAddAgentBridge.enabled` is `true`, CodeOrbit mirrors active Cursor agent chats as runtime-only agents (named from Cursor composer names) using `~/.cursor/projects/<workspace>/agent-transcripts/<composerId>/<composerId>.jsonl`.

## Configuration

CodeOrbit reads settings from the `codeorbit` namespace in workspace settings.

### Settings Reference

- `codeorbit.maxFps` (`number`, default `30`, min `1`, max `30`)
- `codeorbit.stationEffectsEnabled` (`boolean`, default `true`)
- `codeorbit.audioEnabled` (`boolean`, default `true`)
- `codeorbit.simulationSpeed` (`number`, default `1`, enum: `0.75 | 1 | 1.25`)
- `codeorbit.localMetrics.enabled` (`boolean`, default `true`)
- `codeorbit.localMetrics.pollMs` (`number`, default `20000`, min `5000`)
- `codeorbit.agents` (`AgentConfig[]`, default `[]`)
- `codeorbit.cursorNativeAddAgentBridge.enabled` (`boolean`, default `true`)
- `codeorbit.cursorNativeAddAgentBridge.commandIds` (`string[]`, default includes Cursor agent/composer new commands)
- `codeorbit.cursorNativeAddAgentBridge.cooldownMs` (`number`, default `1200`, min `250`)
- `codeorbit.cursorNativeAddAgentBridge.storageFallbackEnabled` (`boolean`, default `true`)
- `codeorbit.cursorNativeAddAgentBridge.storageFallbackPollMs` (`number`, default `1000`, min `500`)

Deep sync note: storage fallback reads Cursor `state.vscdb` via the `sqlite3` CLI (when available) to mirror open `unifiedMode: "agent"` composers (selected/focused), with fallback to non-archived agent composers when open-state ids are unavailable.

Each agent entry supports:

- `id` (required): stable agent id
- `name` (required): display name
- `transcriptPath` (required): absolute file or directory path
- `crewRole` (required): `engineer` | `pilot` | `analyst` | `security`
- `sourceAdapter` (optional): adapter id, defaults to `jsonl`
- `color` (optional): hex tint override

### Example `settings.json`

```json
{
  "codeorbit.maxFps": 24,
  "codeorbit.stationEffectsEnabled": true,
  "codeorbit.audioEnabled": true,
  "codeorbit.simulationSpeed": 1,
  "codeorbit.localMetrics.enabled": true,
  "codeorbit.localMetrics.pollMs": 20000,
  "codeorbit.cursorNativeAddAgentBridge.enabled": true,
  "codeorbit.cursorNativeAddAgentBridge.commandIds": [
    "glass.newAgent",
    "composer.newAgentChat",
    "composer.createNew",
    "composer.createNewComposerTab"
  ],
  "codeorbit.cursorNativeAddAgentBridge.cooldownMs": 1200,
  "codeorbit.cursorNativeAddAgentBridge.storageFallbackEnabled": true,
  "codeorbit.cursorNativeAddAgentBridge.storageFallbackPollMs": 1000,
  "codeorbit.agents": [
    {
      "id": "codex",
      "name": "Codex",
      "sourceAdapter": "jsonl",
      "transcriptPath": "/absolute/path/to/transcripts/codex.jsonl",
      "crewRole": "engineer",
      "color": "#3CC6FF"
    },
    {
      "id": "copilot",
      "name": "Copilot",
      "transcriptPath": "/absolute/path/to/transcripts",
      "crewRole": "analyst"
    }
  ]
}
```

## Transcript Format (JSONL)

The built-in `jsonl` adapter expects newline-delimited JSON, one event object per line.

Cursor `agent-transcripts/*.jsonl` message records are also supported. CodeOrbit infers activity actions (including `input_request`) from `role: "assistant"` message content when explicit `action`/`kind` fields are not present.

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
- `input_request` / `needs_input` / `ask_input` / `blocked`

### Example Transcript Lines

```json
{"action":"read","agentId":"codex","path":"src/extension/activate.ts","ts":"2026-03-06T11:00:00Z"}
{"action":"write","agentId":"codex","path":"src/webview/scenes/StationScene.ts","bytesWritten":481,"ts":1741258861}
{"action":"test_run","agentId":"copilot","suite":"unit","timestamp":1741258865123}
{"action":"test_pass","agentId":"copilot","passed":26,"metadata":{"command":"npm test"}}
{"action":"input_request","agentId":"codex","prompt":"Need approval for production deploy target"}
{"action":"complete","agentId":"codex","taskId":"station-pivot"}
```

### File/Directory Watching Behavior

- If `transcriptPath` points to a file, CodeOrbit watches appended lines in that file.
- If `transcriptPath` points to a directory, `*.jsonl` files are discovered recursively.
- Existing content is treated as historical baseline; visuals update from newly appended events.

## Commands

- `CodeOrbit: Open Station`
- `CodeOrbit: Add Agent`
- `CodeOrbit: Reset Ecosystem`
- `CodeOrbit: Toggle Station Effects`
- `CodeOrbit: Toggle Ambient Audio`
- `CodeOrbit: Cycle Simulation Speed`

## Development Commands

- `npm run typecheck` - strict TypeScript checks
- `npm test` - Vitest unit tests
- `npm run test:integration` - `@vscode/test-electron` lifecycle/messaging tests
- `npm run build` - production extension + webview build
- `npm run package` - create VSIX package
- `npm run release:validate` - verify `package.json` version and `CHANGELOG.md` version alignment
- `npm run release:check` - run full release gate (validation, tests, build, package, VSIX filename check)

## Release Checklist

- [ ] Bump `version` in `package.json` using semver.
- [ ] Add a matching `## <version>` section at the top of `CHANGELOG.md`.
- [ ] Run `npm run release:validate`.
- [ ] (Optional but recommended) Run `npm run test:integration` in a GUI-capable environment.
- [ ] Run `npm run release:check`.
- [ ] Confirm the generated VSIX filename matches `codeorbit-<version>.vsix`.

## Persistence

- Crew state is stored per workspace at `.codeorbit/stats.json`.
- `CodeOrbit: Reset Ecosystem` clears persisted state and re-syncs the webview.
