# Contributing

Thanks for helping make HT Local LLM Marketplace easier to embed, fork, and operate privately.

## Development Setup

```powershell
npm install
npm run dev
```

The default studio runs on `http://127.0.0.1:3000`. The daemon starts at `http://127.0.0.1:3001` and slides upward if the port is occupied.

## Before Opening A Pull Request

```powershell
npm run check
npm test
npm run build
npm run pack:dry-run
npm run smoke:packages
```

Use `npm run release:check` when you want the full gate in one command.

## Change Guidelines

- Keep v1 customization scoped to config, tokens, labels, defaults, and feature toggles.
- Do not add a plugin or render-hook API without an issue describing the repeated integration need.
- Keep runtime/provider work modular in the daemon.
- Treat installer actions, delete plans, CORS, and filesystem paths as security-sensitive.
- Add screenshots for UI changes at desktop and 390px mobile widths.

## Pull Request Checklist

- Explain the user-facing behavior change.
- List verification commands and screenshots.
- Document new config, token, CLI, or environment options.
- Avoid unrelated refactors in the same PR.
