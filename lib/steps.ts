// ---------------------------------------------------------------------------
// The scripted run: a realistic overnight Microsoft Graph automation.
// "Nightly Exec Briefing" — a cron-scheduled, unattended, multi-step agent.
// The dead-refresh-token failure lands on a configurable step (default: Files).
// ---------------------------------------------------------------------------

import type { RunStep } from "./types";

export interface StepSpec {
  id: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  label: string;
  detail: string;
}

export const RUN_SCRIPT: StepSpec[] = [
  {
    id: "acquire",
    method: "POST",
    path: "/oauth2/v2.0/token",
    label: "Acquire Graph token",
    detail: "grant_type=refresh_token · offline_access Mail.ReadWrite Calendars.Read Files.Read.All",
  },
  {
    id: "identity",
    method: "GET",
    path: "/v1.0/me",
    label: "Resolve service identity",
    detail: "svc-briefing@contoso.com",
  },
  {
    id: "inbox",
    method: "GET",
    path: "/v1.0/me/messages?$top=50",
    label: "Scan overnight inbox",
    detail: "52 messages since 18:00",
  },
  {
    id: "calendar",
    method: "GET",
    path: "/v1.0/me/calendarView",
    label: "Pull tomorrow's calendar",
    detail: "7 events · 09:00–17:30",
  },
  {
    id: "files",
    method: "GET",
    path: "/v1.0/me/drive/recent",
    label: "Gather modified documents",
    detail: "OneDrive + 3 SharePoint sites",
  },
  {
    id: "compose",
    method: "POST",
    path: "/v1.0/me/insights",
    label: "Compose executive briefing",
    detail: "rank · summarize · format",
  },
  {
    id: "send",
    method: "POST",
    path: "/v1.0/me/sendMail",
    label: "Send the 6:00am briefing",
    detail: "to: exec-team@contoso.com",
  },
  {
    id: "archive",
    method: "PATCH",
    path: "/v1.0/me/mailFolders/inbox/messages",
    label: "Archive processed threads",
    detail: "move 52 → /Processed",
  },
];

export const DEFAULT_FAILURE_STEP = 4; // "Gather modified documents"

export function buildSteps(): RunStep[] {
  return RUN_SCRIPT.map((s) => ({
    ...s,
    status: "pending",
    attempts: 0,
  }));
}
