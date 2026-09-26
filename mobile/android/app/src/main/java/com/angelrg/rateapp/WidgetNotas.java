package com.angelrg.rateapp;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Widget 4x1: solo las notas, con la portada chica (ver Widgets.java). */
public class WidgetNotas extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager am, int[] ids) {
        Widgets.pintarSonando(ctx);
        final PendingResult r = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try { Widgets.completarPortada(app); } finally { r.finish(); }
        }, "widget-notas").start();
    }
}
