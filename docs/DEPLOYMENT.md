# Owner installation, activation and emergency disable

## What is actually proved

The live demonstration is **your own controlled fixture**, not a government website. Origin and gateway run as separate processes. The gateway consumes origin HTTP responses, not source files. A temporary Cloudflare Quick Tunnel publishes the gateway so an ordinary clean browser receives approved HTML changes. No extension exists or is needed.

Recorded public proof: `evidence/public-deployment-proof.json`. The hostname is temporary and may expire when the process/workspace stops; the MP4 is the recorded fallback, not a live substitute.

## Local reproducible install

Prerequisites: Node **22.13+**, npm, Linux/macOS/Windows with Playwright Chromium dependencies. A recent supported browser environment is required. The event sandbox default Node was 20; we installed pinned Node 22.23.4 as a development tool and executed commands with `node_modules/node/bin/node`. `npm run` picks its local Node binary after full `npm ci`.

```sh
npm ci
npx playwright install --with-deps chromium
npm run setup                 # once; refuses to overwrite .env
npm run origin                # terminal 1
npm start                     # terminal 2
```

Open http://localhost:4100/ for the operator UI and http://localhost:4100/apply for ordinary visitors. Privately read `.env`: use OPERATOR_TOKEN to connect/observe/deploy/disable; use APPROVER_TOKEN to approve/edit/reject. Sessions are HttpOnly, SameSite=Strict and 30 minutes; over HTTPS they are Secure. Do not publish tokens. There is no invented user account directory or demo password.

Optional Groq: add `GROQ_API_KEY` privately to environment/.env and restart the gateway. The provider/model is fixed in `src/model.js`, not a user-supplied URL. No key is shipped. Existing manual drafts work without it. In a staged image proposal, operator → Review optional AI data request → inspect exact payload → consent → Send; approver must then review resulting meaning.

## Authorized target installation

1. Site owner controls the **origin hostname**, a **visitor hostname/routing layer** and the well-known challenge response. Source-code sharing with Sugamya is unnecessary, but some owner control is indispensable.
2. Install the challenge at `/.well-known/sugamya-authorization`, scoped to target ID, exact approved paths and an expiry. Configure its expected challenge privately. The endpoint and route installation are owner/infra tasks, not arbitrary remote takeover.
3. Set startup `TARGET_CONFIG` to a reviewed configuration: fixed origin, exact paths/assets, English locale, task expectation and ID-only repair policy. General authenticated/dynamic sites are not supported.
4. For a durable production route, use an owner-controlled HTTPS reverse-proxy/load-balancer/Tunnel hostname pointing to the gateway, keep the origin private, restrict operator access, run hardened process/browser isolation, and review capacity/headers/forms with that client. These production prerequisites were **not supplied or completed** in the event environment.
5. Verify owner installation in UI. Observe baseline with transformations disabled. Review applicability/priority and local context. Approver must approve/edit/reject every semantic operation. The operator's canary/deploy action is the version activation decision, not semantic approval.
6. Canary → independent visitor gates → verified active version. Check the response version header and actual accessible-name/keyboard task in a new browser profile with no extension.

The contrast family needs the pre-existing approved CSS utility; absent that, do not assert support. The origin's source remains unchanged by Sugamya; these are response-level repairs, not durable source patches.

## Reuse evidence

A second fixture uses `config/reuse-target.json`, different origin (4201), gateway (4200), target ID and `var-reuse` audit store:

```sh
ORIGIN_PORT=4201 FIXTURE_TARGET_ID=second-client-fixture npm run origin
PORT=4200 TARGET_CONFIG=config/reuse-target.json DATA_DIR=var-reuse npm start
TEST_BASE=http://127.0.0.1:4200 ORIGIN_PORT=4201 EVIDENCE_DIR=evidence/reuse npm run test:e2e
```

Both use the same bounded service-form template. Real new client templates need a reviewed policy/task configuration and may need a different integration. No automatic universal adaptation is claimed.

## Disable and rollback

- UI **Emergency disable**, or authenticated POST `/api/disable`, clears active/canary serving pointers and returns original origin HTML to ordinary visitors immediately. No source restore is needed because source was never changed.
- Origin content/selector/locale mismatch skips the full manifest, retains original response and emits an observable event.
- Failing canary → no promotion. Failing independent public-route verification → previous verified pointer or original response. Startup recovers interrupted unverified activations conservatively.
- Existing exact, human-approved verified manifests can be reactivated after disable, with preconditions and independent gates rerun. Modified content needs a new review.
- Owner may remove/bypass the gateway routing layer to disable all transformations while preserving the original service. Validate the actual load-balancer/DNS rollback procedure before production.

## Temporary public proof publishing

Official guide: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

```sh
cloudflared tunnel --url http://127.0.0.1:4100 --protocol http2 --no-autoupdate
PUBLIC_BASE=https://YOUR-ASSIGNED-HOST.trycloudflare.com node scripts/public-proof.js
```

This creates a temporary public hostname without a Cloudflare account/domain. It is not production deployment: no uptime guarantee, hostname changes on restart, 200 in-flight-request limit, no SSE. In this sandbox, the default Arena preview hostname requires a platform traffic token; we did **not** count that inaccessible external URL as public delivery. Cloudflare tunnel DNS initially required propagation, then public browser tests passed.

The checked-in Dockerfiles/Compose describe separate runtime images and a persistent audit volume. They were **not executed** here; use the tested process commands for reproduction. Do not infer hardened isolation from the presence of a configuration file.

## Authorization expiry for later reproduction

The event fixture authorization intentionally expires on 28 October 2026. Later reenactments need a new owner challenge/verification: set a future `authorizationExpires` in the target JSON and `AUTHORIZATION_EXPIRES` for the fixture origin. This is installation-time configuration, not a hidden code edit or bypass. Do not silently remove expiry checks.

Each persistent `DATA_DIR` is bound to one target ID/origin. Do not reuse another installation's store or mistype `TARGET_CONFIG`: startup refuses cross-target state. Changing installations requires a separate store and fresh owner verification, baseline and approvals; it is not an approval migration shortcut.
