"use client";

import Link from "next/link";
import ClubSettingsForm from "./ClubSettingsForm";
import { coachSummary, useClubSettings } from "@/lib/trainingSettings";

/** Réglages du club (coachs et centre), rangés dans « Mon compte ». */
export default function ClubSettingsCard() {
  const club = useClubSettings();
  return (
    <section className="card mini-card" id="reglages">
      <h2 className="mini-title">Réglages de mon club</h2>
      <p className="muted" style={{ fontSize: 13 }}>
        Niveaux de tes coachs et de ton centre d’entraînement (menu Entraînement
        du jeu). Ils servent au coût des plans de « Mon effectif », au
        simulateur et aux leviers d’OVR. Avec GMC Companion, ils sont lus dans
        le jeu et mis à jour tout seuls quand tu ouvres{" "}
        <Link href="/squad" prefetch={false}>
          Mon effectif
        </Link>
        .
      </p>
      <ClubSettingsForm />
      <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
        {club.saved
          ? `Enregistré dans ce navigateur : ${coachSummary(club)}.`
          : "Rien d’enregistré : les plans supposent tout au niveau 5."}
      </p>
    </section>
  );
}
