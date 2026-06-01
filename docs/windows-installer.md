# Windows Installer

## Build

Run `npm run desktop:build` on Windows after the normal daemon and Studio build is green.

## Storage

Models remain in the configured daemon model directory. The installer must not delete model files during app uninstall unless the user explicitly chooses to remove local model storage.

## Uninstall

The uninstall flow removes app binaries, desktop shell settings, and background shortcuts. It leaves marketplace-owned model artifacts in place by default and documents the storage path before removal.

## Migration

If the model directory changes, run `htlm doctor` and `htlm list` before moving files. Move only artifacts returned by daemon inventory or delete-plan evidence.
