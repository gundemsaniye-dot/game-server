export type AndroidHapticKind = "selection" | "castle_hit";

type CastleHapticsBridge = {
  impact(kind: AndroidHapticKind): void;
};

/**
 * Unified haptic entry point for both native Android and Web platforms.
 * Uses native Java bridge when running in Android WebView, and falls back to
 * the Web Vibration API when supported in browser environments.
 */
const MINIMUM_GAP_MS: Record<AndroidHapticKind, number> = {
  selection: 50,
  castle_hit: 500,
};
const PRIORITY: Record<AndroidHapticKind, number> = {
  selection: 1,
  castle_hit: 3,
};
const lastDispatchedAt: Record<AndroidHapticKind, number> = {
  selection: Number.NEGATIVE_INFINITY,
  castle_hit: Number.NEGATIVE_INFINITY,
};
let pendingKind: AndroidHapticKind | undefined;
let flushScheduled = false;

const nativeHapticsBridge = () => (globalThis as typeof globalThis & {
    CastleHapticsNative?: CastleHapticsBridge;
  }).CastleHapticsNative;

function triggerWebHaptic(kind: AndroidHapticKind) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      if (kind === "selection") {
        navigator.vibrate(18);
      } else if (kind === "castle_hit") {
        navigator.vibrate([35, 30, 45]);
      }
    }
  } catch {
    // Haptics are tactile polish and must never throw
  }
}

function flushAndroidHaptic() {
  flushScheduled = false;
  const kind = pendingKind;
  pendingKind = undefined;
  if (!kind) return;

  lastDispatchedAt[kind] = performance.now();

  const nativeBridge = nativeHapticsBridge();
  if (nativeBridge) {
    try {
      nativeBridge.impact(kind);
    } catch {
      // Fallback to web vibration if native bridge fails
      triggerWebHaptic(kind);
    }
  } else {
    triggerWebHaptic(kind);
  }
}

export function playAndroidHaptic(kind: AndroidHapticKind) {
  const now = performance.now();
  if (now - lastDispatchedAt[kind] < MINIMUM_GAP_MS[kind]) return;

  // Collapse every haptic request produced by the same server snapshot/frame
  // into one asynchronous native/web call. Incoming castle damage wins because it
  // is the most important tactile warning.
  if (!pendingKind || PRIORITY[kind] > PRIORITY[pendingKind]) pendingKind = kind;
  if (flushScheduled) return;
  flushScheduled = true;
  setTimeout(flushAndroidHaptic, 0);
}

export function isAndroidHapticsAvailable() {
  return Boolean(nativeHapticsBridge()) || (typeof navigator !== "undefined" && typeof navigator.vibrate === "function");
}

