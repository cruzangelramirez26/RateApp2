package com.angelrg.rateapp;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
