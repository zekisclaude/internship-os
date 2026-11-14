import { json } from "@/lib/http";
// OpenAPI 3.1 description of the agent API. Import it into a custom GPT as an Action (auth: API key, Bearer).
export async function GET() {
  const server = process.env.APP_URL || "http://localhost:3000";
  const rec = { type: "object", properties: { id: { type: "string" }, version: { type: "integer" }, updatedAt: { type: "string" }, updatedBy: { type: "string" }, data: { type: "object", additionalProperties: true } } };
  const coll = { name: "collection", in: "path", required: true, schema: { type: "string", enum: ["opportunities", "companies", "contacts", "outreach", "threads", "feed", "runs", "config"] } };
  return json({
    openapi: "3.1.0",
    info: { title: "Internship OS agent API", version: "1.0.0", description: "Shared records for Claude (research) and ChatGPT (outreach drafts, contacts, replies). Agents cannot approve or send email; only the owner can, in the web app." },
    servers: [{ url: server }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } }, schemas: { Record: rec } },
    security: [{ bearer: [] }],
    paths: {
      "/api/agent/whoami": { get: { operationId: "whoami", summary: "Check the token and see record counts", responses: { "200": { description: "ok" } } } },
      "/api/agent/records/{collection}": { get: { operationId: "listRecords", summary: "List records in a collection, optionally only those changed since a time", parameters: [coll, { name: "since", in: "query", schema: { type: "string", description: "ISO time" } }], responses: { "200": { description: "ok" } } } },
      "/api/agent/records/{collection}/{id}": {
        get: { operationId: "getRecord", parameters: [coll, { name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "ok" } } },
        patch: { operationId: "patchRecord", summary: "Merge fields into one record. Pass ifVersion for an existing record.", parameters: [coll, { name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["patch"], properties: { patch: { type: "object", additionalProperties: true }, ifVersion: { type: "integer" } } } } } }, responses: { "200": { description: "ok" }, "403": { description: "not allowed for this agent" }, "409": { description: "version mismatch; re-read and retry" } } },
      },
      "/api/agent/batch": { post: { operationId: "batchWrite", summary: "Apply up to 200 writes in order. Use dryRun first for large imports.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["items"], properties: { runId: { type: "string" }, dryRun: { type: "boolean" },
          items: { type: "array", items: { type: "object", required: ["collection", "id", "patch"], properties: { collection: { type: "string" }, id: { type: "string" }, patch: { type: "object", additionalProperties: true }, ifVersion: { type: "integer" }, op: { type: "string", enum: ["merge", "create"] } } } } } } } } },
        responses: { "200": { description: "per-item results" } } } },
    },
  });
}
