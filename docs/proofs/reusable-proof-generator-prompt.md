# Reusable Proof Generator Prompt

Date: 2026-06-02

Use this prompt when another repository needs public proof assets for a README, resume, client proposal, or funding submission.

````markdown
You are a coding assistant working inside a software repository. Build a compact proof asset set grounded in the real app, terminal surface, and verification commands.

## Step 1: Discover the product surface

1. Identify the main UI, CLI, daemon/API, database, and package surfaces.
2. Read existing scripts before adding new ones.
3. Run the smallest verification command that proves the app can start or the CLI can respond.

## Step 2: Capture visual proof

If the project has a web UI, use Playwright or the repo's existing browser smoke script.

Capture canonical media under `docs/assets/`:

- `[project-name]-desktop.png`
- `[project-name]-advanced.png`
- `[project-name]-mobile.png`
- `[project-name]-demo.webm`

Use a desktop viewport around `1366x900`, a mobile viewport around `390x844`, and record at least one meaningful interaction path. Check that there are no console errors, failed requests, bad responses, or horizontal overflow.

## Step 3: Capture terminal proof

Run real terminal commands and save a concise transcript under `docs/proofs/terminal-logs/`, using `.txt` instead of `.log` if the repo ignores logs.

Include commands that show:

- available targets or commands,
- initialization or setup flow,
- status/doctor output when a daemon exists,
- one lifecycle command if it is safe to run.

## Step 4: Capture reusable snippets

Place non-binary proof material under `docs/proofs/`:

```text
docs/proofs/
  terminal-logs/
    cli-usability-transcript.txt
    verification-summary.txt
  code-snippets/
    embed-snippet-react.tsx
    embed-snippet-vanilla.html
    db-schema.sql
  text-narratives/
    security-and-privacy.md
    technical-innovation-and-merit.md
    business-value-and-democratization.md
```

Do not duplicate screenshots or videos under `docs/proofs/`. Link to `docs/assets/` from the README, docs index, funding dossier, and proof audit so the repo stays small.

## Step 5: Verify and report

Run the repo's docs smoke or release gate after generating assets. Report exact commands, exact asset paths, and any remaining gaps. Do not claim release readiness unless the release gate passed in the current run.
````
