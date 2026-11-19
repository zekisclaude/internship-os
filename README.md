# Internship OS

A private site for Zeki's Summer 2027 internship search. One database shared by two AI agents and the owner:

- **Claude** writes research: postings, eligibility, pay, deadlines, screening, scores, companies.
- **ChatGPT** writes outreach: recipients, contacts, email drafts, follow-ups, reply labels.
- **Zeki** opens the site, reviews drafts in the queue, approves the exact message, and sends it from his Gmail.

Agents use a token-protected API (`/api/openapi`). Neither agent can approve or send. Rules for agents are in [AGENTS.md](AGENTS.md).

## Setup (one time, about 30 minutes)

### 1. Deploy on Vercel
1. Go to vercel.com, sign in with GitHub, choose **Add New > Project**, and import `zekisclaude/internship-os`. Leave the defaults.
2. In the project, open **Storage > Create Database > Neon (Postgres)** and connect it to the project. This sets `DATABASE_URL`.
3. In **Settings > Deployment Protection**, leave Vercel Authentication on for preview deployments. Production uses the optional site password described below; public access is the owner's current choice.

### 2. Sending
No Gmail password or Google setup. An approved email opens in your own Gmail already filled in, you press Send, then click "I sent it" on the site. Set `SENDER_GMAIL` if you use several Google accounts in the browser.

### 3. Environment variables (Vercel > Settings > Environment Variables, Production)
See `.env.example` for the full list. Generate each secret with `openssl rand -hex 32` (or any password generator, 64 characters).

| Name | Value |
|---|---|
| `APP_URL` | `https://<your-vercel-domain>` |
| `SITE_PASSWORD` | optional. Leave it unset and the site is open to anyone with the link (the current choice). Set it to require a password. |
| `SENDER_GMAIL` | optional: the Gmail address to open the compose window in |
| `SESSION_SECRET`, `ENCRYPTION_KEY` | two different random values |
| `CLAUDE_AGENT_TOKEN`, `CHATGPT_AGENT_TOKEN` | two different random values |
| `DAILY_SEND_CAP` | `15` |

Redeploy after saving.

### 4. Connect the agents
- **Claude**: in the Claude session, Claude asks for the token through its secure credential form for your Vercel domain. Paste `CLAUDE_AGENT_TOKEN` there, never in chat.
- **ChatGPT**: create a custom GPT (or a project action), add an Action, import the schema from `https://<your-vercel-domain>/api/openapi`, and set Authentication to API key, Bearer, value `CHATGPT_AGENT_TOKEN`. For code changes, connect ChatGPT/Codex to this GitHub repository.

### 5. Move existing records in
**Settings > Import records**: paste an export, press Preview, then Import. Existing records are only filled in, never overwritten, and old approvals are kept as history, not as approval.

## Development
```
npm install
npm run dev        # uses an in-memory database when DATABASE_URL is empty
npm run typecheck
npm run build
npm run smoke      # with a local server running; see scripts/smoke.mjs
npm run test:local # after build; isolated API smoke and public-mode checks
npm run test:gmail-flow # approval, loading errors and exact-message Gmail preparation
```

## How sending works
1. ChatGPT writes a draft (`status: awaiting_approval`) with the recipient, an address label, subject, body and a source for the personal hook.
2. The queue shows each draft with automatic checks: valid address, opt-out, address label, length, em dashes, subject length, hook source, duplicate firm, open research flags. Hard failures block approval.
3. **Approve** stores a hash of the exact recipient, subject and body. Any later edit clears it.
4. **Open in Gmail** re-checks the hash and the daily limit, then opens your Gmail compose window with the exact approved text. You press Send in Gmail, then **I sent it** records the send and sets the follow-up date.
5. ChatGPT watches your Gmail for replies and marks the message `replied`.

## Continuing the existing project

Read [the coordination protocol](docs/COORDINATION.md) before importing records or changing runtime connections. `/outreach` and `/queue` use the same review queue. Active drafts whose address does not match their linked verified contact stay on hold without deleting their text or history. Research flags and duplicate initial contacts block approval and opening Gmail.

The Gmail button opens the approved compose URL in a new tab and keeps Internship OS open. A direct Gmail link remains available if the browser blocks the new tab. Owner actions validate the actual request origin so deployment aliases work even when APP_URL names another alias.

## Save all to Gmail drafts

The review queue includes a bulk save action for eligible, unsent messages. It skips existing Gmail correspondence and preserves approval status. The site needs its own Google OAuth connection; see [Gmail draft setup](docs/GMAIL-DRAFTS.md). Setup is separate from an assistant's Gmail access.
