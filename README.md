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

## Configuration

CodeOrbit reads settings from the `codeorbit` namespace in workspace settings.

### Settings Reference

- `codeorbit.maxFps` (`number`, default `30`, min `1`, max `30`)
- `codeorbit.stationEffectsEnabled` (`boolean`, default `true`)
- `codeorbit.agents` (`AgentConfig[]`, default `[]`)

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
- If `transcriptPath` points to a directory, only `*.jsonl` files are watched.
- Existing content is treated as historical baseline; visuals update from newly appended events.

## Commands

- `CodeOrbit: Open Station`
- `CodeOrbit: Add Agent`
- `CodeOrbit: Reset Ecosystem`

## Development Commands

- `npm run typecheck` - strict TypeScript checks
- `npm test` - Vitest unit tests
- `npm run test:integration` - `@vscode/test-electron` lifecycle/messaging tests
- `npm run build` - production extension + webview build
- `npm run package` - create VSIX package

## Persistence

- Crew state is stored per workspace at `.codeorbit/stats.json`.
- `CodeOrbit: Reset Ecosystem` clears persisted state and re-syncs the webview.
