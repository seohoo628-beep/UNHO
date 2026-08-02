import { createSupabaseServiceClient } from "@/lib/supabase/service";

// 서버 컴포넌트에서 공유 데이터(거래처·주문처) 조회. 테이블 미생성/키 없음 시 dbReady=false.

export interface VendorRow {
  id: string;
  store: string;
  cat: string;
  name: string;
  contact: string;
  phone: string;
  items: string;
  terms: string;
  note: string;
}

export interface LinkRow {
  id: string;
  store: string;
  cat: string;
  name: string;
  url: string;
  note: string;
}

export async function fetchVendors(platform: "fnb" | "dining"): Promise<{ rows: VendorRow[]; dbReady: boolean }> {
  try {
    const s = createSupabaseServiceClient();
    const { data, error } = await s
      .from("store_vendors")
      .select("id,store,cat,name,contact,phone,items,terms,note")
      .eq("platform", platform)
      .order("created_at", { ascending: false });
    if (error) return { rows: [], dbReady: false };
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      store: r.store,
      cat: r.cat ?? "식자재",
      name: r.name ?? "",
      contact: r.contact ?? "",
      phone: r.phone ?? "",
      items: r.items ?? "",
      terms: r.terms ?? "",
      note: r.note ?? "",
    }));
    return { rows, dbReady: true };
  } catch {
    return { rows: [], dbReady: false };
  }
}

export interface MeetingRow {
  id: string;
  store: string;
  title: string;
  meetingType: string;
  meetingDate: string;
  attendees: string;
  location: string;
  body: string;
  aiSummary: string;
  filePath: string;
  fileName: string;
}

export async function fetchMeetings(platform: "fnb" | "dining"): Promise<{ rows: MeetingRow[]; dbReady: boolean }> {
  try {
    const s = createSupabaseServiceClient();
    const { data, error } = await s
      .from("store_meetings")
      .select("id,store,title,meeting_type,meeting_date,attendees,location,body,ai_summary,file_path,file_name")
      .eq("platform", platform)
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) return { rows: [], dbReady: false };
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      store: r.store ?? "all",
      title: r.title ?? "",
      meetingType: r.meeting_type ?? "내부",
      meetingDate: r.meeting_date ?? "",
      attendees: r.attendees ?? "",
      location: r.location ?? "",
      body: r.body ?? "",
      aiSummary: r.ai_summary ?? "",
      filePath: r.file_path ?? "",
      fileName: r.file_name ?? "",
    }));
    return { rows, dbReady: true };
  } catch {
    return { rows: [], dbReady: false };
  }
}

export async function fetchLinks(platform: "fnb" | "dining"): Promise<{ rows: LinkRow[]; dbReady: boolean }> {
  try {
    const s = createSupabaseServiceClient();
    const { data, error } = await s
      .from("store_order_links")
      .select("id,store,cat,name,url,note")
      .eq("platform", platform)
      .order("created_at", { ascending: false });
    if (error) return { rows: [], dbReady: false };
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      store: r.store,
      cat: r.cat ?? "기타",
      name: r.name ?? "",
      url: r.url ?? "",
      note: r.note ?? "",
    }));
    return { rows, dbReady: true };
  } catch {
    return { rows: [], dbReady: false };
  }
}
