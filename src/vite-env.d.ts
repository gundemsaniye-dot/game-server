/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANDROID_PERF?: string;
  readonly VITE_ANDROID_PERF_PROFILE?: string;
  readonly VITE_ANDROID_DIAGNOSTICS?: string;
  readonly VITE_ANDROID_QA?: string;
  readonly VITE_ONLINE_QA?: string;
  readonly VITE_ONLINE_PERF_TELEMETRY?: string;
}
