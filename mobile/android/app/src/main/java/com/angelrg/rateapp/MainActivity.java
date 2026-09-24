package com.angelrg.rateapp;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
    }
}
