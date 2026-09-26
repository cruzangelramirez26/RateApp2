package com.angelrg.rateapp;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Los tres widgets de la pantalla de inicio (rediseño movil, fase 6):
 *   4x2 lo que suena (portada, cancion, estado y las 7 notas),
 *   4x1 solo las notas (con la portada chica),
 *   2x2 tu cola (cuantas sin nota en <3333> y tres portadas).
 *
 * LO QUE SUENA LO DECIDE CalificarService, no el widget: el servicio es el que
 * oye el broadcast de Spotify, y guarda aqui cada cambio. Asi el widget y la
 * notificacion dicen siempre la misma cancion y el mismo estado. El estado vive
 * en SharedPreferences (y las portadas en archivos) porque un widget se vuelve
 * a pintar sin el servicio: al reiniciar el launcher o con el servicio apagado.
 *
 * Con el servicio apagado el widget muestra "Lo ultimo que sono", y tocar una
 * nota lo prende (getForegroundService) y califica ESA cancion, la que se ve
 * (decision de Angel). Tocar una nota sigue la misma regla de la notificacion:
 * "Calificada B+ · Deshacer" 4 s y luego se manda, con el flujo completo, o
 * sea NO sirve para la cola de /backfill.
 *
 * El "vidrio" del lienzo no existe en Android (un widget no difumina lo que
 * tiene detras): el fondo es la portada difuminada y oscurecida, generada aqui
 * como bitmap.
 */
final class Widgets {

    private static final String TAG = "RateAppWidgets";
    private static final String PREFS = "widgets";

    private static final String[] RATINGS = {"A+", "A", "B+", "B", "C+", "C", "D"};
    private static final int[] FONDO = {
        R.drawable.wg_nota_top, R.drawable.wg_nota_top, R.drawable.wg_nota_top,
        R.drawable.wg_nota_mid, R.drawable.wg_nota_mid, R.drawable.wg_nota_mid, R.drawable.wg_nota_d};
    private static final int[] TEXTO = {
        R.color.wg_t1, R.color.wg_t1, R.color.wg_t1, R.color.wg_t2, R.color.wg_t2, R.color.wg_t2, R.color.wg_t3};
    // Los ids de las notas son los mismos en los dos layouts que las llevan.
    private static final int[] BOTONES = {
        R.id.wn_ap, R.id.wn_a, R.id.wn_bp, R.id.wn_b, R.id.wn_cp, R.id.wn_c, R.id.wn_d};

    private static final String F_PORTADA = "wg_portada.png";
    private static final String F_FONDO = "wg_fondo.png";
    private static final String F_COLA_FONDO = "wg_cola_fondo.png";
    private static final String F_COLA = "wg_cola_%d.png";

    private Widgets() { }

    // ================================================================= estado

    /**
     * Lo que suena, desde CalificarService. `nota` es la que se ve rellena
     * (la que ya tiene, la tocada o la recien mandada); `deshacer` = esta
     * corriendo la ventana de 4 s.
     */
    static void guardarSonando(Context ctx, String tid, String nombre, String artista, String album,
                               String imagen, String nota, String estado, boolean deshacer) {
        SharedPreferences p = prefs(ctx);
        SharedPreferences.Editor e = p.edit()
            .putString("tid", tid).putString("nombre", nombre).putString("artista", artista)
            .putString("album", album).putString("nota", nota).putString("estado", estado)
            .putBoolean("deshacer", deshacer).putBoolean("vivo", true);
        // La url de la portada llega despues que el broadcast (sale de /tracks/info):
        // un null no borra la que ya habia de ESTA cancion.
        if (imagen != null || !tid.equals(p.getString("tid", null))) e.putString("imagen", imagen);
        e.apply();
        pintarSonando(ctx);
    }

    /** El servicio se apago: el widget se queda con la ultima cancion. */
    static void servicioApagado(Context ctx) {
        prefs(ctx).edit().putBoolean("vivo", false).putBoolean("deshacer", false).apply();
        pintarSonando(ctx);
    }

    // ================================================================ pintar

    static void pintarSonando(Context ctx) {
        AppWidgetManager am = AppWidgetManager.getInstance(ctx);
        int[] grandes = am.getAppWidgetIds(new ComponentName(ctx, WidgetSonando.class));
        int[] chicos = am.getAppWidgetIds(new ComponentName(ctx, WidgetNotas.class));
        if (grandes.length > 0) am.updateAppWidget(grandes, vistaSonando(ctx));
        if (chicos.length > 0) am.updateAppWidget(chicos, vistaNotas(ctx));
    }

    static void pintarCola(Context ctx) {
        AppWidgetManager am = AppWidgetManager.getInstance(ctx);
        int[] ids = am.getAppWidgetIds(new ComponentName(ctx, WidgetCola.class));
        if (ids.length > 0) am.updateAppWidget(ids, vistaCola(ctx));
    }

    static boolean hayDeSonando(Context ctx) {
        AppWidgetManager am = AppWidgetManager.getInstance(ctx);
        return am.getAppWidgetIds(new ComponentName(ctx, WidgetSonando.class)).length > 0
            || am.getAppWidgetIds(new ComponentName(ctx, WidgetNotas.class)).length > 0;
    }

    static boolean hayDeCola(Context ctx) {
        return AppWidgetManager.getInstance(ctx)
            .getAppWidgetIds(new ComponentName(ctx, WidgetCola.class)).length > 0;
    }

    private static RemoteViews vistaSonando(Context ctx) {
        SharedPreferences p = prefs(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_sonando);
        String tid = p.getString("tid", null);
        boolean vivo = p.getBoolean("vivo", false);

        v.setOnClickPendingIntent(R.id.wg_cuerpo, Avisos.abrirApp(ctx, "/", 40));
        if (tid == null) {
            v.setTextViewText(R.id.wg_cab, "RateApp");
            v.setTextViewText(R.id.wg_nombre, "Nada sonando todavía");
            v.setTextViewText(R.id.wg_artista, "Pon algo en Spotify");
            v.setTextViewText(R.id.wg_estado, "");
            v.setViewVisibility(R.id.wg_notas, View.GONE);
            v.setImageViewResource(R.id.wg_portada, R.drawable.wg_portada_vacia);
            v.setImageViewResource(R.id.wg_fondo_img, android.R.color.transparent);
            return v;
        }
        v.setViewVisibility(R.id.wg_notas, View.VISIBLE);
        v.setTextViewText(R.id.wg_cab, vivo ? "Sonando" : "Lo último que sonó");
        v.setTextViewText(R.id.wg_nombre, p.getString("nombre", ""));
        v.setTextViewText(R.id.wg_artista, p.getString("artista", ""));
        v.setTextViewText(R.id.wg_estado, p.getString("estado", ""));
        // Durante los 4 s, el estado ("Calificada B+ · Deshacer") ES el boton.
        if (p.getBoolean("deshacer", false)) {
            v.setOnClickPendingIntent(R.id.wg_estado, alServicio(ctx, CalificarService.ACCION_DESHACER, 49, null));
        } else {
            v.setOnClickPendingIntent(R.id.wg_estado, Avisos.abrirApp(ctx, "/", 40));
        }
        ponerPortadas(ctx, v, tid, R.id.wg_portada, R.id.wg_fondo_img);
        ponerNotas(ctx, v, p, 200);
        return v;
    }

    private static RemoteViews vistaNotas(Context ctx) {
        SharedPreferences p = prefs(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_notas);
        String tid = p.getString("tid", null);
        v.setOnClickPendingIntent(R.id.wg_portada, Avisos.abrirApp(ctx, "/", 41));
        if (tid == null) {
            v.setImageViewResource(R.id.wg_portada, R.drawable.wg_portada_vacia);
            v.setImageViewResource(R.id.wg_fondo_img, android.R.color.transparent);
            v.setViewVisibility(R.id.wg_notas, View.GONE);
            v.setViewVisibility(R.id.wg_vacio, View.VISIBLE);
            return v;
        }
        v.setViewVisibility(R.id.wg_notas, View.VISIBLE);
        v.setViewVisibility(R.id.wg_vacio, View.GONE);
        ponerPortadas(ctx, v, tid, R.id.wg_portada, R.id.wg_fondo_img);
        ponerNotas(ctx, v, p, 300);
        return v;
    }

    private static RemoteViews vistaCola(Context ctx) {
        SharedPreferences p = prefs(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_cola);
        v.setOnClickPendingIntent(R.id.wg_cuerpo, Avisos.abrirApp(ctx, "/", 42));
        int n = p.getInt("cola_n", -1);
        if (n < 0) {
            v.setTextViewText(R.id.wg_numero, "·");
            v.setTextViewText(R.id.wg_pie, "cargando <3333>");
        } else if (n == 0) {
            v.setTextViewText(R.id.wg_numero, "Al día");
            v.setTextViewText(R.id.wg_pie, "nada sin nota en <3333>");
        } else {
            v.setTextViewText(R.id.wg_numero, String.valueOf(n));
            v.setTextViewText(R.id.wg_pie, "sin nota en <3333>");
        }
        int[] imgs = {R.id.wg_cola_0, R.id.wg_cola_1, R.id.wg_cola_2};
        int hay = n > 0 ? p.getInt("cola_imgs", 0) : 0;
        for (int k = 0; k < imgs.length; k++) {
            Bitmap b = k < hay ? leer(ctx, String.format(F_COLA, k)) : null;
            if (b != null) {
                v.setImageViewBitmap(imgs[k], b);
                v.setViewVisibility(imgs[k], View.VISIBLE);
            } else {
                v.setViewVisibility(imgs[k], View.GONE);
            }
        }
        Bitmap fondo = hay > 0 ? leer(ctx, F_COLA_FONDO) : null;
        if (fondo != null) v.setImageViewBitmap(R.id.wg_fondo_img, fondo);
        else v.setImageViewResource(R.id.wg_fondo_img, android.R.color.transparent);
        return v;
    }

    /** Portada y fondo, solo si los archivos son de ESTA cancion. */
    private static void ponerPortadas(Context ctx, RemoteViews v, String tid, int portada, int fondo) {
        boolean deEsta = tid.equals(prefs(ctx).getString("portada_tid", null));
        Bitmap b = deEsta ? leer(ctx, F_PORTADA) : null;
        Bitmap f = deEsta ? leer(ctx, F_FONDO) : null;
        if (b != null) v.setImageViewBitmap(portada, b);
        else v.setImageViewResource(portada, R.drawable.wg_portada_vacia);
        if (f != null) v.setImageViewBitmap(fondo, f);
        else v.setImageViewResource(fondo, android.R.color.transparent);
    }

    private static void ponerNotas(Context ctx, RemoteViews v, SharedPreferences p, int codigoBase) {
        String nota = p.getString("nota", null);
        for (int k = 0; k < RATINGS.length; k++) {
            boolean actual = RATINGS[k].equals(nota);
            v.setTextColor(BOTONES[k], ctx.getColor(actual ? R.color.wg_tinta : TEXTO[k]));
            v.setInt(BOTONES[k], "setBackgroundResource", actual ? R.drawable.wg_nota_on : FONDO[k]);
            // La cancion va en el intent: si el servicio estaba apagado, califica
            // la que se ve en el widget y no lo que Spotify tenga ahora.
            Intent extra = new Intent()
                .putExtra("rating", RATINGS[k])
                .putExtra("track_id", p.getString("tid", null))
                .putExtra("name", p.getString("nombre", ""))
                .putExtra("artist", p.getString("artista", ""))
                .putExtra("album", p.getString("album", ""))
                .putExtra("imagen", p.getString("imagen", null));
            v.setOnClickPendingIntent(BOTONES[k],
                alServicio(ctx, CalificarService.ACCION_CALIFICAR, codigoBase + k, extra));
        }
    }

    /**
     * Al servicio, PRENDIENDOLO si estaba apagado. Un toque en un widget es
     * de las excepciones que Android permite para arrancar un servicio en
     * primer plano desde el fondo.
     */
    private static PendingIntent alServicio(Context ctx, String accion, int codigo, Intent extras) {
        Intent i = new Intent(ctx, CalificarService.class).setAction(accion);
        if (extras != null) i.putExtras(extras);
        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        return Build.VERSION.SDK_INT >= 26
            ? PendingIntent.getForegroundService(ctx, codigo, i, flags)
            : PendingIntent.getService(ctx, codigo, i, flags);
    }

    // ================================================================== red
    // Todo esto hace red: nunca del hilo principal.

    /**
     * Baja la portada de la cancion y genera el fondo. Solo si hay algun
     * widget de lo que suena (para no gastar datos sin motivo) y si no la
     * tiene ya.
     */
    static void bajarPortada(Context ctx, String tid, String url) {
        if (tid == null || url == null || !hayDeSonando(ctx)) return;
        SharedPreferences p = prefs(ctx);
        if (tid.equals(p.getString("portada_tid", null))) return;
        Bitmap b = Servidor.portada(url, 300);
        if (b == null) return;
        if (!escribir(ctx, F_PORTADA, redondear(b, 36)) || !escribir(ctx, F_FONDO, difuminar(b))) return;
        p.edit().putString("portada_tid", tid).commit();
        pintarSonando(ctx);
    }

    /** Un widget recien puesto con la cancion de antes: le falta su portada. */
    static void completarPortada(Context ctx) {
        SharedPreferences p = prefs(ctx);
        bajarPortada(ctx, p.getString("tid", null), p.getString("imagen", null));
    }

    /** Cuenta las sin nota de <3333> (lo mismo que el aviso de la cola). */
    static void refrescarCola(Context ctx) {
        if (!hayDeCola(ctx)) return;
        try {
            JSONArray pend = new JSONArray(Servidor.get(ctx, "/tracks/pending"));
            int sinNota = 0, imgs = 0;
            for (int i = 0; i < pend.length(); i++) {
                JSONObject t = pend.getJSONObject(i);
                String r = t.isNull("rating") ? "" : t.optString("rating", "");
                if (!r.isEmpty()) continue;
                sinNota++;
                if (imgs < 3 && !t.isNull("image")) {
                    Bitmap b = Servidor.portada(t.optString("image", null), 160);
                    if (b == null) continue;
                    if (imgs == 0) escribir(ctx, F_COLA_FONDO, difuminar(b));
                    if (escribir(ctx, String.format(F_COLA, imgs), redondear(b, 18))) imgs++;
                }
            }
            prefs(ctx).edit().putInt("cola_n", sinNota).putInt("cola_imgs", imgs).commit();
        } catch (Exception e) {
            Log.w(TAG, "cola fallo", e);
            return; // se queda lo que habia
        }
        pintarCola(ctx);
    }

    /** refrescarCola en un hilo aparte (desde el hilo principal). */
    static void refrescarColaAparte(Context ctx) {
        final Context app = ctx.getApplicationContext();
        if (!hayDeCola(app)) return;
        new Thread(() -> refrescarCola(app), "widget-cola").start();
    }

    // ============================================================== bitmaps

    /**
     * El "vidrio": la portada reducida, difuminada y agrandada otra vez, con
     * el brillo a la mitad y mas saturada (el blur(30px) brightness(.5)
     * saturate(1.4) del lienzo). Reducirla primero hace el difuminado barato.
     */
    static Bitmap difuminar(Bitmap src) {
        Bitmap chica = Bitmap.createScaledBitmap(src, 40, 40, true);
        int w = chica.getWidth(), h = chica.getHeight();
        int[] px = new int[w * h];
        chica.getPixels(px, 0, w, 0, 0, w, h);
        for (int pasada = 0; pasada < 3; pasada++) cajaBlur(px, w, h, 3);
        chica.setPixels(px, 0, w, 0, 0, w, h);
        Bitmap grande = Bitmap.createScaledBitmap(chica, 360, 360, true);

        Bitmap out = Bitmap.createBitmap(360, 360, Bitmap.Config.ARGB_8888);
        ColorMatrix m = new ColorMatrix();
        m.setSaturation(1.4f);
        ColorMatrix oscuro = new ColorMatrix();
        oscuro.setScale(0.5f, 0.5f, 0.5f, 1f);
        m.postConcat(oscuro);
        Paint pinta = new Paint(Paint.FILTER_BITMAP_FLAG);
        pinta.setColorFilter(new ColorMatrixColorFilter(m));
        new Canvas(out).drawBitmap(grande, 0, 0, pinta);
        return out;
    }

    /** Blur de caja, horizontal y vertical, sobre los pixeles ARGB. */
    private static void cajaBlur(int[] px, int w, int h, int r) {
        int[] tmp = new int[px.length];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) tmp[y * w + x] = promedio(px, w, h, x, y, r, true);
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) px[y * w + x] = promedio(tmp, w, h, x, y, r, false);
    }

    private static int promedio(int[] px, int w, int h, int x, int y, int r, boolean horizontal) {
        int a = 0, rr = 0, g = 0, b = 0, n = 0;
        for (int d = -r; d <= r; d++) {
            int xx = horizontal ? Math.min(w - 1, Math.max(0, x + d)) : x;
            int yy = horizontal ? y : Math.min(h - 1, Math.max(0, y + d));
            int c = px[yy * w + xx];
            a += c >>> 24; rr += (c >> 16) & 0xff; g += (c >> 8) & 0xff; b += c & 0xff; n++;
        }
        return (a / n) << 24 | (rr / n) << 16 | (g / n) << 8 | (b / n);
    }

    /** RemoteViews no recorta esquinas de una imagen: se redondea el bitmap. */
    static Bitmap redondear(Bitmap src, float radio) {
        Bitmap out = Bitmap.createBitmap(src.getWidth(), src.getHeight(), Bitmap.Config.ARGB_8888);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        new Canvas(out).drawRoundRect(new RectF(0, 0, src.getWidth(), src.getHeight()), radio, radio, p);
        return out;
    }

    // =============================================================== archivos

    private static boolean escribir(Context ctx, String nombre, Bitmap b) {
        // Primero a un temporal y luego se renombra: el launcher puede estar
        // leyendo el anterior mientras tanto.
        File tmp = new File(ctx.getFilesDir(), nombre + ".tmp");
        try (FileOutputStream o = new FileOutputStream(tmp)) {
            b.compress(Bitmap.CompressFormat.PNG, 100, o);
        } catch (Exception e) {
            return false;
        }
        return tmp.renameTo(new File(ctx.getFilesDir(), nombre));
    }

    private static Bitmap leer(Context ctx, String nombre) {
        File f = new File(ctx.getFilesDir(), nombre);
        return f.exists() ? BitmapFactory.decodeFile(f.getPath()) : null;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
