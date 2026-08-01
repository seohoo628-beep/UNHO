import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { isKakaoLinked } from "@/lib/notify/kakao";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchSellerSheet } from "@/lib/sheets";
import { fetchPnlRows, getPnlSheet } from "@/lib/pnl";
import KakaoSettings from "@/components/KakaoSettings";
import PnlSourceSettings from "@/components/PnlSourceSettings";
import DriveFolderSettings from "@/components/DriveFolderSettings";
import { getDriveFolderId, driveConfigured } from "@/lib/drive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROLE_LABEL: Record<string, string> = {
  owner: "대표",
  staff: "직원",
  ai: "AI",
  vendor: "외주",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { kakao?: string };
}) {
  const user = await requireAppUser();
  if (user.role !== "owner") redirect("/dashboard");

  const linked = await isKakaoLinked();

  // ── 연동 상태 진단 ──
  const envOk = (v: string | undefined) => !!v && v.trim() !== "";
  const envChecks = [
    { name: "Supabase URL", ok: envOk(process.env.NEXT_PUBLIC_SUPABASE_URL), req: true },
    { name: "Supabase anon 키", ok: envOk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), req: true },
    { name: "Supabase service_role 키", ok: envOk(process.env.SUPABASE_SERVICE_ROLE_KEY), req: true },
    { name: "Anthropic API 키", ok: envOk(process.env.ANTHROPIC_API_KEY), req: true },
    { name: "Cron 시크릿", ok: envOk(process.env.CRON_SECRET), req: true },
    { name: "사이트 URL", ok: envOk(process.env.NEXT_PUBLIC_SITE_URL), req: false },
    { name: "카카오 REST 키", ok: envOk(process.env.KAKAO_REST_API_KEY), req: false },
    { name: "이미지 생성 키(fal)", ok: envOk(process.env.FAL_KEY), req: false },
  ];

  // 라이브 체크 (실패해도 페이지는 뜬다)
  let bucketOk = false;
  try {
    const svc = createSupabaseServiceClient();
    const { data: buckets } = await svc.storage.listBuckets();
    bucketOk = (buckets ?? []).some((b) => b.name === "generated-media");
  } catch {
    bucketOk = false;
  }
  const [sellerSheet, pnlSheet, pnlCfg, driveFolderId] = await Promise.all([
    fetchSellerSheet(),
    fetchPnlRows(),
    getPnlSheet(),
    getDriveFolderId(),
  ]);
  const driveOk = driveConfigured();

  const liveChecks = [
    { name: "Storage 버킷(generated-media)", ok: bucketOk, hint: "Supabase Storage에 공개 버킷 생성" },
    { name: "카카오 알림 연결", ok: linked, hint: "아래 카카오 연결 버튼" },
    { name: "셀러 시트 읽기", ok: sellerSheet.ok, hint: "시트 공유를 링크·뷰어로" },
    { name: "P&L 시트 읽기", ok: pnlSheet.ok, hint: "시트 공유를 링크·뷰어로" },
  ];

  // 사용자 목록
  const supabase = createSupabaseServerClient();
  const { data: usersData } = await supabase
    .from("users")
    .select("name, email, role, job_title, active")
    .order("role");
  const users = (usersData ?? []) as {
    name: string | null;
    email: string;
    role: string;
    job_title: string | null;
    active: boolean;
  }[];

  const kakaoMsg: Record<string, { t: string; c: string }> = {
    ok: { t: "카카오 연결 완료. 테스트 발송으로 확인하세요.", c: "ok" },
    fail: { t: "카카오 연결 실패. 개발자 설정(REST 키·Redirect URI·동의항목)을 확인하세요.", c: "owner" },
    forbidden: { t: "대표 계정만 연결할 수 있습니다.", c: "owner" },
    nocode: { t: "인가 코드가 없습니다. 다시 시도하세요.", c: "owner" },
  };
  const notice = searchParams.kakao ? kakaoMsg[searchParams.kakao] : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>설정</h1>
          <p>알림 연결. 카카오는 대표 본인 카톡으로 요약을 보냅니다.</p>
        </div>
      </div>

      {notice && (
        <div
          className="flag"
          style={{
            marginBottom: 14,
            borderLeftColor: notice.c === "ok" ? "var(--ok)" : "var(--owner)",
            background: notice.c === "ok" ? "var(--ok-bg)" : "var(--owner-bg)",
          }}
        >
          {notice.t}
        </div>
      )}

      {/* 연동 상태 진단 */}
      <div className="section-title">연동 상태 진단</div>
      <div className="grid cols-2">
        <div className="card">
          <div className="lbl" style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 8 }}>
            환경변수
          </div>
          <table className="tbl">
            <tbody>
              {envChecks.map((c) => (
                <tr key={c.name}>
                  <td>{c.name}{!c.req && <span className="muted"> (선택)</span>}</td>
                  <td style={{ textAlign: "right" }}>
                    {c.ok ? (
                      <span className="badge ok">설정됨</span>
                    ) : (
                      <span className={`badge ${c.req ? "owner" : "warn"}`}>미설정</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="lbl" style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 8 }}>
            연결 점검
          </div>
          <table className="tbl">
            <tbody>
              {liveChecks.map((c) => (
                <tr key={c.name}>
                  <td>
                    {c.name}
                    {!c.ok && <div className="muted" style={{ fontSize: 11 }}>{c.hint}</div>}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {c.ok ? (
                      <span className="badge ok">정상</span>
                    ) : (
                      <span className="badge warn">확인 필요</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 사용자 */}
      <div className="section-title">사용자</div>
      <div className="card" style={{ padding: 0 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>역할</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td>{u.name ?? "-"}{u.job_title ? ` (${u.job_title})` : ""}</td>
                <td className="mono">{u.email}</td>
                <td>
                  <span className="badge">{ROLE_LABEL[u.role] ?? u.role}</span>
                </td>
                <td>{u.active ? "활성" : "비활성"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        직원·외주 계정 추가는 README의 계정 생성 SQL을 참고하세요. 비밀번호는 auth.users에서 설정합니다.
      </p>

      <div className="section-title">P&amp;L 시트 연동</div>
      <PnlSourceSettings gid={pnlCfg.gid} />

      <div className="section-title">드라이브 폴더 (업무 진행시트)</div>
      <DriveFolderSettings folderId={driveFolderId} saEmail={process.env.GOOGLE_SA_CLIENT_EMAIL ?? ""} />
      {!driveOk && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          서비스계정 미설정: Vercel 환경변수 <span className="mono">GOOGLE_SA_CLIENT_EMAIL</span>,{" "}
          <span className="mono">GOOGLE_SA_PRIVATE_KEY</span> 등록 후 재배포하세요.
        </p>
      )}

      <div className="section-title">알림 연결</div>
      <KakaoSettings linked={linked} />

      <div className="section-title">카카오 연결 준비 (최초 1회)</div>
      <div className="card">
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.9 }}>
          <li>developers.kakao.com → 내 애플리케이션 → 애플리케이션 추가</li>
          <li>앱 키의 <b>REST API 키</b>를 복사 → Vercel 환경변수 <span className="mono">KAKAO_REST_API_KEY</span> 에 등록 후 재배포</li>
          <li>카카오 로그인 <b>활성화 ON</b></li>
          <li>Redirect URI 에 <span className="mono">{`{사이트주소}`}/api/kakao/callback</span> 등록</li>
          <li>동의항목에서 <b>카카오톡 메시지 전송(talk_message)</b> 사용 설정</li>
          <li>위 <b>카카오 연결</b> 버튼 클릭 → 동의 → 완료</li>
        </ol>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          "나에게 보내기"는 앱을 만든 대표 카카오 계정으로만 전송됩니다. 직원·외주 알림(알림톡)은
          사업자 채널·템플릿 심의가 필요한 별도 건입니다.
        </p>
      </div>
    </div>
  );
}
