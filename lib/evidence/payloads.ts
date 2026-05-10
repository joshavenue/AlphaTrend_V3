import type {
  PayloadRedactionStatus,
  Prisma,
  PrismaClient,
  ProviderName,
} from "@/generated/prisma/client";
import { redactRecord } from "@/lib/config/redact";
import {
  hashPayload,
  hashRequestMetadata,
  stableStringify,
} from "@/lib/evidence/hash";

type PayloadDbClient = Pick<PrismaClient, "providerPayload">;

export type StoreProviderPayloadInput = {
  provider: ProviderName;
  endpoint: string;
  entityType?: string;
  entityId?: string;
  requestMetadata: unknown;
  payload?: unknown;
  payloadStorageUri?: string;
  payloadPreviewJson?: Prisma.InputJsonValue;
  fetchedAt?: Date;
  httpStatus?: number;
  contentType?: string;
  sizeBytes?: number;
  redactionStatus?: PayloadRedactionStatus;
};

function createPayloadPreview(
  payload: unknown,
): Prisma.InputJsonValue | undefined {
  if (payload === undefined) {
    return undefined;
  }

  const redactedPayload = redactRecord(payload);
  const serializedPayload = stableStringify(redactedPayload);

  if (Buffer.byteLength(serializedPayload, "utf8") <= 16_384) {
    return redactedPayload as Prisma.InputJsonValue;
  }

  return {
    truncated: true,
    preview: serializedPayload.slice(0, 16_384),
    full_payload_hash: hashPayload(payload),
  };
}

export async function storeProviderPayload(
  prisma: PayloadDbClient,
  input: StoreProviderPayloadInput,
) {
  const requestHash = hashRequestMetadata(input.requestMetadata);
  const responseHash = hashPayload(
    input.payload ?? input.payloadStorageUri ?? null,
  );
  const payloadPreviewJson =
    input.payloadPreviewJson ?? createPayloadPreview(input.payload);

  const existing = await prisma.providerPayload.findFirst({
    where: {
      endpoint: input.endpoint,
      provider: input.provider,
      requestHash,
      responseHash,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.providerPayload.create({
    data: {
      contentType: input.contentType,
      endpoint: input.endpoint,
      entityId: input.entityId,
      entityType: input.entityType,
      fetchedAt: input.fetchedAt,
      httpStatus: input.httpStatus,
      payloadPreviewJson,
      payloadStorageUri: input.payloadStorageUri,
      provider: input.provider,
      redactionStatus: input.redactionStatus ?? "REDACTED",
      requestHash,
      responseHash,
      sizeBytes:
        input.sizeBytes ??
        (input.payload === undefined
          ? undefined
          : Buffer.byteLength(stableStringify(input.payload), "utf8")),
    },
  });
}
