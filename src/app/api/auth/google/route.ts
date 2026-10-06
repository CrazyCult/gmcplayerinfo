import { cookies } from "next/headers";
import { OAUTH_COOKIE, authEnabled, safeNext, siteUrl } from "@/lib/session";

// Début de la connexion Google : on mémorise un « state » aléatoire (contre
// les requêtes forgées) et la page de retour, puis on part chez Google.

export async function GET(request: Request) {
  if (!authEnabled())
    return new Response("Connexion Google non configurée.", { status: 503 });
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const state = Buffer.from(
    crypto.getRandomValues(new Uint8Array(24)),
  ).toString("base64url");
  (await cookies()).set(OAUTH_COOKIE, JSON.stringify({ state, next }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${siteUrl(request)}/api/auth/callback`,
    response_type: "code",
    scope: "openid profile",
    state,
    prompt: "select_account",
  });
  return Response.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    302,
  );
}
