import type { PrismaClient, ProviderName } from "@/generated/prisma/client";
import { redactText } from "@/lib/config/redact";
import { hashRequestMetadata } from "@/lib/evidence/hash";

type ObservabilityDbClient = Pick<PrismaClient, "apiObservability">;

export type RecordApiObservabilityInput = {
  provider: ProviderName;
  endpoint: string;
  requestMetadata?: unknown;
  requestHash?: string;
  statusCode?: number;
  durationMs?: number;
  rowCount?: number;
  responseHash?: string;
  payloadId?: string;
  jobRunId?: string;
  errorMessage?: string;
  calledAt?: Date;
};

export async function recordApiObservability(
  prisma: ObservabilityDbClient,
  input: RecordApiObservabilityInput,
) {
  const requestHash =
    input.requestHash ??
    (input.requestMetadata === undefined
      ? undefined
      : hashRequestMetadata(input.requestMetadata));

  return prisma.apiObservability.create({
    data: {
      calledAt: input.calledAt,
      durationMs: input.durationMs,
      endpoint: input.endpoint,
      jobRunId: input.jobRunId,
      payloadId: input.payloadId,
      provider: input.provider,
      requestHash,
      responseHash: input.responseHash,
      rowCount: input.rowCount,
      sanitizedError:
        input.errorMessage === undefined
          ? undefined
          : redactText(input.errorMessage),
      statusCode: input.statusCode,
    },
  });
}
