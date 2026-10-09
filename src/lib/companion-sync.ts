const CHANNEL = "gmc-squad-sync-v1";

/** Only accepts the response to this click, from our own page's bridge. */
export function requestCompanionSquad(teamId?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let acknowledged = false;
    const missing = setTimeout(() => {
      if (!acknowledged)
        finish(
          new Error(
            "GMC Companion 2.38.7 requis dans ce navigateur. Recharge l’extension puis cette page et l’onglet GameChase.",
          ),
        );
    }, 2000);
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            "L’actualisation a expiré. Vérifie l’onglet GameChase puis réessaie.",
          ),
        ),
      100000,
    );
    function finish(error?: Error, payload?: unknown) {
      clearTimeout(missing);
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      if (error) reject(error);
      else resolve(payload);
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
        finish(
          data.ok
            ? undefined
            : new Error(
                typeof data.error === "string"
                  ? data.error
                  : "Lecture de l’effectif impossible.",
              ),
          data.payload,
        );
      }
    }
    window.addEventListener("message", receive);
    window.postMessage(
      { channel: CHANNEL, type: "request", requestId, teamId },
      window.location.origin,
    );
  });
}
