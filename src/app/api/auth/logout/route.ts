import { deleteSession, siteUrl } from "@/lib/session";

export async function POST(request: Request) {
  await deleteSession();
  return Response.redirect(`${siteUrl(request)}/squad`, 303);
}
