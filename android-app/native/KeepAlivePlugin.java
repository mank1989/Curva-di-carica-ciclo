package com.banned.nc3000;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Ponte JS: avvia/ferma il servizio in primo piano e chiede di escludere l'app dal risparmio batteria. */
@CapacitorPlugin(name = "KeepAlive")
public class KeepAlivePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        try {
            Context c = getContext();
            ContextCompat.startForegroundService(c, new Intent(c, KeepAliveService.class));
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            Context c = getContext();
            c.stopService(new Intent(c, KeepAliveService.class));
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            Context c = getContext();
            if (Build.VERSION.SDK_INT >= 23) {
                PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(c.getPackageName())) {
                    Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + c.getPackageName()));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    c.startActivity(i);
                }
            }
            call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }
}
