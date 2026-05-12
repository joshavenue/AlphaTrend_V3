import { getEnv } from "@/lib/config/env";

type SignInPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl =
    params.callbackUrl && params.callbackUrl.startsWith("/")
      ? params.callbackUrl
      : "/";
  const env = getEnv();

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-sm border border-border bg-panel p-5">
        <p className="font-mono text-xs uppercase tracking-normal text-amber">
          AlphaTrend V3
        </p>
        <h1 className="mt-3 text-lg font-semibold">Admin sign in</h1>
        <p className="mt-2 text-sm text-secondary">
          Single-admin access for the AlphaTrend research dashboard.
        </p>

        {params.error ? (
          <div className="mt-4 border border-negative bg-negative-bg px-3 py-2 text-sm text-negative">
            Sign in failed. Check the credentials and try again.
          </div>
        ) : null}

        <form
          action="/api/auth/sign-in"
          className="mt-5 grid gap-3"
          method="post"
        >
          <input name="callbackUrl" type="hidden" value={callbackUrl} />
          <label className="grid gap-1 text-sm">
            <span className="text-secondary">Email</span>
            <input
              autoComplete="email"
              className="h-10 border border-border bg-input px-3 font-mono text-sm text-foreground outline-none focus:border-border-strong"
              name="email"
              required
              type="email"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-secondary">Password</span>
            <input
              autoComplete="current-password"
              className="h-10 border border-border bg-input px-3 text-sm text-foreground outline-none focus:border-border-strong"
              name="password"
              required
              type="password"
            />
          </label>
          <button
            className="mt-2 h-10 border border-amber bg-amber px-4 font-mono text-sm font-semibold text-inverse hover:bg-amber-dim focus:outline focus:outline-2 focus:outline-border-strong"
            type="submit"
          >
            Sign in
          </button>
        </form>

        <p className="mt-5 font-mono text-[10px] text-muted">
          {env.APP_ENV} / protected research console
        </p>
      </section>
    </main>
  );
}
