import { fetchVendors } from "@/lib/storeSharedRead";
import VendorsClient from "./VendorsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { rows, dbReady } = await fetchVendors("dining");
  return <VendorsClient rows={rows} dbReady={dbReady} />;
}
