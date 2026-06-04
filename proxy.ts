import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { sessionCookieName, verifySessionToken } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(sessionCookieName)?.value;
  const session = await verifySessionToken(token);
  const isLoginPage = request.nextUrl.pathname === "/login";

  if (!session && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);

    return NextResponse.redirect(url);
  }

  if (session && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
