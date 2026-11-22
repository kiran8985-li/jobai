import type { FillData } from "../fill-data";

/**
 * The apply robot: opens a job's application form, fills it from the person's CV and saved answers,
 * attaches the tailored CV and (in live mode) presses Submit. No I/O in this file.
 */
export type RobotMode = "dry_run" | "live";

export type RobotInput = {
  url: string;
  data: FillData;
  cv: { filename: string; bytes: Uint8Array };
  mode: RobotMode;
  /** Answers a question the form asks that no saved answer covers, from CV facts only; null when it cannot. */
  answer?: (question: string) => Promise<string | null>;
};

export type RobotOutcome =
  /** Live mode: Submit was pressed and the employer's page confirmed it. */
  | "submitted"
  /** Test mode: every required field is filled; stopped before Submit. */
  | "ready"
  /** Something the robot must not or cannot do; the person finishes it. */
  | "needs_user";

export type RobotResult = {
  outcome: RobotOutcome;
  /** Why the person must finish it (shown to them). */
  reason?: string;
  filled: string[];
  aiAnswered: { question: string; answer: string }[];
  unanswered: string[];
  screenshot?: Uint8Array;
};

export type Robot = (input: RobotInput) => Promise<RobotResult>;
