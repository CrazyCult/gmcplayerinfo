import "server-only";
import { cookies } from "next/headers";

// Session du site : cookie signé (HMAC-SHA256 avec AUTH_SECRET) contenant
// l'identifiant Google du compte et son prénom. Rien n'est stocké côté
// serveur à part le club rattaché, rangé sous une empreinte du compte.

export const SESSION_COOKIE = "gmc-session";
export const OAUTH_COOKIE = "gmc-oauth";

/** URL publique du site (adresse de retour déclarée chez Google). */
export function siteUrl(request: Request) {
  return (process.env.NEXT_SITE_URL || new URL(request.url).origin).replace(
    /\/+$/,
    "",
  );
}
const SESSION_DAYS = 60;

export interface Session {
  sub: string;
  name: string;
  exp: number;
}

export const authEnabled = () =>
  Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.AUTH_SECRET &&
    process.env.AUTH_SECRET.length >= 32,
  );

const encoder = new TextEncoder();
function b64url(bytes: ArrayBuffer | Uint8Array) {
  return Buffer.from(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
  ).toString("base64url");
}
let keyPromise: Promise<CryptoKey> | undefined;
function hmacKey() {
  keyPromise ??= crypto.subtle.importKey(
    "raw",
    encoder.encode(process.env.AUTH_SECRET ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return keyPromise;
}
export async function sign(value: string) {
  return b64url(
    await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(value)),
  );
}
async function verify(value: string, signature: string) {
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      Buffer.from(signature, "base64url"),
      encoder.encode(value),
    );
  } catch {
    return false;
  }
}

export async function encodeSession(session: Session) {
  const payload = b64url(encoder.encode(JSON.stringify(session)));
  return `${payload}.${await sign(`session:${payload}`)}`;
}
export async function decodeSession(token: string | undefined) {
  if (!token || !authEnabled()) return null;
  const [payload, signature] = token.split(".");
  if (
    !payload ||
    !signature ||
    !(await verify(`session:${payload}`, signature))
  )
    return null;
  try {
    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Session;
    if (typeof session.sub !== "string" || !(session.exp > Date.now()))
      return null;
    return session;
  } catch {
    return null;
  }
}

export async function getSession() {
  return decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function createSession(sub: string, name: string) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  (await cookies()).set(
    SESSION_COOKIE,
    await encodeSession({ sub, name: name.slice(0, 60), exp }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(exp),
    },
  );
}
export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Clé du compte pour le serveur d'index : empreinte, jamais l'identifiant Google. */
export async function accountKey(sub: string) {
  return sign(`account:${sub}`);
}

/** Chemin de retour sûr (même site uniquement). */
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/squad";
}

/**
 * Comptes autorisés aux modules réservés : clés de compte (voir la page
 * « Mon compte ») séparées par des virgules dans PREMIUM_ACCOUNT_KEYS.
 */
export async function isPremium(session?: Session | null) {
  const s = session === undefined ? await getSession() : session;
  if (!s) return false;
  const allowed = (process.env.PREMIUM_ACCOUNT_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  return allowed.length > 0 && allowed.includes(await accountKey(s.sub));
}
