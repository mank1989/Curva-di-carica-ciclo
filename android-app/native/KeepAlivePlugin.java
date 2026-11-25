package com.banned.nc3000;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Ponte JS: servizio in primo piano, notifiche (stato e avvisi), esclusione dal risparmio batteria. */
@CapacitorPlugin(
    name = "KeepAlive",
    permissions = { @Permission(strings = { "android.permission.POST_NOTIFICATIONS" }, alias = "notifications") }
)
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

    /** Testo della notifica fissa: { title, text } */
    @PluginMethod
    public void status(PluginCall call) {
        KeepAliveService.update(getContext(), call.getString("title", "NC3000 collegato"), call.getString("text", ""));
        call.resolve();
    }

    /** Avviso con suono: { title, text, id, always }. Con l'app in primo piano solo se always (la pagina avvisa già da sé). */
    @PluginMethod
    public void alert(PluginCall call) {
        boolean always = Boolean.TRUE.equals(call.getBoolean("always", false));
        if (!always && MainActivity.inForeground) { call.resolve(); return; }
        Integer id = call.getInt("id", 200);
        KeepAliveService.alert(getContext(), id == null ? 200 : id, call.getString("title", "NC3000"), call.getString("text", ""));
        call.resolve();
    }

    /** Android 13+: chiede il permesso per le notifiche (risponde comunque, anche se rifiutato). */
    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) { call.resolve(); return; }
        requestPermissionForAlias("notifications", call, "notificationsResult");
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) { call.resolve(); }

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
