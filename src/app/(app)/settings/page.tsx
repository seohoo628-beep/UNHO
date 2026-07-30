import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { isKakaoLinked } from "@/lib/notify/kakao";
import KakaoSettings from "@/components/KakaoSettings";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { kakao?: string };
}) {
  const user = await requireAppUser();
  if (user.role !== "owner") redirect("/dashboard");

  const linked = await isKakaoLinked();

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
