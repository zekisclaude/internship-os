# Internship OS

A private site for Zeki's Summer 2027 internship search. One database shared by two AI agents and the owner:

- **Claude** writes research: postings, eligibility, pay, deadlines, screening, scores, companies.
- **ChatGPT** writes outreach: recipients, contacts, email drafts, follow-ups, reply labels.
- **Zeki** reviews drafts in the queue, approves the exact message, and sends it from his Gmail.

Agents use a token-protected API (`/api/openapi`). Neither agent can approve or send. Rules for agents are in [AGENTS.md](AGENTS.md).

## Setup (one time, about 30 minutes)

### 1. Deploy on Vercel
1. Go to vercel.com, sign in with GitHub, choose **Add New > Project**, and import `zekisclaude/internship-os`. Leave the defaults.
2. In the project, open **Storage > Create Database > Neon (Postgres)** and connect it to the project. This sets `DATABASE_URL`.
3. In **Settings > Deployment Protection**, leave Vercel Authentication on for preview deployments. The production site has its own Google sign-in.

### 2. Google sign-in and Gmail sending
1. Go to console.cloud.google.com, create a project (e.g. "Internship OS").
2. **APIs & Services > Library**: enable the **Gmail API**.
3. **OAuth consent screen**: user type External, app name "Internship OS", your email as support and developer contact. Add the scopes `gmail.send` and `gmail.readonly`. Under **Test users**, add the Gmail account you send from.
4. **Credentials > Create credentials > OAuth client ID**, type Web application. Authorized redirect URI: `https://<your-vercel-domain>/api/auth/callback`.
5. Copy the client ID and secret into Vercel (next step). Do not paste them into any chat.

Notes:
- While the consent screen is in **Testing**, Google expires the Gmail permission after 7 days, so you sign in again weekly. Publishing the app removes that, but Gmail scopes then need Google's verification.
- A university Google Workspace can block outside apps from Gmail access. If sign-in shows "access blocked by your administrator", either ask Penn IT to allow the app or send from a personal Gmail account instead.

### 3. Environment variables (Vercel > Settings > Environment Variables, Production)
See `.env.example` for the full list. Generate each secret with `openssl rand -hex 32` (or any password generator, 64 characters).

| Name | Value |
|---|---|
| `APP_URL` | `https://<your-vercel-domain>` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from step 2 |
| `OWNER_EMAILS` | the Gmail address you send from first, then any other address you sign in with |
| `SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` | three different random values |
| `CLAUDE_AGENT_TOKEN`, `CHATGPT_AGENT_TOKEN` | two different random values |
| `DAILY_SEND_CAP` | `15` |

Redeploy after saving. Open the site, sign in with Google, and allow Gmail access. **Settings** should say Gmail is connected.

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
4. **Send** re-checks the hash, the daily limit and Gmail's Sent folder for a duplicate, then sends through the Gmail API from your account and records the Gmail message and thread IDs.
5. On weekday mornings a job checks sent threads for replies, marks them `replied`, and adds them to `threads` for ChatGPT to label.
