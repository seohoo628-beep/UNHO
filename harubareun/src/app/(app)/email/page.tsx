import { requireAppUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { gmailConfigured, gmailUser, listMessages } from "@/lib/gmail";
import EmailClient from "./EmailClient";

export const dynamic = "force-dynamic";

export default async function EmailPage() {
  const user = await requireAppUser();
  if (user.role !== "owner" && user.role !== "staff") redirect("/");

  const configured = gmailConfigured();
  const mailbox = gmailUser();

  let initial = [] as Awaited<ReturnType<typeof listMessages>>["messages"];
  let initialNext: string | undefined;
  let initialError: string | undefined;
  let initialNeedsSetup = false;

  if (configured) {
    const r = await listMessages({ label: "INBOX", max: 20 });
    if (r.ok) {
      initial = r.messages;
      initialNext = r.nextPageToken;
    } else {
      initialError = r.error;
      initialNeedsSetup = !!r.needsSetup;
    }
  } else {
    initialNeedsSetup = false;
  }

  return (
    <EmailClient
      mailbox={mailbox}
      configured={configured}
      initial={initial ?? []}
      initialNext={initialNext}
      initialError={initialError}
      initialNeedsSetup={initialNeedsSetup}
    />
  );
}
