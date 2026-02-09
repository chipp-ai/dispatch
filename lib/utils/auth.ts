import { cookies, headers } from "next/headers";
import crypto from "crypto";

const SESSION_COOKIE_NAME = "dispatch_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function verifyPassword(password: string): Promise<boolean> {
  const correctPassword = process.env.DISPATCH_PASSWORD;
  if (!correctPassword) {
    console.error("DISPATCH_PASSWORD not set");
    return false;
  }
  return password === correctPassword;
}

export async function createSession(): Promise<string> {
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_MS / 1000,
    path: "/",
  });

  return sessionToken;
}

export async function getSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE_NAME);
  return session?.value || null;
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function requireAuth(): Promise<boolean> {
  // Check session cookie (browser UI)
  const session = await getSession();
  if (session !== null) return true;

  // Check Bearer token (CI/API access)
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const apiKey = process.env.DISPATCH_API_KEY;
    if (apiKey && token === apiKey) return true;

    // In dev mode, accept any valid Bearer token (for ngrok tunnel callbacks
    // where the GH Actions secret differs from the local API key)
    if (process.env.NODE_ENV !== "production" && token.length > 0) return true;
  }

  return false;
}
