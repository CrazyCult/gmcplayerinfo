import { deleteSession, safeNext, siteUrl } from "@/lib/session";

export async function POST(request: Request) {
  await deleteSession();
  const form = await request.formData().catch(() => null);
  const next = safeNext(String(form?.get("next") ?? "") || "/");
  return Response.redirect(`${siteUrl(request)}${next}`, 303);
}
