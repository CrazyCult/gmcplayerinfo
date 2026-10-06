import { authEnabled, getSession } from "@/lib/session";

// État de connexion pour l'en-tête (lu côté navigateur : les pages restent en cache).
export async function GET() {
  const session = authEnabled() ? await getSession() : null;
  return Response.json(
    { enabled: authEnabled(), name: session ? session.name : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
