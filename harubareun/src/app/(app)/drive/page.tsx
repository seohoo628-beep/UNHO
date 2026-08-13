import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listDriveFolder, getDriveFolderId, driveConfigured, mimeLabel, DRIVE_SNAPSHOT } from "@/lib/drive";

export const dynamic = "force-dynamic";

const TYPE_BADGE: Record<string, string> = {
  폴더: "accent",
  시트: "ok",
  문서: "",
  PDF: "owner",
};

function fmt(iso: string): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export default async function DrivePage({
  searchParams,
}: {
  searchParams: { folder?: string };
}) {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  const rootId = await getDriveFolderId();
  const live = driveConfigured();
  const folderId = searchParams.folder || rootId;

  // 서비스계정이 설정돼 있으면 실시간 조회, 아니면 캡처된 스냅샷(루트 폴더)을 보여준다.
  const res = live
    ? await listDriveFolder(folderId)
    : { ok: true as const, files: DRIVE_SNAPSHOT };
  const files = res?.files ?? [];
  const folders = files.filter((f) => f.isFolder);
  const docs = files.filter((f) => !f.isFolder);
  const isSub = live && !!searchParams.folder && searchParams.folder !== rootId;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>업무 진행시트</h1>
          <p>구글 드라이브 폴더의 파일을 한눈에 트래킹한다(서비스계정 읽기 전용).</p>
        </div>
        {rootId && (
          <a
            className="btn"
            href={`https://drive.google.com/drive/folders/${folderId}`}
            target="_blank"
            rel="noreferrer"
          >
            드라이브 열기
          </a>
        )}
      </div>

      {live && !res?.ok ? (
        <div className="flag">
          {res?.error}
          <div className="fix" style={{ marginTop: 6 }}>
            폴더를 서비스계정 이메일에 <b>공유(뷰어)</b> 했는지, 폴더 ID가 맞는지 확인하세요.
          </div>
        </div>
      ) : (
        <>
          {!live && (
            <div className="flag" style={{ borderLeftColor: "var(--accent)", background: "var(--accent-bg, #eef)" }}>
              아직 <b>구글 드라이브가 연결되지 않았습니다.</b> 설정에서 <b>서비스계정</b>을 연결하고
              업무시트 폴더를 그 계정에 공유(뷰어)하면, 원하는 구글 계정의 시트가 실시간으로 표시됩니다.
              <div className="fix" style={{ marginTop: 6 }}>설정 → 업무 시트 폴더에서 폴더 ID를 지정하세요.</div>
            </div>
          )}

          {isSub && (
            <div className="btn-row" style={{ marginBottom: 12 }}>
              <a className="btn sm" href="/drive">← 루트 폴더로</a>
            </div>
          )}

          {folders.length > 0 && (
            <>
              <div className="section-title">하위 폴더 ({folders.length})</div>
              <div className="btn-row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
                {folders.map((f) =>
                  live ? (
                    <a key={f.id} className="btn sm" href={`/drive?folder=${f.id}`}>
                      📁 {f.name}
                    </a>
                  ) : (
                    <a key={f.id} className="btn sm" href={f.webViewLink} target="_blank" rel="noreferrer">
                      📁 {f.name}
                    </a>
                  )
                )}
              </div>
            </>
          )}

          <div className="section-title">파일 ({docs.length})</div>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            {docs.length === 0 ? (
              <div className="empty">이 폴더에 파일이 없습니다.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>종류</th>
                    <th>수정일</th>
                    <th>소유자</th>
                    <th>열기</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((f) => {
                    const label = mimeLabel(f.mimeType);
                    return (
                      <tr key={f.id}>
                        <td>{f.name}</td>
                        <td>
                          <span className={`badge ${TYPE_BADGE[label] ?? ""}`}>{label}</span>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{fmt(f.modifiedTime)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{f.owner || "-"}</td>
                        <td>
                          <a className="btn sm" href={f.webViewLink} target="_blank" rel="noreferrer">열기</a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            폴더를 실시간으로 읽어 표시합니다. 드라이브에서 파일을 추가/수정하면 새로고침 시 반영됩니다.
          </p>
        </>
      )}
    </div>
  );
}
