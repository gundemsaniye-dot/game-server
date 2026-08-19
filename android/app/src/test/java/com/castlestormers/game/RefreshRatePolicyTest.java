package com.castlestormers.game;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class RefreshRatePolicyTest {
    @Test
    public void prefers120ForMixedHighRefreshDisplay() {
        assertEquals(
            120.00001f,
            RefreshRatePolicy.chooseCompositorRate(new float[] { 60.0f, 90.0f, 120.00001f, 144.0f }),
            0.01f
        );
    }

    @Test
    public void uses60On90HzDisplayWhenSupported() {
        assertEquals(
            60.0f,
            RefreshRatePolicy.chooseCompositorRate(new float[] { 60.0f, 90.0f }),
            0.01f
        );
    }

    @Test
    public void leavesAndroidInControlWhenNoEven60FpsCadenceExists() {
        assertEquals(
            0.0f,
            RefreshRatePolicy.chooseCompositorRate(new float[] { 90.0f, 144.0f }),
            0.01f
        );
    }

    @Test
    public void ignoresUnsupportedAndInvalidRates() {
        assertEquals(
            60.0f,
            RefreshRatePolicy.chooseCompositorRate(new float[] { Float.NaN, 0.0f, 50.0f, 60.0f, 240.0f }),
            0.01f
        );
    }
}
