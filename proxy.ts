import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "alphatrend_session";

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/sign-in",
  "/sign-in",
  "/favicon.ico",
]);

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/images/") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".webmanifest")
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname) || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    if (!request.cookies.get(SESSION_COOKIE_NAME)?.value) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required.",
          },
          meta: {
            generatedAt: new Date().toISOString(),
            requestId: "req_proxy",
          },
          ok: false,
        },
        { status: 401 },
      );
    }

    return NextResponse.next();
  }

  if (!request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set(
      "callbackUrl",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
