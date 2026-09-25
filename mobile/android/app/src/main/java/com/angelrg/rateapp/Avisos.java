package com.angelrg.rateapp;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Los avisos que no son "calificar lo que suena" (rediseño movil, fase 5).
 * Cada uno con su canal, para apagarlos por separado desde Android. Muy poco
 * texto: una linea (dos a lo mas) y un boton.
 *
 *  - TU COLA: cada 3 dias a las 10:00, solo si hay pendientes en <3333>.
 *  - SIN NOTA: 5 escuchas en un mes y sin nota, UNA vez por cancion. Lo ya
 *    avisado lo guarda el backend (tabla avisos_sin_nota), no el telefono.
 *    Uno al dia a lo mas, a las 20:00.
 *  - CIERRE: el 1 de enero, mayo y septiembre, con el resumen del
 *    cuatrimestre que acabo. Si ese dia no se pudo (sin red, apagado), se
 *    reintenta hasta el dia 7.
 *
 * Se programan con AlarmManager inexacto (setAndAllowWhileIdle): no pide el
 * permiso de alarmas exactas y unos minutos de retraso no importan. Cada alarma
 * es de una sola vez; al sonar se programa la siguiente. Se reprograman al
 * abrir la app y al reiniciar el telefono (ArranqueReceiver).
 */
final class Avisos {

    private static final String TAG = "RateAppAvisos";
    static final String ALARMA_MANANA = "com.angelrg.rateapp.ALARMA_MANANA";
    static final String ALARMA_TARDE = "com.angelrg.rateapp.ALARMA_TARDE";

    private static final String CANAL_COLA = "cola";
    private static final String CANAL_SIN_NOTA = "sin_nota";
    private static final String CANAL_CIERRE = "cierre";
    private static final int ID_COLA = 20;
    private static final int ID_CIERRE = 40;

    private static final int DIAS_ENTRE_COLA = 3;

    private Avisos() { }

    // ------------------------------------------------------------ programar

    static void programar(Context ctx) {
        crearCanales(ctx);
        programarA(ctx, ALARMA_MANANA, 10, 11);
        programarA(ctx, ALARMA_TARDE, 20, 12);
    }

    private static void programarA(Context ctx, String accion, int hora, int codigo) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, hora);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() <= System.currentTimeMillis() + 60_000) c.add(Calendar.DAY_OF_YEAR, 1);
        PendingIntent pi = PendingIntent.getBroadcast(ctx, codigo,
            new Intent(ctx, AvisosReceiver.class).setAction(accion),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(), pi);
    }

    // -------------------------------------------------------------- revisar
    // Todo esto hace red: se llama desde un hilo aparte, nunca del principal.

    /** Tu cola. `forzar` se salta la regla de los 3 dias (pruebas). */
    static void revisarCola(Context ctx, boolean forzar) {
        SharedPreferences p = prefs(ctx);
        long hoy = diaDeHoy();
        if (!forzar && hoy - p.getLong("cola_dia", -99) < DIAS_ENTRE_COLA) return;
        try {
            JSONArray pend = new JSONArray(Servidor.get(ctx, "/tracks/pending"));
            int sinNota = 0;
            String portada = null;
            for (int i = 0; i < pend.length(); i++) {
                JSONObject t = pend.getJSONObject(i);
                String r = t.isNull("rating") ? "" : t.optString("rating", "");
                if (r.isEmpty()) {
                    sinNota++;
                    if (portada == null && !t.isNull("image")) portada = t.optString("image", null);
                }
            }
            // Sin pendientes no se gasta el turno: se vuelve a ver mañana.
            if (sinNota == 0) return;
            NotificationCompat.Builder b = base(ctx, CANAL_COLA)
                .setContentTitle(sinNota + " sin nota en <3333>")
                .setLargeIcon(Servidor.portada(portada, 192))
                .setContentIntent(abrirApp(ctx, "/", 21))
                .addAction(0, "Calificar", abrirApp(ctx, "/", 21));
            if (notificar(ctx, ID_COLA, b)) p.edit().putLong("cola_dia", hoy).apply();
        } catch (Exception e) {
            Log.w(TAG, "cola fallo", e);
        }
    }

    /** Sin nota. `prueba` no gasta el aviso (marcar=false en el backend). */
    static void revisarSinNota(Context ctx, boolean prueba) {
        try {
            JSONObject r = new JSONObject(Servidor.post(ctx,
                "/tracks/avisos/sin-nota?min_plays=5&dias=30&limite=1&marcar=" + (prueba ? "false" : "true"), "{}"));
            JSONArray items = r.optJSONArray("items");
            if (items == null || items.length() == 0) return;
            JSONObject t = items.getJSONObject(0);
            String tid = t.optString("track_id", "");
            if (tid.isEmpty()) return;
            int plays = t.optInt("plays", 5);
            String ruta = "/window?calificar=" + Uri.encode(tid);
            NotificationCompat.Builder b = base(ctx, CANAL_SIN_NOTA)
                .setContentTitle(t.optString("name", "Una canción"))
                .setContentText(plays + " escuchas este mes y sin nota")
                .setLargeIcon(Servidor.portada(t.isNull("image") ? null : t.optString("image", null), 192))
                .setContentIntent(abrirApp(ctx, ruta, 31))
                .addAction(0, "Calificar", abrirApp(ctx, ruta, 31));
            notificar(ctx, 30 + Math.abs(tid.hashCode() % 1000), b);
        } catch (Exception e) {
            Log.w(TAG, "sin nota fallo", e);
        }
    }

    /**
     * Cierre de cuatrimestre. Del 1 al 7 de enero, mayo y septiembre, una vez
     * por cuatrimestre. `forzar` enseña el ultimo que cerro, sin marcarlo.
     */
    static void revisarCierre(Context ctx, boolean forzar) {
        Calendar hoy = Calendar.getInstance();
        int mes = hoy.get(Calendar.MONTH) + 1;
        int anio = hoy.get(Calendar.YEAR);
        String slot;
        int anioSlot = anio;
        if (forzar) {
            // El ultimo que cerro, sea cual sea el dia.
            if (mes <= 4) { slot = "latte"; anioSlot = anio - 1; }
            else if (mes <= 8) slot = "perla";
            else slot = "miel";
        } else {
            if (hoy.get(Calendar.DAY_OF_MONTH) > 7) return;
            if (mes == 1) { slot = "latte"; anioSlot = anio - 1; }
            else if (mes == 5) slot = "perla";
            else if (mes == 9) slot = "miel";
            else return;
        }
        String clave = "cierre_" + anioSlot + "_" + slot;
        SharedPreferences p = prefs(ctx);
        if (!forzar && p.getBoolean(clave, false)) return;
        try {
            JSONObject stats = new JSONObject(Servidor.get(ctx, "/tracks/stats"));
            JSONArray por = stats.optJSONArray("by_cuatri");
            int total = 0, aplus = 0;
            for (int i = 0; por != null && i < por.length(); i++) {
                JSONObject c = por.getJSONObject(i);
                if (c.optInt("year") == anioSlot && slot.equals(c.optString("cuatri"))) {
                    total = c.optInt("count");
                    JSONObject br = c.optJSONObject("by_rating");
                    aplus = br != null ? br.optInt("A+") : 0;
                }
            }
            String nombre = anioSlot + " " + slot;
            String img = null;
            try {
                JSONObject dist = new JSONObject(Servidor.get(ctx, "/playlists/distribution"));
                JSONObject info = dist.getJSONObject("cuatrimestres").getJSONObject(String.valueOf(anioSlot)).getJSONObject(slot);
                nombre = info.optString("nombre", nombre);
                img = info.isNull("img") ? null : info.optString("img", null);
                if (img != null && img.startsWith("/")) img = Servidor.base(ctx) + img;
            } catch (Exception sinNombre) {
                // El nombre es adorno: sin el sale "2026 miel".
            }
            NotificationCompat.Builder b = base(ctx, CANAL_CIERRE)
                .setContentTitle("Se cerró " + nombre)
                .setContentText(total + " canciones · " + aplus + " en A+")
                .setLargeIcon(Servidor.portada(img, 192))
                .setContentIntent(abrirApp(ctx, "/dashboard", 41))
                .addAction(0, "Ver resumen", abrirApp(ctx, "/dashboard", 41));
            if (notificar(ctx, ID_CIERRE, b) && !forzar) p.edit().putBoolean(clave, true).apply();
        } catch (Exception e) {
            Log.w(TAG, "cierre fallo", e);
        }
    }

    // ---------------------------------------------------------------- piezas

    /**
     * Abre la app en una pantalla. MainActivity valida la ruta: es una
     * actividad exportada, cualquiera podria mandarle un intent.
     */
    static PendingIntent abrirApp(Context ctx, String ruta, int codigo) {
        Intent i = new Intent(ctx, MainActivity.class)
            .putExtra(MainActivity.EXTRA_RUTA, ruta)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, codigo, i,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static NotificationCompat.Builder base(Context ctx, String canal) {
        return new NotificationCompat.Builder(ctx, canal)
            .setSmallIcon(R.drawable.ic_stat_rateapp)
            .setGroup(canal)   // cada aviso en su grupo: nada de grupos automaticos
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
    }

    private static boolean notificar(Context ctx, int id, NotificationCompat.Builder b) {
        try {
            NotificationManagerCompat.from(ctx).notify(id, b.build());
            return true;
        } catch (SecurityException sinPermiso) {
            return false;
        }
    }

    static void crearCanales(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(canal(CANAL_COLA, "Tu cola",
            "Cada 3 días a las 10:00, si hay canciones sin nota en <3333>"));
        nm.createNotificationChannel(canal(CANAL_SIN_NOTA, "Sin nota",
            "Una canción con 5 escuchas en un mes y sin calificar"));
        nm.createNotificationChannel(canal(CANAL_CIERRE, "Cierre de cuatrimestre",
            "El resumen del cuatrimestre que acaba de cerrar"));
    }

    // Sin sonido: son recordatorios, no alarmas. Cada canal se puede cambiar
    // desde los ajustes de Android.
    private static NotificationChannel canal(String id, String nombre, String desc) {
        NotificationChannel c = new NotificationChannel(id, nombre, NotificationManager.IMPORTANCE_DEFAULT);
        c.setDescription(desc);
        c.setSound(null, null);
        c.enableVibration(false);
        return c;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences("avisos", Context.MODE_PRIVATE);
    }

    private static long diaDeHoy() {
        Calendar c = Calendar.getInstance();
        long ms = c.getTimeInMillis() + c.get(Calendar.ZONE_OFFSET) + c.get(Calendar.DST_OFFSET);
        return ms / 86_400_000L;
    }
}
