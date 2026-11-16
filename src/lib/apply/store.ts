import type { CvProfile } from "../cv/types";

export type AppStatus = "prepared" | "dry_run" | "sent" | "skipped" | "failed" | "manual";

export type ApplyJob = {
  id: string;
  title: string;
  company: string;
  apply_url: string;
  apply_email: string;
  apply_method: "email" | "ats" | "manual";
  questions: string[];
};
export type ApplyProfile = { id: string; name: string; min_match: number; daily_limit: number; auto_apply: boolean; consent_at: string | null; is_active: boolean };
export type ApplyCandidate = { profileId: string; score: number; job: ApplyJob; tailored: { content: CvProfile; pdf_path: string | null } };
export type ApplyUser = {
  userId: string;
  paused: boolean;
  /** screening_answers as key → answer */
  answers: Record<string, string>;
  profiles: ApplyProfile[];
  /** Matches at or above their search's minimum, best first, that have a tailored CV and no application yet. */
  candidates: ApplyCandidate[];
};
export type NewApplication = {
  user_id: string;
  job_id: string;
  search_profile_id: string;
  status: AppStatus;
  method: "email" | "ats" | "manual";
  detail: Record<string, unknown>;
  sent_at?: string | null;
};
export type NewNotification = { user_id: string; kind: string; message: string; link: string };

/** Everything the apply engine needs from the database, so it can be tested without one. */
export interface ApplyStore {
  listUsers(userId?: string): Promise<ApplyUser[]>;
  /** Automatic applications (dry run, sent, failed, in progress) made for a search since `sinceIso`. */
  countAutoSince(profileId: string, sinceIso: string): Promise<number>;
  /** Inserts the application. Returns its id, or null when one already exists for this user and job. */
  insertApplication(app: NewApplication): Promise<string | null>;
  updateApplication(id: string, patch: { status: AppStatus; detail: Record<string, unknown>; sent_at?: string | null }): Promise<void>;
  addNotification(n: NewNotification): Promise<void>;
  /** The tailored PDF to attach. */
  readTailoredPdf(path: string): Promise<Uint8Array | null>;
}

const AUTO: AppStatus[] = ["prepared", "dry_run", "sent", "failed"];

/** In-memory store for tests. */
export function memoryApplyStore(users: ApplyUser[]) {
  const applications: (NewApplication & { id: string; created_at: string })[] = [];
  const notifications: NewNotification[] = [];
  let clock = () => new Date().toISOString();
  const store: ApplyStore = {
    async listUsers(userId) {
      return users
        .filter((u) => !userId || u.userId === userId)
        .map((u) => ({ ...u, candidates: u.candidates.filter((c) => !applications.some((a) => a.user_id === u.userId && a.job_id === c.job.id)) }));
    },
    async countAutoSince(profileId, sinceIso) {
      return applications.filter((a) => a.search_profile_id === profileId && AUTO.includes(a.status) && a.created_at >= sinceIso).length;
    },
    async insertApplication(app) {
      if (applications.some((a) => a.user_id === app.user_id && a.job_id === app.job_id)) return null;
      const id = `a${applications.length + 1}`;
      applications.push({ ...app, id, created_at: clock() });
      return id;
    },
    async updateApplication(id, patch) {
      Object.assign(applications.find((a) => a.id === id)!, patch);
    },
    async addNotification(n) {
      notifications.push(n);
    },
    async readTailoredPdf() {
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    },
  };
  return { store, applications, notifications, setClock: (fn: () => string) => (clock = fn) };
}
