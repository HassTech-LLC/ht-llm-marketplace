# Security and Privacy Architecture

This narrative summarizes the local safety controls for README material, funding applications, client proposals, and resume artifacts.

## Local-First Boundary

The marketplace is designed around a loopback daemon and local runtime state. Host apps talk to local endpoints, while private prompts, model files, runtime inventory, and hardware scans stay on the user's machine.

## Defensive Controls

### 1. Loopback Host Enforcement

The daemon rejects requests that do not target local loopback hosts such as `127.0.0.1`, `localhost`, or `::1`. This reduces exposure to DNS rebinding attacks against a local service.

### 2. Origin Restrictions

State-changing browser requests are checked against configured allowed origins. This protects privileged local actions from untrusted web pages.

### 3. Privileged-Action Headers

Sensitive actions require explicit confirmation headers such as `x-ht-marketplace-confirm: privileged-action`. Browser clients must pass CORS preflight checks before issuing those actions.

### 4. Delete-Plan Containment

Delete operations are limited to marketplace-owned artifact paths. Path traversal checks prevent cleanup routines from escaping into parent directories or system locations.

### 5. Download And Artifact Verification

Download flows validate expected file metadata where available and keep artifact verification state in local inventory. This makes the model lifecycle auditable without sending local state to a cloud service.
