import { fail, json } from "@/lib/http";
import { currentUser } from "@/lib/session";
import { queueItems, sentToday } from "@/lib/queue";
export async function GET() {
  if (!(await currentUser())) return fail(401, "owner sign-in required");
  return json({ items: await queueItems(), sent: await sentToday() });
}
