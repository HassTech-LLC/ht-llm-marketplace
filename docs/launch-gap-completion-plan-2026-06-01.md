# Launch Gap Completion Plan

This plan closes the remaining gaps after the marketplace launch-polish pass. It keeps the current architecture intact: CLI, daemon, SDK, React embed, Web Component embed, and full Studio remain separate surfaces with the Studio path as the peak runtime option.

## Current Baseline

Already verified locally:

- `npm run release:check`
- `npm ci --prefix apps/desktop`
- `npm run smoke:studio`
- `npm run smoke:installer`
- `npm run check:artifacts`

Known remaining caveat:

- `npm run smoke:docker` skips on this machine because Docker CLI is unavailable.

## Completion Tools

The repo now has executable tools for each remaining track:

| Gap | Tool |
| --- | --- |
| Docker proof | `npm run smoke:docker:required` |
| Full release preflight | `npm run release:preflight` |
| CI-grade release preflight | `npm run release:preflight:ci` |
| Publish package shape without publishing | `npm run publish:dry-run` |
| External clean-room install validation | `npm run smoke:consumer` |
| Remote workflow observation | `npm run ci:status` |
| Local release tarball bundle | `npm run bundle:local` |

`release:preflight:ci` is designed for Docker-capable CI runners. It makes Docker proof mandatory there, while local `release:preflight` keeps Docker optional for machines without Docker.

## Track 1: Docker Proof

Goal: prove the Docker install path on a Docker-capable runner instead of treating it as locally assumed.

Tasks:

- Add a Docker-capable CI job or confirm the existing GitHub runner can execute `npm run smoke:docker`.
- Make Docker smoke fail only when Docker is expected, while still skipping cleanly on machines without Docker.
- Capture the container health endpoint, image build result, and daemon startup output in CI logs.
- Document Docker as "optional locally, proven in CI" once the runner passes.

Acceptance:

- GitHub Actions shows a passing Docker smoke on the launch branch.
- `docs/open-source.md` and `RELEASE.md` say where Docker is proven.
- `npm run smoke:docker:required` fails if Docker is missing on a machine where Docker proof is expected.

## Track 2: Publish And Release Distribution

Goal: make external installation real, not only local tarball based.

Tasks:

- Choose the release channel for v0.1.0: npm public publish, GitHub release bundles, or both.
- Add a release workflow that runs `npm run release:check` before publishing or attaching artifacts.
- Generate local bundle artifacts with `npm run bundle:local` for pre-npm testers.
- Add package provenance or npm token setup notes without committing secrets.
- Confirm package names and dependency versions before publish.

Acceptance:

- A clean external folder can install from npm or from a GitHub release bundle.
- Release notes include exact verification commands and generated docs screenshots.
- No generated tarballs remain tracked in the repo.
- `npm run publish:dry-run` passes before any real publish attempt.

## Track 3: Remote CI Observation

Goal: prove the current local gates pass in the real remote CI environment.

Tasks:

- Push the launch-polish branch.
- Watch the full GitHub Actions run for `release:check`, Studio smoke, installer smoke, and Docker smoke.
- Fix any Linux-only, browser-dependency, package-lock, or path-casing issues.
- Record the passing workflow URL in the release checklist.

Acceptance:

- The launch branch has a passing remote CI run after the latest marketplace changes.
- Any local-only assumptions discovered by CI are either fixed or documented as host-specific.
- `npm run ci:status` can retrieve recent workflow runs once GitHub CLI is authenticated.

## Track 4: Runnable Universal Templates

Goal: upgrade the most important framework snippets into copyable clean-room templates without bloating the repo.

Tasks:

- Keep snippets for every target, but promote representative targets into runnable templates:
  - `node-terminal`
  - `plain-html`
  - `python`
  - one server-rendered web framework
  - one desktop shell
  - one IDE or agent extension surface
- Add minimal manifests only where they can be validated cheaply.
- Extend `smoke:universal` to run cheap template checks without installing heavy framework dependencies.
- Keep heavy framework full-app tests optional or template-only until publish.

Acceptance:

- `examples/universal/README.md` labels each target as runnable starter or snippet.
- `smoke:universal` proves at least one terminal/API template and one embed template.
- The docs no longer overstate snippet-only examples as full applications.

## Track 5: External Clean-Room Consumer Validation

Goal: prove a real consuming project can use the marketplace from scratch.

Tasks:

- Create a temporary consumer folder outside the repo.
- Install either published packages or the generated local bundle.
- Run:

```powershell
npx htlm init --target auto
npx htlm targets
npx htlm status
```

- Validate a plain HTML embed against a started daemon.
- Validate a Node terminal call against the daemon or fake OpenAI-compatible endpoint.
- Delete the temporary consumer folder after recording output.

Acceptance:

- A clean external project can install, initialize, and call the marketplace without referencing repo internals.
- Any required environment variables are documented in `docs/universal-integration.md`.
- `npm run smoke:consumer` passes from a temporary folder outside the repo.

## Execution Order

1. Remote CI observation, because it will reveal host-specific issues early.
2. Docker proof, because it depends on CI or another Docker-capable host.
3. External clean-room consumer validation using the current local bundle.
4. Publish/release distribution workflow.
5. Broader runnable templates after the distribution path is stable.

Practical command sequence:

```powershell
npm run release:preflight
npm run publish:dry-run
npm run bundle:local
```

On a Docker-capable CI runner:

```powershell
npm run release:preflight:ci
```

## Completion Definition

The gaps are closed when:

- Remote CI is green on the latest branch.
- Docker is either proven in CI or explicitly documented as unsupported for the release.
- An external clean-room project installs from a release channel and runs the CLI/API path.
- The release checklist links to the passing CI run and clean-room validation output.
- Universal docs distinguish runnable starters from snippets accurately.
