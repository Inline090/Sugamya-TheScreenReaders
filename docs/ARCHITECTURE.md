# Architecture and change contracts

## Decision: a controlled reverse proxy, not a browser overlay

```
Origin (separate HTTP service, owned fixture)
    │ public HTML / existing CSP / form endpoint
    ▼
Owner-installed gateway route (/apply; explicit asset allowlist)
    ├─ disabled or mismatch → exact original HTML body, no repair claim
    └─ approved version → constrained attribute/class transformation
            │
            ▼
Ordinary browser — no extension, cookie, operator session or installation
            │
            ▼
Independent browser verifier → gates → report / real active-pointer rollback
```

The operator control plane lives on the gateway but has actual capability-token authentication and distinct operator/approver roles. Target origin, paths, task probe and repair policy are installation-time configuration, never arbitrary URLs supplied to a crawler. An owner installs the scoped challenge endpoint and points a hostname/router to the gateway; a random third-party website cannot be modified by entering its URL.

### Alternatives evaluated

| Route | Decision |
|---|---|
| Cloudflare Worker Route + HTMLRewriter | Sound bounded HTML transformation API; no account/domain routing credentials supplied. Not represented as deployed. |
| Controlled reverse proxy | **Chosen and implemented.** Fixed upstream and path scope; local and public HTTPS visitor proof possible now. No source read/write in the repair path. |
| Approved site-owner JavaScript / tag manager | Can reach ordinary visitors but executes after page load, needs owner installation/CSP changes, risks hydration conflicts. Not built. |
| CMS integration | Excellent for sites whose operators can install a plugin; no such CMS authorization supplied. Not built. |
| Source patch / PR | Preferable durable fix when a source-owning team can merge it; does not answer this project's no-source bottleneck on its own. Not built. |
| Operator extension or mirror | Useful preview, **not** visitor-wide deployment. Neither is used as delivery proof. |

### Honest reach

The public demonstration hostname is a temporary Cloudflare Quick Tunnel, forwarding to the real reverse proxy. It is ordinary public HTTPS access, not an operator-only DOM patch. The underlying application source is **unchanged**, not permanently repaired. Removing/disabling the gateway removes its transformations. No production uptime/SLA or real customer is claimed.

The controlled origin and control plane are in the same repository so judges can reproduce both. Runtime remediation uses HTTP observations and a manifest; it does not import, patch, mount or consult `fixture/origin.js`. The sandbox run uses separate processes, not OS-enforced filesystem isolation. Separate Docker build contexts exclude fixture code from the gateway image, but the supplied Docker/Compose configuration was **not executed in this sandbox** and is not evidence of container hardening.

## Implemented boundaries

- Public, English, server-rendered HTML only, exact installed path and exact document SHA-256.
- ID-only selectors, exactly one matching element, original attribute value and locale preconditions.
- Allowlisted `alt`, `aria-label`, `aria-labelledby`, and a specific existing contrast class. No generated JavaScript, HTML, CSS, URLs, event handlers, arbitrary DOM insertion or Worker editing.
- **Contrast limit:** the owned fixture has an owner-preinstalled `.sugamya-contrast` utility. The gateway only selects that known class and verifies its computed effect. On a site without an approved compatible class/style route, contrast needs a separate owner-approved integration or source handoff. Naming/label/alt repairs do not require this CSS utility.
- Exact-document hashing intentionally over-invalidates benign origin changes. This is conservative and unsuitable for arbitrary personalized pages; a mismatch skips the whole manifest, preserves original body and emits an event.
- Model text is never activated automatically. Semantic association, action-name and alt-text changes all require approver decisions. Approvals bind both operation and whole manifest hashes; edits invalidate earlier approvals.
- Canary URL serves only an approved candidate. Canary checks gate activation; an independent ordinary-visitor check follows activation. Failure restores a previous pointer or the original response. Interrupted unverified promotions are recovered conservatively on startup.
- Emergency disable changes the actual serving pointer to original origin HTML. It is not dashboard-only text.

## Schemas and lifecycle

Runtime schemas are in `src/contracts.js`: target authorization, evidence, findings, criterion decisions, operation, manifest, approval, deployment, verification, rollback and hash-chained event. Some exported reporting contracts describe the journal format; write boundaries actually parse Target, Manifest, Operation, Decision and Approval, and report replay validates RunEvent.

Legal workflow:

`owner-unverified → owner-verified → observed → staged → [semantic decisions] → approved → canary → [withheld | active → verified | rolled-back]`

Reject terminates that staged version. Editing records the old manifest/approvals and clears approvals for the modified manifest. A previously verified, still-approved exact manifest may be redeployed after disable, but always reruns current preconditions and both browser gates. A signed-in/unauthorized target has no deploy route. An unavailable model leaves manual/context-derived drafts and deterministic repairs usable.

`src/planner.js` ingests actual observations and axe findings, calculates explicit task-weighted priorities, and proposes only supported operations. It does not synthesize scan results. A 20-request model budget and bounded per-page repair count limit the optional drafting path. There is no claim that the language model autonomously performs full WCAG reasoning: deployment and priority decisions are policy-guided, while the model drafts only minimized semantic text after explicit consent.

## Delivery mechanics

Fixed upstream only; redirect following disabled; 5-second upstream timeout; 1 MiB body bound; only configured HTML/assets and the owned fixture's small form POST are supported. No target cookies, operator tokens or origin auth are forwarded. Query-bearing and signed-in requests are rejected as outside scope. HTTP is allowed only for explicitly local/fixture service origins; external installed origins require HTTPS.

On transformed HTML, stale content length/encoding are not forwarded; the body is serialized and a new length generated. Browser security headers are preserved from origin, no remote script is injected, and responses are `no-store, private`. The fixture's hashed-script CSP survives transformation and form behavior is tested. The implementation is **not** a universal proxy for streaming, binary assets, SPAs, arbitrary POSTs, WebSockets, external resources, locales or production caching strategies.

`/dynamic` and a controlled hydration fixture demonstrate that post-load name removal is detected; the candidate is withheld. Later SPA states are not assumed repaired. `/private` is denied without collecting or uploading sensitive content.

## Independent checks

`src/browser.js` does not import the transformation engine. Every verification creates a new Chromium context without extensions or operator state. Gates: response status, version header, axe no-new-finding instances, normalized unaffected DOM after reverting intended attributes, no new HTML parse-error categories, selected layout boxes within one pixel, preserved CSP, operation effects after hydration, independent configured names + keyboard task completion, page errors, and same-origin network scope.

Intended changes are explicit attribute/colour changes, not blanket DOM hashes that reject all useful edits. Layout checks cover selected controls, not every pixel. No screenshot-diff gate or real screen-reader test is claimed.
