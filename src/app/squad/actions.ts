"use server";

import { redirect } from "next/navigation";
import { setAccountClub } from "@/data/gmc-index";
import { accountKey, getSession } from "@/lib/session";

/** Rattache le club affiché au compte Google connecté. */
export async function linkClub(formData: FormData) {
  const session = await getSession();
  const teamId = String(formData.get("teamId") ?? "").slice(0, 64);
  if (!session)
    redirect(
      `/api/auth/google?next=${encodeURIComponent(`/squad?club=${teamId}`)}`,
    );
  if (!teamId) redirect("/squad");
  await setAccountClub(await accountKey(session.sub), teamId);
  redirect("/squad");
}

/** Détache le club du compte (pour en choisir un autre). */
export async function unlinkClub() {
  const session = await getSession();
  if (session) await setAccountClub(await accountKey(session.sub), null);
  redirect("/squad?changer=1");
}
