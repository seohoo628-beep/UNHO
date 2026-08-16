import { redirect } from "next/navigation";
// 업무일지 통합(/work-logs)으로 이동. 디자이너 탭은 그 안에 있음.
export default function Page() { redirect("/work-logs"); }
