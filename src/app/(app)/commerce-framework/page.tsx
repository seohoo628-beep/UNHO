import CommerceFrameworkClient from "./CommerceFrameworkClient";
import { getRevenueGoals } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await getRevenueGoals();
  return <CommerceFrameworkClient serverGoals={g.goals} goalsTableMissing={g.tableMissing} />;
}
