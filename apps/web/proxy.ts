import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const wantsMd =
    request.nextUrl.searchParams.get("format") === "md" ||
    request.headers.get("accept")?.includes("text/markdown");

  if (wantsMd) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("format");
    url.pathname = `/api/markdown${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|v1|_next|favicon).*)"],
};
