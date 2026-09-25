package com.angelrg.rateapp;

import android.Manifest;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import org.json.JSONObject;

import java.util.regex.Pattern;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** La pantalla a abrir (la manda un aviso: "/", "/dashboard", "/window?calificar=..."). */
    static final String EXTRA_RUTA = "ruta";
    /** Solo en builds de depuracion: dispara un aviso ya (cola, sin_nota, cierre). */
    private static final String EXTRA_PRUEBA = "prueba_aviso";

    // Esta actividad esta exportada: cualquier app puede mandarle un intent. La
    // ruta se valida para que solo pueda ser una pantalla de RateApp.
    private static final Pattern RUTA_VALIDA = Pattern.compile("^/(?!/)[A-Za-z0-9/_?=&%.-]*$");

    private final ActivityResultLauncher<String> pedirNotificaciones =
        registerForActivityResult(new ActivityResultContracts.RequestPermission(), concedido -> arrancarNotificacion());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Sin esto, el boton "atras" de Android CERRABA la app desde cualquier
        // pantalla: Capacitor solo lo maneja con el plugin @capacitor/app, que
        // no se instala para no exponerle mas API nativa a la pagina remota.
        // Con historial, regresa como el navegador; sin historial, manda la app
        // al fondo en vez de matarla (asi reabrir no recarga todo).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web != null && web.canGoBack()) {
                    web.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });

        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this,
                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            pedirNotificaciones.launch(Manifest.permission.POST_NOTIFICATIONS);
        }

        Avisos.programar(this);

        // Abierta desde un aviso: la WebView ya empezo a cargar la raiz; se
        // cambia a la pantalla del aviso.
        String ruta = rutaDe(getIntent());
        if (ruta != null && getBridge() != null) {
            getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(Servidor.base(this) + ruta));
        }
        probar(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String ruta = rutaDe(intent);
        if (ruta != null && getBridge() != null) {
            // La app ya estaba abierta: se navega dentro de React sin recargar.
            // React Router escucha popstate.
            getBridge().getWebView().evaluateJavascript(
                "history.pushState({}, '', " + JSONObject.quote(ruta) + ");"
                    + "dispatchEvent(new PopStateEvent('popstate'));", null);
        }
        probar(intent);
    }

    private static String rutaDe(Intent i) {
        String r = i != null ? i.getStringExtra(EXTRA_RUTA) : null;
        return r != null && RUTA_VALIDA.matcher(r).matches() ? r : null;
    }

    /**
     * Probar un aviso sin esperar a las 10:00:
     *   adb shell am start -n com.angelrg.rateapp/.MainActivity --es prueba_aviso cola
     * Solo en el APK de depuracion. "sin_nota" consulta sin gastar el aviso.
     */
    private void probar(Intent i) {
        boolean depuracion = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        String cual = i != null ? i.getStringExtra(EXTRA_PRUEBA) : null;
        if (!depuracion || cual == null) return;
        final android.content.Context app = getApplicationContext();
        new Thread(() -> {
            if ("cola".equals(cual)) Avisos.revisarCola(app, true);
            else if ("sin_nota".equals(cual)) Avisos.revisarSinNota(app, true);
            else if ("cierre".equals(cual)) Avisos.revisarCierre(app, true);
        }, "prueba-aviso").start();
    }

    @Override
    public void onResume() {
        super.onResume();
        // "Desde que abres RateApp hasta que la quitas": cada vez que la app
        // vuelve al frente, la notificacion regresa si se habia deslizado.
        // Arrancar un servicio que ya corre no hace nada.
        arrancarNotificacion();
    }

    private void arrancarNotificacion() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this,
                Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return; // sin permiso la notificacion ni se veria
        }
        ContextCompat.startForegroundService(this, new Intent(this, CalificarService.class));
    }
}
