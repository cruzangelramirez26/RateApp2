package com.angelrg.rateapp;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Al reiniciar el telefono (o al actualizar la app) Android borra las
 * alarmas: aqui se vuelven a programar. Exportado porque lo manda el sistema;
 * las dos acciones son protegidas, ninguna otra app puede mandarlas.
 */
public class ArranqueReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            Avisos.programar(ctx.getApplicationContext());
        }
    }
}
