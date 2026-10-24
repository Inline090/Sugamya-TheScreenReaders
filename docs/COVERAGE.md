# Criterion applicability and coverage

Standard selected: **WCAG 2.2, Level AA**, for this future-facing controlled English public-service fixture. This is not a legal finding about a government site. The W3C recommends current WCAG; actual client obligations may differ. Normative source: https://www.w3.org/TR/WCAG22/ ; WAI's tool limits: https://www.w3.org/WAI/test-evaluate/tools/selecting/

`config/wcag22-aa.json` was mechanically extracted from W3C's published criterion headings/conformance-level markers: **55 Level A/AA criteria**. WCAG 2.1 A/AA has 50. WCAG 2.2 adds six A/AA criteria and removes obsolete 4.1.1, yielding 55. This explains a plausible source for the evaluator's “55”; no fixed standards-wide “20 cannot be automated” division was verified. Automation is method-, context- and subrequirement-dependent, not a universal partition.

## Actual evaluated fixture state

| Evidence category | Count / 55 | What it means |
|---|---:|---|
| applicable-and-automated | 1 | 1.4.3: rendered selected text/axe contrast evidence and approved class repair; not every text state or full criterion certified |
| applicable-and-human-assisted | 3 | 1.1.1, 3.3.2, 4.1.2: observed DOM issues with explicit human semantic review |
| applicable-but-unsupported | 3 | 2.1.1, 2.4.3, 2.4.7: a task keyboard probe exists, but full manual criterion evaluation remains outstanding |
| not-applicable | 5 | 1.2.1–1.2.5: no audio/video in this particular static page state; linked/later media not assessed |
| unresolved / not-tested | 43 | No reliable criterion-wide assessment supplied. Kept visible in the manual-review queue |

**Zero whole-criterion “passes” or conformance claims are inferred from this inventory.** 4 proposed repair operations are not 55 automated checks. Each criterion record discloses method, confidence, task impact, reach assumptions, severity where known, repair route, semantic/deployment risk, verification plan and operator-effort uncertainty. See actual JSON in the run report and the UI criterion filter. Empty/unsupported evidence does not become a pass.

The manual-review queue is the unresolved/unsupported criterion list, not an automated judgment or a completed expert audit. It does not implement full ACR/VPAT/OpenACR authoring. Native screen-reader sessions, reflow across all states, cognitive language quality, complex media and legal compliance remain expert work.

## Priority method

`severity(1–5) × confidence × evaluated-task-reach(1) × 100 / (estimated review minutes + 1)`

The required name association and submit action rank above the lower-confidence image description because they directly affect the configured service task. Reach is one evaluated task, **not measured population traffic**. Review minutes and severity are disclosed heuristics, not measured operator productivity. Ranking is deterministic and explainable; it is not represented as model-discovered business intelligence.

## Reuse

A new installed target supplies origin, authorization, exact paths, task names/selectors and a bounded repair policy. The second configuration uses a separate origin/gateway/audit store and passed the same 21-case suite. This demonstrates reuse on the **same service-form shape**, not arbitrary templates or all WCAG. Unknown templates, missing suitable CSS classes, dynamic content and inaccessible PDFs require another reviewed integration/hand-off.

The full criterion matrix and latest generated decisions remain machine-readable in `config/wcag22-aa.json`, `evidence/run-report.json`, and `evidence/reuse/run-report.json`.
