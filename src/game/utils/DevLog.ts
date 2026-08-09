export function castleLog(scope: string, message: string) {
  const line = `[CastleFront][${scope}] ${message}`;
  if (import.meta.env.DEV || import.meta.env.VITE_ANDROID_DIAGNOSTICS === "1" || scope.includes("ERROR") || scope === "UNHANDLED_REJECTION") {
    console.log(line);
  }

  if (!import.meta.env.DEV || import.meta.env.VITE_ANDROID_PERF === "1" || typeof fetch !== "function") {
    return;
  }

  void fetch("/__castle_log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ line }),
    keepalive: true,
  }).catch(() => undefined);
}

export function installGlobalErrorLogging() {
  const global = globalThis as typeof globalThis & { __castleLogInstalled?: boolean };

  if (global.__castleLogInstalled || typeof window === "undefined") {
    return;
  }

  global.__castleLogInstalled = true;

  window.addEventListener("error", (event) => {
    castleLog("WINDOW_ERROR", `${event.message} ${event.filename}:${event.lineno}:${event.colno}`);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason instanceof Error
      ? `${event.reason.name}: ${event.reason.message}`
      : String(event.reason);

    castleLog("UNHANDLED_REJECTION", reason);
  });
}
