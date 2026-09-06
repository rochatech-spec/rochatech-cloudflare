package com.rochatech.aurora;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.LauncherApps;
import android.os.Bundle;

public class PinWidgetActivity extends Activity {
    private static final int HOST_ID = 27027;
    private static final String PREFS = "aurora_home";
    private static final String KEY_WIDGET = "widget_id";
    private LauncherApps.PinItemRequest request;
    private AppWidgetHost host;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        host = new AppWidgetHost(this, HOST_ID);
        LauncherApps launcherApps = (LauncherApps)getSystemService(Context.LAUNCHER_APPS_SERVICE);
        request = launcherApps != null ? launcherApps.getPinItemRequest(getIntent()) : null;
        if (request == null || request.getRequestType() != LauncherApps.PinItemRequest.REQUEST_TYPE_APPWIDGET) {
            finish();
            return;
        }

        new AlertDialog.Builder(this)
                .setTitle("Adicionar widget?")
                .setMessage("O widget será colocado na Tela de Início do Aurora.")
                .setNegativeButton("Cancelar", (d,w) -> finish())
                .setPositiveButton("Adicionar", (d,w) -> acceptWidget())
                .setOnCancelListener(d -> finish())
                .show();
    }

    private void acceptWidget() {
        int id = -1;
        try {
            id = host.allocateAppWidgetId();
            Bundle options = new Bundle();
            options.putInt(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            if (request.accept(options)) {
                int old = getSharedPreferences(PREFS, MODE_PRIVATE).getInt(KEY_WIDGET, -1);
                if (old > 0 && old != id) {
                    try { host.deleteAppWidgetId(old); } catch (Exception ignored) {}
                }
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_WIDGET, id).apply();
                Intent home = new Intent(this, AuroraLauncherActivity.class);
                home.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                startActivity(home);
            } else {
                try { host.deleteAppWidgetId(id); } catch (Exception ignored) {}
            }
        } catch (Exception e) {
            if (id > 0) try { host.deleteAppWidgetId(id); } catch (Exception ignored) {}
        }
        finish();
    }
}
