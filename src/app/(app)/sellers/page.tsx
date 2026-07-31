import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { fetchSellerSheet, getSellerSheetId } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SellersPage() {
  const user = await requireAppUser();
  if (user.role === "vendor") redirect("/portal");

  const sheetId = await getSellerSheetId();
  const sheet = await fetchSellerSheet(sheetId);
  const rows = sheet.rows ?? [];
  const header = rows[0] ?? [];
  const body = rows.slice(1, 200);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>셀러 파이프라인</h1>
          <p>
            구글 시트를 읽기 전용으로 연동합니다. 로컬 복제는 하지 않으며, 쓰기는 시트 쪽에만
            합니다. MD 에이전트가 이 데이터를 후보 검증 입력으로 씁니다.
          </p>
        </div>
        <a
          className="btn"
          href={`https://docs.google.com/spreadsheets/d/${sheetId}`}
          target="_blank"
          rel="noreferrer"
        >
          시트 열기
        </a>
      </div>

      {!sheet.ok ? (
        <div className="flag">
          {sheet.error}
          <div className="fix" style={{ marginTop: 6 }}>
            구글 시트 → 공유 → "링크가 있는 모든 사용자"를 <b>뷰어</b>로 설정하면 읽힙니다.
            (편집 권한은 주지 않습니다. 읽기 전용)
          </div>
        </div>
      ) : rows.length <= 1 ? (
        <div className="card empty">시트에 데이터가 없습니다.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                {header.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {header.map((_, ci) => (
                    <td key={ci}>{r[ci] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        상위 200행까지 표시. 팔로업 상세는 노션 "운호컴퍼니 운영관리 &gt; 공구 셀러 팔로업"에서 관리합니다.
      </p>
    </div>
  );
}
