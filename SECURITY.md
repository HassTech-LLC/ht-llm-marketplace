# Security Policy

## Supported Versions

The project is currently pre-1.0. Security fixes target the latest `main` branch and the newest npm package line once packages are published.

## Reporting A Vulnerability

Please open a private security advisory on GitHub when available. If the repository has not enabled private advisories yet, contact the maintainers directly before publishing exploit details.

Include:

- Affected package or route.
- Reproduction steps.
- Whether the issue requires a malicious model repository, local network access, or a local user action.
- Impact on filesystem access, runtime installation, model deletion, private inventory, or local service control.

## Security Boundaries

- The daemon is intended to bind to loopback by default.
- API CORS is limited to configured local origins unless `HT_MARKETPLACE_ALLOWED_ORIGINS=*` is explicitly set.
- Widget assets are publicly loadable by design so local apps can embed the Web Component module script.
- Delete execution is limited to marketplace-owned artifacts inside configured model/download roots.
- Runtime installation can invoke local package managers and should remain explicit user action.

See [`docs/security-privacy.md`](docs/security-privacy.md) for the current threat model and operational notes.
