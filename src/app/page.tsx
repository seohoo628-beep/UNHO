import { redirect } from "next/navigation";
import { getAppUserOrNull } from "@/lib/auth";
import { isCeoUser } from "@/lib/ceo";

// 첫 진입 랜딩: 대표는 CEO 투두, 그 외는 홈(허브).
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAppUserOrNull();
  if (!user) redirect("/login");
  if (user.role === "vendor") redirect("/portal");
  if (user.role === "guest") redirect("/partner");
  redirect(isCeoUser(user) ? "/ceo-todos" : "/hub");
}
