export const sessionCookieName = "picloud_session";
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

export type SessionPayload = {
  userId: string;
  username: string;
  exp: number;
};

const textEncoder = new TextEncoder();

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters.");
  }

  return secret;
}

function base64UrlEncode(input: string | ArrayBuffer) {
  const bytes =
    typeof input === "string"
      ? textEncoder.encode(input)
      : new Uint8Array(input);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(input: string) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return atob(padded);
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value));

  return base64UrlEncode(signature);
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return result === 0;
}

export async function createSessionToken(payload: Omit<SessionPayload, "exp">) {
  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      exp: Date.now() + sessionMaxAgeSeconds * 1000,
    }),
  );
  const signature = await sign(body);

  return `${body}.${signature}`;
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token) {
    return null;
  }

  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return null;
  }

  const expectedSignature = await sign(body);

  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;

    if (!payload.userId || !payload.username || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: sessionMaxAgeSeconds,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
