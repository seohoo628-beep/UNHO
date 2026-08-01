import crypto from "crypto";
import { getSetting } from "@/lib/settings";

// 구글 드라이브 폴더 트래킹 — 서비스계정(JWT)으로 Drive API 읽기.
// env: GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY(줄바꿈 \n 이스케이프 허용)
//      기본 폴더는 setting(drive_folder_id) 또는 env(GOOGLE_DRIVE_FOLDER_ID).

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

// 운호컴퍼니 운영도구 폴더(기본). 설정/ENV로 덮어쓸 수 있다.
const DEFAULT_DRIVE_FOLDER_ID = "1pE4UmqFVq_zb4ArUl8WGIvVseLD2RYNo";

export async function getDriveFolderId(): Promise<string> {
  return (
    (await getSetting("drive_folder_id")) ||
    process.env.GOOGLE_DRIVE_FOLDER_ID ||
    DEFAULT_DRIVE_FOLDER_ID
  );
}

export function driveConfigured(): boolean {
  return !!(process.env.GOOGLE_SA_CLIENT_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY);
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SA_CLIENT_EMAIL;
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error("서비스계정(GOOGLE_SA_*)이 설정되지 않았습니다.");
  const key = rawKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: email,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(key).toString("base64url");
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = (await res.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!j.access_token) throw new Error(j.error_description || j.error || "토큰 발급 실패");
  return j.access_token;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  owner: string;
  isFolder: boolean;
};

const MIME_LABEL: Record<string, string> = {
  "application/vnd.google-apps.folder": "폴더",
  "application/vnd.google-apps.spreadsheet": "시트",
  "application/vnd.google-apps.document": "문서",
  "application/vnd.google-apps.presentation": "슬라이드",
  "application/vnd.google-apps.form": "설문",
  "application/pdf": "PDF",
};
export function mimeLabel(mime: string): string {
  if (MIME_LABEL[mime]) return MIME_LABEL[mime];
  if (mime.startsWith("image/")) return "이미지";
  if (mime.startsWith("video/")) return "영상";
  return "파일";
}

export async function listDriveFolder(
  folderId: string
): Promise<{ ok: boolean; files?: DriveFile[]; error?: string }> {
  try {
    const token = await getAccessToken();
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "nextPageToken, files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName))",
        pageSize: "200",
        orderBy: "folder,name",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const t = await res.text();
        return { ok: false, error: `목록 조회 실패(${res.status}): ${t.slice(0, 160)}` };
      }
      const j = (await res.json()) as {
        nextPageToken?: string;
        files?: {
          id: string;
          name: string;
          mimeType: string;
          modifiedTime?: string;
          webViewLink?: string;
          owners?: { displayName?: string }[];
        }[];
      };
      for (const f of j.files ?? []) {
        files.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          modifiedTime: f.modifiedTime ?? "",
          webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
          owner: f.owners?.[0]?.displayName ?? "",
          isFolder: f.mimeType === "application/vnd.google-apps.folder",
        });
      }
      pageToken = j.nextPageToken;
    } while (pageToken);
    return { ok: true, files };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "드라이브 조회 실패" };
  }
}

// 서비스계정 미설정 시 보여줄 스냅샷(운영도구 폴더, 2026-08-01 기준). 갱신 요청 시 업데이트.
export const DRIVE_SNAPSHOT: DriveFile[] = [
  { name: "공급가", mimeType: "application/vnd.google-apps.folder", id: "121IioNVjkoyootqlxi_o3_rShrvElGed", modifiedTime: "2026-07-31T08:39:15Z", webViewLink: "https://drive.google.com/drive/folders/121IioNVjkoyootqlxi_o3_rShrvElGed", owner: "최운호", isFolder: true },
  { name: "IR,소개서", mimeType: "application/vnd.google-apps.folder", id: "1HoRWSiqHUr9rpbpxSHDgAu5ZfMyTdHwX", modifiedTime: "2026-07-29T02:46:24Z", webViewLink: "https://drive.google.com/drive/folders/1HoRWSiqHUr9rpbpxSHDgAu5ZfMyTdHwX", owner: "최운호", isFolder: true },
  { name: "공동구매 가이드", mimeType: "application/vnd.google-apps.folder", id: "19bjSHUoxaS43yy15YDjhYoVfANA2OU5e", modifiedTime: "2026-07-31T04:39:49Z", webViewLink: "https://drive.google.com/drive/folders/19bjSHUoxaS43yy15YDjhYoVfANA2OU5e", owner: "최운호", isFolder: true },
  { name: "인사관리", mimeType: "application/vnd.google-apps.folder", id: "1Eplpm9QXMUPAZxPdLB11IgeKqNw65g8_", modifiedTime: "2026-07-25T23:51:17Z", webViewLink: "https://drive.google.com/drive/folders/1Eplpm9QXMUPAZxPdLB11IgeKqNw65g8_", owner: "최운호", isFolder: true },
  { name: "진행완료된 시트", mimeType: "application/vnd.google-apps.folder", id: "1qR5TgyYU9s5d9b84TNzkHqpUsI_g44ET", modifiedTime: "2026-07-25T23:40:40Z", webViewLink: "https://drive.google.com/drive/folders/1qR5TgyYU9s5d9b84TNzkHqpUsI_g44ET", owner: "최운호", isFolder: true },
  { name: "F&B", mimeType: "application/vnd.google-apps.folder", id: "1BWcm2Da-1Ld4YUHoSHPknWP68nSPUcwf", modifiedTime: "2026-07-25T23:39:33Z", webViewLink: "https://drive.google.com/drive/folders/1BWcm2Da-1Ld4YUHoSHPknWP68nSPUcwf", owner: "최운호", isFolder: true },
  { name: "진행중인 업무", mimeType: "application/vnd.google-apps.folder", id: "1yeYO4dV1YMfg498T6hkySE1QDVKLogTx", modifiedTime: "2026-07-25T23:41:33Z", webViewLink: "https://drive.google.com/drive/folders/1yeYO4dV1YMfg498T6hkySE1QDVKLogTx", owner: "최운호", isFolder: true },
  { name: "최운호 투두", mimeType: "application/vnd.google-apps.spreadsheet", id: "1UvWWMpFl394lIhdS_8aYwqcl99Nxkp6GFJGKTeS1mU8", modifiedTime: "2026-08-01T03:31:26Z", webViewLink: "https://docs.google.com/spreadsheets/d/1UvWWMpFl394lIhdS_8aYwqcl99Nxkp6GFJGKTeS1mU8/edit", owner: "최운호", isFolder: false },
  { name: "공구셀러_관리시트", mimeType: "application/vnd.google-apps.spreadsheet", id: "1p1h341Vry8a4PhUwO0D25qVPgQ81sU10oZcif-XeTR4", modifiedTime: "2026-07-31T23:55:05Z", webViewLink: "https://docs.google.com/spreadsheets/d/1p1h341Vry8a4PhUwO0D25qVPgQ81sU10oZcif-XeTR4/edit", owner: "최운호", isFolder: false },
  { name: "UC_운영도구_P&L", mimeType: "application/vnd.google-apps.spreadsheet", id: "1qQIV3l2fadd05x2pthY0MbsDpo3Yg0NlYK3AjAdRo3o", modifiedTime: "2026-07-31T09:02:32Z", webViewLink: "https://docs.google.com/spreadsheets/d/1qQIV3l2fadd05x2pthY0MbsDpo3Yg0NlYK3AjAdRo3o/edit", owner: "최운호", isFolder: false },
  { name: "스피듀얼샷_통합관리", mimeType: "application/vnd.google-apps.spreadsheet", id: "1cKoDL2QyTq1UbFW9y_hUcvkJdNxBseFK_NGFXFft17o", modifiedTime: "2026-07-31T07:54:02Z", webViewLink: "https://docs.google.com/spreadsheets/d/1cKoDL2QyTq1UbFW9y_hUcvkJdNxBseFK_NGFXFft17o/edit", owner: "최운호", isFolder: false },
  { name: "마케팅 업무 자동화", mimeType: "application/vnd.google-apps.spreadsheet", id: "1o5utN-MRZha3YD5WiyFBjWddKQLUwU0SGIpcx2feygk", modifiedTime: "2026-07-29T08:46:17Z", webViewLink: "https://docs.google.com/spreadsheets/d/1o5utN-MRZha3YD5WiyFBjWddKQLUwU0SGIpcx2feygk/edit", owner: "최운호", isFolder: false },
  { name: "운호컴퍼니_SEO_상위노출_체크리스트", mimeType: "application/vnd.google-apps.spreadsheet", id: "1_WzrEbg_ABdQFhUqWX3oW5dWLCMsPbPjB-Cgdl5a4dA", modifiedTime: "2026-07-27T03:50:56Z", webViewLink: "https://docs.google.com/spreadsheets/d/1_WzrEbg_ABdQFhUqWX3oW5dWLCMsPbPjB-Cgdl5a4dA/edit", owner: "최운호", isFolder: false },
  { name: "SEO·상단노출 실행 트래커", mimeType: "application/vnd.google-apps.spreadsheet", id: "1DTFlax2qMWlESmVeJ9x3aY4lNSCs8KYjM998AgadTrc", modifiedTime: "2026-07-26T15:48:44Z", webViewLink: "https://docs.google.com/spreadsheets/d/1DTFlax2qMWlESmVeJ9x3aY4lNSCs8KYjM998AgadTrc/edit", owner: "최운호", isFolder: false },
  { name: "UC_마케팅보드", mimeType: "application/vnd.google-apps.spreadsheet", id: "1xhQdVOQ-336LFDBOLdsLdufqfD41xsUeZnr63rWXAt0", modifiedTime: "2026-07-26T03:09:51Z", webViewLink: "https://docs.google.com/spreadsheets/d/1xhQdVOQ-336LFDBOLdsLdufqfD41xsUeZnr63rWXAt0/edit", owner: "최운호", isFolder: false },
  { name: "UC_마케팅보드_개선", mimeType: "application/vnd.google-apps.spreadsheet", id: "1pdBqUI1bEijnlNkK4Za-XzgYnwL_dAVFdpSljAQNpys", modifiedTime: "2026-07-26T03:26:37Z", webViewLink: "https://docs.google.com/spreadsheets/d/1pdBqUI1bEijnlNkK4Za-XzgYnwL_dAVFdpSljAQNpys/edit", owner: "최운호", isFolder: false },
  { name: "UC_디자인업무보드", mimeType: "application/vnd.google-apps.spreadsheet", id: "1qD3fm18ARWFcWUfbY2Xbv_hwH2dJ0mNYafTnpglo9c8", modifiedTime: "2026-07-26T03:32:15Z", webViewLink: "https://docs.google.com/spreadsheets/d/1qD3fm18ARWFcWUfbY2Xbv_hwH2dJ0mNYafTnpglo9c8/edit", owner: "최운호", isFolder: false },
  { name: "대표,이사 업무시트", mimeType: "application/vnd.google-apps.spreadsheet", id: "1BhmfyhKEbx4E7OYnoBhdTfBkptP2x6pn6jWm2SSO90s", modifiedTime: "2026-07-26T03:22:26Z", webViewLink: "https://docs.google.com/spreadsheets/d/1BhmfyhKEbx4E7OYnoBhdTfBkptP2x6pn6jWm2SSO90s/edit", owner: "최운호", isFolder: false },
  { name: "경영지원매니저_업무시트", mimeType: "application/vnd.google-apps.spreadsheet", id: "13e3cOca7wBzTHj31EtCdJnVnoBpUlANJXxH5QwoEDQk", modifiedTime: "2026-07-25T09:45:20Z", webViewLink: "https://docs.google.com/spreadsheets/d/13e3cOca7wBzTHj31EtCdJnVnoBpUlANJXxH5QwoEDQk/edit", owner: "최운호", isFolder: false },
  { name: "운호컴퍼니 전제품 이미지,영상 파일들", mimeType: "application/vnd.google-apps.document", id: "1Axbt78Wh9OAA1bGKPayRN26QJFz8t36RW2rEnwKCgyI", modifiedTime: "2026-07-27T06:11:52Z", webViewLink: "https://docs.google.com/document/d/1Axbt78Wh9OAA1bGKPayRN26QJFz8t36RW2rEnwKCgyI/edit", owner: "최운호", isFolder: false },
  { name: "통합운영직_업무범위_정리 (1).docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", id: "19xvNtz9kjxbg08WA6z5VwNavvb6v-W5d", modifiedTime: "2026-07-27T01:38:26Z", webViewLink: "https://drive.google.com/file/d/19xvNtz9kjxbg08WA6z5VwNavvb6v-W5d/view", owner: "최운호", isFolder: false },
  { name: "파티 초대 VIP명단", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", id: "1NuRqrEQFcb2duas2m4BZxRcFFcrxIky4", modifiedTime: "2026-07-31T03:57:02Z", webViewLink: "https://drive.google.com/file/d/1NuRqrEQFcb2duas2m4BZxRcFFcrxIky4/view", owner: "최운호", isFolder: false },
];

/** 폴더 URL/ID에서 폴더 ID를 뽑는다. */
export function parseFolderId(input: string): string | null {
  const m = input.match(/\/folders\/([a-zA-Z0-9_-]+)/) || input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}
