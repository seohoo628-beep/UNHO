import { fetchAssets } from "@/lib/storeSharedRead";
import ContractsClient from "./ContractsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { rows: files, dbReady } = await fetchAssets("fnb");
  const contracts = files.filter((f) => f.section === "contract");
  const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/`;
  return <ContractsClient files={contracts} dbReady={dbReady} publicBase={publicBase} />;
}
