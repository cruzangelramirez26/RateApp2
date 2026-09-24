package com.angelrg.rateapp;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * La notificacion fija para calificar lo que suena sin abrir la app.
 *
 * Como sabe que suena: la app de Spotify manda un broadcast cada vez que
 * cambia la cancion, con el track_id exacto — SI Angel tiene prendido
 * "Device Broadcast Status" en Spotify. Asi no hay que sondear el backend ni
 * gastar llamadas a la API de Spotify; solo se le pregunta al backend una vez
 * por cancion, por la portada y la calificacion que ya tenga.
 *
 * Por que un servicio en primer plano: desde Android 8 esos broadcasts solo
 * llegan a un receptor registrado en tiempo de ejecucion, o sea a algo que
 * este vivo. La notificacion ES la del servicio.
 *
 * Califica por HTTP directo al backend (igual que los atajos de Rust del
 * escritorio), no a traves de la pagina: la pagina remota no recibe ningun
 * permiso nativo. Usa el flujo COMPLETO de rate_track, como el widget del
 * sidebar — por eso NO sirve para la cola de /backfill.
 *
 * Vive desde que se abre RateApp hasta que Angel la quita deslizando.
 */
public class CalificarService extends Service {

    private static final String TAG = "RateAppCalificar";
    private static final String CANAL = "calificar";
    private static final int NOTIF_ID = 7;

    static final String ACCION_CALIFICAR = "com.angelrg.rateapp.CALIFICAR";
    static final String ACCION_CERRAR = "com.angelrg.rateapp.CERRAR";

    // Mismo orden que la app: 1 = A+ ... 7 = D (utils/ratings.js).
    private static final String[] RATINGS = {"A+", "A", "B+", "B", "C+", "C", "D"};
    private static final int[] BOTONES = {
        R.id.btn_ap, R.id.btn_a, R.id.btn_bp, R.id.btn_b, R.id.btn_cp, R.id.btn_c, R.id.btn_d};
    private static final int[] COLORES = {
        R.color.rating_ap, R.color.rating_a, R.color.rating_bp, R.color.rating_b,
        R.color.rating_cp, R.color.rating_c, R.color.rating_d};
    private static final int[] FONDO_VACIO = {
        R.drawable.rate_out_ap, R.drawable.rate_out_a, R.drawable.rate_out_bp, R.drawable.rate_out_b,
        R.drawable.rate_out_cp, R.drawable.rate_out_c, R.drawable.rate_out_d};
    private static final int[] FONDO_LLENO = {
        R.drawable.rate_fill_ap, R.drawable.rate_fill_a, R.drawable.rate_fill_bp, R.drawable.rate_fill_b,
        R.drawable.rate_fill_cp, R.drawable.rate_fill_c, R.drawable.rate_fill_d};

    // Estado de lo que se muestra. Solo se toca en el hilo principal.
    private String trackId;
    private String nombre = "";
    private String artista = "";
    private String album = "";
    private String rating;     // null = sin calificar (o todavia no se sabe)
    private Bitmap portada;
    private String estado = ""; // "Calificando...", errores; vacio = derivado del rating

    private final ExecutorService red = Executors.newSingleThreadExecutor();
    private final Handler principal = new Handler(Looper.getMainLooper());
    private String base;

    private final BroadcastReceiver spotify = new BroadcastReceiver() {
        @Override
        public void onReceive(Context ctx, Intent i) {
            if (!"com.spotify.music.metadatachanged".equals(i.getAction())) return;
            String id = i.getStringExtra("id");
            // Podcasts y anuncios traen otro tipo de uri: no se califican.
            if (id == null || !id.startsWith("spotify:track:")) return;
            String tid = id.substring("spotify:track:".length());
            if (tid.equals(trackId)) return;
            mostrar(tid, texto(i.getStringExtra("track")), texto(i.getStringExtra("artist")),
                texto(i.getStringExtra("album")));
            enriquecer(tid);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        base = leerServidor();
        crearCanal();

        ServiceCompat.startForeground(this, NOTIF_ID, construir(),
            Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0);

        IntentFilter f = new IntentFilter("com.spotify.music.metadatachanged");
        // EXPORTED a proposito: el que lo manda es otra app (Spotify).
        ContextCompat.registerReceiver(this, spotify, f, ContextCompat.RECEIVER_EXPORTED);

        // El broadcast solo llega al CAMBIAR de cancion. Si ya estaba sonando
        // algo al abrir la app, se pregunta una vez al backend.
        enriquecer(null);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String accion = intent != null ? intent.getAction() : null;
        if (ACCION_CERRAR.equals(accion)) {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACCION_CALIFICAR.equals(accion)) {
            calificar(intent.getStringExtra("rating"));
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        try { unregisterReceiver(spotify); } catch (IllegalArgumentException ignored) { }
        red.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ------------------------------------------------------------------ estado

    private void mostrar(String tid, String n, String a, String al) {
        trackId = tid;
        nombre = n;
        artista = a;
        album = al;
        rating = null;
        portada = null;
        estado = "";
        publicar();
    }

    /**
     * Portada y calificacion. Con el id del broadcast se pide
     * /tracks/info/{id}: NO /now-playing, porque la API de Spotify puede ir
     * detras del celular y devolver otra cancion (paso el 2026-09-24).
     * Con tid == null (arranque, aun no llega ningun broadcast) se adopta lo
     * que diga /now-playing.
     */
    private void enriquecer(final String tid) {
        red.execute(() -> {
            try {
                JSONObject t;
                if (tid != null) {
                    t = new JSONObject(get(base + "/tracks/info/" + tid));
                    t.put("id", tid);
                } else {
                    t = new JSONObject(get(base + "/tracks/now-playing")).optJSONObject("track");
                }
                String idBackend = t != null ? t.optString("id", null) : null;
                if (idBackend == null) return;
                String rat = t.isNull("rating") ? null : t.optString("rating", null);
                String img = t.isNull("image") ? null : t.optString("image", null);
                Bitmap bmp = img != null ? bajarPortada(img) : null;
                String n = t.optString("name", ""), a = t.optString("artist", ""), al = t.optString("album", "");
                principal.post(() -> {
                    if (tid == null) {
                        // Arranque: solo si mientras tanto no llego un broadcast.
                        if (trackId != null) return;
                        trackId = idBackend; nombre = n; artista = a; album = al;
                    } else if (!idBackend.equals(trackId)) {
                        return; // ya cambio otra vez
                    }
                    rating = rat;
                    if (bmp != null) portada = bmp;
                    publicar();
                });
            } catch (Exception e) {
                Log.w(TAG, "portada/calificacion fallo", e);
            }
        });
    }

    private void calificar(final String r) {
        if (r == null) return;
        if (trackId == null) {
            estado = "Nada sonando";
            publicar();
            return;
        }
        // Se captura todo al momento del clic: si la cancion cambia mientras
        // viaja la peticion, se califica la que Angel estaba viendo.
        final String tid = trackId, n = nombre, a = artista, al = album;
        estado = "Calificando " + r + "…";
        publicar();
        red.execute(() -> {
            String resultado;
            boolean ok = false;
            try {
                JSONObject body = new JSONObject()
                    .put("track_id", tid).put("rating", r)
                    // Con nombres: sin ellos, una cancion nueva nacia anonima
                    // (el bug del 2026-09-22 con el reproductor).
                    .put("name", n).put("artist", a).put("album", al);
                int code = post(base + "/tracks/rate", body.toString());
                ok = code >= 200 && code < 300;
                resultado = ok ? "Calificada " + r : "No se pudo calificar (" + code + ")";
            } catch (Exception e) {
                Log.w(TAG, "rate fallo", e);
                resultado = "Sin conexion, no se califico";
            }
            final boolean exito = ok;
            final String texto = resultado;
            principal.post(() -> {
                if (!tid.equals(trackId)) return;
                if (exito) rating = r;
                estado = texto;
                publicar();
            });
        });
    }

    // ---------------------------------------------------------- notificacion

    private void publicar() {
        try {
            NotificationManagerCompat.from(this).notify(NOTIF_ID, construir());
        } catch (SecurityException sinPermiso) {
            // Sin permiso de notificaciones no hay nada que pintar.
        }
    }

    private android.app.Notification construir() {
        RemoteViews chica = new RemoteViews(getPackageName(), R.layout.notif_small);
        RemoteViews grande = new RemoteViews(getPackageName(), R.layout.notif_big);

        boolean hay = trackId != null;
        chica.setTextViewText(R.id.title, hay ? nombre + " · " + artista : "Nada sonando en Spotify");
        grande.setTextViewText(R.id.title, hay ? nombre : "Nada sonando en Spotify");
        grande.setTextViewText(R.id.artist, hay ? artista : "Pon algo y aparece aqui");
        grande.setTextViewText(R.id.status, !estado.isEmpty() ? estado
            : !hay ? "" : rating != null ? "Calificada " + rating : "Sin calificar");
        if (portada != null) grande.setImageViewBitmap(R.id.cover, portada);
        else grande.setImageViewResource(R.id.cover, R.mipmap.ic_launcher);

        for (int k = 0; k < RATINGS.length; k++) {
            boolean activa = RATINGS[k].equals(rating);
            int color = ContextCompat.getColor(this, activa ? R.color.rating_on_fill : COLORES[k]);
            int fondo = activa ? FONDO_LLENO[k] : FONDO_VACIO[k];
            PendingIntent pi = PendingIntent.getService(this, 100 + k,
                new Intent(this, CalificarService.class).setAction(ACCION_CALIFICAR).putExtra("rating", RATINGS[k]),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            for (RemoteViews v : new RemoteViews[]{chica, grande}) {
                v.setOnClickPendingIntent(BOTONES[k], pi);
                v.setTextColor(BOTONES[k], color);
                v.setInt(BOTONES[k], "setBackgroundResource", fondo);
            }
        }

        PendingIntent abrir = PendingIntent.getActivity(this, 1,
            new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent cerrar = PendingIntent.getService(this, 2,
            new Intent(this, CalificarService.class).setAction(ACCION_CERRAR),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        return new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_stat_rateapp)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(chica)
            .setCustomBigContentView(grande)
            .setContentIntent(abrir)
            // Desde Android 14 la notificacion de un servicio SI se puede
            // deslizar; al hacerlo se apaga el servicio (opcion "a").
            .setDeleteIntent(cerrar)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void crearCanal() {
        NotificationChannel c = new NotificationChannel(CANAL, "Calificar lo que suena",
            NotificationManager.IMPORTANCE_LOW);
        c.setDescription("Notificacion fija con los botones A+ a D");
        c.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        c.setShowBadge(false);
        getSystemService(NotificationManager.class).createNotificationChannel(c);
    }

    // -------------------------------------------------------------------- red

    /** La URL del backend sale del capacitor.config.json empaquetado: una sola fuente. */
    private String leerServidor() {
        try (InputStream in = getAssets().open("capacitor.config.json")) {
            String url = new JSONObject(leer(in)).getJSONObject("server").getString("url");
            return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
        } catch (Exception e) {
            throw new IllegalStateException("No pude leer server.url de capacitor.config.json", e);
        }
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = abrir(url);
        try {
            if (c.getResponseCode() / 100 != 2) throw new IllegalStateException("HTTP " + c.getResponseCode());
            return leer(c.getInputStream());
        } finally { c.disconnect(); }
    }

    private static int post(String url, String json) throws Exception {
        HttpURLConnection c = abrir(url);
        try {
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = c.getOutputStream()) { o.write(json.getBytes(StandardCharsets.UTF_8)); }
            return c.getResponseCode();
        } finally { c.disconnect(); }
    }

    private static Bitmap bajarPortada(String url) {
        try {
            HttpURLConnection c = abrir(url);
            try (InputStream in = c.getInputStream()) {
                Bitmap b = BitmapFactory.decodeStream(in);
                // La de Spotify es de 640 px; la notificacion la pinta a 64dp.
                return b != null ? Bitmap.createScaledBitmap(b, 256, 256, true) : null;
            } finally { c.disconnect(); }
        } catch (Exception e) {
            return null;
        }
    }

    private static HttpURLConnection abrir(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(15000);
        return c;
    }

    private static String leer(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
        return b.toString("UTF-8");
    }

    private static String texto(String s) { return s != null ? s : ""; }
}
