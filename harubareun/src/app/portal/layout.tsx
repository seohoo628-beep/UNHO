import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

// 외주업체 포털. 내부 사이드바 없는 별도 레이아웃. vendor 역할만 접근.
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAppUser();
  if (user.role !== "vendor") redirect("/dashboard");

  return (
    <div>
      <header
        style={{
          background: "var(--ink)",
          color: "#fff",
          padding: "14px 22px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontWeight: 700 }}>
          하루바른·나아 외주 포털
          <span className="muted" style={{ color: "#9aa3ac", fontWeight: 400, marginLeft: 10, fontSize: 13 }}>
            {user.name}
          </span>
        </div>
        <div style={{ width: 120 }}>
          <LogoutButton />
        </div>
      </header>
      <main className="main" style={{ maxWidth: 900, margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}
