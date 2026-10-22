import { CompanionUnavailableError } from "./companion-sync";

const CHANNEL = "gmc-card-preview-v1";

/**
 * Asks GMC Companion (in this browser) for the game's own position-card
 * preview: projected OVR per position. The site never contacts the game; the
 * extension does it from the player's logged-in GameChase tab, read-only.
 */
export function requestCardPreview(
  playerId: string,
  positions: readonly string[],
): Promise<Record<string, number>> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let acknowledged = false;
    const missing = setTimeout(() => {
      if (!acknowledged)
        finish(
          new CompanionUnavailableError(
            "GMC Companion 2.53 ou plus récent requis dans ce navigateur, avec un onglet GameChase ouvert.",
          ),
        );
    }, 2000);
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "L’aperçu a expiré. Vérifie l’onglet GameChase puis réessaie.",
          ),
        ),
      60000,
    );
    function finish(error?: Error, previews?: Record<string, number>) {
      clearTimeout(missing);
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      if (error) reject(error);
      else resolve(previews ?? {});
    }
    function receive(event: MessageEvent) {
      const data = event.data;
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        data?.channel !== CHANNEL ||
        data.requestId !== requestId
      )
        return;
      if (data.type === "ack") acknowledged = true;
      if (data.type === "result") {
        if (!data.ok)
          return finish(
            new Error(
              typeof data.error === "string"
                ? data.error
                : "Aperçu du jeu indisponible.",
            ),
          );
        const previews: Record<string, number> = {};
        if (data.previews && typeof data.previews === "object")
          for (const [pos, value] of Object.entries(data.previews))
            if (
              positions.includes(pos) &&
              Number.isInteger(value) &&
              (value as number) > 0 &&
              (value as number) < 200
            )
              previews[pos] = value as number;
        finish(undefined, previews);
      }
    }
    window.addEventListener("message", receive);
    window.postMessage(
      { channel: CHANNEL, type: "request", requestId, playerId, positions },
      window.location.origin,
    );
  });
}
