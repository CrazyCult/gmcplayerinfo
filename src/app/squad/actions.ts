"use server";

import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";
import { getClub, playerTag, setAccountClub } from "@/data/gmc-index";
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

/** Verify the extension upload before invalidating the individual player cards. */
export async function refreshSyncedClub(teamId: string, fetchedAt: number) {
  if (
    !/^[a-zA-Z0-9_-]{1,64}$/.test(teamId) ||
    !Number.isSafeInteger(fetchedAt) ||
    fetchedAt < Date.now() - 30 * 60_000 ||
    fetchedAt > Date.now() + 5 * 60_000
  )
    throw new Error("Actualisation de l’effectif non reconnue.");
  const club = await getClub(teamId);
  if (
    !club.fetchedAt ||
    club.fetchedAt < fetchedAt ||
    club.players.some((p) => p.light)
  )
    throw new Error(
      "Le site n’a pas encore reçu les fiches complètes de cet effectif.",
    );
  for (const { player } of club.players)
    revalidateTag(playerTag(player.id), { expire: 0 });
}
