# AGENTS.md

## Project Overview
This is "CodeOrbit" — a VS Code extension that renders a living pixel-art station/ecosystem in a webview panel. Each AI coding agent (Claude Code, Copilot, Codex, etc.) is represented as a CrewUnit whose behavior maps to the agent's real-time activity, read from JSONL transcript files or configurable adapters.

## Tech Stack
- **Language:** TypeScript (strict mode)
- **Runtime:** VS Code Extension API (vscode ^1.96.0)
- **Rendering:** Phaser 3 (pixelArt: true) inside a VS Code webview panel
- **State:** Lightweight in-memory store; persist CrewUnit stats to workspace `.codeorbit/` as JSON
- **Build:** esbuild for extension bundling; Vite for webview dev
- **Tests:** Vitest for unit tests; @vscode/test-electron for integration
- **Linting:** ESLint flat config + Prettier

## Architecture
src/
extension/ # VS Code extension host code
activate.ts # extension entry, register commands & providers
agentWatcher.ts # FSWatcher on JSONL transcript dirs
parser.ts # parse transcript events → AgentEvent union type
bridge.ts # postMessage bridge: extension ↔ webview
webview/ # Phaser game (runs inside webview iframe)
main.ts # Phaser Game bootstrap
scenes/
StationScene.ts # main gameplay scene
BootScene.ts # asset preload
entities/
CrewUnit.ts # base CrewUnit class (sprite, state machine, stats)
CrewFactory.ts # spawn CrewUnit from AgentConfig
environment/
StationAlerts.ts # alert overlay system driven by CI/project health
StationInfrastructure.ts # station modules that respond to codebase metrics
OrbitalCycle.ts # orbital cycle synced to local time
ui/
HUD.ts # overlay: CrewUnit names, status icons
Tooltip.ts # hover info panel
state/
StationState.ts # central state store (agents, environment, time)
shared/
types.ts # shared types between extension & webview
constants.ts # tunable constants (speeds, thresholds, colors)
assets/
sprites/ # 16×16 and 32×32 pixel art spritesheets
tilemaps/ # Tiled JSON tilemaps for station background
audio/ # optional ambient station SFX

text

## Coding Conventions
- Pure functions preferred; side effects only at boundaries (bridge, FS, vscode API)
- All public functions and types must have JSDoc comments
- State machine for CrewUnit behavior: Standby → Scanning → Repairing → Docked → Alert
- Use discriminated unions for message types between extension and webview
- Sprite assets: 16×16 base tiles, 32×32 CrewUnits, PNG with transparency
- No `any` types; no `as unknown as`; use proper generics and guards

## Agent Event Mapping
| Agent Action         | CrewUnit Behavior         | Environment Effect          |
|----------------------|---------------------------|-----------------------------|
| Reading files        | Scanning consoles         | Light scanner sweep         |
| Writing code         | Repairing modules         | Module nodes light up       |
| Running tests        | Alert / diagnostics       | Alert line sweep            |
| Tests passing        | Celebration animation     | Cool power glow             |
| Tests failing        | Damaged animation         | Red alarm strobes           |
| Bash/terminal cmd    | Rapid movement            | Console flicker             |
| Idle / waiting       | Docked / standby          | Ambient station drift       |
| Error / crash        | Damaged + limping         | Critical alarm              |
| Task complete        | Celebration + XP gain     | Jump-lane arc               |
| Asking for input     | Comms beacon + request    | Persistent input indicator  |

## Commands (package.json contributions)
- `codeorbit.open` — Open Station panel
- `codeorbit.addAgent` — Configure a new agent transcript source
- `codeorbit.resetEcosystem` — Reset station to default state

## Key Constraints
- Extension must activate lazily (onCommand activation event)
- Webview must work offline (bundle Phaser, no CDN)
- JSONL parsing must be non-blocking (stream with readline, not slurp)
- Keep webview render ≤ 30fps to stay lightweight
- Support watching multiple transcript directories simultaneously
- All CrewUnit stats persist across VS Code restarts via workspace storage
