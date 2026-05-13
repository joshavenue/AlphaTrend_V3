import net from "node:net";

export type DatabaseEndpoint = {
  databaseName: string;
  host: string;
  port: number;
};

export function databaseEndpoint(databaseUrl: string): DatabaseEndpoint | null {
  try {
    const parsed = new URL(databaseUrl);
    return {
      databaseName: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 5432,
    };
  } catch {
    return null;
  }
}

export function canReachDatabaseUrl(databaseUrl: string, timeoutMs = 750) {
  const endpoint = databaseEndpoint(databaseUrl);

  if (!endpoint) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection(endpoint.port, endpoint.host);
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}
