package com.banned.nc3000;

import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
    }

    // In secondo piano la pagina deve continuare a girare (letture ogni 250 ms): si tiene la finestra «visibile» per la WebView
    private void keepWebViewRunning() {
        try {
            View v = getBridge().getWebView();
            v.dispatchWindowVisibilityChanged(View.VISIBLE);
        } catch (Exception ignored) { }
    }

    @Override public void onPause() { super.onPause(); keepWebViewRunning(); }
    @Override public void onStop() { super.onStop(); keepWebViewRunning(); }
}
