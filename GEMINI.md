<!-- HASS_GRAPHIFY_AGENT_START -->
## Hasstechapi Obsidian + Graphify Autouse

This project is registered in the HassTech Graphify control repo.

- Project key: `ht-llm-marketplace`
- Membership: `hass-tech`
- Master project: `hasstechapi`
- Graphify control repo: `C:\Users\Owner\Desktop\graphify`

Before meaningful Gemini work in this project, load the project memory:

```powershell
rtk python C:\Users\Owner\.codex\skills\obsidian-vault\scripts\obsidian_vault.py ensure-project --cwd .
rtk python C:\Users\Owner\.codex\skills\obsidian-vault\scripts\obsidian_vault.py project-context --cwd .
```

For Gemini CLI sessions, confirm this project context is actually loaded:

```text
/memory show
```

If this managed block or the project rules are missing, reload and pin the file:

```text
/memory reload
@GEMINI.md
```


Use Graphify from the control repo for project-wide orientation and source-map planning:

```powershell
Push-Location C:\Users\Owner\Desktop\graphify
python -m hass_graphify status --project ht-llm-marketplace
python -m hass_graphify plan --project ht-llm-marketplace
Pop-Location
```

Only build Graphify artifacts when they are useful for the current task:

```powershell
Push-Location C:\Users\Owner\Desktop\graphify
python -m hass_graphify build --project ht-llm-marketplace
Pop-Location
```

After meaningful work, append durable project memory:

```powershell
rtk python C:\Users\Owner\.codex\skills\obsidian-vault\scripts\obsidian_vault.py project-log --cwd . --summary "Short result" --details "Verification and important context"
```

If this folder is not the expected project or ownership is unclear, stop and ask Hassan whether it is part of `Hasstechapi` or separate before registering it with `python -m hass_graphify onboard`.
<!-- HASS_GRAPHIFY_AGENT_END -->
