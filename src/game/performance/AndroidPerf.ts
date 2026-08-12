export type AndroidPerfProfile = "diagnostic" | "telemetry";

export interface AndroidPerfRequest {
  enabled: boolean;
  level: number;
  seed: number;
  profile: AndroidPerfProfile;
  skipBriefing: boolean;
  realSystems: boolean;
  syntheticPopulation: boolean;
  powerFxQa?: "missile" | "ice" | "both";
}

export function getAndroidPerfRequest(): AndroidPerfRequest {
  const params = new URLSearchParams(window.location.search);
  const buildEnabled = import.meta.env.VITE_ANDROID_PERF === "1";
  const pathEnabled = window.location.pathname.includes("/android-perf");
  const enabled = buildEnabled && (pathEnabled || params.has("androidPerf"));
  const level = Math.max(1, Math.min(20, Number.parseInt(params.get("level") ?? "20", 10) || 20));
  const seed = Number.parseInt(params.get("seed") ?? "20020", 10) || 20020;
  const requestedProfile = params.get("profile") ?? import.meta.env.VITE_ANDROID_PERF_PROFILE;
  const requestedPowerFxQa = params.get("powerFxQa");

  return {
    enabled,
    level,
    seed,
    profile: requestedProfile === "diagnostic" ? "diagnostic" : "telemetry",
    skipBriefing: params.get("skipBriefing") === "1",
    realSystems: params.get("realSystems") === "1",
    syntheticPopulation: params.get("syntheticPopulation") === "1",
    powerFxQa: requestedPowerFxQa === "missile" || requestedPowerFxQa === "ice" || requestedPowerFxQa === "both"
      ? requestedPowerFxQa
      : undefined,
  };
}

export const isAndroidPerfBuild = () => import.meta.env.VITE_ANDROID_PERF === "1";
