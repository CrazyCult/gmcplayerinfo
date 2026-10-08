import { getAccountAppearance, setAccountAppearance } from "@/data/gmc-index";
import { accountKey, authEnabled, getSession } from "@/lib/session";
import { isAppearance } from "@/lib/appearance";

const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const session = authEnabled() ? await getSession() : null;
  if (!session)
    return Response.json(
      { authenticated: false, appearance: null },
      { headers },
    );
  try {
    const appearance = await getAccountAppearance(
      await accountKey(session.sub),
    );
    return Response.json({ authenticated: true, appearance }, { headers });
  } catch {
    return Response.json(
      { error: "Préférence momentanément indisponible." },
      { status: 503, headers },
    );
  }
}
export async function PUT(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "Origine non autorisée." },
      { status: 403, headers },
    );
  const session = authEnabled() ? await getSession() : null;
  if (!session)
    return Response.json(
      { error: "Connexion Google nécessaire." },
      { status: 401, headers },
    );
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalide." }, { status: 400, headers });
  }
  if (
    !body ||
    !Object.hasOwn(body, "appearance") ||
    (body.appearance !== null && !isAppearance(body.appearance))
  )
    return Response.json(
      { error: "Apparence invalide." },
      { status: 400, headers },
    );
  try {
    const appearance = await setAccountAppearance(
      await accountKey(session.sub),
      body.appearance,
    );
    return Response.json({ authenticated: true, appearance }, { headers });
  } catch {
    return Response.json(
      {
        error:
          "Sauvegarde impossible pour l’instant. Le choix local est conservé.",
      },
      { status: 503, headers },
    );
  }
}
