import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import CommerceFrameworkClient from "./CommerceFrameworkClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");
  return <CommerceFrameworkClient />;
}
