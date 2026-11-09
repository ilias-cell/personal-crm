import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// A quick check, without the database: a page opens only with a login cookie, otherwise the login page opens.
// It is NOT the protection of the data: a cookie can be old or closed. Every server action and every page
// that reads data asks who is logged in again (requireUser), and gives nothing without a valid login.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

// Everything except: the login pages, the login handler itself, the server check of the deploy,
// and the files the login page needs (styles, scripts, the icon).
export const config = {
  matcher: ["/((?!login(?:/|$)|api/auth(?:/|$)|health$|_next/static|_next/image|icon\\.svg$).*)"],
};
