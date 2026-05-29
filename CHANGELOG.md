# Changelog

All notable changes will be documented here.

## 0.1.0 - Unreleased

### Added

- Local-first marketplace daemon, SDK, React UI, Web Component, CLI, and Studio app.
- `MarketplaceConfig` public customization API for branding, labels, display defaults, features, tokens, default query, storage namespace, theme, and API URL.
- Web Component attributes plus JSON `config` support.
- MIT license, package metadata, CI, docs, examples, and release checks.
- Package dry-run and external tarball smoke workflow.

### Security

- Local-origin API CORS guard with explicit configured-origin escape hatch.
- CORS-safe widget asset serving for cross-origin module-script embeds.
- Delete plans constrained to marketplace-owned files inside configured roots.
