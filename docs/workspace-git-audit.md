# HassTech Workstation: Git Repositories Audit & Cleanup Guide
*Date: June 2, 2026* | *Environment: Windows Desktop / Local Workspaces*

This audit scanned all local directories on your Desktop (`C:\Users\Owner\Desktop`) and nested project directories (`C:\Users\Owner\Desktop\Projects`) up to two levels deep, discovering **48 total Git repositories**.

---

## 🛑 1. Critical Redundant Duplicates (Immediate Cleanup Action)

These directories are identical duplicate checkouts pointing to the same remote origin. You can safely remove the duplicates to recover disk space and avoid operational confusion.

| Repository Name | Local Directory Path | Remote Origin URL | Last Commit Date | Action Recommendation |
| --- | --- | --- | --- | --- |
| **HTllmMarketplace** | `C:\Users\Owner\Desktop\HTllmMarketplace` | `ht-llm-marketplace.git` | Jun 2, 2026 | 🔴 **Delete** (Keep active: `Desktop\HT llm Markteplace`) |
| **Mobile LLM Studio** | `C:\Users\Owner\Desktop\Mobile LLM Studio` | `reroute-mobile-core.git` | May 12, 2026 | 🔴 **Delete** (Keep active: `Desktop\Projects\Mobile LLM Studio`) |
| **resume-site** | `C:\Users\Owner\Desktop\Projects\resume-site` | `resume-site.git` | Apr 24, 2026 | 🔴 **Delete** (Keep active: `Desktop\Projects\HT Resume`) |

---

## 🗃️ 2. Redundant Portfolio Sub-Folders (`C:\Users\Owner\Desktop\Projects\portfolio project\`)

The `portfolio project` directory contains older duplicate mappings of your active primary repositories, originally structured for documentation. We recommend backing up any uncommitted files in these directories and **deleting the entire sub-folder** to clean up the workspace.

| Portfolio Duplicate | Remote Origin URL | Status | Last Commit Msg / Date | Action Recommendation |
| --- | --- | --- | --- | --- |
| **hasstech-site** | `hasstech-site.git` | Dirty | "docs: add snippet markdown" (5 weeks ago) | 🔴 **Delete** (Use primary: `Projects\hasstech-site`) |
| **hasstech-api** | `hasstech-api.git` | Dirty | "docs: add premium hero banner to README" (5 weeks ago) | 🔴 **Delete** (Use primary: `Projects\HassTech API`) |
| **hasstechapi-contact-worker** | `hasstechapi-contact-worker.git` | Clean | "docs: add premium hero banner to README" (5 weeks ago) | 🔴 **Delete** (Use primary: `Projects\hasstechapi-contact-worker`) |
| **ht-calc-login-version-** | `ht-calc-login-version-.git` | Dirty | "docs: Regenerated 3D isometric hero banner..." (5 weeks ago) | 🔴 **Delete** (Use primary: `Projects\HT calc - antigravity`) |
| **ht-career** | `ht-career.git` | Dirty | "docs: add snippet markdown" (5 weeks ago) | 🔴 **Delete** (Use primary: `Projects\HT Career`) |
| **ht-meter** | `ht-meter.git` | Clean | "docs: add premium hero banner to README" (5 weeks ago) | 🔴 **Delete** (Use primary: `Projects\HT Meter`) |
| **htpdf-api** | `htpdf-api.git` | Clean | "docs: add premium hero banner to README" (5 weeks ago) | 🔴 **Delete** (Use primary: `Projects\htpdf`) |
| **LLM-Studio** | `LLM-Studio.git` | Dirty | "docs: add premium hero banner to README" (5 weeks ago) | 🔴 **Delete** (Use primary: `Projects\llm studio`) |
| **reroute-mobile-core** | `reroute-mobile-core.git` | Clean | "docs: add premium hero banner to README" (5 weeks ago) | 🔴 **Delete** (Use primary: `Projects\Mobile LLM Studio`) |
| **resume-site** | `resume-site.git` | Clean | "docs: add premium hero banner to README" (5 weeks ago) | 🔴 **Delete** (Use primary: `Projects\HT Resume`) |

---

## 🗑️ 3. Stale Branch Workspaces & Experiments (Review & Remove)

These local-only folders contain checkouts of specific feature branches or local next-app templates. If their features have been merged into your main repositories, they should be deleted.

| Repository | Directory Path | Remote | Last Commit | Status | Action Recommendation |
| --- | --- | --- | --- | --- | --- |
| **HT calc-ip-protection-free-plan** | `Projects\HT calc-ip-protection-free-plan` | None | None | Clean | 🟡 **Delete** (Old branch checkout workspace) |
| **HT calc-rate-card-hide-series-id** | `Projects\HT calc-rate-card-hide-series-id` | None | None | Clean | 🟡 **Delete** (Old branch checkout workspace) |
| **HT calc-sound-toggle-visible** | `Projects\HT calc-sound-toggle-visible` | None | None | Clean | 🟡 **Delete** (Old branch checkout workspace) |
| **master desktop code\antigravity-orchestrator** | `Projects\master desktop code\antigravity-orchestrator` | None | "Initial commit from Create Next App" (7 weeks ago) | Dirty | 🟡 **Delete** (Merge any loose next-app layout code first) |
| **portfolio project\ai-vault** | `Projects\portfolio project\ai-vault` | None | "Initial commit from Create Next App" (5 weeks ago) | Dirty | 🟡 **Delete** (Safe to remove if empty / unused) |
| **portfolio project\fractal-mcp** | `Projects\portfolio project\fractal-mcp` | None | None | Dirty | 🟡 **Delete** (Empty local sandbox) |

---

## 🛡️ 4. Active Primary Core Repositories (MUST KEEP)

These are your highly active, primary production platforms. Do **NOT** delete these directories.

| Repository Name | Local Directory Path | Remote Origin URL | Last Commit Details | Status |
| --- | --- | --- | --- | --- |
| **HT llm Markteplace** | `Desktop\HT llm Markteplace` | `ht-llm-marketplace.git` | **22 min ago** - "docs: reorganize E2E proofs..." | 🟢 **Keep (Active)** |
| **ht studio** | `Desktop\ht studio` | `ht-studio.git` | **14 hours ago** - "fix: implement fail-safe..." | 🟢 **Keep (Active)** |
| **HT calc** | `Desktop\HT calc` | `HT-Calc.git` | **5 days ago** - "feat(layout): enable floating calculator..." | 🟢 **Keep (Active)** |
| **ht- llm research** | `Desktop\ht- llm research` | `ht-llm-research.git` | **6 days ago** - "docs: update project memory..." | 🟢 **Keep (Active)** |
| **Mobile LLM Studio** | `Projects\Mobile LLM Studio` | `reroute-mobile-core.git` | **3 weeks ago** - "feat: frutiger aero appearance..." | 🟢 **Keep (Active)** |
| **HT calc - antigravity** | `Projects\HT calc - antigravity` | `ht-calc-login-version-.git` | **8 weeks ago** - "Add Capacitor iOS shell..." | 🟢 **Keep (Active)** |
| **HT Career** | `Projects\HT Career` | `ht-career.git` | **4 weeks ago** - "feat(middleware): redirect resume..." | 🟢 **Keep (Active)** |
| **HT Folio** | `Projects\HT Folio` | `ht-folio.git` | **4 weeks ago** - "feat: deepen portfolio..." | 🟢 **Keep (Active)** |
| **HT Resume** | `Projects\HT Resume` | `ht-resume.git` | **4 weeks ago** - "fix(ats-panel): show Match Score..." | 🟢 **Keep (Active)** |
| **HT Meter** | `Projects\HT Meter` | `ht-meter.git` | **5 weeks ago** - "feat(polish): cmdk, onboarding, docs" | 🟢 **Keep (Active)** |
| **HT sync** | `Projects\HT sync` | `ai-collaboration-operating-room.git` | **3 weeks ago** - "Add production hardening" | 🟢 **Keep (Active)** |
| **htpdf** | `Projects\htpdf` | `htpdf-api.git` | **8 weeks ago** - "ci: add GitHub Actions Workers deploy" | 🟢 **Keep (Active)** |
| **llm studio** | `Projects\llm studio` | `LLM-Studio.git` | **6 weeks ago** - "Clean up project: remove 1.4GB..." | 🟢 **Keep (Active)** |

---

## 🔬 5. Local Research & Development Sandboxes (KEEP)

These directories contain critical locally compiled tools, IDE environments, and research engines.

| Repository Name | Local Directory Path | Remote URL | Last Commit Details | Status |
| --- | --- | --- | --- | --- |
| **research team** | `Desktop\research team` | *Local Only* | **2 days ago** - "Implement audit convergence engine" | 🟢 **Keep** |
| **Ultra IDE\repo** | `Projects\Ultra IDE\repo` | *Local Only* | **3 weeks ago** - "v0.2.0-alpha.4: REPL boot banner..." | 🟢 **Keep** |
| **Super plan** | `Projects\Super plan` | *Local Only* | **3 weeks ago** - "fix: harden upc self audit release gates" | 🟢 **Keep** |
| **ai build** | `Desktop\ai build` | *Local Only* | **12 days ago** - "Initial commit from Specify template" | 🟢 **Keep** |

---

## 🔌 6. External Forks & Dependency Clones (KEEP)

These are clones of open-source frameworks or dependency configurations. Do not delete them unless you no longer require them for references or local builds.

| Repository | Directory Path | Remote URL | Last Commit Details |
| --- | --- | --- | --- |
| **hermes-agent** | `Projects\Hermes agent\hermes-agent` | `NousResearch/hermes-agent.git` | **3 weeks ago** - Feat video gen provider (#25126) |
| **open-webui** | `Projects\Hermes agent\open-webui` | `open-webui/open-webui.git` | **3 weeks ago** - Merge pull request #24492 |
| **litellm** | `Projects\Hermes agent\litellm` | `BerriAI/litellm.git` | **3 weeks ago** - Fix fireworks strip thinking (#27881) |
| **vllm** | `Projects\Hermes agent\vllm` | `vllm-project/vllm.git` | **3 weeks ago** - skywork max transformers (#42104) |
| **mcp-servers** | `Projects\Hermes agent\mcp-servers` | `modelcontextprotocol/servers.git` | **3 weeks ago** - Upgrade zod-v4 (#4136) |
| **hermes-webui** | `Projects\Hermes agent\hermes-webui` | `nesquena/hermes-webui.git` | **3 weeks ago** - Stage-350 merge |
| **openclaw** | `Projects\openclaw` | `openclaw/openclaw.git` | **3 months ago** - Failover errno patterns (#42830) |
| **deerflow** | `Projects\deerflow` | `bytedance/deer-flow` | **8 weeks ago** - Feishu receive file (#1608) |
| **SadTalker** | `Projects\SadTalker` | `OpenTalker/SadTalker.git` | **2 years ago** - Update colab (Safe to remove if unused) |
