import "./env.js";
import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { z } from "zod";
import {
  Target,
  Decision,
  Manifest,
  Approval,
  Authorization,
} from "./contracts.js";
import { Store, hash, uid, now } from "./store.js";
import { plan } from "./planner.js";
import { observe, verify } from "./browser.js";
import { recover } from "./recovery.js";
import { draft, previewPayload, PROVIDER } from "./model.js";
import { transform, approvalsComplete } from "./transform.js";
import {
  analyzeUrl,
  decide as decideExternal,
  getPublicSession,
  pendingQueue,
  previewHtml,
  setValue as setExternalValue,
} from "./external.js";
const target = Target.parse(
  JSON.parse(
    fs.readFileSync(process.env.TARGET_CONFIG || "config/target.json", "utf8"),
  ),
);
// Origin is a startup installation choice, never an operator-submitted URL. Local HTTP is fixture-only.
const origin = new URL(target.origin);
if (
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  !["http:", "https:"].includes(origin.protocol)
)
  throw Error("Invalid installed origin");
if (
  origin.protocol === "http:" &&
  !["127.0.0.1", "localhost", "origin"].includes(origin.hostname)
)
  throw Error("Non-local origins require HTTPS");
const store = new Store(process.env.DATA_DIR || "var"),
  app = express(),
  port = Number(process.env.PORT || 4100),
  base = `http://127.0.0.1:${port}`;
if (store.state.versions.some((v) => v.manifest.target !== target.id))
  throw Error(
    "Stored manifest target scope mismatch; use a separate DATA_DIR per installation",
  );
const installation = { target: target.id, origin: target.origin };
if (
  store.state.installation &&
  hash(store.state.installation) !== hash(installation)
)
  throw Error(
    "Stored installation scope mismatch; use a separate DATA_DIR per installation",
  );
if (!store.state.installation) {
  store.state.installation = installation;
  store.event("installation.bound", installation);
  store.save();
}
app.disable("x-powered-by");
app.set("trust proxy", false);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    strictTransportSecurity: false,
  }),
);
app.use(express.json({ limit: "12kb", strict: true }));
recover(store);
const sessions = new Map(),
  rates = new Map();
function limit(req, res, next) {
  const key = req.socket.remoteAddress,
    ts = Date.now(),
    v = rates.get(key);
  if (!v || v.until < ts) {
    rates.set(key, { count: 1, until: ts + 60000 });
    if (rates.size > 5000) rates.clear();
    return next();
  }
  if (++v.count > 180)
    return res.status(429).json({ error: "Rate limit; retry in one minute" });
  next();
}
app.use("/api", limit);
const same = (a, b) =>
  typeof a === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
function roleFor(token) {
  if (same(token, process.env.OPERATOR_TOKEN)) return "operator";
  if (same(token, process.env.APPROVER_TOKEN)) return "approver";
  return null;
}
app.post("/api/session", (req, res) => {
  if (req.get("X-Sugamya-Request") !== "1")
    return res
      .status(403)
      .json({ error: "Same-origin request header required" });
  const body = z
    .object({ token: z.string().max(300) })
    .strict()
    .safeParse(req.body);
  const role = body.success ? roleFor(body.data.token) : null;
  if (!role) return res.status(401).json({ error: "Invalid access token" });
  const id = randomBytes(32).toString("hex");
  sessions.set(id, { role, expires: Date.now() + 30 * 60000 });
  if (sessions.size > 500) sessions.delete(sessions.keys().next().value);
  res.setHeader(
    "Set-Cookie",
    `sugamya=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800${req.get("x-forwarded-proto") === "https" ? "; Secure" : ""}`,
  );
  res.json({ role, expiresMinutes: 30 });
});
app.use("/api", (req, res, next) => {
  const bearer = req.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
  let role = bearer ? roleFor(bearer) : null;
  const cookie = req
    .get("Cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("sugamya="))
    ?.slice(8);
  if (!role && cookie) {
    const session = sessions.get(cookie);
    if (session?.expires > Date.now()) role = session.role;
    else sessions.delete(cookie);
  }
  if (!role) return res.status(401).json({ error: "Authentication required" });
  if (req.method !== "GET" && !bearer && req.get("X-Sugamya-Request") !== "1")
    return res
      .status(403)
      .json({ error: "CSRF protection: request header required" });
  req.role = role;
  next();
});
app.post("/api/logout", (req, res) => {
  const cookie = req.get("Cookie")?.match(/(?:^|;\s*)sugamya=([^;]+)/)?.[1];
  if (cookie) sessions.delete(cookie);
  res.setHeader(
    "Set-Cookie",
    "sugamya=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  );
  res.json({ signedOut: true });
});
app.use("/api", (req, res, next) => {
  if (
    req.method === "POST" &&
    (/^\/(connect|scan|verify|disable|logout)$/.test(req.path) ||
      /^\/versions\/[^/]+\/deploy$/.test(req.path))
  ) {
    const empty = z.object({}).strict().safeParse(req.body);
    if (!empty.success)
      return res.status(400).json({
        error:
          "Unexpected request properties; targets are installation-time configuration",
      });
  }
  next();
});
const requireRole = (role) => (req, res, next) =>
  req.role === role
    ? next()
    : res.status(403).json({ error: `${role} role required` });
const authorized = () =>
  store.state.authorization &&
  Date.parse(store.state.authorization.expires) > Date.now();
const installedPaths = new Set([...target.paths, ...target.assetPaths]);
async function originFetch(path, options = {}) {
  if (
    !installedPaths.has(path) &&
    path !== "/.well-known/sugamya-authorization" &&
    path !== "/dynamic"
  )
    throw Error("Origin path denied");
  const r = await fetch(new URL(path, origin), {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
    headers: { "Accept-Encoding": "identity", ...(options.headers || {}) },
  });
  if (r.status >= 300 && r.status < 400) throw Error("Origin redirects denied");
  const length = Number(r.headers.get("content-length") || 0);
  if (length > 1024 * 1024) throw Error("Origin body limit");
  return r;
}
async function boundedText(r) {
  const reader = r.body.getReader();
  let total = 0,
    parts = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 1024 * 1024) throw Error("Origin body limit");
      parts.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(parts).toString("utf8");
}
async function connect() {
  const r = await originFetch("/.well-known/sugamya-authorization");
  if (!r.ok) throw Error("Owner challenge unavailable");
  const j = JSON.parse(await boundedText(r));
  if (
    !same(j.challenge, process.env.OWNER_CHALLENGE) ||
    j.target !== target.id ||
    JSON.stringify(j.paths) !== JSON.stringify(target.paths)
  )
    throw Error("Owner challenge mismatch");
  const expires = new Date(
    Math.min(Date.parse(j.expires), Date.parse(target.authorizationExpires)),
  ).toISOString();
  if (Date.parse(expires) <= Date.now())
    throw Error("Owner authorization expired");
  const auth = Authorization.parse({
    target: target.id,
    origin: target.origin,
    paths: target.paths,
    verifiedAt: now(),
    expires,
    method: "owner-installed challenge",
  });
  store.state.authorization = auth;
  store.event("authorization.verified", auth);
  store.save();
  return auth;
}
let busy = false;
function action(fn) {
  return async (req, res, next) => {
    if (busy)
      return res
        .status(409)
        .json({ error: "An operational action is already running" });
    busy = true;
    try {
      res.json(await fn(req, res));
    } catch (e) {
      next(e);
    } finally {
      busy = false;
    }
  };
}
function version(id) {
  const v = store.state.versions.find((v) => v.manifest.id === id);
  if (!v) throw Error("Version not found");
  return v;
}
const baselineFor = (v) => store.object(v.baselineObject.name);
app.get("/api/state", (req, res) =>
  res.set("Cache-Control", "no-store").json({
    role: req.role,
    target: { ...target, origin: target.origin },
    state: store.state,
    busy,
    events: store.events.slice(-60),
    model: {
      provider: PROVIDER,
      available: Boolean(process.env.GROQ_API_KEY),
      calls: store.events.filter((e) => e.type === "model.completed").length,
    },
    mode: "Evidence-driven agent: deterministic repairs; optional Groq text drafting only after explicit minimal-payload consent; human semantics approval always required",
    limits: [
      "Controlled owned fixture, not a government deployment",
      "Server-rendered public HTML only",
      "No WCAG conformance claim",
      "Capability-token roles; no enterprise SSO or tenant isolation",
    ],
  }),
);
app.post(
  "/api/connect",
  requireRole("operator"),
  action(() => connect()),
);
app.post(
  "/api/scan",
  requireRole("operator"),
  action(async () => {
    if (!authorized()) throw Error("Connect owner-authorized target first");
    if (store.state.versions.length >= 100)
      throw Error(
        "Local version budget exhausted; export/archive this deployment before a new run",
      );
    const baseline = await observe(base + target.paths[0], {
      contrastSelector: target.policy.contrastSelector,
    }); // actual visitor route, disable required to establish origin baseline
    if (store.state.active && !store.state.disabled)
      throw Error(
        "Disable active transformations before a new origin baseline",
      );
    const originResult = await originFetch(target.paths[0]);
    if (!originResult.ok) throw Error("Origin unavailable");
    const html = await boundedText(originResult);
    if (hash(html) !== baseline.safe.sha256)
      throw Error("Baseline differs from original response");
    const record = { ...baseline, html };
    const obj = store.put("baseline", record);
    const result = plan(record, target);
    store.state.baseline = {
      ...baseline.safe,
      object: obj,
      coverage: result.coverage,
      findings: result.findings,
    };
    store.event("evidence.observed", {
      evidence: obj,
      method: baseline.safe.method,
      violations: baseline.safe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.length,
      })),
    });
    if (result.manifest) {
      const v = {
        manifest: result.manifest,
        approvals: [],
        status: "staged",
        baselineObject: obj,
        history: [],
      };
      store.state.versions.push(v);
      store.put("manifest", v.manifest);
      store.event("proposal.staged", {
        version: v.manifest.id,
        manifestHash: hash(v.manifest),
        findings: result.findings,
      });
    } else store.event("agent.unresolved", { reason: result.reason });
    store.save();
    return result;
  }),
);
app.get(
  "/api/versions/:id/model-payload/:operation",
  requireRole("operator"),
  (req, res, next) => {
    try {
      const v = version(req.params.id),
        op = v.manifest.operations.find((o) => o.id === req.params.operation);
      if (!op) throw Error("Operation not found");
      res.json(previewPayload(op, baselineFor(v), target));
    } catch (e) {
      next(e);
    }
  },
);
app.post(
  "/api/versions/:id/model-draft/:operation",
  requireRole("operator"),
  action(async (req) => {
    const consent = z
        .object({
          consent: z.literal(true),
          payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .parse(req.body),
      v = version(req.params.id);
    if (!["staged", "approved"].includes(v.status))
      throw Error("Only a staged version can receive a model draft");
    const op = v.manifest.operations.find((o) => o.id === req.params.operation);
    if (!op) throw Error("Operation not found");
    if (store.events.filter((e) => e.type === "model.requested").length >= 20)
      throw Error(
        "Local run model budget exhausted (20 requests); continue manually",
      );
    const preview = previewPayload(op, baselineFor(v), target);
    if (preview.payloadHash !== consent.payloadHash)
      throw Error("Evidence changed since consent preview");
    store.event("model.consent", {
      version: v.manifest.id,
      operation: op.id,
      provider: PROVIDER.name,
      payloadHash: preview.payloadHash,
      bytes: preview.bytes,
      excludes: preview.excluded,
    });
    store.event("model.requested", {
      provider: PROVIDER.name,
      model: PROVIDER.model,
      payloadHash: preview.payloadHash,
    });
    let result;
    try {
      result = await draft(preview, {
        consent: true,
        expectedHash: consent.payloadHash,
      });
    } catch (e) {
      store.event("model.unavailable", {
        provider: PROVIDER.name,
        reason: "PROVIDER_OR_CONTRACT_FAILURE",
        proposalUnchanged: true,
      });
      store.save();
      throw e;
    }
    const evidence = store.put("model", result);
    store.event("model.completed", {
      version: v.manifest.id,
      operation: op.id,
      status: result.draft.status,
      evidence,
      usage: result.usage,
    });
    if (result.draft.status === "draft") {
      const candidate = structuredClone(v.manifest);
      candidate.operations.find((o) => o.id === op.id).value =
        result.draft.value;
      Manifest.parse(candidate);
      v.history.push({
        manifest: store.put("manifest", v.manifest),
        approvals: structuredClone(v.approvals),
        at: now(),
      });
      v.manifest = candidate;
      v.approvals = [];
      v.status = "staged";
      v.modelDrafts = [
        ...(v.modelDrafts || []),
        {
          operation: op.id,
          evidence,
          manifestHash: hash(candidate),
          uncertainty: result.draft.uncertainty,
          source: PROVIDER.name + " / " + PROVIDER.model,
        },
      ];
      store.put("manifest", candidate);
    }
    store.save();
    return { ...result, evidence, humanApprovalRequired: true };
  }),
);
app.post(
  "/api/versions/:id/decisions/:operation",
  requireRole("approver"),
  action(async (req) => {
    const decision = Decision.parse(req.body),
      v = version(req.params.id);
    if (!["staged", "approved"].includes(v.status))
      throw Error("Only staged/approved versions can be reviewed");
    const op = v.manifest.operations.find((o) => o.id === req.params.operation);
    if (!op || !op.semantic) throw Error("Semantic operation not found");
    if (decision.action === "edit") {
      if (!decision.value) throw Error("Edited value required");
      const candidate = structuredClone(v.manifest),
        edit = candidate.operations.find((o) => o.id === op.id);
      edit.value = decision.value;
      Manifest.parse(candidate);
      v.history.push({
        manifest: store.put("manifest", v.manifest),
        approvals: structuredClone(v.approvals),
        at: now(),
      });
      v.manifest = candidate;
      v.approvals = [];
      store.put("manifest", v.manifest);
    }
    const current = v.manifest.operations.find(
      (o) => o.id === req.params.operation,
    );
    const approval = Approval.parse({
      id: uid(),
      version: v.manifest.id,
      operation: current.id,
      manifestHash: hash(v.manifest),
      operationHash: hash(current),
      actor: "approver",
      action: decision.action,
      reason: decision.reason,
      at: now(),
    });
    v.approvals = v.approvals.filter((a) => a.operation !== current.id);
    v.approvals.push(approval);
    v.status =
      decision.action === "reject"
        ? "rejected"
        : approvalsComplete(v)
          ? "approved"
          : "staged";
    store.event(`semantic.${decision.action}`, approval);
    store.save();
    return { version: v.manifest.id, status: v.status, approval };
  }),
);
app.post(
  "/api/versions/:id/deploy",
  requireRole("operator"),
  action(async (req) => {
    const v = version(req.params.id);
    if (store.state.active === v.manifest.id && !store.state.disabled)
      throw Error(
        "Version already active; re-verify or disable before reactivation",
      );
    if (!["approved", "staged", "verified"].includes(v.status))
      throw Error("Version not eligible for deployment");
    if (!approvalsComplete(v))
      throw Error("Unresolved semantic approval prevents deployment");
    await connect();
    const original = await originFetch(v.manifest.path);
    const html = await boundedText(original);
    const transformed = transform(html, v, target, v.manifest.path);
    if (!transformed.applied)
      throw Error("Staging precondition: " + transformed.reason);
    const previous = store.state.active;
    store.state.canary = v.manifest.id;
    v.status = "canary";
    store.event("deployment.canary", { version: v.manifest.id, previous });
    store.save();
    const canary = await verify(
      base + "/canary" + v.manifest.path,
      v,
      baselineFor(v),
      target,
    );
    const canaryEvidence = store.put("verification", canary);
    store.state.verification = { ...canary, evidence: canaryEvidence };
    store.event("verification.canary", {
      version: v.manifest.id,
      pass: canary.pass,
      evidence: canaryEvidence,
    });
    store.state.canary = null;
    if (!canary.pass) {
      v.status = "withheld";
      store.event("promotion.withheld", {
        version: v.manifest.id,
        activeUnchanged: previous,
        reason: "Independent canary gate failed",
      });
      store.save();
      return { promoted: false, verification: canary };
    }
    store.state.active = v.manifest.id;
    store.state.disabled = false;
    v.status = "active";
    store.event("deployment.activated", { version: v.manifest.id, previous });
    store.save();
    const visitor = await verify(
        base + v.manifest.path,
        v,
        baselineFor(v),
        target,
      ),
      visitorEvidence = store.put("verification", visitor);
    store.state.verification = { ...visitor, evidence: visitorEvidence };
    store.event("verification.visitor", {
      version: v.manifest.id,
      pass: visitor.pass,
      evidence: visitorEvidence,
    });
    if (!visitor.pass) {
      store.state.active = previous;
      v.status = "rolled-back";
      store.event("deployment.rolled-back", {
        from: v.manifest.id,
        to: previous,
        reason: "Independent visitor verification failed",
        at: now(),
      });
    } else {
      store.state.lastGood = v.manifest.id;
      v.status = "verified";
      store.event("deployment.verified", { version: v.manifest.id });
    }
    store.save();
    return { promoted: visitor.pass, verification: visitor };
  }),
);
app.post(
  "/api/verify",
  requireRole("operator"),
  action(async () => {
    if (!store.state.active || store.state.disabled)
      throw Error("No active visitor repair to verify");
    const v = version(store.state.active),
      r = await verify(base + v.manifest.path, v, baselineFor(v), target),
      obj = store.put("verification", r);
    store.state.verification = { ...r, evidence: obj };
    store.event("verification.observed", {
      version: v.manifest.id,
      pass: r.pass,
      evidence: obj,
    });
    if (!r.pass) {
      const previous =
        store.state.lastGood === v.manifest.id ? null : store.state.lastGood;
      store.state.active = previous;
      v.status = "rolled-back";
      store.event("deployment.rolled-back", {
        from: v.manifest.id,
        to: previous,
        reason: "Observed verification failed",
        at: now(),
      });
    }
    store.save();
    return r;
  }),
);
app.post(
  "/api/disable",
  requireRole("operator"),
  action(async () => {
    const previous = store.state.active;
    store.state.disabled = true;
    store.state.active = null;
    store.state.canary = null;
    store.event("deployment.emergency-disabled", {
      previous,
      restored: "original origin response",
    });
    store.save();
    return { disabled: true, previous };
  }),
);
app.get("/api/evidence/:name", (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store").json(store.object(req.params.name));
  } catch (e) {
    next(e);
  }
});
app.get("/api/report", (req, res) => {
  store.validate();
  res
    .set({
      "Content-Disposition": 'attachment; filename="sugamya-run-report.json"',
      "Cache-Control": "no-store",
    })
    .json({
      generatedAt: now(),
      product: "Sugamya",
      team: "The Screen Readers / HX-P3JQ",
      target,
      state: store.state,
      events: store.events,
      integrity: {
        verified: true,
        head: store.events.at(-1)?.hash || null,
        limits:
          "Hash chain detects edits against retained head; local administrator can rewrite whole log. Not external notarization.",
      },
      privacy: {
        remoteCalls: store.events.filter((e) => e.type === "model.requested")
          .length,
        completedCalls: store.events.filter((e) => e.type === "model.completed")
          .length,
        externalModels:
          "Groq text-only, optional per-request explicit consent; no screenshots/images/HTML",
        signedInPages: "unsupported; deny by default",
      },
      roi: {
        measuredHumanReviewMinutes: null,
        measuredSetupMinutes: null,
        modelCost: store.events.some((e) => e.type === "model.completed")
          ? "Invoice/rate not verified"
          : 0,
        claims:
          "No human-study or time-saving claim; forecast requires explicit operator inputs.",
      },
    });
});
// ---------------------------------------------------------------------------
// External-URL mode: analyse any public URL, approve fixes, reload the preview.
// This is additive and does not touch the owner-installed exact-fingerprint
// pipeline above.
// ---------------------------------------------------------------------------
app.post(
  "/api/external/analyze",
  requireRole("operator"),
  action(async (req) => {
    const body = z
      .object({ url: z.string().min(4).max(2000) })
      .strict()
      .safeParse(req.body);
    if (!body.success) throw Error("A public URL is required");
    return analyzeUrl(body.data.url);
  }),
);
app.get("/api/external/queue", (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store").json(pendingQueue());
  } catch (e) {
    next(e);
  }
});
app.get("/api/external/:id", (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store").json(getPublicSession(req.params.id));
  } catch (e) {
    next(e);
  }
});
app.post(
  "/api/external/:id/operation/:opId",
  action(async (req) =>
    setExternalValue(req.params.id, req.params.opId, req.body?.value),
  ),
);
app.post(
  "/api/external/:id/decide",
  action(async (req) =>
    decideExternal(req.params.id, req.body?.operationId, req.body),
  ),
);
app.get("/preview/:id", (req, res, next) => {
  try {
    // The preview renders a snapshot of a third-party page on this origin, so
    // it gets a scoped, permissive policy rather than the console's strict CSP.
    res.setHeader(
      "Content-Security-Policy",
      "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; img-src * data: blob:; style-src * 'unsafe-inline'; font-src * data:",
    );
    res.set("Cache-Control", "no-store");
    res.set("X-Sugamya-Version", "external-preview");
    res.type("html").send(previewHtml(req.params.id));
  } catch (e) {
    next(e);
  }
});
const skips = new Map();
async function gateway(req, res, next) {
  try {
    const canary = req.path.startsWith("/canary/"),
      path = canary ? req.path.slice(7) : req.path;
    if (req.url.includes("?"))
      return res
        .status(400)
        .send("Query-bearing pages are outside authorized repair scope");
    if (req.get("Cookie") || req.get("Authorization")) {
      if (
        !req
          .get("Cookie")
          ?.split(";")
          .every((x) => x.trim().startsWith("sugamya="))
      )
        return res
          .status(403)
          .send("Signed-in target content is outside this public repair route");
    }
    if (!installedPaths.has(path) && path !== "/dynamic")
      return res.status(403).send("Unauthorized origin path");
    if (
      !["GET", "POST", "HEAD"].includes(req.method) ||
      (req.method === "POST" && path !== target.paths[0])
    )
      return res.status(405).send("Method outside installed route");
    const headers = {},
      options = { method: req.method, headers };
    if (req.method === "POST") {
      const ct = req.get("content-type");
      if (ct !== "application/x-www-form-urlencoded")
        return res.status(415).send("Only fixture form POST supported");
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > 2048) return res.status(413).send("Form body too large");
        chunks.push(c);
      }
      options.body = Buffer.concat(chunks);
      headers["Content-Type"] = ct;
    }
    const r = await originFetch(path, options);
    if (r.status >= 500) {
      const key = "origin-" + r.status;
      if ((skips.get(key) || 0) < Date.now() - 10000) {
        skips.set(key, Date.now());
        store.event("origin.http-error", {
          path,
          status: r.status,
          repairClaimed: false,
        });
      }
    }
    res.status(r.status);
    for (const name of [
      "content-type",
      "content-security-policy",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
      "content-language",
    ]) {
      const val = r.headers.get(name);
      if (val) res.set(name, val);
    }
    res.set({
      "Cache-Control": "no-store, private",
      Vary: "Cookie",
      "X-Sugamya-Version": "origin",
      "X-Sugamya-Delivery": "owner-controlled-reverse-proxy",
    });
    if (req.method === "HEAD") return res.end();
    const body = await boundedText(r);
    let outgoing = body;
    const active = canary
      ? store.state.canary
      : store.state.disabled
        ? null
        : store.state.active;
    if (
      active &&
      r.ok &&
      req.method === "GET" &&
      target.paths.includes(path) &&
      r.headers.get("content-type")?.includes("text/html") &&
      authorized()
    ) {
      const v = version(active),
        result = transform(body, v, target, path);
      if (result.applied) {
        outgoing = result.html;
        res.set("X-Sugamya-Version", active);
      } else {
        res.set("X-Sugamya-Skip", result.reason);
        const k = active + result.reason;
        if ((skips.get(k) || 0) < Date.now() - 10000) {
          skips.set(k, Date.now());
          store.event("transformation.skipped", {
            version: active,
            path,
            reason: result.reason,
          });
          store.save();
        }
      }
    }
    res.send(outgoing);
  } catch {
    store.event("origin.unavailable", {
      path: req.path,
      code: "FETCH_OR_BODY_FAILURE",
    });
    res
      .status(502)
      .type("text")
      .send("Origin unavailable. No repair result claimed.");
  }
}
app.use((req, res, next) => {
  if (
    installedPaths.has(req.path) ||
    target.paths.some((p) => req.path === "/canary" + p) ||
    req.path === "/dynamic"
  )
    return gateway(req, res, next);
  next();
});
app.all(["/private", "/canary/private"], (req, res) =>
  res.status(403).send("Sensitive paths are not authorized"),
);
app.use(
  express.static("public", {
    dotfiles: "deny",
    index: "index.html",
    maxAge: 0,
  }),
);
app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use((e, req, res, next) => {
  const code = e instanceof z.ZodError ? "CONTRACT_REJECTED" : "ACTION_FAILED";
  store.event("action.failed", { code, route: req.route?.path || "unknown" });
  res.status(e instanceof z.ZodError ? 400 : 409).json({
    error:
      e instanceof z.ZodError
        ? "Schema validation failed: " +
          e.issues.map((i) => i.message).join("; ")
        : e.message.slice(0, 300),
    code,
  });
});
app.listen(port, "0.0.0.0", () =>
  console.log(
    `Sugamya gateway and operator console listening on ${port}. No credentials are logged.`,
  ),
);
