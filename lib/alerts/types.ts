import type {
  AlertSeverity,
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";

export type AlertDbClient = PrismaClient;

export type AlertStateType =
  | "candidate_exposure_state"
  | "candidate_final_state"
  | "candidate_fundamental_state"
  | "candidate_liquidity_state"
  | "candidate_price_state"
  | "theme_dashboard_state";

export type CurrentTrackedState = {
  currentScore?: number;
  currentState: string;
  evidenceIds: string[];
  reasonCodes: string[];
  securityId?: string;
  severity: AlertSeverity;
  sourceThemeCode?: string | null;
  stateType: AlertStateType;
  themeCandidateId?: string;
  themeId: string;
  themeName: string;
  themeSlug: string;
  ticker?: string;
};

export type AlertDecision = {
  alertReasonCode: string;
  alertType: string;
  message: string;
  severity: AlertSeverity;
  title: string;
};

export type AlertEvaluationOptions = {
  themeRef?: string;
};

export type AlertThemeSummary = {
  alertsCreated: number;
  baselinesCreated: number;
  changesSuppressed: number;
  sourceThemeCode?: string | null;
  statesEvaluated: number;
  themeId: string;
  themeName: string;
};

export type AlertEvaluationSummary = {
  alertsCreated: number;
  baselinesCreated: number;
  changesSuppressed: number;
  jobRunId: string;
  rowsRead: number;
  rowsWritten: number;
  signalStatesWritten: number;
  themes: AlertThemeSummary[];
  warnings: AlertWarning[];
};

export type AlertWarning = {
  code: string;
  message: string;
  severity: "INFO" | "WARNING" | "BLOCKER";
  themeCode?: string | null;
  ticker?: string;
};

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
