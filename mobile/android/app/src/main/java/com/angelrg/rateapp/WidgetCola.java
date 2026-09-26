package com.angelrg.rateapp;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/**
 * Widget 2x2: cuantas sin nota en <3333> (ver Widgets.java). Se refresca al
 * ponerlo, cada 30 min (el minimo de Android), al abrir la app y despues de
 * calificar.
 */
public class WidgetCola extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager am, int[] ids) {
        Widgets.pintarCola(ctx);
        final PendingResult r = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try { Widgets.refrescarCola(app); } finally { r.finish(); }
        }, "widget-cola").start();
    }
}
