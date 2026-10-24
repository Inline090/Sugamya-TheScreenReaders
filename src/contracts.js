import { z } from "zod";
const selector = z.string().regex(/^#[A-Za-z][A-Za-z0-9_-]{0,60}$/);
const route = z
  .string()
  .regex(/^\/[a-zA-Z0-9_./-]{1,100}$/)
  .refine(
    (s) =>
      !s.split("/").some((p) => p === "." || p === "..") && !s.includes("//"),
    "No path traversal or ambiguous segments",
  );
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const Target = z
  .object({
    id,
    name: z.string().max(100),
    origin: z.url(),
    paths: z.array(route).min(1).max(1),
    assetPaths: z.array(route),
    publicEvidence: z.literal(true),
    standard: z.literal("WCAG 2.2 AA"),
    authorizationExpires: z.iso.datetime(),
    locale: z.literal("en"),
    policy: z
      .object({
        fieldSelector: selector,
        labelSelector: selector,
        actionSelector: selector,
        actionSourceAttribute: z.enum(["data-action-label", "title"]),
        imageSelector: selector,
        contrastSelector: selector,
        contrastClass: z.literal("muted sugamya-contrast"),
      })
      .strict(),
    task: z
      .object({
        name: z.string(),
        inputSelector: z.string(),
        inputName: z.string(),
        emailSelector: z.string(),
        emailName: z.string(),
        submitSelector: z.string(),
        submitName: z.string(),
        resultSelector: z.string(),
        successText: z.string(),
      })
      .strict(),
  })
  .strict();
export const Operation = z
  .object({
    id,
    criterion: z.enum(["1.1.1", "1.4.3", "3.3.2", "4.1.2"]),
    selector: z.string().regex(/^#[A-Za-z][A-Za-z0-9_-]{0,60}$/),
    attribute: z.enum(["alt", "aria-label", "aria-labelledby", "class"]),
    before: z.string().max(600).nullable(),
    value: z.string().max(300),
    semantic: z.boolean(),
    reason: z.string().max(800),
  })
  .strict()
  .superRefine((o, c) => {
    if (o.attribute === "class" && o.value !== "muted sugamya-contrast")
      c.addIssue({
        code: "custom",
        message: "Only approved contrast class allowed",
      });
    if (o.semantic !== (o.attribute !== "class"))
      c.addIssue({
        code: "custom",
        message: "Semantic risk cannot be downgraded",
      });
    if (
      o.attribute === "aria-labelledby" &&
      !/^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(o.value)
    )
      c.addIssue({ code: "custom", message: "Unsupported relationship" });
    if (o.attribute === "aria-label" && !o.value.trim())
      c.addIssue({ code: "custom", message: "Empty name denied" });
    if (
      /[<>]/.test(o.value) ||
      Array.from(o.value).some((c) => c.charCodeAt(0) < 32)
    )
      c.addIssue({
        code: "custom",
        message: "Markup/control characters denied",
      });
  });
export const Manifest = z
  .object({
    id,
    target: id,
    path: route,
    locale: z.literal("en"),
    baselineHash: digest,
    createdAt: z.iso.datetime(),
    operations: z.array(Operation).min(1).max(8),
  })
  .strict();
export const Decision = z
  .object({
    action: z.enum(["approve", "edit", "reject"]),
    value: z.string().min(1).max(300).optional(),
    reason: z.string().min(3).max(500),
  })
  .strict();
export const Evidence = z.object({
  id,
  at: z.iso.datetime(),
  url: z.url(),
  method: z.string(),
  sha256: digest,
  privacy: z.literal("public-fixture-minimal"),
  observations: z.array(z.record(z.string(), z.unknown())),
});
export const Finding = z.object({
  id,
  criterion: z.string(),
  selector: z.string(),
  impact: z.string(),
  evidenceId: id,
  confidence: z.number().min(0).max(1),
});
export const CriterionDecision = z.object({
  criterion: z.string(),
  status: z.enum([
    "applicable-and-automated",
    "applicable-and-human-assisted",
    "applicable-but-unsupported",
    "not-applicable",
    "unresolved",
  ]),
  method: z.string(),
  reason: z.string(),
});
export const Approval = z.object({
  id,
  version: id,
  operation: id,
  manifestHash: digest,
  operationHash: digest,
  actor: z.literal("approver"),
  action: z.enum(["approve", "edit", "reject"]),
  reason: z.string(),
  at: z.iso.datetime(),
});
export const Authorization = z.object({
  target: id,
  origin: z.url(),
  paths: z.array(z.string()),
  verifiedAt: z.iso.datetime(),
  expires: z.iso.datetime(),
  method: z.literal("owner-installed challenge"),
});
export const Deployment = z.object({
  version: id.nullable(),
  previous: id.nullable(),
  at: z.iso.datetime(),
  status: z.enum([
    "canary",
    "active",
    "verified",
    "rolled-back",
    "disabled",
    "withheld",
  ]),
});
export const Verification = z.object({
  id,
  version: id.nullable(),
  at: z.iso.datetime(),
  pass: z.boolean(),
  checks: z.array(
    z.object({ name: z.string(), pass: z.boolean(), detail: z.unknown() }),
  ),
  elapsedMs: z.number(),
});
export const Rollback = z.object({
  from: id,
  to: id.nullable(),
  reason: z.string(),
  at: z.iso.datetime(),
});
export const RunEvent = z.object({
  seq: z.number().int().positive(),
  at: z.iso.datetime(),
  type: z.string(),
  data: z.unknown(),
  previousHash: digest,
  hash: digest,
});
