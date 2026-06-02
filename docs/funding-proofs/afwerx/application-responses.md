# AFWERX SBIR/STTR (Department of Defense)
## Tactical Edge AI & Dual-Use Technology Proofs

This directory contains highly detailed, secure tactical answers and telemetry scans to attach when submitting proposals to the **AFWERX / Department of the Air Force (USAF)** SBIR/STTR programs.

---

## 📋 Section 1: Application Copy & Text Snippets

### Prompt: Describe the military utility, commercial viability, and security advantages of your technical innovation at the tactical edge.

#### 🎯 Recommended Answer:
> "Modern tactical military operations require secure, high-speed artificial intelligence at the edge, frequently in Denied, Intermittent, and Limited (DIL) communication environments. Cloud-dependent AI architectures are highly vulnerable to electronic warfare jamming, signal sniffing, and data leaks. HassTech LLC's 'HT Local LLM Marketplace' is a lightweight, zero-dependency control plane that enables local-first, offline execution of quantized GGUF models directly on tactical edge workstations and ruggedized hardware. 
> 
> Featuring a 5-Ring Security Architecture—including local DNS rebinding protection (isLoopbackHost verification), custom header OPTIONS blocks to prevent cross-origin scripting, strict path traversal boundaries for deletes, and Hugging Face LFS SHA256 integrity checks—the system operates under a rigid zero-trust posture. Furthermore, our native AVX-512 LLVM compiler bypass compiles llama.cpp binaries optimized for standard CPU/GPU hardware (targeting x86-64-v3 instructions), capturing maximum Vulkan GPU and AVX2 hardware acceleration. 
> 
> This provides tactical operators with secure, zero-latency offline mission-planning assistants, language translators, and local telemetry diagnostics, without transmitting signal intelligence over the air. Its commercial viability is proven through frictionless developer integrations across VS Code, React, and Web Components."

---

## 📎 Section 2: Uploadable Proof Attachments (Manifest)

Attach these files to your proposal under the Technical Narrative / Feasibility Proof sections:

1. **`attachments/terminal-doctor-scan.json`** (JSON Telemetry File)
   - *Form Description:* "Hardware Scan Log: Raw offline doctor scanner log verifying Vulkan GPU memory discovery, system RAM boundaries, SQLite inventory telemetry, and active runtime statuses."
2. **`attachments/marketplace-desktop.png`** (Image Attachment)
   - *Form Description:* "Edge UI Panel: Desktop interface depicting local model parameter and quant selectors, precise file footprint metrics, and pre-flight memory diagnostics."
3. **`attachments/marketplace-demo.webm`** (Video Attachment)
   - *Form Description:* "Offline Operations: Recorded demonstration showing high-speed UI navigation, catalog search queries, and dynamic memory allocations on isolated networks."

---

## 🛠️ Section 3: Technical Specifications for AFWERX Evaluators

| Dimension | Specification | Military Advantage |
| --- | --- | --- |
| **Control Plane Weight** | 1.42 MiB total foot footprint | Fits onto ultra-low-bandwidth flash devices / embedded controllers. |
| **Inference Runtime** | Native llama.cpp (compiled `b8637`) | Bypasses AVX-512 compiler crashes, allowing resilient acceleration. |
| **Security Shielding** | Loopback Host Header Guard (`isLoopbackHost`) | Prevents DNS rebinding and cross-site request forgery at the edge. |
| **Network Reliance** | 0.00% active connection required | Resilient to communications jamming and electronic spoofing. |
| **Database Engine** | Native synchronous SQLite in WAL mode | Ultra-reliable, zero-server database; write-ahead logs prevent corruption. |
