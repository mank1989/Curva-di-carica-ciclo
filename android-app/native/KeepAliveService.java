package com.banned.nc3000;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/** Servizio in primo piano: tiene viva l'app (e il Bluetooth) quando lo schermo è spento o l'app è in secondo piano.
 *  La sua notifica fissa mostra lo stato delle uscite; gli avvisi (fine ciclo, errori) usano un canale a parte con suono. */
public class KeepAliveService extends Service {
    private static final String CHANNEL = "nc3000_keepalive";
    private static final String ALERTS = "nc3000_alerts";
    private static final int ONGOING_ID = 1;
    static volatile boolean running = false;
    private PowerManager.WakeLock wakeLock;

    @Override public IBinder onBind(Intent intent) { return null; }

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Collegamento caricabatterie", NotificationManager.IMPORTANCE_LOW));
        NotificationChannel a = new NotificationChannel(ALERTS, "Avvisi: fine ciclo ed errori", NotificationManager.IMPORTANCE_HIGH);
        a.enableVibration(true);
        a.setVibrationPattern(new long[]{0, 300, 150, 300});
        nm.createNotificationChannel(a);
    }

    private static PendingIntent openApp(Context c) {
        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static Notification ongoing(Context c, String title, String text) {
        String first = text.contains("\n") ? text.substring(0, text.indexOf('\n')) : text;
        return new NotificationCompat.Builder(c, CHANNEL)
                .setContentTitle(title)
                .setContentText(first)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setContentIntent(openApp(c))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    /** Aggiorna il testo della notifica fissa (solo se il servizio è acceso). */
    static void update(Context c, String title, String text) {
        if (!running) return;
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(ONGOING_ID, ongoing(c, title, text));
        } catch (Exception ignored) { }
    }

    /** Avviso con suono e vibrazione (fine ciclo, errori, connessione persa). */
    static void alert(Context c, int id, String title, String text) {
        ensureChannels(c);
        try {
            Notification n = new NotificationCompat.Builder(c, ALERTS)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentIntent(openApp(c))
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setDefaults(NotificationCompat.DEFAULT_ALL)
                    .build();
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(id, n);
        } catch (Exception ignored) { }   // notifiche non permesse: niente avviso, l'app continua
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        ensureChannels(this);
        Notification n = ongoing(this, "NC3000 collegato", "Le letture continuano in background");
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(ONGOING_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            else startForeground(ONGOING_ID, n);
        } catch (Exception e) {            // permesso Bluetooth non ancora concesso, ecc.: meglio fermarsi che chiudere l'app
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "nc3000:keepalive");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(12 * 60 * 60 * 1000L);   // al massimo 12 ore
            }
        }
        return START_NOT_STICKY;
    }

    // app chiusa dall'elenco delle recenti: si spegne anche il servizio
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        running = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }
}
