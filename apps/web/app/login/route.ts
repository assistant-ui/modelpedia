import { NextResponse } from "next/server";
import { buildAuthorizeUrl, writeFlowState } from "@/lib/auth";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const redirect = new URL(request.url).searchParams.get("redirect") ?? "/";

  const { url, flow } = await buildAuthorizeUrl(origin, redirect);

  const response = NextResponse.redirect(url);
  await writeFlowState(response, flow, origin);
  return response;
}
