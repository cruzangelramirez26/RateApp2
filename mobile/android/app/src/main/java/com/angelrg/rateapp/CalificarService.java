package com.angelrg.rateapp;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
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

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Calificar lo que suena sin abrir la app (rediseño movil, fase 5).
 *
 * Como sabe que suena: la app de Spotify manda un broadcast cada vez que
 * cambia la cancion, con el track_id exacto — SI Angel tiene prendido
 * "Device Broadcast Status" en Spotify. Esos broadcasts solo llegan a un
 * receptor registrado en tiempo de ejecucion (Android 8+), o sea a algo vivo:
 * por eso un servicio en primer plano.
 *
 UNA SOLA NOTIFICACION, la del servicio, que cambia de estado:
 *   - con cada cancion: una linea y las 7 notas;
 *   - al tocar una: "Calificada B+ · Deshacer" (4 s);
 *   - despues: una linea "✓ B+ · cancion" hasta la siguiente cancion.
 * Se probo con DOS (la del servicio minima y la de calificar normal, para que
 * esta pudiera irse sola) y NO SIRVIO: Android 16 / One UI junta las
 * notificaciones de una app en un grupo "RateApp" contraido, que esconde las
 * notas, y al deslizarlo se van todas (medido en el S24 el 2026-09-26, con los
 * eventos de notification_cancel). Una app no puede quitar la notificacion de
 * su servicio, asi que "se va sola" quedo en "se vuelve una linea". Sin
 * setOngoing: en Android 14+ se desliza, el servicio sigue, y la siguiente
 * cancion la trae de vuelta.
 *
 * DESHACER sin endpoint nuevo: la nota NO se manda al tocarla. Sale
 * "Calificada B+ · Deshacer" y se manda a los 4 s; Deshacer antes de eso la
 * cancela. Si cambia la cancion mientras tanto, se manda en el acto.
 *
 * Califica con el flujo COMPLETO de rate_track (como Calificar), mandando
 * nombre/artista/album. Por eso NO sirve para la cola de /backfill.
 *
 * WIDGETS (fase 6): cada cambio de estado se copia a Widgets.java, asi el
 * widget y la notificacion dicen lo mismo. Las notas del widget llegan aqui
 * con la cancion en el intent, y lo prenden si estaba apagado.
 */
public class CalificarService extends Service {

    private static final String TAG = "RateAppCalificar";
    private static final String CANAL = "calificar";
    private static final int NOTIF_ID = 6;
    private static final int NOTIF_VIEJA = 7;   // la de calificar cuando eran dos
    private static final long VENTANA_DESHACER_MS = 4000;

    static final String ACCION_CALIFICAR = "com.angelrg.rateapp.CALIFICAR";
    static final String ACCION_DESHACER = "com.angelrg.rateapp.DESHACER";
    static final String ACCION_CERRAR = "com.angelrg.rateapp.CERRAR";

    // Mismo orden que la app: 1 = A+ ... 7 = D (utils/ratings.js).
    private static final String[] RATINGS = {"A+", "A", "B+", "B", "C+", "C", "D"};
    private static final int[] BOTONES = {
        R.id.btn_ap, R.id.btn_a, R.id.btn_bp, R.id.btn_b, R.id.btn_cp, R.id.btn_c, R.id.btn_d};
    // Sin relleno (decision de Angel): borde claro para las que entran a
    // playlists, casi invisible para B/C+/C, punteado para D. Solo se rellena
    // la que ya tiene la cancion.
    private static final int[] FONDO = {
        R.drawable.nota_top, R.drawable.nota_top, R.drawable.nota_top,
        R.drawable.nota_mid, R.drawable.nota_mid, R.drawable.nota_mid, R.drawable.nota_d};
    private static final int[] TEXTO = {
        R.color.nota_texto_top, R.color.nota_texto_top, R.color.nota_texto_top,
        R.color.nota_texto_mid, R.color.nota_texto_mid, R.color.nota_texto_mid, R.color.nota_texto_mid};

    // Lo que suena. Solo se toca en el hilo principal.
    private String trackId;
    private String nombre = "";
    private String artista = "";
    private String album = "";
    private String imagen;      // url de la portada (sale de /tracks/info, llega despues)
    private String rating;      // la que ya tiene (null = sin nota o no se sabe)
    private String aviso = "";  // un error que mostrar en la linea de arriba
    private String hecha;       // la nota recien mandada: la notificacion queda en una linea

    // La nota tocada que todavia no se manda (ventana de deshacer).
    private Pendiente pendiente;

    // Tras onDestroy, una respuesta de red atrasada no debe volver a pintar
    // la notificacion (el servicio ya no existe) ni marcar el widget como vivo.
    private boolean destruido;

    private static final class Pendiente {
        final String tid, n, a, al, nota;
        Pendiente(String tid, String n, String a, String al, String nota) {
            this.tid = tid; this.n = n; this.a = a; this.al = al; this.nota = nota;
        }
    }

    private final ExecutorService red = Executors.newSingleThreadExecutor();
    private final Handler principal = new Handler(Looper.getMainLooper());
    private final Runnable alTerminarVentana = this::confirmar;

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
            leerNota(tid);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        crearCanales();

        ServiceCompat.startForeground(this, NOTIF_ID, notifReposo(),
            Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0);
        // Limpieza de la version de dos notificaciones.
        NotificationManagerCompat.from(this).cancel(NOTIF_VIEJA);
        getSystemService(NotificationManager.class).deleteNotificationChannel("servicio");

        IntentFilter f = new IntentFilter("com.spotify.music.metadatachanged");
        // EXPORTED a proposito: el que lo manda es otra app (Spotify).
        ContextCompat.registerReceiver(this, spotify, f, ContextCompat.RECEIVER_EXPORTED);

        // El broadcast solo llega al CAMBIAR de cancion. Si ya estaba sonando
        // algo al abrir la app, se pregunta una vez al backend.
        leerNota(null);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String accion = intent != null ? intent.getAction() : null;
        if (!ACCION_CERRAR.equals(accion)) {
            // Un widget lo prende con startForegroundService, que exige
            // startForeground en cada arranque aunque ya estuviera prendido.
            ServiceCompat.startForeground(this, NOTIF_ID, actual(),
                Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0);
        }
        if (ACCION_CERRAR.equals(accion)) {
            confirmar();
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACCION_CALIFICAR.equals(accion)) {
            adoptarDelWidget(intent);
            tocar(intent.getStringExtra("rating"));
        }
        if (ACCION_DESHACER.equals(accion)) deshacer();
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        principal.removeCallbacks(alTerminarVentana);
        confirmar();  // una nota tocada no se pierde porque se apague el servicio
        destruido = true;
        Widgets.servicioApagado(this);
        try { unregisterReceiver(spotify); } catch (IllegalArgumentException ignored) { }
        red.shutdown(); // shutdown y no shutdownNow: que termine de mandarla
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    // ------------------------------------------------------------------ estado

    private void mostrar(String tid, String n, String a, String al) {
        confirmar(); // la de la cancion anterior sale ya, no se pierde
        trackId = tid;
        nombre = n;
        artista = a;
        album = al;
        imagen = null;
        rating = null;
        aviso = "";
        hecha = null;
        publicar();
    }

    /**
     * Una nota tocada en el widget trae la cancion que el widget ensena. Si
     * no es la que tiene el servicio (estaba apagado, o Spotify cambio sin
     * avisar), se adopta: se califica lo que Angel estaba viendo.
     */
    private void adoptarDelWidget(Intent i) {
        String tid = i.getStringExtra("track_id");
        if (tid == null || tid.equals(trackId)) return;
        confirmar();
        trackId = tid;
        nombre = texto(i.getStringExtra("name"));
        artista = texto(i.getStringExtra("artist"));
        album = texto(i.getStringExtra("album"));
        imagen = i.getStringExtra("imagen");
        rating = null;
        aviso = "";
        hecha = null;
        leerNota(tid); // la nota que ya tenia, para Deshacer
    }

    /**
     * La nota que ya tenga, para rellenarla. Con el id del broadcast se pide
     * /tracks/info/{id}: NO /now-playing, porque la API de Spotify puede ir
     * detras del celular y devolver otra cancion (paso el 2026-09-24).
     * Con tid == null (arranque, aun no llega ningun broadcast) se adopta lo
     * que diga /now-playing.
     */
    private void leerNota(final String tid) {
        red.execute(() -> {
            try {
                JSONObject t;
                if (tid != null) {
                    t = new JSONObject(Servidor.get(this, "/tracks/info/" + tid));
                    t.put("id", tid);
                } else {
                    t = new JSONObject(Servidor.get(this, "/tracks/now-playing")).optJSONObject("track");
                }
                String idBackend = t != null ? t.optString("id", null) : null;
                if (idBackend == null) return;
                String rat = t.isNull("rating") ? null : t.optString("rating", null);
                String n = t.optString("name", ""), a = t.optString("artist", ""), al = t.optString("album", "");
                String img = t.isNull("image") ? null : t.optString("image", null);
                principal.post(() -> {
                    if (tid == null) {
                        // Arranque: solo si mientras tanto no llego un broadcast.
                        if (trackId != null) return;
                        trackId = idBackend;
                        nombre = n;
                        // now-playing junta a todos los artistas; en MySQL va el principal.
                        artista = a.split(", ")[0];
                        album = al;
                    } else if (!idBackend.equals(trackId)) {
                        return; // ya cambio otra vez
                    }
                    rating = rat;
                    imagen = img;
                    if (pendiente == null && hecha == null) publicar();
                    else aWidgets();
                });
                // Aqui mismo, que ya es el hilo de red. Si mientras tanto cambio
                // la cancion, el widget no la usa (compara el id).
                Widgets.bajarPortada(this, idBackend, img);
            } catch (Exception e) {
                Log.w(TAG, "leer la nota fallo", e);
            }
        });
    }

    /** Tocar una nota: todavia no se manda; empieza la ventana de deshacer. */
    private void tocar(String r) {
        if (r == null || trackId == null) return;
        // Se captura todo al momento del toque: si la cancion cambia, se
        // califica la que Angel estaba viendo.
        pendiente = new Pendiente(trackId, nombre, artista, album, r);
        principal.removeCallbacks(alTerminarVentana);
        principal.postDelayed(alTerminarVentana, VENTANA_DESHACER_MS);
        publicarHecha();
    }

    private void deshacer() {
        principal.removeCallbacks(alTerminarVentana);
        if (pendiente == null) return;
        boolean mismaCancion = pendiente.tid.equals(trackId);
        pendiente = null;
        if (mismaCancion) publicar();
    }

    /** Manda la nota pendiente (si hay). Al salir bien, la notificacion se va. */
    private void confirmar() {
        principal.removeCallbacks(alTerminarVentana);
        final Pendiente p = pendiente;
        if (p == null) return;
        pendiente = null;
        red.execute(() -> {
            boolean ok;
            try {
                JSONObject body = new JSONObject()
                    .put("track_id", p.tid).put("rating", p.nota)
                    // Con nombres: sin ellos, una cancion nueva nacia anonima
                    // (el bug del 2026-09-22 con el reproductor).
                    .put("name", p.n).put("artist", p.a).put("album", p.al);
                Servidor.post(this, "/tracks/rate", body.toString());
                ok = true;
            } catch (Exception e) {
                Log.w(TAG, "rate fallo", e);
                ok = false;
            }
            final boolean exito = ok;
            principal.post(() -> {
                if (exito) Widgets.refrescarColaAparte(this); // pudo ser de <3333>
                if (destruido || !p.tid.equals(trackId)) return; // ya suena otra: su notificacion manda
                if (exito) {
                    rating = p.nota;
                    hecha = p.nota;
                    publicar();
                } else {
                    aviso = "No se califico, sin conexion";
                    publicar();
                }
            });
        });
    }

    // ---------------------------------------------------------- notificaciones

    private void publicar() {
        if (destruido) return;
        if (trackId == null) { notificar(NOTIF_ID, notifReposo()); return; }
        aWidgets();
        if (hecha != null) {
            Log.d(TAG, "lista: " + hecha + " · " + nombre);
            notificar(NOTIF_ID, notifLista());
            return;
        }
        Log.d(TAG, "calificar: " + nombre + " · " + artista + " nota=" + rating + (aviso.isEmpty() ? "" : " aviso=" + aviso));
        notificar(NOTIF_ID, notifCalificar());
    }

    private void publicarHecha() {
        Log.d(TAG, "hecha: " + pendiente.nota + " · " + pendiente.n);
        aWidgets();
        notificar(NOTIF_ID, notifHecha());
    }

    /** La notificacion que toca ahora (para volver a llamar startForeground). */
    private Notification actual() {
        if (trackId == null) return notifReposo();
        if (pendiente != null) return notifHecha();
        if (hecha != null) return notifLista();
        return notifCalificar();
    }

    /** El mismo estado, en palabras del widget. */
    private void aWidgets() {
        if (destruido || trackId == null) return;
        String nota, estado;
        boolean deshacer = false;
        if (pendiente != null) {
            nota = pendiente.nota;
            estado = "Calificada " + pendiente.nota + " · Deshacer";
            deshacer = true;
        } else if (hecha != null) {
            nota = hecha;
            estado = "✓ Calificada " + hecha;
        } else if (!aviso.isEmpty()) {
            nota = rating;
            estado = aviso;
        } else {
            nota = rating;
            estado = rating == null ? "Sin calificar" : "Tiene " + rating;
        }
        Widgets.guardarSonando(this, trackId, nombre, artista, album, imagen, nota, estado, deshacer);
    }

    private void notificar(int id, Notification n) {
        try {
            NotificationManagerCompat.from(this).notify(id, n);
        } catch (SecurityException sinPermiso) {
            // Sin permiso de notificaciones no hay nada que pintar.
        }
    }

    private Notification notifCalificar() {
        RemoteViews v = new RemoteViews(getPackageName(), R.layout.notif_calificar);
        v.setTextViewText(R.id.title, !aviso.isEmpty() ? aviso + " · " + nombre : nombre + " · " + artista);
        for (int k = 0; k < RATINGS.length; k++) {
            boolean actual = RATINGS[k].equals(rating);
            v.setTextColor(BOTONES[k], ContextCompat.getColor(this, actual ? R.color.nota_on_texto : TEXTO[k]));
            v.setInt(BOTONES[k], "setBackgroundResource", actual ? R.drawable.nota_on : FONDO[k]);
            v.setOnClickPendingIntent(BOTONES[k], PendingIntent.getService(this, 100 + k,
                new Intent(this, CalificarService.class).setAction(ACCION_CALIFICAR).putExtra("rating", RATINGS[k]),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        return base(v).build();
    }

    private Notification notifHecha() {
        RemoteViews v = new RemoteViews(getPackageName(), R.layout.notif_hecha);
        v.setTextViewText(R.id.status, "Calificada " + pendiente.nota + " · " + pendiente.n);
        v.setOnClickPendingIntent(R.id.btn_deshacer, PendingIntent.getService(this, 3,
            new Intent(this, CalificarService.class).setAction(ACCION_DESHACER),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return base(v).build();
    }

    private NotificationCompat.Builder base(RemoteViews v) {
        return new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_stat_rateapp)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(v)
            .setCustomBigContentView(v)
            .setContentIntent(Avisos.abrirApp(this, "/", 1))
            .setGroup("calificar")
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW);
    }

    /** Nada sonando todavia: una linea, con "Apagar". */
    private Notification notifReposo() {
        return linea("Atento a Spotify", "Pon algo y aparecen las notas").build();
    }

    /** Ya calificada: una linea hasta la siguiente cancion. */
    private Notification notifLista() {
        return linea("✓ " + hecha + " · " + nombre, artista).build();
    }

    private NotificationCompat.Builder linea(String titulo, String texto) {
        PendingIntent apagar = PendingIntent.getService(this, 2,
            new Intent(this, CalificarService.class).setAction(ACCION_CERRAR),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_stat_rateapp)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setContentIntent(Avisos.abrirApp(this, "/", 1))
            .addAction(0, "Apagar", apagar)
            .setGroup("calificar")
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW);
    }

    private void crearCanales() {
        NotificationChannel c = new NotificationChannel(CANAL, "Calificar lo que suena",
            NotificationManager.IMPORTANCE_LOW);
        c.setDescription("Una línea y las siete notas, con cada canción");
        c.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        c.setShowBadge(false);
        getSystemService(NotificationManager.class).createNotificationChannel(c);
    }

    private static String texto(String s) { return s != null ? s : ""; }
}
