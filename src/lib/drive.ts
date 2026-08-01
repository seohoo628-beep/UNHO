import crypto from "crypto";
import { getSetting } from "@/lib/settings";

// 구글 드라이브 폴더 트래킹 — 서비스계정(JWT)으로 Drive API 읽기.
// env: GOOGLE_SA_CLIENT_EMAIL, GOOGLE_SA_PRIVATE_KEY(줄바꿈 \n 이스케이프 허용)
//      기본 폴더는 setting(drive_folder_id) 또는 env(GOOGLE_DRIVE_FOLDER_ID).

const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export async function getDriveFolderId(): Promise<string> {
  return (await getSetting("drive_folder_id")) || process.env.GOOGLE_DRIVE_FOLDER_ID || "";
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

/** 폴더 URL/ID에서 폴더 ID를 뽑는다. */
export function parseFolderId(input: string): string | null {
  const m = input.match(/\/folders\/([a-zA-Z0-9_-]+)/) || input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}
