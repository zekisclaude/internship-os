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

The current app opens an approved message in Gmail. It does not use Gmail OAuth, send through Gmail's API, or reconcile a sent message automatically. The manual 'I sent it' action is not independent Gmail evidence. Direct sending remains blocked until exact recipients/content/attachments/version, suppression, duplicate prevention, uncertain-result reconciliation and revocation are enforced end to end.

## Validation

Run `npm run typecheck`, `npm run build`, then `npm run test:local`. Local tests use fresh in-memory data and disposable credentials. Production databases must never be used for smoke tests. Browser QA, production deployment, Postgres persistence and migration validation are separate checks; report their actual status.
