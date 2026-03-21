import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeCode,
  fetchUserInfo,
  getCallbackUrl,
  readFlowState,
  writeSession,
} from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?error=missing_params", origin));
  }

  const store = await cookies();
  const flow = await readFlowState(store);

  if (!flow || flow.state !== state) {
    return NextResponse.redirect(new URL("/?error=invalid_state", origin));
  }

  try {
    const tokens = await exchangeCode({
      code,
      codeVerifier: flow.verifier,
      redirectUri: getCallbackUrl(origin),
    });

    const user = await fetchUserInfo(tokens.access_token);

    const session = {
      user,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      accessTokenExpiresAt: tokens.expires_at
        ? tokens.expires_at * 1000
        : Date.now() + (tokens.expires_in ?? 3600) * 1000,
    };

    const response = NextResponse.redirect(new URL(flow.redirectPath, origin));
    await writeSession(response, session, origin);
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?error=auth_failed", origin));
  }
}
