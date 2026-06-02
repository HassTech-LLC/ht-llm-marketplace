# Security and Privacy Architecture (The 5-Ring Defense)

This document provides a highly detailed, professional, general-purpose explanation of the platform's security controls. It can be used for repository README files, funding applications, developer documentations, or technical resumes.

---

## 🔒 The 5 Defensive Security Rings

Since local daemons run system processes, scan hardware, and perform deletions, they are sensitive attack targets. The daemon implements a rigorous, multi-dimensional defense model:

### Ring 1: DNS Rebinding Protection (`isLoopbackHost`)
- **Mechanism**: The daemon inspects the HTTP `Host` header of every incoming request. If it does not match local loopback networks (`127.0.0.1`, `localhost`, `::1`), the request is immediately rejected with `403 Forbidden`.
- **Value**: Stops external malicious web pages from hijacking the active local connection in the user's browser.

### Ring 2: Origin CSRF Restrictions
- **Mechanism**: All state-changing endpoints (`POST`, `PUT`, `DELETE`) inspect browser-provided `Origin` headers. Requests are only processed if they match origins specified in `allowedOrigins` (e.g., trusted local app ports, specific domains).
- **Value**: Prevents Cross-Site Request Forgery attacks from unverified sites.

### Ring 3: Privileged Action Confirmation (Dual Headers)
- **Mechanism**: Sensitive, high-risk actions (e.g. system installations, self-updates, deleting files, VRAM evictions, revealing local directories) require a custom header:
  `x-ht-marketplace-confirm: privileged-action` or `x-ht-studio-confirm: privileged-action`.
- **Value**: Because custom headers force a **CORS Preflight (OPTIONS request)** in web browsers, cross-origin web pages are blocked by browser sandboxes from exploiting the daemon's local access.

### Ring 4: Path Traversal Defenses in Delete Safety Plans
- **Mechanism**: File deletions must be strictly contained inside the configured marketplace directories. Path resolutions use `path.relative` and `isPathInside` assertions to verify that all targets are inside registered workspace boundaries.
- **Value**: Deletions targeted at parent or system drives (`../../`) are blocked.

### Ring 5: Binary Execution & Download Integrity Verification
- **Mechanism**: The daemon verifies downloaded binaries and installer files against trusted patterns. Hugging Face downloads are validated against Hugging Face LFS SHA256 hashes immediately after completion.
- **Value**: Ensures complete download integrity and prevents remote code execution vulnerabilities from corrupted or compromised files.
