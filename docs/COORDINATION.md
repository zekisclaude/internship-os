# Shared development and runtime reconciliation

Both agents use this existing repository. Source access is not runtime API authorization, a shared database, a Gmail connection, or proof of unattended execution.

## Ownership and concurrent work

Claude owns employer/opportunity research and recruiting leads. ChatGPT owns recipient selection, contacts, drafts, reply classification and follow-up preparation. The owner alone authorizes exact messages. Neither agent sends from a schedule.

Read AGENTS.md, recent commits, open PRs, and coordination receipts first. Use a branch and a PR. Record the base commit and changed paths. If another agent changes the same paths, reread and reconcile instead of replacing its work. Zeki merges; changes to approval/permission rules are explicitly called out for review. Public access remains the owner's current choice.

## Machine-readable source coordination

Append a uniquely named JSON receipt under `coordination/`. Required fields: `schemaVersion`, `runId`, `agent`, `createdAt`, `baseCommit`, `state`, `changedPaths`, `validation`, `requests`, `acknowledges`. Acknowledgments name the earlier runId and concrete action/result. Never rewrite another agent's receipt.

Receipts may describe source work and access failures. No contact lists, message text, mailbox exports, approval artifacts, private database snapshots or credentials belong in Git. A receipt demonstrates only that its author wrote it. Successful reciprocal coordination requires the other agent to read it and append an acknowledgment. GitHub itself does not schedule either agent.

## Existing runtime stores and transport

The Vercel application's Postgres store and the earlier Site's R2 store both contain records. Their schemas and IDs differ. Keep the existing Site authoritative for its outreach until migration is reconciled and read back. Continue the established Drive exchange; do not create another database, repository or schedule.

Before migration, read every record from both stores. Match stable IDs, original Claude IDs, employer/requisition, canonical URLs, company identity and recipient routes. Produce a dry-run conflict report. Preserve each store's newer supported evidence, owner notes/stages, suppression, Gmail IDs, message versions and sent history. Do not restore hidden drafts just because they occur in an export. Imported approvals remain historical only. Keep the old store intact until record-level readback and rollback are verified.

A contact's verification must describe the same email as its draft. Apollo verification labels require their evidence to be checked before use; a label alone is not a fresh external verification. Existing team-inbox drafts in the Site and the Vercel application's personal-address rule require reconciliation before import, not silent relabeling.

The current Vercel importer fills blank fields and does not provide full cross-store identity matching. Do not use a blind bulk import as migration.

## Connections and delivery

Use separate server-side credentials with role restrictions. Never paste credentials in chat or commit them. Verify an agent connection with whoami, readback and a harmless scoped write; a health flag saying a token exists is insufficient. Verify Claude's reciprocal acknowledgment and existing scheduler configuration before claiming autonomous exchange.

The app can open an approved message in Gmail, save drafts through the owner's Gmail OAuth connection, and (since 2026-11-19, owner request) send one approved message through `POST /api/send` from the owner's verified browser session. Agents cannot call these routes. Sends are journaled in `gmail_send_exports`, refuse changed, unapproved, held, flagged, duplicate or already-contacted recipients, and never retry an unclear result. Editing an approved message and adding it to drafts again updates the existing saved draft in place. The manual 'I sent it' action is not independent Gmail evidence; reconcile against the Sent folder.

## Validation

Run `npm run typecheck`, `npm run build`, then `npm run test:local`. Local tests use fresh in-memory data and disposable credentials. Production databases must never be used for smoke tests. Browser QA, production deployment, Postgres persistence and migration validation are separate checks; report their actual status.

## Email sources and tags (2026-11-20)

Recipient statuses accepted by the code: `apollo_verified` and `getprospect_valid`. Record a finder's own status exactly; never call a guess verified. LinkedIn may identify people and confirm employers; addresses come from Apollo or GetProspect. A company or candidate with a publicly stated Ethiopian or Eritrean background carries `tags: ["habesha"]` and a `tagBasis` citing the public source; never infer it from a name or photo. The importer fills blank fields only, so changing an existing candidate list needs the agent API or an owner edit. Claude's scheduled runs may use the reviewed `linkedin-search` job-listing CLI at low volume (AGENTS.md rule 2).
