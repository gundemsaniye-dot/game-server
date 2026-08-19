package com.castlestormers.game;

final class RefreshRatePolicy {
    private static final float CONTENT_RATE_HZ = 60.0f;
    private static final float MAX_COMPOSITOR_RATE_HZ = 120.5f;
    private static final float RATE_TOLERANCE_HZ = 1.0f;

    private RefreshRatePolicy() {}

    /**
     * Selects the fastest supported compositor rate, up to 120 Hz, whose
     * cadence is an integer multiple of the game's 60 FPS content rate.
     * Returning zero means that Android should keep its current display mode.
     */
    static float chooseCompositorRate(float[] supportedRates) {
        if (supportedRates == null) return 0.0f;

        float bestRate = 0.0f;
        for (float rate : supportedRates) {
            if (!Float.isFinite(rate) || rate <= 0.0f || rate > MAX_COMPOSITOR_RATE_HZ) {
                continue;
            }
            int multiplier = Math.round(rate / CONTENT_RATE_HZ);
            if (
                multiplier >= 1 &&
                Math.abs(rate - multiplier * CONTENT_RATE_HZ) < RATE_TOLERANCE_HZ &&
                rate > bestRate
            ) {
                bestRate = rate;
            }
        }
        return bestRate;
    }
}
