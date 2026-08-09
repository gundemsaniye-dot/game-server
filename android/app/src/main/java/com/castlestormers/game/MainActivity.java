package com.castlestormers.game;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.Process;
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
        // Defaulting this to false let the short launch boost expire during the
        // menu/map flow, after which WebView frame times steadily degraded.
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
        performanceAttributes.preferredRefreshRate = 60.0f;
        getWindow().setAttributes(performanceAttributes);

        bridge.getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            bridge.getWebView().setRendererPriorityPolicy(
                WebView.RENDERER_PRIORITY_IMPORTANT,
                false
            );
        }
        bridge.getWebView().setHorizontalScrollBarEnabled(false);
        bridge.getWebView().setVerticalScrollBarEnabled(false);
        if (BuildConfig.PERF_LOG_BRIDGE) {
            bridge.getWebView().addJavascriptInterface(new PerfLogBridge(), "CastlePerfNative");
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
