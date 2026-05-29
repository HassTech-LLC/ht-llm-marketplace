## Summary

Describe the user-facing change and the package/app it affects.

## Verification

- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run pack:dry-run`
- [ ] `npm run smoke:packages`

## UI Evidence

Attach screenshots for visual changes:

- [ ] Desktop dark
- [ ] Desktop light
- [ ] 390px mobile
- [ ] Web Component embed, if affected

## Security And Privacy

- [ ] No new installer action runs without explicit user action.
- [ ] No daemon route expands CORS without documentation.
- [ ] Filesystem writes/deletes stay inside configured roots.
- [ ] New source/provider behavior is documented.
