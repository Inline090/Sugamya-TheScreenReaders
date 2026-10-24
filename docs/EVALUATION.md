# Evaluation, measurements and limitations

## Environment and method

24 October 2026. Linux sandbox; Node 22.23.4; Playwright 1.64.1 / Chromium 156.0.8078.4; final axe-core and wrapper 4.14.0. Initial development used wrapper 4.13 before upgrade; final public proof and independent reuse suite were rerun with 4.14. Raw reports disclose their own environment/time. All target records are deliberately seeded owned fixtures, not customer records.

The origin and gateway are separate HTTP processes. The main fixture's exact human-approved manifest is `8bdc2f5f-85e6-4665-b67d-4a4eb2f17100`; the public proof captures the actual response version. The repair path reads origin HTTP and a constrained manifest, not the origin's source file. No browser extension was installed in fresh verification contexts.

The selected journey: locate Full name and Email address by accessible name, fill synthetic values, Tab to the configured submit control, confirm its independent accessible name, press Enter, observe the actual origin form endpoint's success message. The same script/method ran 3 fresh-context trials per before/after state.

## Main measured outcomes

| Measure | Denominator / method | Observed result |
|---|---|---|
| Task completion | Same automated accessible-name/keyboard script; 3 before + 3 after | Before 0/3, after 3/3. Before waits 5 seconds for missing accessible name; after trials ~0.71–0.75 s including load. These are browser timings, not human speed |
| axe finding instances | Same page, evaluated public state | 4 deliberately seeded violation instances before; 0 after. Rule IDs: button-name, color-contrast, image-alt, label. No site/WCAG conformance claim |
| Considered task findings / proposed operations | Actual observed DOM/axe evidence | 4 / 4, all 4 reach the public visitor response; 3 semantic operations require approval |
| Main human decision | Explicit owner confirmation of exact edited alt text, label association and action name | 3 exact semantic values approved. The agent recorded the decision using the approver capability; no disabled-user review or enterprise identity attestation |
| Independent public gates | New browser context, anonymous public HTTPS route | 11/11 passed, actual form task and response header included |
| Optional model use | Main journal, explicit minimized-text consent | 1 completed Groq call; 291 prompt + 150 completion = 441 tokens; 380 ms recorded client elapsed; no image transmitted |
| Local route overhead | 30 interleaved origin/gateway pairs after 5 warmups, consume full body, no-store | Origin median 2.02 ms; gateway median 6.84 ms; paired increment median 4.78 ms / p95 8.41 ms. Full samples retained |
| UI state | 1440/768/390 pixels; actual login, filter, ROI and focus checks | No viewport overflow, page errors or axe violations; loaded local Geist; 3px focus |
| Official Taste checks | Actual authenticated UI through local-only real-API harness | Source lint 0/0; final browser inspector 0 FAIL / 0 WARN; screenshots inspected |
| Human setup/review time | No timed human workflow study | **Not measured**, explicitly null. Do not convert automated engineering timings into observed operator effort |

Actual samples/denominators are in `evidence/measurements.json`; public evidence in `evidence/public-deployment-proof.json`; human confirmation in `evidence/human-approved-deployment.json`. No original 26-government-page scan was reproducible from the supplied workspace, so its claimed totals are not used.

## Failure outcomes and independent reuse

A second installation uses a different target ID, origin (4201), gateway (4200) and audit store, on the same service-form shape. Its **21/21 E2E cases** passed. This is reusable configuration evidence, not a second customer or a general arbitrary-template benchmark.

The suite verifies unauthenticated API denial; operator cannot approve; routes/files/private paths denied; submitted external/internal URLs rejected; malformed Unicode capability denied; owner challenge; actual baseline/applicability priority; preapproval block; capability-bound review; canary+visitor deployment; unchanged origin and new public DOM; actual emergency restore; reject; wrong-name canary withheld; private default no model leakage; dynamic behavior; recovery; live stale-fingerprint rollback; origin 503; hydration failure withheld; final normal version restored.

Actual negative evidence:

- Misleading **“Transfer funds”** test label: accessibility syntax/axe can pass while independent configured task fails. Canary was actually **withheld**, active pointer unchanged.
- Stale origin: original HTML served with mismatch header; verifier failed; active pointer actually returned to origin. Rollback is not dashboard text.
- Emergency disable: response version reverted to `origin` and missing original association returned.
- Hydration fixture: later script removed the relationship; actual post-hydration check failed and promotion was withheld.
- Origin outage: actual 503 preserved, no repair success claimed. Provider 503 is separately a **unit injected failure**, not a fabricated real Groq outage.
- Restart recovery unit tests prove interrupted unverified deployments cannot resume as verified. A process crash was not injected into the public main deployment during recording.

Automated approver calls in engineering tests are explicitly labeled fixtures. They prove the authorization/transition paths, not human decisions. The main human-confirmed path is separate.

## Costs and ROI

Actual invoice cost was not obtained. The observed main 441-token request, priced post hoc at the current Groq public list rates ($0.075/M input, $0.30/M output), is approximately **US$0.000066825**. That is an estimate, not a charge/credit statement. https://console.groq.com/docs/model/openai/gpt-oss-20b

Transparent forecast, **not measured savings**:

`sites/month × (manual-baseline-minutes − Sugamya-review-minutes) / 60 × operator-hourly-cost`

At 10 sites, assumed 45 → 15 minutes, ₹600/hour: **5 forecast operator hours / ₹3,000 gross effort value per month**. Low volume (1 site): ₹300. Doubled review burden (30 minutes): ₹1,500. Hosting, owner installation, manual WCAG audits, maintenance and invoice cost are excluded. No review/setup study or customer outcome justifies stronger ROI claims.

## Test/report reproducibility

- `npm test` — final 30 unit tests; output `evidence/unit-tests.txt`.
- `npm run test:e2e` — mutating owned fixture suite; use second-config command in deployment guide. Final result in `evidence/reuse/e2e-results.json` (21 cases). Earlier main 19-case run retained as historical development evidence.
- `npm run test:ui` — viewport/console evidence; `node scripts/ui-workflow.js` exercises actual review/deploy/re-verify controls on the separate fixture.
- `PUBLIC_BASE=... node scripts/public-proof.js` — actual public route, not local mirror.
- `node scripts/measure.js` — raw timing pairs and task trials. Current fixture/live prerequisites required.
- `npm run replay -- evidence/run-report.json` — validates the event chain; it is a trace replay, not a rerun of browsers.
- `npm run lint`, `npm audit --json`, Gitleaks indexed-export scan — exact outputs retained. Static warnings are reviewed, not converted to “zero vulnerabilities.”

Raw public observations/manifests/model/verification records are exported to `evidence/objects/`. Generated summary exports may be regenerated; original content-addressed observations and journal events are never overwritten by the system. Original observations do not become a fabricated “pass” when a model/tool is unavailable.
