import { requireUser } from "@/lib/guard";
import { queueState, sentToday } from "@/lib/queue";
import SendPage from "@/components/SendPage";

export const dynamic = "force-dynamic";
export default async function Page() {
  await requireUser();
  const { items } = await queueState();
  const cap = 0; // 0 means no daily send limit (owner request 2026-11-21)
  return <SendPage initial={JSON.parse(JSON.stringify(items))} cap={cap} sent={await sentToday()} />;
}
