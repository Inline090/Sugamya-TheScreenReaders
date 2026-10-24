# Any-URL mode and the before-load proxy

This mode is additive. It does not change the owner-installed pipeline.
It lets an operator analyse any public URL, inject fixes into a served copy,
and queue semantic changes (image/video descriptions) for an approver.

## What it does

1. Loads the URL in a real Chromium browser.
2. Runs axe-core with all WCAG 2.0/2.1/2.2 A/AA tags.
3. Runs bounded interactive probes: a 40-step Tab walk, focus visibility,
   24x24 target size, and a 320px reflow check.
4. Produces a coverage status for all 55 WCAG 2.2 A/AA criteria:
   `detected`, `no-failure-found-in-tested-state`, `needs-interactive-evidence`,
   `needs-human-review`, `not-applicable`, `unresolved`.
5. Proposes operations:
   - image alt text, drafted by the vision adapter and marked **provisional**;
   - labels and accessible names for unlabeled fields and nameless controls.
6. Serves `/preview/<id>` with every non-rejected fix applied and visible
   markers (green solid = fixed, amber dashed = provisional).
7. Persists sessions to `var/external-sessions.json` so the proxy and the
   approver queue survive a restart.

## Human review

- Image descriptions are **provisional** and appear in the **Semantic approval
  queue**.
- The approver can approve, edit, or reject each one.
- Approving or editing clears the provisional marker and the next preview or
  proxy response uses the approved value.

## Before-load proxy

`npm run proxy` starts an HTTP proxy on `127.0.0.1:4102` (override with
`PROXY_PORT`). For a URL that has been analysed, the proxy returns the stored
corrected page, so the browser receives the fixed DOM **before parsing** instead
of the original.

```
npm start              # console + analysis on :4100
npm run proxy          # before-load proxy on :4102
```

Launch a browser through the proxy to see the corrected page load directly:

```
chrome --user-data-dir=%TEMP%\sugamya --proxy-server=http://127.0.0.1:4102 http://your-http-page
```

HTTPS is intentionally **not** intercepted. A real deployment needs a local
certificate (MITM), which is out of scope for this demo. Use `http://` pages
for the proxy demonstration; HTTPS pages still work through the `/preview`
route.

## Honest limits

- The preview and proxy serve the **analysed snapshot**, not a live third-party
  rewrite. The target site itself is never modified.
- The vision adapter uses a local Ollama vision model by default, or an
  OpenAI-compatible endpoint when `SUGAMYA_VISION_*` is set. Without any model
  it uses the explicit `changed via sugamya` placeholder and marks it
  provisional.
- Coverage is per tested page and state. "No failure found" is not a
  conformance claim.
- No automatic captioning or media description is claimed.
