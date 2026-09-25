package com.angelrg.rateapp;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Hablar con el backend desde Java (la notificacion de calificar y los avisos).
 *
 * Por HTTP directo, como los atajos de Rust del escritorio: la pagina remota
 * no recibe ningun permiso nativo. La URL sale del capacitor.config.json
 * empaquetado, que es la misma que carga la WebView: una sola fuente.
 */
final class Servidor {

    private static String base;

    private Servidor() { }

    static synchronized String base(Context ctx) {
        if (base != null) return base;
        try (InputStream in = ctx.getAssets().open("capacitor.config.json")) {
            String url = new JSONObject(leer(in)).getJSONObject("server").getString("url");
            base = url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
            return base;
        } catch (Exception e) {
            throw new IllegalStateException("No pude leer server.url de capacitor.config.json", e);
        }
    }

    static String get(Context ctx, String ruta) throws Exception {
        HttpURLConnection c = abrir(base(ctx) + ruta);
        try {
            if (c.getResponseCode() / 100 != 2) throw new IllegalStateException("HTTP " + c.getResponseCode());
            return leer(c.getInputStream());
        } finally { c.disconnect(); }
    }

    /** POST con JSON. Devuelve el cuerpo; lanza si no es 2xx. */
    static String post(Context ctx, String ruta, String json) throws Exception {
        HttpURLConnection c = abrir(base(ctx) + ruta);
        try {
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            // Siempre con cuerpo: Cloud Run contesta 411 a un POST sin Content-Length.
            try (OutputStream o = c.getOutputStream()) {
                o.write((json != null ? json : "{}").getBytes(StandardCharsets.UTF_8));
            }
            if (c.getResponseCode() / 100 != 2) throw new IllegalStateException("HTTP " + c.getResponseCode());
            return leer(c.getInputStream());
        } finally { c.disconnect(); }
    }

    /** Portada escalada a `lado` px; null si no se pudo. Nunca lanza. */
    static Bitmap portada(String url, int lado) {
        if (url == null) return null;
        try {
            HttpURLConnection c = abrir(url);
            try (InputStream in = c.getInputStream()) {
                Bitmap b = BitmapFactory.decodeStream(in);
                return b != null ? Bitmap.createScaledBitmap(b, lado, lado, true) : null;
            } finally { c.disconnect(); }
        } catch (Exception e) {
            return null;
        }
    }

    private static HttpURLConnection abrir(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10000);
        c.setReadTimeout(20000);
        return c;
    }

    private static String leer(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
        return b.toString("UTF-8");
    }
}
