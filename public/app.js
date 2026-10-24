"use strict";
const $ = (s) => document.querySelector(s),
  el = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = String(text);
    if (cls) e.className = cls;
    return e;
  };
let current = null,
  working = false,
  external = null;
function notice(text, error = false) {
  $("#notice").textContent = text;
  $("#notice").className = error ? "error" : "";
}
async function api(path, body) {
  const r = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Sugamya-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Request failed");
  return j;
}
function button(text, fn, cls) {
  const b = el("button", text, cls);
  b.type = "button";
  b.onclick = fn;
  return b;
}
async function perform(label, fn) {
  if (working) return;
  working = true;
  notice(label + " — waiting for actual tool results.");
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    const r = await fn();
    notice(
      r?.promoted === false
        ? "Canary rejected. The active visitor version was not changed. Inspect the failed checks."
        : label + " completed.",
    );
    await refresh();
  } catch (e) {
    notice(e.message, true);
    try {
      await refresh();
    } catch {
      /* Original error remains visible; no synthetic state. */
    }
  } finally {
    working = false;
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
    applyControls();
  }
}
function safelyDisabled() {
  return Boolean(current?.state.disabled);
}
function latest() {
  return current?.state.versions.at(-1);
}
function applyControls() {
  if (!current) return;
  document.querySelectorAll("[data-role]").forEach((b) => {
    b.hidden = b.dataset.role !== current.role;
    b.disabled = working;
  });
  const v = latest();
  $("#deploy").disabled =
    working ||
    !v ||
    !(
      v.status === "approved" ||
      (v.status === "staged" &&
        v.manifest.operations.every((o) => !o.semantic)) ||
      (v.status === "verified" && safelyDisabled())
    );
  $("#verify").disabled =
    working || !current.state.active || current.state.disabled;
  $("#scan").disabled =
    working ||
    !current.state.authorization ||
    Boolean(current.state.active && !current.state.disabled);
  $("#disable").disabled = working || !current.state.active;
}
async function refresh() {
  try {
    current = await api("/state");
    $("#login-panel").hidden = true;
    $("#console").hidden = false;
    $("#signout").hidden = false;
    render();
  } catch (e) {
    if (!current) {
      $("#login-panel").hidden = false;
      $("#console").hidden = true;
    } else throw e;
  }
}
function render() {
  const { state: s, target: t, role } = current,
    v = latest(),
    b = s.baseline;
  $("#identity").textContent = "Signed in · " + role;
  $("#target-name").textContent = t.name + " · owned fixture";
  $("#target-origin").textContent = t.origin + " → this gateway /apply";
  $("#authorization").textContent = s.authorization
    ? "Owner challenge verified " +
      new Date(s.authorization.verifiedAt).toLocaleTimeString() +
      " · expires " +
      new Date(s.authorization.expires).toLocaleDateString()
    : "Owner installation has not been verified. No repair authority claimed.";
  $("#mode").textContent = current.mode;
  const steps = [
    ["Owner verified", Boolean(s.authorization)],
    ["Baseline", Boolean(b)],
    ["Proposed", Boolean(v)],
    [
      "Approved",
      Boolean(
        v && ["approved", "canary", "active", "verified"].includes(v.status),
      ),
    ],
    ["Deployed", Boolean(s.active)],
    ["Visitor verified", Boolean(s.active && s.verification?.pass)],
    ["Report", Boolean(current.events.length)],
  ];
  $("#pipeline").replaceChildren(
    ...steps.map(([text, done]) => el("li", text, done ? "done" : "")),
  );
  $("#finding-count").textContent = b?.findings.length || 0;
  $("#repair-count").textContent = v?.manifest.operations.length || 0;
  const semantic = v?.manifest.operations.filter((o) => o.semantic) || [];
  $("#approval-count").textContent =
    (v?.approvals.filter((a) => a.action !== "reject").length || 0) +
    " / " +
    semantic.length;
  $("#task-result").textContent = s.verification
    ? s.verification.checks.find((c) => c.name === "service-task-keyboard")
        ?.pass
      ? "Completed"
      : "Failed / blocked"
    : "Not tested";
  $("#version-status").textContent = v
    ? v.status + " · " + v.manifest.id.slice(0, 8)
    : "No version staged";
  $("#deploy-detail").textContent = s.active
    ? "Visitor route is serving " + s.active + "; origin remains unchanged."
    : "No active repair. Visitors receive original origin HTML.";
  if (v) {
    const nodes = v.manifest.operations.map((o) => renderProposal(o, v));
    $("#proposal-list").replaceChildren(...nodes);
  }
  if (s.verification) {
    const vr = s.verification;
    $("#verification-list").replaceChildren(
      ...vr.checks.map((c) => {
        const d = el("details"),
          sum = el("summary");
        const row = el("span", undefined, "check");
        row.append(
          el("span", c.name.replaceAll("-", " ")),
          el("span", c.pass ? "Pass" : "Fail", c.pass ? "passed" : "failed"),
        );
        sum.append(row);
        d.append(sum, el("pre", JSON.stringify(c.detail, null, 2)));
        return d;
      }),
    );
    $("#verification-time").textContent =
      new Date(vr.at).toLocaleString() +
      " · " +
      (vr.elapsedMs / 1000).toFixed(2) +
      " s tool run · " +
      (vr.pass
        ? "All implemented gates passed."
        : "Promotion blocked or previous version restored.");
  }
  if (b) {
    const pre = el(
      "pre",
      JSON.stringify(
        {
          id: b.id,
          sha256: b.sha256,
          violations: b.violations,
          snapshot: b.snapshot,
          loadMs: b.loadMs,
        },
        null,
        2,
      ),
    );
    const link = el("a", "Download immutable baseline JSON");
    link.href = "/api/evidence/" + b.object.name;
    link.download = b.object.name;
    $("#baseline-detail").replaceChildren(pre, link);
  }
  renderCoverage();
  renderExternal();
  $("#events").replaceChildren(
    ...[...current.events].reverse().map((e) => {
      const li = el("li"),
        time = el("time", new Date(e.at).toLocaleTimeString());
      time.dateTime = e.at;
      const detail = el("details");
      detail.append(
        el("summary", e.seq + " · " + e.type),
        el(
          "pre",
          JSON.stringify(
            { data: e.data, hash: e.hash, previousHash: e.previousHash },
            null,
            2,
          ),
        ),
      );
      li.append(time, detail);
      return li;
    }),
  );
  applyControls();
}
function renderProposal(o, v) {
  const d = el("article", undefined, "proposal"),
    title = el("div", undefined, "proposal-title"),
    approval = v.approvals.find((a) => a.operation === o.id),
    finding = current.state.baseline?.findings.find(
      (f) => f.operation === o.id,
    );
  title.append(
    el("strong", o.criterion + " · " + o.selector),
    el(
      "span",
      !o.semantic
        ? "Deterministic"
        : approval
          ? approval.action === "reject"
            ? "Rejected"
            : "Human approved"
          : "Needs human review",
      "status " +
        (!o.semantic || (approval && approval.action !== "reject")
          ? "good"
          : "wait"),
    ),
  );
  d.append(title, el("p", o.reason, "caption"));
  const dl = el("dl");
  for (const [key, val] of [
    [
      "Priority",
      finding
        ? finding.priority + " · " + finding.priorityFormula
        : "Not scored",
    ],
    [
      "Risk",
      o.semantic
        ? "Changes meaning / association"
        : "Owner-approved presentation class",
    ],
    ["Evidence", "Local DOM, axe and surrounding public context"],
  ])
    dl.append(el("dt", key), el("dd", val));
  d.append(dl);
  if (o.attribute === "alt") {
    const image = el("img");
    image.src = "/map.svg";
    image.alt =
      "Source diagram for human review: entrance route to service desk";
    d.append(image);
  }
  const diff = el("div", undefined, "diff");
  diff.append(
    el("span", "Before"),
    el("span", o.before === null ? "Attribute absent" : o.before),
    el("span", "Proposed"),
    el("code", o.attribute + '="' + o.value + '"'),
  );
  d.append(diff);
  const modelDraft = v.modelDrafts?.filter((x) => x.operation === o.id).at(-1);
  if (modelDraft)
    d.append(
      el(
        "p",
        "AI source: " +
          modelDraft.source +
          " · Uncertainty: " +
          modelDraft.uncertainty,
        "caption",
      ),
    );
  if (
    o.attribute === "alt" &&
    current.role === "operator" &&
    ["staged", "approved"].includes(v.status)
  ) {
    const controls = el("div");
    const review = button("Review optional AI data request", async () => {
      try {
        const preview = await api(
          "/versions/" + v.manifest.id + "/model-payload/" + o.id,
        );
        const section = el("section");
        section.append(
          el("h3", "Explicit remote-processing consent"),
          el(
            "p",
            preview.provider.name +
              " / " +
              preview.provider.model +
              " · " +
              preview.bytes +
              " bytes. " +
              preview.provider.retention,
            "caption",
          ),
          el("pre", JSON.stringify(preview.payload, null, 2)),
          el(
            "p",
            "Excluded: " +
              preview.excluded.join(", ") +
              ". No request has been sent yet.",
            "caption",
          ),
        );
        const label = el(
            "label",
            "Send this exact minimized text to Groq for one unapproved draft",
          ),
          checkbox = el("input");
        checkbox.type = "checkbox";
        label.prepend(checkbox);
        section.append(label);
        const send = button("Send consented text & draft", () =>
          perform("Remote text drafting", async () => {
            if (!checkbox.checked)
              throw Error("Explicit consent checkbox must be selected.");
            const r = await api(
              "/versions/" + v.manifest.id + "/model-draft/" + o.id,
              { consent: true, payloadHash: preview.payloadHash },
            );
            if (r.draft.status === "unresolved")
              throw Error(
                "AI marked evidence unresolved: " + r.draft.uncertainty,
              );
            return r;
          }),
        );
        section.append(send);
        if (!preview.available) {
          send.disabled = true;
          section.append(
            el(
              "p",
              "Provider is unavailable on this installation. Continue with the existing manual draft.",
              "caption",
            ),
          );
        }
        controls.replaceChildren(section);
      } catch (e) {
        notice(e.message, true);
      }
    });
    controls.append(review);
    d.append(controls);
  }
  if (
    o.semantic &&
    current.role === "approver" &&
    ["staged", "approved"].includes(v.status)
  ) {
    const wrap = el("div", undefined, "review-fields"),
      label = el("label", "Reviewed value"),
      input = el("textarea");
    input.value = o.value;
    label.append(input);
    const reasonLabel = el("label", "Decision rationale"),
      reason = el("input");
    reason.type = "text";
    reason.maxLength = 500;
    reason.placeholder = "Explain why this meaning is appropriate";
    reasonLabel.append(reason);
    wrap.append(label, reasonLabel);
    const act = (action) => () =>
      perform("Semantic " + action, () => {
        if (reason.value.trim().length < 3)
          throw Error("Enter a rationale (at least three characters).");
        return api("/versions/" + v.manifest.id + "/decisions/" + o.id, {
          action,
          reason: reason.value.trim(),
          ...(action === "edit" ? { value: input.value.trim() } : {}),
        });
      });
    const actions = el("div", undefined, "review-actions");
    actions.append(
      button("Approve", act("approve")),
      button("Edit & approve", act("edit")),
      button("Reject version", act("reject"), "danger"),
    );
    d.append(wrap, actions);
  } else if (o.semantic && !approval)
    d.append(
      el(
        "p",
        "Sign in as approver to review this meaning-changing operation.",
        "caption",
      ),
    );
  if (approval) d.append(el("p", "Decision: " + approval.reason, "caption"));
  return d;
}
function renderCoverage() {
  const b = current?.state.baseline,
    filter = $("#coverage-filter").value,
    rows = b?.coverage || [];
  if (rows.length) {
    const counts = rows.reduce(
      (a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a),
      {},
    );
    $("#coverage-summary").textContent =
      rows.length +
      " WCAG 2.2 AA criteria inventoried · " +
      Object.entries(counts)
        .map(([k, v]) => v + " " + k)
        .join(" · ") +
      ". No whole-criterion or conformance pass is inferred.";
  }
  $("#criteria-body").replaceChildren(
    ...rows
      .filter((r) => filter === "all" || r.status === filter)
      .map((r) => {
        const tr = el("tr"),
          a = el("a", r.id + " " + r.name);
        a.href = r.url;
        a.target = "_blank";
        a.rel = "noopener";
        const one = el("td");
        one.append(a);
        const two = el("td", r.status),
          three = el("td");
        three.append(el("p", r.method), el("p", r.reason, "caption"));
        const det = el("details");
        det.append(
          el("summary", "Applicability & priority detail"),
          el("pre", JSON.stringify(r, null, 2)),
        );
        three.append(det);
        tr.append(one, two, three);
        return tr;
      }),
  );
}
$("#login").addEventListener("submit", (e) => {
  e.preventDefault();
  perform("Sign in", async () => {
    await api("/session", { token: $("#access-token").value });
    $("#access-token").value = "";
    current = null;
    await refresh();
  });
});
$("#signout").onclick = () =>
  perform("Sign out", async () => {
    await api("/logout", {});
    current = null;
    $("#console").hidden = true;
    $("#login-panel").hidden = false;
    $("#signout").hidden = true;
    $("#identity").textContent = "Not signed in";
  });
$("#connect").onclick = () =>
  perform("Owner verification", () => api("/connect", {}));
$("#scan").onclick = () => perform("Observe & plan", () => api("/scan", {}));
$("#deploy").onclick = () =>
  perform("Independent canary & visitor deployment", () =>
    api("/versions/" + latest().manifest.id + "/deploy", {}),
  );
$("#disable").onclick = () =>
  perform("Emergency disable", () => api("/disable", {}));
$("#verify").onclick = () =>
  perform("Visitor verification", () => api("/verify", {}));
$("#coverage-filter").onchange = renderCoverage;
$("#roi").onsubmit = (e) => {
  e.preventDefault();
  const vals = ["sites", "baseline", "review", "rate"].map((k) =>
    Number($("#roi-" + k).value),
  );
  if (vals.some((v) => !Number.isFinite(v) || v < 0))
    return notice("Enter non-negative numbers", true);
  const [sites, baseline, review, rate] = vals,
    hours = (sites * (baseline - review)) / 60;
  $("#roi-result").textContent =
    "Forecast only: " +
    hours.toFixed(1) +
    " operator hours / month; ₹" +
    Math.round(hours * rate).toLocaleString("en-IN") +
    " gross effort value. Low-volume case (1 site): ₹" +
    Math.round(((baseline - review) / 60) * rate) +
    ". Double-review-burden case: ₹" +
    Math.round(((sites * (baseline - 2 * review)) / 60) * rate) +
    ". Excludes hosting, setup, manual audits and maintenance. These inputs are assumptions, not measured savings.";
};
function renderExternal() {
  const box = $("#external-result");
  if (!box) return;
  if (!external) {
    box.replaceChildren();
    return;
  }
  const head = el("div", undefined, "section-head");
  head.append(el("h3", "Proposals for " + external.url));
  const link = el("a", "Open fixed preview ↗", "button");
  link.href = external.previewUrl;
  link.target = "_blank";
  link.rel = "noopener";
  head.append(link);
  const summary = el(
    "p",
    external.operations.length +
      " supported operation(s) · " +
      external.contrast.length +
      " contrast finding(s) need owner CSS",
    "caption",
  );
  const nodes = [head, summary];
  for (const o of external.operations) nodes.push(renderExternalOp(o));
  if (external.coverage?.length) {
    const counts = external.coverage.reduce(
      (a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a),
      {},
    );
    nodes.push(
      el(
        "p",
        "WCAG 2.2 A/AA: " +
          external.coverage.length +
          " criteria · " +
          Object.entries(counts)
            .map(([k, v]) => v + " " + k.replaceAll("-", " "))
            .join(" · "),
        "caption",
      ),
    );
    const det = el("details");
    det.append(el("summary", "Coverage by criterion"));
    const table = el("table"),
      thead = el("thead"),
      hr = el("tr");
    hr.append(el("th", "Criterion"), el("th", "Status"), el("th", "Method"));
    thead.append(hr);
    const tbody = el("tbody");
    for (const r of external.coverage) {
      const tr = el("tr");
      tr.append(
        el("td", r.id + " " + r.name),
        el("td", r.status),
        el("td", r.method + " — " + r.reason),
      );
      tbody.append(tr);
    }
    table.append(thead, tbody);
    det.append(table);
    nodes.push(det);
  }
  if (external.probes) {
    const p = external.probes;
    nodes.push(
      el(
        "p",
        "Probes: " +
          (p.keyboard?.order?.length || 0) +
          " Tab steps, " +
          (p.keyboard?.traps?.length || 0) +
          " trap candidate(s); focus indicator missing on " +
          (p.focusVisible?.missing || 0) +
          "/" +
          (p.focusVisible?.checked || 0) +
          "; targets under 24px: " +
          (p.targetSize?.failing || 0) +
          "/" +
          (p.targetSize?.checked || 0) +
          "; 320px reflow: " +
          (p.reflow?.horizontalScroll
            ? "horizontal scroll"
            : "no horizontal scroll"),
        "caption",
      ),
    );
  }
  if (external.contrast.length) {
    const det = el("details");
    det.append(
      el("summary", "Contrast findings (detected, not auto-fixed)"),
      el("pre", JSON.stringify(external.contrast, null, 2)),
    );
    nodes.push(det);
  }
  box.replaceChildren(...nodes);
}
function renderExternalOp(o) {
  const card = el("article", undefined, "proposal");
  const title = el("div", undefined, "proposal-title");
  const decided = o.decision && o.decision.action !== "reject";
  title.append(
    el("strong", o.criterion + " · " + o.kind),
    el(
      "span",
      o.decision
        ? o.decision.action === "reject"
          ? "Rejected"
          : "Human approved"
        : o.provisional
          ? "Provisional AI draft — needs approval"
          : "Needs human review",
      "status " + (decided ? "good" : "wait"),
    ),
  );
  card.append(title, el("p", o.reason, "caption"));
  if (o.source) card.append(el("p", "Source: " + o.source, "caption"));
  const diff = el("div", undefined, "diff");
  diff.append(
    el("span", "Before"),
    el("span", o.before === null ? "Attribute absent" : o.before),
    el("span", "Proposed"),
    el("code", o.attribute + '="' + o.value + '"'),
  );
  card.append(diff);
  if (current?.role === "operator" || current?.role === "approver") {
    const wrap = el("div", undefined, "review-fields");
    const label = el("label", "Change value (review off, applied on reload)");
    const input = el("input");
    input.type = "text";
    input.value = o.value;
    input.maxLength = 300;
    label.append(input);
    wrap.append(label);
    const actions = el("div", undefined, "review-actions");
    actions.append(
      button("Apply change", () =>
        perform("Apply change", async () => {
          external = await api(
            "/external/" + external.id + "/operation/" + o.id,
            { value: input.value.trim() },
          );
          renderExternal();
          return external;
        }),
      ),
      button("Reject", () =>
        perform("Reject change", async () => {
          external = await api(
            "/external/" + external.id + "/decide",
            { operationId: o.id, action: "reject", reason: "Rejected in demo" },
          );
          renderExternal();
          return external;
        }),
        "danger",
      ),
    );
    card.append(wrap, actions);
  }
  return card;
}
$("#external-form").addEventListener("submit", (e) => {
  e.preventDefault();
  perform("Analyze URL", async () => {
    const url = $("#external-url").value.trim();
    if (!url) throw Error("Enter a public URL");
    external = await api("/external/analyze", { url });
    $("#external-note").textContent =
      "Analysed " +
      external.url +
      ". Approve changes, then open the fixed preview.";
    renderExternal();
    return external;
  });
});
refresh().catch((e) => notice(e.message, true));
