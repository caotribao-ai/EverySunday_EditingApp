export type PlanTier = "FREE" | "BASIC" | "PRO";

export interface LimitsMeResponse {
  plan: PlanTier;
  limits: {
    maxUploadBytes: number;
    maxDurationSeconds: number;
    monthlyTranscribeJobs: number;
    dailyTranscribeJobs: number;
    dailyExportJobs: number;
  };
  export: {
    width: number;
    height: number;
    watermark: boolean;
  };
  credits: {
    included: number;
    consumed: number;
    remaining: number;
    overageEnabled: boolean;
    overageCredits: number;
  };
  usage: {
    monthlyTranscribeJobs: number;
    monthlyTranscribeLimit: number;
    today: {
      transcribeJobs: number;
      exportJobs: number;
    };
  };
}

export async function fetchLimitsMe(authHeaders: HeadersInit): Promise<LimitsMeResponse> {
  const response = await fetch("/api/limits/me", { headers: authHeaders });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Không thể tải quota.");
  }
  return data as LimitsMeResponse;
}

export function formatMonthlyVideoQuota(quota: LimitsMeResponse | null, plan: PlanTier): string {
  const limit = quota?.usage.monthlyTranscribeLimit
    ?? (plan === "FREE" ? 5 : plan === "BASIC" ? 30 : 100);
  const used = quota?.usage.monthlyTranscribeJobs ?? 0;
  return `${used} / ${limit} videos`;
}

export function monthlyQuotaPercent(quota: LimitsMeResponse | null, plan: PlanTier): number {
  const limit = quota?.usage.monthlyTranscribeLimit
    ?? (plan === "FREE" ? 5 : plan === "BASIC" ? 30 : 100);
  if (limit <= 0) return 0;
  const used = quota?.usage.monthlyTranscribeJobs ?? 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
