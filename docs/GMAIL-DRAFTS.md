# Save all eligible messages to Gmail drafts

The review queue's **Add all to Gmail drafts** button saves each eligible message as an unsent Gmail draft. It does not approve a message, change its outreach stage, open a compose window, or send email.

## One-time Google setup

The website needs its own Google authorization. ChatGPT's Gmail connection cannot be reused by a Vercel application. No Google OAuth client is currently configured in this project.

1. In the owner's existing Google Cloud project, enable the Gmail API. Reuse an existing suitable OAuth client if one is available. Otherwise create a Web application OAuth client for Internship OS.
2. Configure consent for `openid`, `email`, `https://www.googleapis.com/auth/gmail.compose`, and `https://www.googleapis.com/auth/gmail.readonly`. While the app is in testing, add the configured sender as a test user. Google or a managed Workspace account may impose consent restrictions. Gmail scopes may require Google verification outside private testing.
3. Set the production `APP_URL` to `https://internship-os-theta.vercel.app`. Register this exact authorized redirect URI:
   `https://internship-os-theta.vercel.app/api/gmail/callback`
4. Enter `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` directly in Vercel's production environment variables. Keep the secret server-side. Confirm existing `SENDER_GMAIL`, `SESSION_SECRET`, and `ENCRYPTION_KEY` are configured. Never paste any credential into chat or commit it. Do not attach production mailbox credentials to preview deployments.
5. Deploy the feature, open the canonical production URL in the browser, and select **Connect Gmail**. Sign in as the configured sender and approve the Google consent screen. Other Google accounts are rejected. If using another deployment alias, the application directs the user to the configured canonical host before connecting so its state cookie returns to the same browser session.
6. Confirm the queue reports connected. Save one genuine eligible draft after owner authorization and compare its exact recipient, subject and body in Gmail. Then retry the same export and verify it is reported as already added without a second draft. No real email is sent for validation.

Mailbox operations require the browser's signed Gmail session, even when the app is publicly readable. The Google access token remains in server memory; the refresh token is encrypted with the existing ENCRYPTION_KEY in the existing secrets table. The Gmail cookie contains a revocable random session capability, not a Google token. Disconnect revokes Google's grant and deletes the stored connection. Reconnecting invalidates the older browser session.

Google's `gmail.compose` scope includes sending capability at the provider level. This application implements only draft creation; it has no Gmail send endpoint or send call. `gmail.readonly` is needed to find prior drafts and correspondence and avoid duplicate outreach. No automatic sending is authorized by connecting Gmail or saving drafts.

## Eligibility and duplicate behavior

- The button snapshots each selected id and current message hash; changed messages are rejected.
- Only active drafts with matching verified, unsuppressed contacts and no hard research/duplicate checks are eligible. Sent/replied/history records are excluded. Empty messages and unsupported CC/BCC/attachments are refused.
- Existing Gmail messages to or from the exact recipient, including saved drafts and sent mail, cause a skip. Mailbox searches retrieve all pages. A failed search stops export; it never means 'no previous messages'. This conservative check may skip legitimate follow-ups or unrelated correspondence, which should be reviewed individually.
- Before Gmail creation, the app atomically claims the outreach id/hash and normalized recipient in `gmail_draft_exports`. Concurrent requests or a changed-version export cannot create a second draft to the same recipient. Both this table and OAuth storage reuse the current Postgres database.
- Existing historical team-inbox drafts or drafts from other systems are not overwritten. They are skipped if found in Gmail. Cross-store company deduplication still needs the separate reconciliation described in COORDINATION.md.
- A network timeout or interrupted response after creation is marked uncertain. It is never blindly retried. Check Gmail and reconcile the stored claim before permitting another attempt; do not delete the claim just to retry. Existing journal rows are retained on code rollback.
- Results report added/already-added/skipped/uncertain/failed per record. Site approvals and sent history are unchanged.

## Validation and rollout

Run `npm run typecheck`, `npm run build`, `npm run test:local`, `npm run test:gmail-flow`, and `npm run test:gmail-drafts` without production credentials. The local tests use a fresh in-memory database and mocked Gmail responses; they do not contact a mailbox or send email.

The new table is added by the existing idempotent schema initializer, without changing existing records or creating a second database. A deployed preview or passing mocked test does not prove Google consent, Gmail creation, duplicate handling against the actual mailbox, or revocation works end to end. Those remain blocked until the Google configuration and owner consent are completed.

## Sending (added 2026-11-19 at the owner's request)

With Gmail connected, the review queue and the **Send** page can send approved messages. This uses the same connection and the existing `gmail.compose` scope; no new permission is needed.

- **Send now** (approved cards), **Approve and send** (unapproved cards) and **Send** (Send page) each ask for confirmation, then call `POST /api/send` for that one message.
- **Approve all** and **Send all** show the exact list first and need a tick box before they run. Approve all approves each listed message's current version. Send all sends them one at a time with a short pause and stops on any error, limit or unclear result.
- `/api/send` re-checks everything on the server: the owner's Gmail browser session, the approval hash and recipient, the verified-recipient, opt-out, research-flag and duplicate rules. There is no daily send limit (owner request, 2026-11-21). It searches Gmail (excluding drafts) for earlier mail with the recipient and skips if any exists.
- Each attempt is claimed in `gmail_send_exports` before Gmail is called, with one initial email allowed per recipient. If Gmail's answer cannot be confirmed the row is marked uncertain and is never retried automatically; check Gmail Sent. A saved Gmail draft of the same message is deleted after a successful send so it cannot be sent twice.
- On success the outreach record becomes `sent` with the Gmail message and thread IDs and a follow-up date five business days out.
- Tested with mocked Gmail only (`npm run test:gmail-send`). A real send has not been verified end to end until the owner connects Gmail and sends one message.

## Editing after a draft was saved

If a message's text changes after "Add to Gmail drafts", adding it again replaces the saved Gmail draft in place (same draft, new text) instead of skipping or creating a second draft. Our own draft is ignored by the earlier-correspondence check; any other mail with that person still blocks. If the draft was deleted in Gmail, a new one is created. Hand edits made inside the Gmail draft are overwritten. Approval is unchanged by this step.

## Staggered Send all

**Send all** offers two choices (owner request, 2026-11-21): send everything now, about 2.5 seconds apart, or send in batches: 15 approved emails, a 15 minute wait, then the next 15, until the approved list is done. The schedule runs in the open browser tab, so the tab must stay open; a Stop button ends it after the current message. If the tab closes, the remaining messages stay approved and pressing Send all again continues (already sent messages are skipped by the server). Each message is still sent individually with its exact approved text and all server checks.
