import { fetchLinks } from "@/lib/storeSharedRead";
import AssetsClient from "./AssetsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { rows, dbReady } = await fetchLinks("fnb");
  return <AssetsClient links={rows} dbReady={dbReady} />;
}
