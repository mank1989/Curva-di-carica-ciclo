package com.banned.nc3000;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(KeepAlivePlugin.class);
        super.onCreate(savedInstanceState);
        // Android 13+: senza questo permesso la notifica del servizio non si vede (il servizio funziona lo stesso)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 77);
        }
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
