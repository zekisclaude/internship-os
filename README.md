# Internship OS

A private site for Zeki's Summer 2027 internship search. One database shared by two AI agents and the owner:

- **Claude** writes research: postings, eligibility, pay, deadlines, screening, scores, companies.
- **ChatGPT** writes outreach: recipients, contacts, email drafts, follow-ups, reply labels.
- **Zeki** unlocks the site with a password, reviews drafts in the queue, approves the exact message, and sends it from his Gmail.

Agents use a token-protected API (`/api/openapi`). Neither agent can approve or send. Rules for agents are in [AGENTS.md](AGENTS.md).

## Setup (one time, about 30 minutes)

### 1. Deploy on Vercel
1. Go to vercel.com, sign in with GitHub, choose **Add New > Project**, and import `zekisclaude/internship-os`. Leave the defaults.
2. In the project, open **Storage > Create Database > Neon (Postgres)** and connect it to the project. This sets `DATABASE_URL`.
3. In **Settings > Deployment Protection**, leave Vercel Authentication on for preview deployments. The production site has its own Google sign-in.

### 2. Gmail app password
1. Turn on 2-Step Verification for the Gmail account you send from (myaccount.google.com > Security).
2. Open myaccount.google.com/apppasswords, create one named "Internship OS", and copy the 16 characters.
3. If Google says app passwords are not available, the account's administrator (for example Penn) has turned them off. Use a personal Gmail account instead.

### 3. Environment variables (Vercel > Settings > Environment Variables, Production)
See `.env.example` for the full list. Generate each secret with `openssl rand -hex 32` (or any password generator, 64 characters).

| Name | Value |
|---|---|
| `APP_URL` | `https://<your-vercel-domain>` |
| `SITE_PASSWORD` | a long passphrase you choose; it unlocks the site |
| `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD` | the sending account and its app password from step 2 |
| `SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` | three different random values |
| `CLAUDE_AGENT_TOKEN`, `CHATGPT_AGENT_TOKEN` | two different random values |
| `DAILY_SEND_CAP` | `15` |

Redeploy after saving. Open the site, enter the password, then use **Settings > Test Gmail connection** (it sends nothing).

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
npm run smoke      # with the server running; see the header of scripts/smoke.mjs
```

## How sending works
1. ChatGPT writes a draft (`status: awaiting_approval`) with the recipient, an address label, subject, body and a source for the personal hook.
2. The queue shows each draft with automatic checks: valid address, opt-out, address label, length, em dashes, subject length, hook source, duplicate firm, open research flags. Hard failures block approval.
3. **Approve** stores a hash of the exact recipient, subject and body. Any later edit clears it.
4. **Send** re-checks the hash, the daily limit and Gmail's Sent folder for a duplicate, then sends over Gmail SMTP from your account and records the message and thread IDs.
5. On weekday mornings a job checks sent threads for replies, marks them `replied`, and adds them to `threads` for ChatGPT to label.
