package com.angelrg.rateapp;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Widget 4x2: lo que suena, con portada y las 7 notas (ver Widgets.java). */
public class WidgetSonando extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager am, int[] ids) {
        Widgets.pintarSonando(ctx);
        final PendingResult r = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try { Widgets.completarPortada(app); } finally { r.finish(); }
        }, "widget-sonando").start();
    }
}
