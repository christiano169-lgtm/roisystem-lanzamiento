// Best-effort shape for Fathom's meeting API — see NOTE in client.ts.
export interface FathomMeeting {
  id: string;
  title?: string;
  recording_url?: string;
  transcript?: string;
  duration_seconds?: number;
  created_at?: string;
  contact_email?: string;
  [key: string]: unknown;
}
