import { fetchMeetings } from "@/lib/storeSharedRead";
import MeetingsClient from "./MeetingsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { rows, dbReady } = await fetchMeetings("fnb");
  const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/`;
  const today = new Date().toISOString().slice(0, 10);
  return <MeetingsClient rows={rows} dbReady={dbReady} publicBase={publicBase} today={today} />;
}
