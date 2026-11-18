type Message = { id: string; hash: string; version: number; data: { status: string } };

// Only prepare the exact message shown when the owner clicked. No sending occurs.
export async function prepareGmail(it: Message, request: typeof fetch): Promise<string> {
  async function json(path: string, body?: Record<string, unknown>) {
    const response = await request(path, body ? {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    } : { cache: "no-store" });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result || result.ok === false) {
      const detail = Array.isArray(result?.failed) ? `: ${result.failed.join("; ")}` : "";
      throw new Error((result?.error || "Could not load the message. Reload and try again.") + detail);
    }
    return result;
  }
  const base = `/api/outreach/${encodeURIComponent(it.id)}`;
  if (it.data.status !== "approved") await json(`${base}/approve`, { hash: it.hash, ifVersion: it.version });
  const queue = await json("/api/queue");
  const current = queue.items?.find((item: Message) => item.id === it.id);
  if (!current || current.hash !== it.hash || current.data.status !== "approved") {
    throw new Error("The message changed or is no longer available. Reload and review it again.");
  }
  const result = await json(`${base}/compose`, { hash: it.hash });
  let url: URL;
  try { url = new URL(result.url); } catch { throw new Error("Gmail did not return a usable link. Please try again."); }
  if (url.origin !== "https://mail.google.com" || url.pathname !== "/mail/") {
    throw new Error("Gmail did not return a usable link. Please try again.");
  }
  return url.href;
}
