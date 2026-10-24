# Threat model and release decision

## Release boundary

Approved as a **single-deployment, controlled public-fixture MVP**, not a universal production crawler or multi-tenant SaaS. No claim of perfect security, legal WCAG conformance or production customer readiness. Arbitrary/signed-in origins, enterprise identity, general binary/streaming proxying and arbitrary SPA remediation are blocked/out of scope. Credentials are private environment capabilities, not mock accounts.

Trust boundaries: operator browser → authenticated API → installed target; untrusted page evidence → planner/optional remote model → strict manifest; independent browser → serving route; local audit store → report; development skills/MCP → engineering workspace. The remote model and target page do not receive deployment credentials. MCP is not a product runtime dependency.

## Threat-to-control-to-negative-test map

| Threat | Implemented control | Negative evidence / release decision |
|---|---|---|
| Unauthorized site/hostname changes; SSRF/internal URL input | No submitted-URL crawler API. Origin and path scope installed at startup; owner challenge verified; credentials not forwarded; redirect following off; external origins require HTTPS | Unknown/private routes rejected; target/origin confusion unit tests; query/cookie exclusion. Fixed loopback/`origin` host is explicitly a fixture exception, not broad SSRF access |
| Forged approver / approval replay | Distinct 256-bit operator/approver capabilities; actual server role enforcement; each decision binds manifest + operation hash; edits invalidate approvals | Operator decision request 403; preapproval deploy denied; replay/hash-forgery tests; edited/rejected UI/API cases |
| XSS / unsafe generated code | UI `textContent`/DOM creation, no model HTML insertion; ID-only selectors; attributes/class allowlist; no arbitrary CSS/JS/URL; value length/control/markup rejection; CSP | Malicious operation fields/onclick/script selectors and markup rejected. Model output cannot become executable code. Target code remains untrusted and is not an instruction source |
| Prompt injection | Page/model content treated as data, small text context, no model tool execution, strict output schema, human meaning approval and independent configured task expectations | Extra `execute` fields and generated `<script>` values denied; wrong semantic name passes simple syntax but fails independent task gate |
| Leaked signed-in/citizen content | Public fixture only, no target auth forwarded, `/private` denied; no screenshots/images/full HTML/form values in model payload; opt-in per-request payload/hash consent; text redaction | Synthetic Aadhaar/email/phone/secret fixture redacted; signed-in guard fails closed; no-consent and changed-payload tests prevent external request |
| Stale selector/content/locale | Exact document fingerprint plus selector count, original value, locale and existing style preconditions | Unit test preserves stale original; live stale fixture serves original, logs skip, independent verify rolls serving pointer back |
| Bad promotion / rollback failure / interrupted process | Canary gate before promotion; visitor gate after promotion; last-good/original pointer restoration; emergency disable; startup recovery for interrupted canary/unverified active state | Misnamed-action canary withheld; live rollback and original-header assertions; four restart-recovery unit cases |
| CSP/caching/encoding regressions | Preserve origin security headers; no injected remote runtime; drop stale content length/encoding; no-store responses; bounded HTML serialization; form probe | CSP equality, functionality, parse errors, unaffected DOM, layout and browser gates; not a universal cache/streaming proxy |
| Origin/model/tool failure | Upstream timeout/body bound, truthful status, observable error events, strict schema; model unavailability changes no proposal; manual/deterministic path remains | Controlled origin 503, mocked provider 503 **unit negative test**, missing key, failed hydration, initial browser dependency failure fixed. No success fallback |
| Denial of service | Fixed one-page installed scope, 1 MiB upstream response, 2 KiB form/12 KiB JSON, timeouts, 180 API requests/min/IP, serialized operational actions, max 8 manifest operations, 20 optional model requests per local journal | Bounded fixtures and budget/schema tests. Local disk journal still requires owner backup/capacity management; not an internet-scale service |
| Tampered evidence/history | Content-addressed immutable objects, SHA-256 event chain, atomic state-file replacement, integrity validation on startup/replay | Unit tests alter historical event and object paths; replay verifies hashes. **Local admin can rewrite whole log and head**: not external notarization, not Byzantine tamper-proof |
| Secret/dependency/tool compromise | .env/session files excluded; pinned lockfile; npm audit; Gitleaks staged-export scan; least tool environment; no GitHub/model secrets passed to MCP; official sources pinned | See dependency/secret/static scan outputs and tools inventory. Skills run with engineering-user privileges and are not inherently sandboxed |

## Privacy and model data contract

Default scan/plan/deploy makes **no model request**. The optional Groq path first displays the exact redacted bounded text payload, provider/model, byte count, exclusions and retention caveat. Consent must be explicit and tied to that payload hash. The request body contains no screenshots, image bytes, full HTML, citizen records, form values or auth tokens. UI context images stay local to the origin; the remote model has not visually interpreted them.

Source: https://console.groq.com/docs/your-data — Groq states that inference inputs/outputs are not retained by default, with reliability/abuse exceptions up to 30 days; retained customer data is in US GCP buckets. Account-specific ZDR was **not** verified. Therefore the product does not promise zero provider retention or Indian data residency. Local redaction is not a universal PII detector; signed-in pages are denied rather than “made safe” by a regex.

The real model test sent only the owned fixture's minimized context. One successful response, 441 tokens, 380 ms was observed. The human explicitly approved an edited route description and both form associations through Arena; the engineering agent transmitted that recorded decision using the approver capability. Capability identity is not enterprise SSO or independent reviewer identity attestation.

## Review findings and residuals

- Original source-first/mirror idea did not prove visitor reach: replaced with actual owner-controlled proxy and public clean-browser test.
- Original DOM/layout “no change” gate would reject intended repairs: now revert only intended attributes for normalized DOM comparison and test selected unaffected layout boxes.
- Fixed mobile sign-out visibility, browser library prerequisites, asset-path schema regression, and interrupted promotion recovery before release.
- ESLint 10 initially exposed an incompatible legacy plugin API; official `@eslint/compat` rule wrapper added, then rerun. Final output has **0 errors; warnings are retained and reviewed** (dynamic installation/store/test paths, controlled development child processes and bounded redaction regex). Warnings are not silently suppressed or relabeled “zero findings.”
- `npm audit` found no known package advisories in the scanned lockfile at the recorded time; this is not proof of absence of vulnerabilities.
- Chromium in this sandbox runs without its OS sandbox. Network is restricted to the installed origin and pages are owned fixtures; **arbitrary hostile-site crawling is not released**. Production requires stronger browser/process isolation, egress controls and infrastructure review.
- The demonstration uses temporary HTTPS hosting, not a hardened named production route. Single-host capability roles, local disk storage, no tenant isolation/SSO, no external audit anchoring or incident SLA are explicit limits.
- Supplied Docker/Compose configuration was not run. No Docker security claim is based on it.

Release gate: do not promote beyond the controlled scope while severe authorization/privacy/rollback issues remain. Current negative tests support this bounded MVP; they do not remove the above production limitations. Keep initial credentials in a private password manager, rotate shared event keys after use, and avoid exposing the origin/admin fixture port on a real deployment.
