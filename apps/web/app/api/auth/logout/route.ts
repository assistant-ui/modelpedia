import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL("/", origin));
  clearSession(response);
  return response;
}
