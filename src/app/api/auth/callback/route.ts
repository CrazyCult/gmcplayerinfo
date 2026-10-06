import { cookies } from "next/headers";
import {
  OAUTH_COOKIE,
  authEnabled,
  createSession,
  safeNext,
  siteUrl,
} from "@/lib/session";

// Retour de Google : on vérifie le « state », on échange le code contre un
// jeton d'identité directement auprès de Google (connexion TLS du serveur,
// donc pas besoin de vérifier la signature du jeton) et on ouvre la session.
function fail(request: Request, reason: string) {
  return Response.redirect(
    `${siteUrl(request)}/squad?connexion=${encodeURIComponent(reason)}`,
    302,
  );
}

export async function GET(request: Request) {
  if (!authEnabled()) return fail(request, "indisponible");
  const url = new URL(request.url);
  const jar = await cookies();
  const saved = jar.get(OAUTH_COOKIE)?.value;
  jar.delete({ name: OAUTH_COOKIE, path: "/api/auth" });
  let expected: { state?: string; next?: string } = {};
  try {
    expected = saved ? JSON.parse(saved) : {};
  } catch {}
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return fail(request, "annulee");
  if (
    !code ||
    !expected.state ||
    url.searchParams.get("state") !== expected.state
  )
    return fail(request, "expiree");

  let idToken: string | undefined;
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${siteUrl(request)}/api/auth/callback`,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.error("Google : échange refusé", response.status);
      return fail(request, "refusee");
    }
    idToken = ((await response.json()) as { id_token?: string }).id_token;
  } catch (error) {
    console.error("Google injoignable", error);
    return fail(request, "indisponible");
  }
  let claims: {
    sub?: string;
    aud?: string;
    iss?: string;
    exp?: number;
    given_name?: string;
    name?: string;
  } = {};
  try {
    claims = JSON.parse(
      Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString(
        "utf8",
      ),
    );
  } catch {}
  if (
    !claims.sub ||
    claims.aud !== process.env.GOOGLE_CLIENT_ID ||
    !["https://accounts.google.com", "accounts.google.com"].includes(
      claims.iss ?? "",
    ) ||
    !((claims.exp ?? 0) * 1000 > Date.now())
  )
    return fail(request, "refusee");
  await createSession(claims.sub, claims.given_name || claims.name || "");
  return Response.redirect(
    `${siteUrl(request)}${safeNext(expected.next)}`,
    302,
  );
}
