/**
 * WCAG 2.2 A/AA criterion registry and honest coverage model.
 *
 * For every one of the 55 criteria we report ONE status:
 *   detected                          - a rule failure was observed
 *   no-failure-found-in-tested-state  - checked, no failure in this page/state
 *   needs-interactive-evidence        - requires keyboard/focus probing
 *   needs-human-review                - meaning/media needs a person
 *   not-applicable                    - no relevant content in this state
 *   unresolved                        - no usable evidence
 *
 * A "no failure" result is never a conformance claim.
 */
import fs from "node:fs";

const CRITERIA = JSON.parse(
  fs.readFileSync(new URL("../config/wcag22-aa.json", import.meta.url)),
);

// Tier assignment: how the criterion can be decided.
const AUTOMATED = new Set([
  "1.3.1", "1.3.2", "1.3.3", "1.4.1", "1.4.3", "1.4.4", "2.4.2", "2.4.6",
  "3.1.1", "4.1.1",
]);
const INTERACTIVE = new Set([
  "1.4.10", "1.4.12", "2.1.1", "2.1.2", "2.2.1", "2.2.2", "2.4.1", "2.4.3",
  "2.4.7", "2.5.1", "2.5.2", "2.5.3", "2.5.4", "2.5.7", "2.5.8",
]);

// Axe rule -> WCAG criterion. Only rules we can attribute are listed; an
// unlisted rule is still reported by axe but does not credit a criterion.
const RULE_TO_CRITERION = {
  "image-alt": "1.1.1",
  "input-image-alt": "1.1.1",
  "object-alt": "1.1.1",
  "role-img-alt": "1.1.1",
  "svg-img-alt": "1.1.1",
  "area-alt": "1.1.1",
  "color-contrast": "1.4.3",
  "meta-viewport": "1.4.4",
  "label": "3.3.2",
  "form-field-multiple-labels": "3.3.2",
  "button-name": "4.1.2",
  "link-name": "4.1.2",
  "aria-command-name": "4.1.2",
  "aria-toggle-field-name": "4.1.2",
  "aria-input-field-name": "4.1.2",
  "select-name": "4.1.2",
  "aria-meter-name": "4.1.2",
  "aria-progressbar-name": "4.1.2",
  "html-has-lang": "3.1.1",
  "html-lang-valid": "3.1.1",
  "document-title": "2.4.2",
  "heading-order": "1.3.1",
  "list": "1.3.1",
  "listitem": "1.3.1",
  "td-headers-attr": "1.3.1",
  "th-has-data-cells": "1.3.1",
  "duplicate-id": "4.1.1",
  "duplicate-id-aria": "4.1.1",
  "target-size": "2.5.8",
};

export function tierOf(id) {
  if (AUTOMATED.has(id)) return "automated";
  if (INTERACTIVE.has(id)) return "interactive";
  return "human";
}

export function coverageFor({ axe = [], hasMedia = false } = {}) {
  const violated = new Map();
  for (const v of axe) {
    const c = RULE_TO_CRITERION[v.id];
    if (!c) continue;
    if (!violated.has(c)) violated.set(c, new Set());
    violated.get(c).add(v.id);
  }
  return CRITERIA.map((c) => {
    const tier = tierOf(c.id);
    let status, method, reason;
    if (c.id.startsWith("1.2.")) {
      if (!hasMedia) {
        status = "not-applicable";
        method = "DOM media inventory";
        reason = "No audio or video in the tested state.";
      } else {
        status = "needs-human-review";
        method = "media inspection";
        reason = "Media present; captions and descriptions need a person.";
      }
    } else if (violated.has(c.id)) {
      status = "detected";
      method = "axe-core";
      reason = "Detected via " + [...violated.get(c.id)].join(", ") + ".";
    } else if (tier === "automated") {
      status = "no-failure-found-in-tested-state";
      method = "axe-core / deterministic checks";
      reason = "No rule failure in this page and state; not conformance.";
    } else if (tier === "interactive") {
      status = "needs-interactive-evidence";
      method = "browser probe";
      reason = "Requires keyboard or focus probing in this state.";
    } else {
      status = "needs-human-review";
      method = "manual assessment";
      reason = "Meaning or complex behavior cannot be decided by a scanner.";
    }
    return {
      id: c.id,
      name: c.name,
      level: c.level,
      url: c.url,
      tier,
      status,
      method,
      reason,
    };
  });
}

export function summarize(rows) {
  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  return { total: rows.length, counts };
}
