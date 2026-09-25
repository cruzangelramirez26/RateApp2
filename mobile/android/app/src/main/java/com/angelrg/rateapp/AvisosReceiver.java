package com.angelrg.rateapp;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Suena la alarma de las 10:00 (tu cola y cierre) o la de las 20:00 (sin
 * nota). La red va en un hilo aparte con goAsync: una alarma es un broadcast
 * de fondo y tiene hasta ~1 min antes de que Android lo corte, lo que alcanza
 * aunque Cloud Run arranque en frio (~5 s).
 *
 * No exportado: solo lo dispara el AlarmManager de esta misma app.
 */
public class AvisosReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        final String accion = intent.getAction();
        final Context app = ctx.getApplicationContext();
        final PendingResult fin = goAsync();
        new Thread(() -> {
            try {
                if (Avisos.ALARMA_MANANA.equals(accion)) {
                    Avisos.revisarCola(app, false);
                    Avisos.revisarCierre(app, false);
                } else if (Avisos.ALARMA_TARDE.equals(accion)) {
                    Avisos.revisarSinNota(app, false);
                }
            } finally {
                // Las alarmas son de una sola vez: se programa la siguiente.
                Avisos.programar(app);
                fin.finish();
            }
        }, "avisos").start();
    }
}
