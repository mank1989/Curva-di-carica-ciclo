package com.banned.nc3000;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** true quando l'app è sullo schermo: gli avvisi normali li mostra la pagina, senza notifica */
    static volatile boolean inForeground = false;

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

    @Override public void onResume() { super.onResume(); inForeground = true; }
    @Override public void onPause() { super.onPause(); inForeground = false; keepWebViewRunning(); }
    @Override public void onStop() { super.onStop(); keepWebViewRunning(); }

    // app chiusa: niente servizio rimasto acceso da solo
    @Override
    public void onDestroy() {
        if (isFinishing()) {
            try { stopService(new Intent(this, KeepAliveService.class)); } catch (Exception ignored) { }
        }
        super.onDestroy();
    }
}
