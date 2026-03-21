import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { cache } from "react";

// ── Config ──

const AUTH_URL =
  process.env.NEXT_PUBLIC_AUTH_URL ?? "https://accounts.assistant-ui.com";
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID ?? "modelpedia";
const OIDC_SCOPE = "openid profile email";
const SESSION_COOKIE = "modelpedia.session";
const FLOW_COOKIE = "modelpedia.oidc_flow";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const FLOW_COOKIE_MAX_AGE = 60 * 10; // 10 min
const SECRET = process.env.AUTH_SECRET ?? "";

// ── Types ──

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
};

export type AuthSession = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string | null;
  accessTokenExpiresAt: number;
};

type OidcFlowState = {
  state: string;
  verifier: string;
  redirectPath: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  expires_at?: number;
};

// ── Crypto ──

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encrypt(data: string): Promise<string> {
  const key = await deriveKey(SECRET);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(data),
  );
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(data: string): Promise<string> {
  const key = await deriveKey(SECRET);
  const combined = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted,
  );
  return new TextDecoder().decode(decrypted);
}

// ── PKCE ──

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createVerifier(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return toBase64Url(new Uint8Array(digest));
}

export function createState(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}

// ── URLs ──

function authEndpoint(path: string): string {
  return new URL(path, AUTH_URL).toString();
}

export function getCallbackUrl(origin: string): string {
  return new URL("/api/auth/callback", origin).toString();
}

export async function buildAuthorizeUrl(
  origin: string,
  redirectPath = "/",
): Promise<{ url: string; flow: OidcFlowState }> {
  const state = createState();
  const verifier = createVerifier();
  const challenge = await createChallenge(verifier);

  const url = new URL(authEndpoint("/api/auth/oauth2/authorize"));
  url.searchParams.set("client_id", OIDC_CLIENT_ID);
  url.searchParams.set("redirect_uri", getCallbackUrl(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OIDC_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { url: url.toString(), flow: { state, verifier, redirectPath } };
}

// ── Token exchange ──

export async function exchangeCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const res = await fetch(authEndpoint("/api/auth/oauth2/token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: OIDC_CLIENT_ID,
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json() as Promise<TokenResponse>;
}

export async function fetchUserInfo(accessToken: string): Promise<AuthUser> {
  const res = await fetch(authEndpoint("/api/auth/oauth2/userinfo"), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`User info failed: ${res.status}`);
  const data = (await res.json()) as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  return {
    id: data.sub,
    email: data.email ?? "",
    name: data.name ?? data.email ?? data.sub,
    image: data.picture ?? null,
  };
}

// ── Cookie helpers ──

function cookieOptions(maxAge: number, origin: string) {
  const secure = new URL(origin).protocol === "https:";
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure,
  };
}

export async function writeSession(
  response: NextResponse,
  session: AuthSession,
  origin: string,
) {
  response.cookies.set(
    SESSION_COOKIE,
    await encrypt(JSON.stringify(session)),
    cookieOptions(COOKIE_MAX_AGE, origin),
  );
}

export async function writeFlowState(
  response: NextResponse,
  flow: OidcFlowState,
  origin: string,
) {
  response.cookies.set(
    FLOW_COOKIE,
    await encrypt(JSON.stringify(flow)),
    cookieOptions(FLOW_COOKIE_MAX_AGE, origin),
  );
}

export async function readFlowState(store: {
  get(name: string): { value: string } | undefined;
}): Promise<OidcFlowState | null> {
  const value = store.get(FLOW_COOKIE)?.value;
  if (!value) return null;
  try {
    return JSON.parse(await decrypt(value));
  } catch {
    return null;
  }
}

export function clearSession(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
  response.cookies.set(FLOW_COOKIE, "", { maxAge: 0, path: "/" });
}

// ── Server session reader (cached per request) ──

export const getSession = cache(async (): Promise<AuthSession | null> => {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  if (!value) return null;
  try {
    return JSON.parse(await decrypt(value)) as AuthSession;
  } catch {
    return null;
  }
});

export const getUser = cache(async (): Promise<AuthUser | null> => {
  const session = await getSession();
  return session?.user ?? null;
});
