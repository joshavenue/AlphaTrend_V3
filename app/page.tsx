import { envPresence, getEnv } from "@/lib/config/env";

const commandRows = [
  ["dev", "next dev on 0.0.0.0:420"],
  ["health", "server-side health and env presence check"],
  ["test", "Vitest Phase 0 checks"],
  ["db:migrate", "Prisma migration runner"],
  ["smoke:providers", "provider config smoke placeholder"],
];

export default function Home() {
  const env = getEnv();
  const presence = envPresence();

  return (
    <main className="min-h-screen px-6 py-6 md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="border-b border-border pb-5">
          <p className="font-mono text-xs uppercase tracking-normal text-amber">
            AlphaTrend V3 / Phase 0
          </p>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-normal md:text-5xl">
                Build Frame
              </h1>
              <p className="mt-2 max-w-2xl text-base text-muted">
                Repository skeleton, environment boundaries, health checks,
                migration frame, worker entrypoints, and test harness.
              </p>
            </div>
            <a
              className="inline-flex h-10 items-center justify-center border border-amber px-4 font-mono text-sm text-amber transition hover:bg-amber hover:text-inverse"
              href="/api/health"
            >
              /api/health
            </a>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
          <div className="border border-border bg-panel p-5">
            <h2 className="text-xl font-semibold">Runtime Contract</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="grid grid-cols-[9rem_1fr] gap-4 border-b border-border/70 pb-3">
                <dt className="font-mono text-muted">APP_ENV</dt>
                <dd>{env.APP_ENV}</dd>
              </div>
              <div className="grid grid-cols-[9rem_1fr] gap-4 border-b border-border/70 pb-3">
                <dt className="font-mono text-muted">APP_BASE_URL</dt>
                <dd>{env.APP_BASE_URL}</dd>
              </div>
              <div className="grid grid-cols-[9rem_1fr] gap-4">
                <dt className="font-mono text-muted">LOG_LEVEL</dt>
                <dd>{env.LOG_LEVEL}</dd>
              </div>
            </dl>
          </div>

          <div className="border border-border bg-panel p-5">
            <h2 className="text-xl font-semibold">Secret Boundary</h2>
            <div className="mt-4 grid gap-2 font-mono text-xs">
              {presence.map((item) => (
                <div
                  className="flex items-center justify-between border-b border-border/60 pb-2 last:border-b-0"
                  key={item.name}
                >
                  <span className="text-muted">{item.name}</span>
                  <span
                    className={item.present ? "text-positive" : "text-caution"}
                  >
                    {item.present ? "present" : "missing"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border border-border bg-panel p-5">
          <h2 className="text-xl font-semibold">Phase 0 Commands</h2>
          <div className="mt-4 grid gap-2">
            {commandRows.map(([name, description]) => (
              <div
                className="grid gap-1 border-b border-border/60 pb-2 last:border-b-0 md:grid-cols-[14rem_1fr]"
                key={name}
              >
                <code className="font-mono text-sm text-cyan">
                  npm run {name}
                </code>
                <span className="text-sm text-muted">{description}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
