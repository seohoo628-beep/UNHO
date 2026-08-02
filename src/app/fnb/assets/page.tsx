import { fetchLinks, fetchAssets } from "@/lib/storeSharedRead";
import AssetsClient from "./AssetsClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [{ rows: links, dbReady }, { rows: files, dbReady: filesReady }] = await Promise.all([
    fetchLinks("fnb"),
    fetchAssets("fnb"),
  ]);
  const publicBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/generated-media/`;
  return <AssetsClient links={links} dbReady={dbReady} files={files} filesReady={filesReady} publicBase={publicBase} />;
}
