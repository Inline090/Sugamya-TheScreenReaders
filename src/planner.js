import fs from "node:fs";
import { Manifest } from "./contracts.js";
import { uid, now } from "./store.js";
const criteria = JSON.parse(
  fs.readFileSync(new URL("../config/wcag22-aa.json", import.meta.url)),
);
export function coverage(observation) {
  return criteria.map((c) => {
    let status = "unresolved",
      method = "not-tested",
      reason =
        "No reliable evidence collected for this criterion; manual assessment required.",
      confidence = 0,
      repairPath = "manual/source handoff";
    if (
      ["1.1.1", "3.3.2", "4.1.2"].includes(c.id) &&
      (observation.observations || []).some(
        (e) =>
          e.tag ===
          { "1.1.1": "img", "3.3.2": "input", "4.1.2": "button" }[c.id],
      )
    ) {
      status = "applicable-and-human-assisted";
      method = "DOM + axe + human semantic decision";
      reason =
        "Selected elements only. Meaning cannot be established by scanner.";
      confidence = 0.9;
      repairPath = "approved attribute manifest";
    }
    if (
      c.id === "1.4.3" &&
      (observation.observations || []).some((e) => e.text)
    ) {
      status = "applicable-and-automated";
      method = "axe computed contrast on rendered public state";
      reason =
        "Automated evidence covers rendered text only; no whole-criterion pass inferred.";
      confidence = 0.95;
      repairPath = "preinstalled approved CSS class";
    }
    if (c.id.startsWith("1.2.") && observation.dom.media === 0) {
      status = "not-applicable";
      method = "DOM inventory of audio/video in current page state";
      reason =
        "No audio or video present in evaluated static state; does not cover linked media or later states.";
      confidence = 0.95;
      repairPath = "none";
    }
    if (["2.1.1", "2.4.3", "2.4.7"].includes(c.id)) {
      status = "applicable-but-unsupported";
      method =
        "task keyboard probe planned; full manual evaluation outstanding";
      reason = "Task probe is not exhaustive keyboard/focus assessment.";
      confidence = 0.5;
    }
    return {
      ...c,
      status,
      method,
      reason,
      confidence,
      taskImpact: ["3.3.2", "4.1.2"].includes(c.id)
        ? "Blocks name-based service application"
        : "Requires criterion-specific assessment",
      reach: "one evaluated public page/state; population frequency unknown",
      severity: ["3.3.2", "4.1.2"].includes(c.id) ? 5 : null,
      repairPath,
      semanticRisk: ["1.1.1", "3.3.2", "4.1.2"].includes(c.id)
        ? "human decision required"
        : "not determined outside selected evidence",
      deploymentRisk: "static HTML only; fingerprint gated",
      verification:
        "independent DOM / task probe for implemented repairs; otherwise manual",
      estimatedOperatorMinutes: null,
    };
  });
}
export function plan(baseline, target) {
  const policy = target.policy || {
    fieldSelector: "#full-name",
    labelSelector: "#name-label",
    actionSelector: "#submit",
    actionSourceAttribute: "data-action-label",
    imageSelector: "#desk-map",
    contrastSelector: "#help",
    contrastClass: "muted sugamya-contrast",
  };
  const obs = baseline.safe,
    operations = [],
    findings = [];
  const add = (o, severity, confidence, effort) => {
    const op = { ...o, id: uid() };
    operations.push(op);
    findings.push({
      id: uid(),
      criterion: o.criterion,
      selector: o.selector,
      impact: o.reason,
      evidenceId: obs.id,
      confidence,
      severity,
      reach: 1,
      operatorMinutesEstimate: effort,
      priority: Math.round((severity * confidence * 100) / (effort + 1)),
      priorityFormula:
        "severity × confidence × evaluated-task-reach(1) × 100 / (estimated review minutes + 1)",
      assumptions: "not measured population reach; severity 1–5 heuristic",
      operation: op.id,
    });
  };
  for (const el of obs.observations) {
    if (!el.id) continue;
    const selector = "#" + el.id,
      a = el.attributes;
    if (
      el.tag === "input" &&
      !el.label &&
      !a["aria-label"] &&
      !a["aria-labelledby"]
    ) {
      if (el.precedingText && selector === policy.fieldSelector)
        add(
          {
            criterion: "3.3.2",
            selector,
            attribute: "aria-labelledby",
            before: null,
            value: policy.labelSelector.slice(1),
            semantic: true,
            reason:
              "Associate the existing visible Full name prompt with the required application field; human confirms relationship.",
          },
          5,
          0.98,
          1,
        );
    }
    if (
      el.tag === "button" &&
      !el.text.replace("→", "").trim() &&
      !a["aria-label"] &&
      selector === policy.actionSelector &&
      a[policy.actionSourceAttribute]
    )
      add(
        {
          criterion: "4.1.2",
          selector,
          attribute: "aria-label",
          before: null,
          value: a[policy.actionSourceAttribute],
          semantic: true,
          reason:
            "Expose the owner-provided action metadata as the button name; human must confirm the action meaning.",
        },
        5,
        0.95,
        1,
      );
    if (
      el.tag === "img" &&
      selector === policy.imageSelector &&
      a.alt === undefined
    )
      add(
        {
          criterion: "1.1.1",
          selector,
          attribute: "alt",
          before: null,
          value: el.context || "",
          semantic: true,
          reason:
            "Draft copied from adjacent context, not a generated image interpretation. Human must inspect diagram and approve, edit or reject.",
        },
        3,
        0.65,
        2,
      );
    if (
      selector === policy.contrastSelector &&
      obs.violations.some(
        (v) =>
          v.id === "color-contrast" &&
          v.nodes.some((n) => n.target.includes(policy.contrastSelector)),
      )
    )
      add(
        {
          criterion: "1.4.3",
          selector,
          attribute: "class",
          before: a.class || null,
          value: policy.contrastClass,
          semantic: false,
          reason:
            "Use owner-preinstalled contrast class; known colour #344e5a on white. No arbitrary CSS generated.",
        },
        3,
        0.99,
        0.5,
      );
  }
  findings.sort((a, b) => b.priority - a.priority);
  operations.sort(
    (a, b) =>
      findings.findIndex((x) => x.operation === a.id) -
      findings.findIndex((x) => x.operation === b.id),
  );
  if (!operations.length)
    return {
      manifest: null,
      findings,
      coverage: coverage(obs),
      status: "unresolved",
      reason: "No supported repair justified; no synthetic success.",
    };
  const manifest = Manifest.parse({
    id: uid(),
    target: target.id,
    path: target.paths?.[0] || "/apply",
    locale: target.locale,
    baselineHash: obs.sha256,
    createdAt: now(),
    operations,
  });
  return {
    manifest,
    findings,
    coverage: coverage(obs),
    status: "staged",
    reason:
      "Only observed findings with constrained repair paths proposed; semantic edits held.",
  };
}
