import { requireUser } from "@/lib/guard";
import { queueItems, sentToday } from "@/lib/queue";
import Queue from "@/components/Queue";

export const dynamic = "force-dynamic";
export default async function Page() {
  await requireUser();
  const items = await queueItems();
  const cap = Number(process.env.DAILY_SEND_CAP || 15);
  return <Queue initial={JSON.parse(JSON.stringify(items))} sent={await sentToday()} cap={cap} />;
}
