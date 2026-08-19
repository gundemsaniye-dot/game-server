package com.castlestormers.game;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.Process;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final String EXTRA_RETURN_TARGET = "castleReturnTarget";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (BuildConfig.PERF_LOG_BRIDGE) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        PowerManager powerManager = getSystemService(PowerManager.class);
        // The reference device exposes Android's sustained-performance API.
        // Defaulting this to false lets the short launch boost expire during the
        // menu/map flow, after which WebView frame times steadily degrade.
        // Keep an Intent override for diagnostics, but ship the stable mode on.
        boolean sustainedPerformance = getIntent().getBooleanExtra("sustainedPerformance", true);
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.N &&
            powerManager != null &&
            powerManager.isSustainedPerformanceModeSupported()
        ) {
            getWindow().setSustainedPerformanceMode(sustainedPerformance);
        }

        // Android 15 exposes per-View frame-rate voting, which is the public
        // API WebView can use. Keep the window refresh hint for API 30–34 and
        // as a secondary vote on newer devices.
        if (Build.VERSION.SDK_INT >= 35) {
            bridge.getWebView().setRequestedFrameRate(60.0f);
        }
        WindowManager.LayoutParams performanceAttributes = getWindow().getAttributes();
        // Keep WebView content at 60 FPS, but let high-refresh devices compose
        // it on a 120 Hz display timeline. A frame that narrowly misses 16.7 ms
        // can then present at the next 8.3 ms slot instead of collapsing to the
        // next 33.3 ms slot on devices with strict 60 Hz frame pacing.
        float compositorRefreshRate = 0.0f;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && getDisplay() != null) {
            android.view.Display.Mode[] supportedModes = getDisplay().getSupportedModes();
            float[] supportedRates = new float[supportedModes.length];
            for (int index = 0; index < supportedModes.length; index++) {
                supportedRates[index] = supportedModes[index].getRefreshRate();
            }
            compositorRefreshRate = RefreshRatePolicy.chooseCompositorRate(supportedRates);
        }
        if (compositorRefreshRate > 0.0f) {
            performanceAttributes.preferredRefreshRate = compositorRefreshRate;
            getWindow().setAttributes(performanceAttributes);
        }

        bridge.getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            bridge.getWebView().setRendererPriorityPolicy(
                WebView.RENDERER_PRIORITY_IMPORTANT,
                false
            );
        }
        bridge.getWebView().setHorizontalScrollBarEnabled(false);
        bridge.getWebView().setVerticalScrollBarEnabled(false);
        bridge.getWebView().addJavascriptInterface(new HapticsBridge(), "CastleHapticsNative");
        if (BuildConfig.PERF_LOG_BRIDGE) {
            bridge.getWebView().addJavascriptInterface(new PerfLogBridge(), "CastlePerfNative");
        }

        if (BuildConfig.DEBUG) {
            String qaMode = getIntent().getStringExtra("qaMode");
            String qaUrl = getIntent().getStringExtra("qaUrl");
            if ("castleCombat".equals(qaMode)) {
                bridge.getWebView().loadUrl(
                    "https://localhost/?scene=battle&level=1&castleCombatQa=1"
                );
            } else if ("loadout".equals(qaMode)) {
                bridge.getWebView().loadUrl(
                    "https://localhost/?scene=loadout&unlockAll=1"
                );
            } else if (qaUrl != null && qaUrl.startsWith("https://localhost/")) {
                bridge.getWebView().loadUrl(qaUrl);
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }

        enterImmersiveMode();
    }

    public static final class PerfLogBridge {
        @JavascriptInterface
        public void log(String line) {
            if (line != null && line.startsWith("[CastlePerf]") && line.length() <= 32_000) {
                Log.i("CastlePerf", line);
            }
        }
    }

    public final class HapticsBridge {
        private long lastSelectionAt;
        private long lastCastleHitAt;

        @JavascriptInterface
        public void impact(String kind) {
            if (
                !"selection".equals(kind) &&
                !"castle_hit".equals(kind)
            ) {
                return;
            }

            long now = SystemClock.uptimeMillis();
            // Castle snapshots can contain several simultaneous attackers.
            // Keep one tactile pulse per combat beat so vibration never turns
            // into continuous work that competes with WebView rendering.
            long minimumGap = "selection".equals(kind) ? 45L : 600L;
            long lastImpactAt = "selection".equals(kind)
                ? lastSelectionAt
                : lastCastleHitAt;
            if (now - lastImpactAt < minimumGap) {
                return;
            }
            if ("selection".equals(kind)) {
                lastSelectionAt = now;
            } else {
                lastCastleHitAt = now;
            }

            runOnUiThread(() -> vibrate(kind));
        }

        private void vibrate(String kind) {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager manager = getSystemService(VibratorManager.class);
                vibrator = manager == null ? null : manager.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator()) return;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                boolean amplitudeControl = vibrator.hasAmplitudeControl();
                if ("selection".equals(kind)) {
                    vibrator.vibrate(VibrationEffect.createOneShot(
                        30L,
                        amplitudeControl ? 95 : VibrationEffect.DEFAULT_AMPLITUDE
                    ));
                } else {
                    long[] timings = new long[] { 0L, 32L, 30L, 45L };
                    int[] amplitudes = amplitudeControl
                        ? new int[] { 0, 190, 0, 255 }
                        : new int[] {
                            0,
                            VibrationEffect.DEFAULT_AMPLITUDE,
                            0,
                            VibrationEffect.DEFAULT_AMPLITUDE
                        };
                    vibrator.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1));
                }
            } else {
                vibrator.vibrate("selection".equals(kind) ? 30L : 70L);
            }

            String intensity = "selection".equals(kind)
                ? "duration=30 amplitude=95"
                : "pattern=32/30/45 amplitudes=190/255";
            Log.i("CastleHaptics", "impact=" + kind + " " + intensity);
        }
    }


    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterImmersiveMode();
        }
    }

    private void enterImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
            return;
        }

        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }
}
