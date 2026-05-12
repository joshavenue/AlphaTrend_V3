import { headers } from "next/headers";

type ApiEnvelope<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: {
        code: string;
        message: string;
      };
      ok: false;
    };

function originFromHeaders(headersList: Headers) {
  const host = headersList.get("host") ?? "127.0.0.1:420";
  const proto = headersList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function fetchInternalApi<T>(path: string): Promise<T> {
  const headersList = await headers();
  const response = await fetch(`${originFromHeaders(headersList)}${path}`, {
    cache: "no-store",
    headers: {
      cookie: headersList.get("cookie") ?? "",
    },
  });
  const envelope = (await response.json()) as ApiEnvelope<T>;

  if (!envelope.ok) {
    throw new Error(envelope.error.message);
  }

  return envelope.data;
}
