# Customization

HT Local LLM Marketplace v1 is intentionally a tokens-and-config embed. Teams can change branding, copy, colors, feature visibility, defaults, and storage namespacing without committing to a plugin API.

## React Config

See `examples/react-embed` for a minimal React embed and `examples/enterprise-white-label` for a larger branded preset.

For a project-specific starting point:

Run this after installing the CLI from the local release bundle or published package.

```powershell
npx htlm init --target react
```

Use `--target vite` or `--target next` when you want the printed snippet to match those host expectations. Next.js hosts should render the marketplace from a client component because it uses browser storage and a local daemon endpoint.

```tsx
import { ModelMarketplace, type MarketplaceConfig } from "@ht-llm-marketplace/react";
import "@ht-llm-marketplace/react/styles.css";

const marketplaceConfig: MarketplaceConfig = {
  apiUrl: "http://127.0.0.1:3001",
  theme: "system",
  branding: {
    name: "Acme Model Hub",
    tagline: "Approved local models",
    mark: "AM"
  },
  defaultQuery: "qwen coder",
  storageKey: "acme_model_hub",
  tokens: {
    "--ht-cyan": "#0ea5e9",
    "--ht-green": "#16a34a",
    "--ht-bg": "#0b1020",
    "--ht-panel": "#111827"
  },
  features: {
    doctor: false,
    settings: false
  },
  labels: {
    nav: {
      discover: "Models",
      downloads: "Queue"
    },
    buttons: {
      search: "Find models"
    }
  }
};

export function App() {
  return <ModelMarketplace config={marketplaceConfig} />;
}
```

Existing props still work:

```tsx
<ModelMarketplace apiUrl="http://127.0.0.1:3001" compact />
```

## Web Component

See `examples/minimal-widget` for the smallest embed and `examples/plain-html` for a styled host page.

For any non-React project, start with:

Run this after installing the CLI from the local release bundle or published package.

```powershell
npx htlm init --target html
```

That path is the portable default for static HTML, Astro, Rails, Django, Laravel, Phoenix, ASP.NET, CMS templates, and any host that can render a custom element and load a module script.

Use simple attributes for common embed changes:

```html
<script type="module" src="http://127.0.0.1:3001/widget/ht-model-marketplace.js"></script>

<ht-model-marketplace
  api-url="http://127.0.0.1:3001"
  theme="system"
  brand-name="Acme Model Hub"
  brand-tagline="Approved local models"
  brand-mark="AM"
  accent-color="#0ea5e9"
  default-query="qwen coder"
></ht-model-marketplace>
```

Serve plain HTML examples from a local HTTP origin such as `http://127.0.0.1:3009`. Direct `file://` pages can load the widget script, but the daemon API intentionally only allows browser calls from local HTTP origins or configured origins.

Use the `config` attribute for advanced options:

```html
<ht-model-marketplace
  api-url="http://127.0.0.1:3001"
  config='{"features":{"doctor":false,"settings":false},"labels":{"buttons":{"search":"Find"}}}'
></ht-model-marketplace>
```

Invalid JSON logs a warning and falls back safely. Attributes override matching fields inside `config`.

## Themes And Tokens

`theme` accepts `dark`, `light`, or `system`. Tokens are applied as CSS variables on the root `.ht-marketplace` element. Token names can be supplied as `--ht-cyan`, `ht-cyan`, or `cyan`; they normalize to CSS custom properties.

Common tokens:

| Token | Purpose |
| --- | --- |
| `--ht-bg` | App background |
| `--ht-panel` | Main panel background |
| `--ht-panel-2` | Secondary surface background |
| `--ht-line` | Borders and dividers |
| `--ht-text` | Primary text |
| `--ht-muted` | Secondary text |
| `--ht-cyan` | Primary accent |
| `--ht-green` | Success accent |
| `--ht-gold` | Warning/accent badges |
| `--ht-red` | Destructive/warning state |
| `--ht-sidebar-bg` | Sidebar surface |
| `--ht-input-bg` | Search and input surface |
| `--ht-filter-bg` | Filter controls |
| `--ht-control-bg` | Generic controls |
| `--ht-btn-primary-bg` | Primary button background |
| `--ht-btn-primary-text` | Primary button text |

For Web Component embeds, host-level CSS variables still work and override the theme/accent values:

```css
ht-model-marketplace {
  --ht-cyan: #7c3aed;
  --ht-panel: #ffffff;
  --ht-text: #111827;
}
```

## Branding

Branding controls the sidebar identity:

```ts
branding: {
  name: "Acme Model Hub",
  tagline: "Approved local models",
  mark: "AM"
}
```

The mark should be short because it is rendered inside a compact square.

## Display Controls

Display options control visual density and can be namespaced per host app:

```ts
display: {
  showLogos: true,
  showDescriptions: false,
  showBadges: true,
  showSpecs: true,
  downloadMode: "simple"
},
storageKey: "acme_model_hub"
```

`downloadMode` defaults to `simple`, which shows one recommended GGUF artifact in the download panel. If the only available choices are too heavy for the scanned GPU or cannot be scored confidently, Simple mode blocks the direct install action and asks the user to review Advanced options. Set it to `advanced` when your audience needs the full quantization matrix and every file variant visible by default.

Multipart GGUF repos are grouped as complete artifacts in both modes. Advanced mode should show one selectable artifact per quantization group, not individual `00001-of-00003` shards.

The marketplace stores display preferences as `${storageKey}:showLogos`, `${storageKey}:showDescriptions`, `${storageKey}:showBadges`, `${storageKey}:showSpecs`, and `${storageKey}:downloadMode`.

## Feature Toggles

Feature toggles hide top-level views, the persistent compatibility rail, and selected actions:

```ts
features: {
  discover: true,
  downloads: true,
  library: false,
  runtimes: true,
  doctor: false,
  settings: false,
  themeToggle: true,
  refresh: true,
  doctorAction: false,
  viewSettings: true
}
```

`doctor` controls the always-visible compatibility scanner in the left sidebar, not a standalone navigation page. `doctorAction` controls the manual scan button inside that scanner; auto-scanning still runs while the scanner is enabled. If the current view is disabled, the UI falls back to the first enabled view. If every view is disabled by mistake, the UI keeps Discover enabled as a recoverable fallback.

## Labels

Copy labels are grouped by area:

```ts
labels: {
  nav: {
    discover: "Models",
    downloads: "Queue"
  },
  subtitles: {
    discover: "Search approved local model sources."
  },
  buttons: {
    search: "Find",
    refresh: "Sync",
    viewSettings: "Display"
  },
  settings: {
    title: "Display",
    showDescriptions: "Show descriptions",
    downloadMode: "Download mode",
    simpleMode: "Simple",
    advancedMode: "Advanced"
  },
  doctor: {
    title: "Compatibility",
    subtitle: "Auto-scanning this workstation.",
    rescan: "Scan now"
  },
  empty: {
    noDownloads: "No downloads are running."
  }
}
```

## Extension Boundary

v1 does not expose a plugin API or render hooks. Runtime/provider adapters remain modular in the daemon and are the intended future extension point once common integration needs are clearer.
