# PROJECT_MEMORY.md - Lumina LLM Marketplace

## 🌟 Project Overview
**Lumina** is a premium, developer-first, open-source local LLM Marketplace and GGUF manager. It is designed to be **ultra-lightweight, simple, and embeddable**—allowing any developer to easily drop the marketplace UI directly into their own web projects using a single script tag, while giving non-technical users a double-click start setup.

---

## 🛠️ Technology Stack & Optimization Goals
*   **Frontend**: React (Vite-based) + Tailwind CSS
*   **Widget Portability**: Builds a single-file custom element bundle (`lumina-widget.js`) compiled via Vite to output a native Custom Web Component `<lumina-marketplace>`.
*   **Styling**: Glassmorphism, гармоничный dark-mode gradients (royal purples, dark obsidian, neon teal), custom micro-interactions.
*   **Backend**: Node.js + Express
*   **Inference & Orchestration Engine**: Local Ollama (Port 11434)
*   **Storage Database**: Simple JSON file (`database.json`) inside `lumina-backend/` to maintain a tiny codebase footprint.

---

## 📐 Architecture & Key Decisions

### 1. Dual Build (SPA and Web Component)
*   Lumina serves as a standalone web application, but also compiles into a single, light standalone Javascript file (`lumina-widget.js`).
*   Any web project can import Lumina via:
    ```html
    <script src="http://localhost:3001/widget/lumina-widget.js"></script>
    <lumina-marketplace backend-url="http://localhost:3001"></lumina-marketplace>
    ```
*   This makes it extremely portable and easy to embed into custom internal tools or third-party user interfaces.

### 2. Double-Click Setup (`start.bat`)
*   Contains an auto-launcher script that verifies dependencies, installs them in parallel, verifies that Ollama is running in the background, spins up the servers, and launches the interface in the browser. Zero technical barrier for users.

### 3. Native GPU GGUF Import
*   Downloads custom GGUF models directly from Hugging Face Hub.
*   Automatically creates a local `Modelfile` and calls Ollama's API `/api/create` to import it.
*   This gives the absolute best performance (GPU offloading) with absolute model freedom (Hugging Face ecosystem).

### 4. Server-Sent Events (SSE) Progress Downloader
*   Node.js chunks incoming model streams and writes directly to disk.
*   Calculates download percent, instantaneous speed, and ETA.
*   Pipes these metrics via SSE, avoiding complex websocket handshakes or heavy client-polling models.

### 5. Zero-Leak Storage Reclamation
*   Deleting a model triggers:
    1. Ollama model un-registration.
    2. Local file wipe.
    3. Database record wipe.
*   Reclaims 100% of storage space.

### 6. Strict Port Auditing Safeguard
*   **Guardrail**: Before spawning any development server or background bridge process, the agent **MUST** actively audit the local port mappings (using `Get-NetTCPConnection` or netstat) to check if the target ports are already taken.
*   If a port collision is detected, the agent must notify the user, re-route, and document the change to prevent server crashes and host conflicts.

---

## 🌐 Port Mapping & Settings
*   **Frontend Vite Server**: `http://localhost:3009` (Overridden from Port 3000 at User Request due to collision).
*   **Lumina Backend Server**: `http://localhost:3001`
*   **Ollama Endpoint**: `http://127.0.0.1:11434`

---

## 📈 Dev Status & Next Steps
*   [x] Establish embeddable web-widget design and plan.
*   [x] Initialize `lumina-backend` structure and install core packages.
*   [x] Implement chunk-based downloader with progress SSE streaming and Hugging Face Search.
*   [x] Initialize `lumina-frontend` React Vite project.
*   [x] Implement premium glassmorphic UI, Playground, and Developer Integration Panel (Codex 6 views).
*   [x] Enable custom CustomElement build output for drop-in embeddability.
*   [x] Port re-routed to 3009 due to port 3000 collision on host system.
*   [x] Strict Port Auditing Safeguard integrated as a core architectural constraint.
*   [x] Resolve Library Manager blank loading behavior & missing loading/empty visual states.
*   [x] Eliminate `temperature` and `contextLength` undefined ReferenceError bugs in chat-smoke tests.
*   [x] Inject Hassan's premium "Global Visual Spotlight & focus-within Inputs" design tokens globally.
*   [x] Integrate high-fidelity dynamic brand logo rendering (Meta Llama, Alibaba Qwen, DeepSeek, Microsoft Phi, Google Gemma, Hugging Face) next to model names in Discover tab.
*   [x] Synthesize smart dynamic model descriptions for Hugging Face hub search results.
*   [x] Parallel launch dev server environments at Ports 3009 (Frontend) and 3001 (Backend).
*   [x] Compile and hot-reload updated web components widget build.
*   [x] Perform final system end-to-end verification.
*   [x] Overhaul Discover tab to side-by-side Split-Pane Explorer (Left list column, Right technical details card).
*   [x] Refactor and synchronize monorepo package (model-marketplace.tsx) and legacy app prototype (App.jsx).
*   [x] Integrate interactive Quantization dropdown options and real-time GPU VRAM offload compatible calculator.
*   [x] Embed beautiful scrollable monospace README document viewport cards.
*   [x] Build and compile 100% clean production assets in 240kB stand-alone web component bundles.
*   [x] Overhaul system theme to pure pitch-black (#000000) and pure white (#ffffff) symmetrical colors.
*   [x] Enforce absolute text contrast guardrails (no black text in dark mode, no white text in light mode).
*   [x] Implement dynamically toggled cockpit theme switch button in both widget and legacy app.
*   [x] Completely disable the overlapping overlay GGUF drawer on the Discover tab explorer.
*   [x] Resolve JSX syntax ternary conditional bug in legacy prototype's `App.jsx` to ensure clean compile outputs.
*   [x] Correct approximate logos (Qwen purple circle containing "p", text emojis, dynamic fallbacks) with official, mathematically precise premium vector SVGs for Alibaba Qwen, Google Gemma, Meta Llama, DeepSeek, Mistral, Cohere, Microsoft, and Hugging Face in both package (`model-marketplace.tsx`) and legacy app (`App.jsx`).
*   [x] Implement One-Click Local Engine Provisioner (Windows winget powershell installer for Ollama and LM Studio).
*   [x] Implement Dynamic Installed checks and background serve launcher (ollama serve) for offline engines.
*   [x] Implement Unified Hugging Face Quant Crawler and Downloader across both standard and legacy systems.
*   [x] Implement Dynamic Pre-Flight Compatibility Scorer (RTX GPU VRAM telemetry scan integration and exceeds free VRAM pre-flight red warnings).
*   [x] Implement Modelfile Compiler & Programmatic Ollama Registration (chat templates compiled on GGUF completion, auto-create warm Ollama models).
*   [x] Implement Port Sliding Supervisor & Client Autodiscovery (Express/Node daemon sliding, dynamic frontend port sweeping for self-healing loops).
*   [x] Completely eliminate all green colors (emerald Tailwind classes, hex codes, --ht-green variables) remapping them to neutral black-and-grey backgrounds and premium crisp cyan / violet accents across package components and legacy apps.

