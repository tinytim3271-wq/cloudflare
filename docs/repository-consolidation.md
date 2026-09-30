# Repository consolidation

**Canonical repository:** `tinytim3271-wq/cloudflare`  
**Audit date:** 2026-09-30

This repository is the primary home for MechPro's application, API, and
deployment configuration. The source repositories are reference material only;
this consolidation does not authorize deleting or archiving them.

## Architecture and conflict decisions

- Keep the existing local-first PWA and its `src/` → generated `app.js` build.
- Keep Cloudflare Pages for the web app and the Cloudflare Worker, D1, R2, and
  Workers AI for the service layer. The active deployment workflows and
  `wrangler.jsonc` remain authoritative.
- Keep `/api` as the API namespace and the current tenant/shop identity model.
  Do not add AWS credentials, AWS deployment workflows, or source-specific
  secrets to the Cloudflare runtime.
- Preserve legacy entity compatibility at the Worker boundary. For example,
  `bookings` maps to `appointments`, and legacy customer, employee, invoice,
  and inspection fields are normalized into the current entity model.
- The `infra/` tree contains partial AWS/Lambda-era reference code, but is not
  an active deployment target. Do not use it to override Cloudflare bindings or
  deployment workflows; decide its retirement or supported status separately.

## Source repository audit

| Source repository | Access and useful material reviewed | Consolidation decision |
| --- | --- | --- |
| `tinytim3271-wq/mechpro-dispatch` | GitHub Contents API returned 404 in this environment. | No source diff was possible. The current Cloudflare app already contains the shop dispatch/PWA baseline; compare against this repo directly when access is available. |
| `tinytim3271-wq/reliable-shop-management1` | GitHub Contents API returned 404 in this environment. | No source diff was possible. Revisit after access is restored. |
| `tinytim3271-wq/MechPro` | Reviewed its README, architecture reference, package metadata, and source-tree inventory. It is a React/Vite shop OS with AWS/Convex paths, payroll calculations, timeclock, Web Serial OBD, authorized key workflows, and shop operations. | Do not copy its React/AWS app wholesale into the vanilla PWA or replace Cloudflare hosting. The current app already has customers, vehicles, repair orders, estimates, invoices, expenses, scheduling, inventory, vendors, purchases, payroll records, an AI assistant, and J2534 desktop diagnostics. Re-evaluate individual missing workflows (especially browser OBD/key programming and payroll calculation parity) as separately scoped Cloudflare-compatible work. |
| `tinytim3271-wq/reliable-shop-management` | Reviewed its README and package metadata. This is a small TypeScript CLI package whose `test` script runs the TypeScript build; no shop-domain implementation was identified from the available top-level material. | No domain implementation to merge from the reviewed files. Recheck if additional source modules are identified. |
| `tinytim3271-wq/MechPro-aws` | GitHub Contents API returned 404. MechPro's architecture reference describes AWS CDK, Lambda, Aurora, Cognito, and API Gateway paths, but is not a direct source diff. | Do not migrate its AWS database/auth/deployment stack. Existing Cloudflare entity compatibility mappings cover known legacy payload shapes. Obtain direct access before considering any deeper port. |
| `tinytim3271-wq/ai-receptionist` | Reviewed its README, package metadata, telephony/AI route implementations, and SQLite schema. It has call intake, Twilio signature checks, webhook idempotency, callback escalation, an operations dashboard, and approved-service-only auto-booking guardrails. | Its Express/SQLite/OpenAI runtime and schema cannot be deployed unchanged to Workers/D1. Current Cloudflare code has a Workers AI assistant and AgentPhone integration, but not the source's complete native Twilio receptionist workflow. Track a native D1/Worker port as follow-up; retain signature validation, idempotency, and code-enforced booking restrictions as mandatory acceptance criteria. |
| `tinytim3271-wq/reliable-shop-standalone` | Reviewed its README, API source inventory, and migration inventory. It is a broad desktop app with a bundled backend, React frontend, Drizzle migrations, embedded PGlite, and local filesystem storage. Its README says the API source depends on unavailable monorepo packages and cannot be rebuilt in isolation. | Do not import the bundled server or PGlite schema into the Worker. Map individual business workflows to the existing shop-scoped entities and D1 only after source provenance, buildability, and behavior can be verified. |

## Follow-up work

These are explicit gaps or access blockers, not claims that the source
repositories have been fully imported:

1. Restore direct read access to `mechpro-dispatch`, `reliable-shop-management1`,
   and `MechPro-aws`; compare their current default branches against this
   repository before closing the audit.
2. Review `MechPro`'s payroll calculation and Web Serial/key-programming
   workflows against the Cloudflare app; port only isolated, testable behavior
   that fits existing modules and the Cloudflare security model.
3. Design and test a Worker/D1-native receptionist integration. Include
   Twilio request-signature verification, replay/idempotency protection,
   staff callback escalation, and explicit service allowlisting before enabling
   appointment creation.
4. Inspect the full standalone app source and build inputs before deciding
   whether any workflows not already represented by Cloudflare entities merit
   a port.
5. Decide separately whether the partial AWS/Lambda-era `infra/` reference
   files should be archived or removed after confirming they have no supported
   consumers. Cloudflare deployment remains unchanged in the meantime.

## Validation boundary

The work documented above does not copy unbuildable bundled output, introduce
new runtime dependencies, or change Worker routes, schemas, secrets, or
deployment behavior. Source repositories that returned 404 were not treated as
reviewed or complete; their gaps remain open until their contents can be
inspected.
