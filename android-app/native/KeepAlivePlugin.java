package com.banned.nc3000;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.util.Base64;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

/** Ponte JS: servizio in primo piano, notifiche, risparmio batteria, file in Download, lettore QR, voce. */
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

    /** Salva un file in Download/NC3000: { name, data, mime, base64 } → { path } */
    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name", "nc3000.txt").replaceAll("[\\\\/:*?\"<>|]", "_");
        String data = call.getString("data", "");
        String mime = call.getString("mime", "application/octet-stream");
        boolean b64 = Boolean.TRUE.equals(call.getBoolean("base64", false));
        try {
            byte[] bytes = b64 ? Base64.decode(data, Base64.DEFAULT) : data.getBytes(StandardCharsets.UTF_8);
            String path;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver r = getContext().getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.Downloads.DISPLAY_NAME, name);
                v.put(MediaStore.Downloads.MIME_TYPE, mime);
                v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/NC3000");
                Uri uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("impossibile creare il file");
                try (OutputStream os = r.openOutputStream(uri)) {
                    if (os == null) throw new Exception("impossibile scrivere il file");
                    os.write(bytes);
                }
                path = "Download/NC3000/" + name;
            } else {
                File dir = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "NC3000");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("cartella non creata");
                File f = new File(dir, name);
                try (FileOutputStream os = new FileOutputStream(f)) { os.write(bytes); }
                path = f.getAbsolutePath();
            }
            JSObject ret = new JSObject();
            ret.put("path", path);
            call.resolve(ret);
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    /** Lettore QR di Google Play Services (niente permesso fotocamera): → { value } */
    @PluginMethod
    public void scanQr(PluginCall call) {
        try {
            GmsBarcodeScannerOptions opts = new GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build();
            GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(getActivity(), opts);
            scanner.startScan()
                .addOnSuccessListener(b -> { JSObject r = new JSObject(); r.put("value", b.getRawValue()); call.resolve(r); })
                .addOnCanceledListener(() -> call.reject("cancel"))
                .addOnFailureListener(e -> call.reject(String.valueOf(e.getMessage())));
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }

    // ---------- voce ----------
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private String ttsPending = null;

    /** Legge ad alta voce un testo in italiano: { text } */
    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        call.resolve();
        if (text == null || text.isEmpty()) return;
        if (tts == null) {
            ttsPending = text;
            tts = new TextToSpeech(getContext(), status -> {
                ttsReady = status == TextToSpeech.SUCCESS;
                if (!ttsReady) return;
                tts.setLanguage(Locale.ITALIAN);
                if (ttsPending != null) { tts.speak(ttsPending, TextToSpeech.QUEUE_ADD, null, "nc3000"); ttsPending = null; }
            });
            return;
        }
        if (ttsReady) tts.speak(text, TextToSpeech.QUEUE_ADD, null, "nc3000" + System.currentTimeMillis());
        else ttsPending = text;
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) { tts.shutdown(); tts = null; ttsReady = false; }
        super.handleOnDestroy();
    }
}
