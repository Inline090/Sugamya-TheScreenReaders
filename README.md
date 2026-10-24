# Sugamya
## A Self-Verifying AI Agent That Fixes Web Accessibility

**The Screen Readers · HX-P3JQ · AgentOps’26 · IT Infrastructure**

Sugamya is a bounded accessibility repair control plane for website operators. It turns an observed task barrier into an approved response-level change, serves that change through an owner-controlled reverse proxy, checks what a fresh ordinary browser actually receives, and withholds or rolls back failures. **Visitors install nothing. Target application source is not patched.**

This repository contains the implementation **and a deliberately flawed owned test site**. It is not a government customer deployment, a universal accessibility overlay, a compliance certificate, or a production multi-tenant SaaS.

### Actual evidence

| Observation | Result | Scope / limitation |
|---|---|---|
| Same automated accessible-name + keyboard service task | **0/3 before → 3/3 after** | Fresh contexts; owned fixture; not a disabled-user study |
| Seeded axe violation instances | **4 → 0** | One public page/state; not whole-criterion conformance |
| Actual public HTTPS visitor verification | **11/11 gates passed** | Temporary Quick Tunnel; no extension/operator state |
| Unit / independent second-configuration E2E | **30 / 21 passed** | Controlled positive, negative, stale, outage and hydration fixtures |
| Main real AI draft | **441 tokens, 380 ms** | Groq text-only; explicitly consented; visual accuracy unverified |
| Human semantics decision | **3 exact operations explicitly approved** | Project-owner confirmation; agent recorded decision through approver capability |
| Local paired proxy overhead | **4.78 ms median / 8.41 ms p95 increment** | 30 warm paired requests; not production/global latency |
| UI / Taste inspection | **1440, 768, 390 px; 0 axe findings; inspector 0 FAIL / 0 WARN** | Tested console state, not full manual audit |

Evidence: [public route](evidence/public-deployment-proof.json), [human decision](evidence/human-approved-deployment.json), [actual model result](evidence/model-live-result.json), [measurements](evidence/measurements.json), [21-case reuse suite](evidence/reuse/e2e-results.json), [negative canary](evidence/failing-canary.json), [real rollback](evidence/rollback-result.json), [UI](evidence/ui-tests.json).

The recorded demo is [artifacts/Sugamya-demo.mp4](artifacts/Sugamya-demo.mp4), **79.6 seconds**, actual system behavior with burned-in captions, not a live action. Final [PowerPoint](artifacts/Sugamya-final.pptx) has a five-minute 10-slide narrative plus two Q&A appendices; [PDF](artifacts/Sugamya-final.pdf) is a rendered fallback. Each slide has speaker notes. These replace the application-stage idea deck.

The temporary demonstration URL recorded in the evidence may expire: https://freight-galleries-feels-messenger.trycloudflare.com/apply . Do not interpret a dead tunnel after the event as a durable hosting promise. Reproduce locally using the commands below.

## Run the tested process deployment

Prerequisites: **Node 22.13+**, npm, Playwright Chromium and its actual OS dependencies. No database/cloud account is required for deterministic/manual mode.

```sh
npm ci
npx playwright install --with-deps chromium
npm run setup               # creates private .env; refuses overwrite
npm run origin              # terminal 1: separate owned fixture origin, port 4101
npm start                   # terminal 2: console + gateway, port 4100
```

Open `http://localhost:4100/`. Privately read the generated `.env`:

- **OPERATOR_TOKEN**: verify owner installation, observe/plan, request an optional AI draft, deploy, verify, emergency disable.
- **APPROVER_TOKEN**: approve, edit, or reject semantic changes. Separate capability/role enforced on the server.
- The visitor route is `http://localhost:4100/apply`; it needs no login or extension.

These are actual strong bearer capabilities with HttpOnly/SameSite sessions, not mock authentication. No tokens are provided in this repository. Never publish `.env`, portal sessions, model keys, or GitHub credentials.

If the host only has Node 20, first install Node 22. The event's full `npm ci` also installs pinned dev Node 22.23.4; its binary is `node_modules/node/bin/node`. Production `--omit=dev` installs require system Node 22.13+.

Optional Groq: set **GROQ_API_KEY** privately and restart. The operator first sees the exact minimized text/provider/retention notice and must consent to that payload. No screenshot, image, full HTML, form value or credential is sent. The model output stays staged; it cannot authorize its own meaning or deployment. Without a key/provider, the supported deterministic/manual path still works. No GitHub Models integration is claimed: that service was retired in July 2026.

## Prove the vertical slice

1. Operator signs in → **Verify owner installation**. Scope comes from startup `config/target.json`, not a submitted arbitrary URL.
2. With transformations disabled → **Observe & plan**. Actual local DOM/accessibility/axe evidence produces task-ranked operations.
3. Approver signs in → inspect context/original/proposal/uncertainty → **Approve**, **Edit & approve**, or **Reject version**. Edits clear approvals tied to the old manifest.
4. Operator → **Run canary & deploy**. Preconditions and independent canary gates precede activation; fresh ordinary-visitor checks follow.
5. Open the public/localhost visitor route in a new browser profile, no operator state. Inspect `X-Sugamya-Version` and complete the form by accessible names and keyboard.
6. **Emergency disable** restores original HTML. A bad canary is withheld; a stale deployed page is skipped and an observed verification failure really restores the serving pointer.
7. Download JSON report or replay the exported trace. Public raw observations and failed evidence are preserved by content address.

## What is and is not supported

Implemented: exact-fingerprint public English HTML; one configured service-form shape; constrained `alt`, `aria-label`, `aria-labelledby`, and a specific existing contrast class; real role-gated review; canary/public browser checks; version history; non-promotion, rollback and disable; minimized optional AI text drafting; criterion applicability/manual-review queue; forecast-only ROI inputs.

**Important contrast limit:** the controlled origin already provides an approved `.sugamya-contrast` utility. We select it; we do not invent arbitrary CSS or claim this works on a site with no compatible styling route. Label/name/alt attribute repairs do not depend on that class.

Not released: signed-in/personalized pages, arbitrary URLs, unknown SPA states, arbitrary assets/POSTs/streaming, source PRs, extension delivery, full WCAG audit/conformance, ACR/VPAT authoring, enterprise SSO, tenant isolation, notarized logs or production SLA. The sandbox origin/gateway are separate processes, not OS-isolated. Dockerfiles/Compose are supplied as **unexecuted configuration**, not tested isolation evidence.

**Coverage is honest:** WCAG 2.2 AA inventory of 55; 1 selected automated, 3 human-assisted, 3 requiring fuller manual evaluation, 5 inapplicable to current static state, 43 unresolved/untested. No whole-criterion “passed” count. The criterion filter is an actual manual-review queue, not a completed expert assessment.

## Reproduce tests and tools

```sh
npm test                    # 30 unit/schema/privacy/recovery tests
npm run test:e2e             # mutates only the owned configured fixture; 21 checks
npm run test:ui              # real login, viewport, axe, focus, filter and ROI controls
npm run lint                # 0 errors; warnings remain reviewed, not suppressed
npm audit --json
npm run test:mcp             # real MCP handshake, navigation and accessibility snapshot
npm run replay -- evidence/run-report.json
```

The E2E suite seeds controlled failures and uses scripted approver capabilities **as engineering tests**, not human content-owner decisions. Human-approved production-path evidence is separately identified. Do not point the test runner at a customer site.

Second installed target, separate audit store and ports: see [deployment guide](docs/DEPLOYMENT.md). Public proof can be rerun with `PUBLIC_BASE=https://your-authorized-gateway node scripts/public-proof.js`. This requires a live actual HTTPS route, not a mirror.

Taste Skill was installed using its current official `design-taste-frontend` name and used through its app draw/lint/real-browser inspection workflow. Project MCP config uses official Playwright MCP with a secret-stripped dev wrapper. See exact sources, licenses, pins and smoke tests in [tools inventory](docs/TOOLS.md). Skills, MCP/SDK, ESLint, Gitleaks, FFmpeg and presentation tooling are not visitor runtime dependencies.

## Architecture, research, release and judging evidence

- [Operating rules/time/domain verification](docs/OPERATING-CONTEXT.md)
- [Architecture and contracts](docs/ARCHITECTURE.md)
- [Authorization/deployment/rollback guide](docs/DEPLOYMENT.md)
- [Security threat map and residuals](docs/SECURITY.md)
- [Privacy/model consent contract](docs/SECURITY.md#privacy-and-model-data-contract)
- [Short cited competitive matrix and code inspected](docs/COMPETITIVE-EVIDENCE.md)
- [Criterion coverage and prioritization](docs/COVERAGE.md)
- [Evaluation method, denominators and business case](docs/EVALUATION.md)
- [Judging categories and evaluator-concern mapping](docs/JUDGING.md)
- [Five-minute demo and Q&A runbook](docs/DEMO.md)
- [Observed engineering failures and fixes](evidence/TOOL-FAILURES-AND-FIXES.md)
- [Third-party notices](THIRD-PARTY-NOTICES.md), [MIT license](LICENSE)

No measured customer savings are claimed. The editable ROI calculator's default example—10 sites/month, 45 manual minutes vs 15 review minutes, ₹600/hour—forecasts ₹3,000/month gross effort value, excluding hosting, setup, audits and maintenance. Human setup/review time was not timed; model invoice cost was not verified.

The final saved submission receipt and full submitted commit SHA are delivered separately after portal save. They cannot be embedded into the same immutable commit without a circular update. Event freeze: **24 October 2026, 18:00 IST**; all development/commits/pushes/uploads/final save must precede it, with no project changes afterwards through judging.
