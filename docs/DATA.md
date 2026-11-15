# Record shapes

All records are JSON. Fields not listed are allowed.

- **opportunities**: employer, title, loc, metro, tier, track, kind, comp{text,hourly,weeks,hours,gross,housing,housingCost,net,src}, url, deadline{date,type,note}, source, posted, verified, discovered, elig{status,note}, riba{status,note,question}, odds, score, parts[[label,points,max,why]], materials, next, status, archiveReason, confidence, companyId, reqId
- **companies**: candidates[{name,title,email,emailStatus,source,seniority,note}] (people Claude found; ChatGPT chooses), name, track, industry, size, hq, metro, tier, teams, signals, why, riba{status,note}, score, parts, outreachStatus, sources[{date,note,url}], careersUrl
- **contacts**: name, company, companyId, title, email, emailStatus, evidence, profileUrl, verified, angle, optOut
- **outreach**: contactId, companyId, company, toName, toTitle, to, toStatus (published, apollo_verified, apollo_unverified, general_inbox, pattern-inferred), tier (A, B, C), subject, subjectFormula, body, version, evidence[{claim,url}], type (initial, follow-up), status (draft, awaiting_approval, approved, sent, replied, skipped, rejected, archived), reviewFlags[{by,at,reason,resolved}], followUpDue, replyToThreadId and inReplyTo (follow-ups only). Server only: approval, sentAt, sentBy, gmailMessageId, gmailThreadId, gmailUrl, history
- **threads**: gmailThreadId, date, from, subject, snippet, cls, company, companyId, contactId, outreachId, url, needsAction
- **feed**: date, type, title, body, url
- **runs**: type, startedAt, completedAt, sources[{name,ok,note}], counts, digest, draftsToReview
