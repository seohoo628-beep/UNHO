"use server";

import { requireAppUser } from "@/lib/auth";
import { listMessages, getMessage, sendMessage, markRead, type MailHeader, type MailFull } from "@/lib/gmail";

async function guard() {
  const u = await requireAppUser();
  if (u.role !== "owner" && u.role !== "staff") return null;
  return u;
}

export async function listInbox(opts: { label?: string; q?: string; pageToken?: string }): Promise<{
  ok: boolean;
  messages?: MailHeader[];
  nextPageToken?: string;
  error?: string;
  needsSetup?: boolean;
}> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  return listMessages({ label: opts.label, q: opts.q, pageToken: opts.pageToken, max: 20 });
}

export async function openMessage(id: string): Promise<{ ok: boolean; message?: MailFull; error?: string }> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  const r = await getMessage(id);
  if (r.ok && r.message?.unread) {
    // 열람 시 읽음 처리(실패해도 무시).
    markRead(id).catch(() => {});
  }
  return r;
}

export async function sendMail(input: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ ok: boolean; error?: string; needsSetup?: boolean }> {
  const u = await guard();
  if (!u) return { ok: false, error: "권한이 없습니다." };
  return sendMessage({
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    body: input.body,
    fromName: "하루바른·나아",
    threadId: input.threadId,
    inReplyTo: input.inReplyTo,
    references: input.references,
  });
}

export async function markMailRead(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await guard())) return { ok: false, error: "권한이 없습니다." };
  return markRead(id);
}
