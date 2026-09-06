package com.rochatech.aurora;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.BatteryManager;
import android.os.Bundle;
import android.os.Handler;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.text.Collator;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class AuroraLauncherActivity extends Activity {
    private static final int HOST_ID = 27026;
    private static final int REQ_PICK_WIDGET = 8101;
    private static final int REQ_BIND_WIDGET = 8102;
    private static final int REQ_CONFIG_WIDGET = 8103;
    private static final String PREFS = "aurora_home";
    private static final String KEY_WIDGET = "widget_id";

    private final Locale ptBR = new Locale("pt", "BR");
    private final List<AppInfo> apps = new ArrayList<>();
    private FrameLayout root;
    private AppWidgetHost widgetHost;
    private AppWidgetManager widgetManager;
    private int pendingWidgetId = -1;
    private float downX, downY;
    private final Handler statusHandler = new Handler();
    private TextView statusTime, statusBattery;
    private final Runnable statusTick = new Runnable() {
        @Override public void run() {
            updateStatus();
            statusHandler.postDelayed(this, 60_000L);
        }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        configureWindow();
        widgetHost = new AppWidgetHost(this, HOST_ID);
        widgetManager = AppWidgetManager.getInstance(this);
        loadApps();
        buildHome();
        if (getIntent().getBooleanExtra("openEditor", false)) root.postDelayed(this::showEditMenu, 250);
    }

    @Override protected void onStart() {
        super.onStart();
        try { widgetHost.startListening(); } catch (Exception ignored) {}
    }

    @Override protected void onStop() {
        try { widgetHost.stopListening(); } catch (Exception ignored) {}
        super.onStop();
    }

    @Override protected void onResume() {
        super.onResume();
        loadApps();
        if (root != null) buildHome();
        statusHandler.removeCallbacks(statusTick);
        statusHandler.post(statusTick);
    }

    @Override protected void onPause() {
        statusHandler.removeCallbacks(statusTick);
        super.onPause();
    }

    private void configureWindow() {
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS |
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
        w.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    private void buildHome() {
        root = new FrameLayout(this);
        root.setBackground(new HomeBackgroundDrawable(false));
        root.setOnLongClickListener(v -> { showEditMenu(); return true; });
        root.setOnTouchListener((v, e) -> {
            if (e.getAction() == MotionEvent.ACTION_DOWN) { downX = e.getX(); downY = e.getY(); }
            if (e.getAction() == MotionEvent.ACTION_UP) {
                float dx = e.getX() - downX, dy = e.getY() - downY;
                if (Math.abs(dx) < dp(70) && dy > dp(100)) { showAppLibrary(); return true; }
            }
            return false;
        });

        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setPadding(dp(14), dp(6), dp(14), dp(14));
        root.addView(shell, new FrameLayout.LayoutParams(-1, -1));

        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int bottom = insets.getSystemWindowInsetBottom();
            shell.setPadding(dp(14), dp(6), dp(14), Math.max(bottom + dp(8), dp(14)));
            return insets;
        });

        FrameLayout status = new FrameLayout(this);
        status.setPadding(dp(4), 0, dp(4), 0);

        statusTime = new TextView(this);
        statusTime.setTextColor(Color.WHITE);
        statusTime.setTextSize(14);
        statusTime.setGravity(Gravity.CENTER_VERTICAL);
        statusTime.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        FrameLayout.LayoutParams timeP = new FrameLayout.LayoutParams(dp(88), -1, Gravity.START);
        status.addView(statusTime, timeP);

        View island = new View(this);
        island.setBackground(roundRect(Color.BLACK, 18));
        FrameLayout.LayoutParams islandP = new FrameLayout.LayoutParams(dp(94), dp(28), Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        islandP.topMargin = dp(1);
        status.addView(island, islandP);

        statusBattery = new TextView(this);
        statusBattery.setTextColor(Color.WHITE);
        statusBattery.setTextSize(12);
        statusBattery.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        statusBattery.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        FrameLayout.LayoutParams batteryP = new FrameLayout.LayoutParams(dp(104), -1, Gravity.END);
        status.addView(statusBattery, batteryP);

        shell.addView(status, new LinearLayout.LayoutParams(-1, dp(34)));
        updateStatus();

        int widgetId = getPreferences().getInt(KEY_WIDGET, -1);
        AppWidgetProviderInfo info = widgetId > 0 ? widgetManager.getAppWidgetInfo(widgetId) : null;
        boolean hasWidget = info != null;

        if (hasWidget) {
            FrameLayout widgetFrame = new FrameLayout(this);
            widgetFrame.setBackground(roundRect(Color.argb(40,255,255,255), 24));
            widgetFrame.setClipToOutline(true);
            AppWidgetHostView hostView = widgetHost.createView(this, widgetId, info);
            hostView.setAppWidget(widgetId, info);
            widgetFrame.addView(hostView, new FrameLayout.LayoutParams(-1, -1));
            LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-1, dp(158));
            wp.setMargins(dp(4), dp(4), dp(4), dp(12));
            shell.addView(widgetFrame, wp);
        }

        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        grid.setRowCount(hasWidget ? 4 : 6);
        grid.setAlignmentMode(GridLayout.ALIGN_BOUNDS);
        int maxApps = hasWidget ? 16 : 24;
        List<AppInfo> homeApps = pickHomeApps(maxApps);
        for (int i = 0; i < homeApps.size(); i++) {
            View tile = appTile(homeApps.get(i), true, false);
            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(i % 4, 1, 1f);
            gp.rowSpec = GridLayout.spec(i / 4, 1, 1f);
            gp.width = 0;
            gp.height = 0;
            gp.setMargins(dp(2), dp(1), dp(2), dp(1));
            tile.setLayoutParams(gp);
            grid.addView(tile);
        }
        shell.addView(grid, new LinearLayout.LayoutParams(-1, 0, 1f));

        TextView search = new TextView(this);
        search.setText("⌕  Buscar");
        search.setTextSize(13);
        search.setTextColor(Color.WHITE);
        search.setGravity(Gravity.CENTER);
        search.setBackground(roundRect(Color.argb(82, 30, 36, 45), 22));
        search.setOnClickListener(v -> showAppLibrary());
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(dp(96), dp(32));
        sp.gravity = Gravity.CENTER_HORIZONTAL;
        sp.setMargins(0, dp(4), 0, dp(8));
        shell.addView(search, sp);

        LinearLayout dock = new LinearLayout(this);
        dock.setOrientation(LinearLayout.HORIZONTAL);
        dock.setGravity(Gravity.CENTER);
        dock.setPadding(dp(8), dp(7), dp(8), dp(7));
        dock.setBackground(roundRect(Color.argb(118, 238, 241, 245), 31));
        dock.setElevation(dp(8));
        for (AppInfo app : pickDockApps()) {
            View tile = appTile(app, false, true);
            dock.addView(tile, new LinearLayout.LayoutParams(0, -1, 1f));
        }
        LinearLayout.LayoutParams dpDock = new LinearLayout.LayoutParams(-1, dp(78));
        dpDock.setMargins(dp(3), 0, dp(3), 0);
        shell.addView(dock, dpDock);

        setContentView(root);
    }

    private View appTile(AppInfo app, boolean label, boolean dock) {
        LinearLayout cell = new LinearLayout(this);
        cell.setOrientation(LinearLayout.VERTICAL);
        cell.setGravity(Gravity.CENTER);
        cell.setPadding(dp(2), dp(2), dp(2), dp(2));
        cell.setClickable(true);
        cell.setOnClickListener(v -> launch(app));
        cell.setOnLongClickListener(v -> { showAppActions(app); return true; });

        FrameLayout iconFrame = new FrameLayout(this);
        iconFrame.setBackground(roundRect(Color.TRANSPARENT, 15));
        iconFrame.setClipToOutline(true);

        ImageView icon = new ImageView(this);
        icon.setImageDrawable(app.icon);
        icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        icon.setPadding(0, 0, 0, 0);
        iconFrame.addView(icon, new FrameLayout.LayoutParams(-1, -1));
        int size = dp(dock ? 57 : 58);
        cell.addView(iconFrame, new LinearLayout.LayoutParams(size, size));

        if (label) {
            TextView name = new TextView(this);
            name.setText(app.label);
            name.setTextColor(Color.WHITE);
            name.setShadowLayer(3f, 0f, 1f, Color.argb(150,0,0,0));
            name.setTextSize(11);
            name.setGravity(Gravity.CENTER);
            name.setSingleLine(true);
            name.setEllipsize(android.text.TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(-1, dp(20));
            np.topMargin = dp(2);
            cell.addView(name, np);
        }
        return cell;
    }

    private void showAppActions(AppInfo app) {
        new AlertDialog.Builder(this)
                .setTitle(app.label)
                .setItems(new String[]{"Abrir", "Informações do app", "Editar Tela de Início"}, (d, which) -> {
                    if (which == 0) launch(app);
                    if (which == 1) {
                        try {
                            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                    android.net.Uri.parse("package:" + app.packageName));
                            startActivity(i);
                        } catch (Exception ignored) {}
                    }
                    if (which == 2) showEditMenu();
                }).show();
    }

    private void showEditMenu() {
        new AlertDialog.Builder(this)
                .setTitle("Editar Tela de Início")
                .setItems(new String[]{"Adicionar widget", "Papéis de parede", "Biblioteca de Apps"}, (d, which) -> {
                    if (which == 0) beginPickWidget();
                    if (which == 1) startActivity(new Intent(this, AuroraSettingsActivity.class).putExtra("section", "wallpaper"));
                    if (which == 2) showAppLibrary();
                }).show();
    }

    private void beginPickWidget() {
        try {
            pendingWidgetId = widgetHost.allocateAppWidgetId();
            Intent pick = new Intent(AppWidgetManager.ACTION_APPWIDGET_PICK);
            pick.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, pendingWidgetId);
            startActivityForResult(pick, REQ_PICK_WIDGET);
        } catch (Exception e) {
            Toast.makeText(this, "Não foi possível abrir os widgets.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK_WIDGET) {
            if (resultCode != RESULT_OK) { cleanupPendingWidget(); return; }
            int id = data != null ? data.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, pendingWidgetId) : pendingWidgetId;
            AppWidgetProviderInfo info = widgetManager.getAppWidgetInfo(id);
            if (info == null) { cleanupPendingWidget(); return; }
            if (!widgetManager.bindAppWidgetIdIfAllowed(id, info.provider)) {
                Intent bind = new Intent(AppWidgetManager.ACTION_APPWIDGET_BIND);
                bind.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
                bind.putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER, info.provider);
                pendingWidgetId = id;
                startActivityForResult(bind, REQ_BIND_WIDGET);
            } else {
                configureOrSaveWidget(id, info);
            }
        } else if (requestCode == REQ_BIND_WIDGET) {
            if (resultCode != RESULT_OK) { cleanupPendingWidget(); return; }
            AppWidgetProviderInfo info = widgetManager.getAppWidgetInfo(pendingWidgetId);
            if (info != null) configureOrSaveWidget(pendingWidgetId, info);
        } else if (requestCode == REQ_CONFIG_WIDGET) {
            if (resultCode == RESULT_OK) saveWidget(pendingWidgetId); else cleanupPendingWidget();
        }
    }

    private void configureOrSaveWidget(int id, AppWidgetProviderInfo info) {
        pendingWidgetId = id;
        if (info.configure != null) {
            try {
                Intent config = new Intent(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE);
                config.setComponent(info.configure);
                config.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
                startActivityForResult(config, REQ_CONFIG_WIDGET);
                return;
            } catch (Exception ignored) {}
        }
        saveWidget(id);
    }

    private void saveWidget(int id) {
        int old = getPreferences().getInt(KEY_WIDGET, -1);
        if (old > 0 && old != id) try { widgetHost.deleteAppWidgetId(old); } catch (Exception ignored) {}
        getPreferences().edit().putInt(KEY_WIDGET, id).apply();
        pendingWidgetId = -1;
        buildHome();
    }

    private void cleanupPendingWidget() {
        if (pendingWidgetId > 0) try { widgetHost.deleteAppWidgetId(pendingWidgetId); } catch (Exception ignored) {}
        pendingWidgetId = -1;
    }

    private void showAppLibrary() {
        Dialog dialog = new Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        FrameLayout page = new FrameLayout(this);
        page.setBackground(new HomeBackgroundDrawable(true));

        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18), dp(50), dp(18), dp(18));
        page.addView(body, new FrameLayout.LayoutParams(-1, -1));

        TextView title = new TextView(this);
        title.setText("Biblioteca de Apps");
        title.setTextSize(28);
        title.setTextColor(Color.WHITE);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        body.addView(title);

        EditText search = new EditText(this);
        search.setHint("Buscar");
        search.setHintTextColor(Color.argb(170,255,255,255));
        search.setTextColor(Color.WHITE);
        search.setSingleLine(true);
        search.setTextSize(16);
        search.setPadding(dp(16), 0, dp(16), 0);
        search.setBackground(roundRect(Color.argb(90,255,255,255), 16));
        LinearLayout.LayoutParams searchP = new LinearLayout.LayoutParams(-1, dp(46));
        searchP.setMargins(0, dp(14), 0, dp(12));
        body.addView(search, searchP);

        ScrollView scroll = new ScrollView(this);
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        grid.setPadding(0, dp(4), 0, dp(24));
        scroll.addView(grid, new ScrollView.LayoutParams(-1, -2));
        body.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1f));
        fillLibrary(grid, "");
        search.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            public void onTextChanged(CharSequence s, int start, int before, int count) { fillLibrary(grid, s.toString()); }
            public void afterTextChanged(Editable s) {}
        });

        TextView close = new TextView(this);
        close.setText("Concluído");
        close.setGravity(Gravity.CENTER);
        close.setTextColor(Color.WHITE);
        close.setTextSize(15);
        close.setBackground(roundRect(Color.argb(82,255,255,255), 20));
        close.setOnClickListener(v -> dialog.dismiss());
        body.addView(close, new LinearLayout.LayoutParams(-1, dp(46)));

        dialog.setContentView(page);
        dialog.show();
        Window w = dialog.getWindow();
        if (w != null) {
            w.setLayout(-1, -1);
            w.setStatusBarColor(Color.TRANSPARENT);
            w.setNavigationBarColor(Color.TRANSPARENT);
        }
    }

    private void fillLibrary(GridLayout grid, String qRaw) {
        grid.removeAllViews();
        String q = qRaw == null ? "" : qRaw.trim().toLowerCase(ptBR);
        int index = 0;
        for (AppInfo app : apps) {
            if (!q.isEmpty() && !app.label.toLowerCase(ptBR).contains(q)) continue;
            View tile = appTile(app, true, false);
            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(index % 4, 1, 1f);
            gp.width = 0;
            gp.height = dp(92);
            gp.setMargins(dp(2), dp(4), dp(2), dp(4));
            tile.setLayoutParams(gp);
            grid.addView(tile);
            index++;
        }
    }

    private void loadApps() {
        apps.clear();
        PackageManager pm = getPackageManager();
        Intent query = new Intent(Intent.ACTION_MAIN);
        query.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> found = pm.queryIntentActivities(query, 0);
        Set<String> seen = new HashSet<>();
        for (ResolveInfo r : found) {
            String pkg = r.activityInfo.packageName;
            if (!seen.add(pkg)) continue;
            CharSequence label = r.loadLabel(pm);
            apps.add(new AppInfo(label == null ? pkg : label.toString(), pkg, r.activityInfo.name, r.loadIcon(pm)));
        }
        Collator c = Collator.getInstance(ptBR);
        apps.sort((a,b) -> c.compare(a.label, b.label));
    }

    private List<AppInfo> pickHomeApps(int max) {
        List<AppInfo> out = new ArrayList<>();
        String[] priorities = {"Telefone","Phone","Mensagens","Messages","WhatsApp","Câmera","Camera","Fotos","Photos",
                "Galeria","Gallery","Chrome","Safari","Mapas","Maps","YouTube","Música","Music","Spotify",
                "Calendário","Calendar","Notas","Notes","Relógio","Clock","Clima","Weather","Configurações","Settings"};
        for (String p : priorities) {
            AppInfo found = findByLabel(p);
            if (found != null && !out.contains(found) && out.size() < max) out.add(found);
        }
        for (AppInfo a : apps) if (!out.contains(a) && !a.packageName.equals(getPackageName()) && out.size() < max) out.add(a);
        return out;
    }

    private List<AppInfo> pickDockApps() {
        List<AppInfo> out = new ArrayList<>();
        String[] priorities = {"Telefone","Phone","Mensagens","Messages","Chrome","Câmera","Camera","WhatsApp"};
        for (String p : priorities) {
            AppInfo a = findByLabel(p);
            if (a != null && !out.contains(a) && out.size() < 4) out.add(a);
        }
        for (AppInfo a : apps) if (!out.contains(a) && !a.packageName.equals(getPackageName()) && out.size() < 4) out.add(a);
        return out;
    }

    private AppInfo findByLabel(String wanted) {
        String w = wanted.toLowerCase(ptBR);
        for (AppInfo a : apps) if (a.label.toLowerCase(ptBR).equals(w)) return a;
        for (AppInfo a : apps) if (a.label.toLowerCase(ptBR).contains(w)) return a;
        return null;
    }

    private void launch(AppInfo app) {
        try {
            Intent i = new Intent(Intent.ACTION_MAIN);
            i.addCategory(Intent.CATEGORY_LAUNCHER);
            i.setComponent(new ComponentName(app.packageName, app.activityName));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = getPackageManager().getLaunchIntentForPackage(app.packageName);
                if (i != null) startActivity(i);
            } catch (Exception ignored) {}
        }
    }

    private void updateStatus() {
        if (statusTime != null) statusTime.setText(new SimpleDateFormat("HH:mm", ptBR).format(new Date()));
        if (statusBattery != null) {
            int level = 0;
            try {
                BatteryManager bm = (BatteryManager)getSystemService(BATTERY_SERVICE);
                level = bm != null ? bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) : 0;
            } catch (Exception ignored) {}
            statusBattery.setText("●●●   ᯤ   " + Math.max(0, level) + "%");
        }
    }

    private SharedPreferences getPreferences() { return getSharedPreferences(PREFS, MODE_PRIVATE); }

    private GradientDrawable roundRect(int color, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }

    private int dp(float n) { return (int)(n * getResources().getDisplayMetrics().density + .5f); }

    private static class AppInfo {
        final String label, packageName, activityName;
        final Drawable icon;
        AppInfo(String l, String p, String a, Drawable i) { label=l; packageName=p; activityName=a; icon=i; }
    }

    private class HomeBackgroundDrawable extends Drawable {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final boolean dark;
        HomeBackgroundDrawable(boolean d) { dark = d; }

        @Override public void draw(Canvas canvas) {
            int w = getBounds().width(), h = getBounds().height();
            int style = getSharedPreferences(AuroraSettingsActivity.PREFS, MODE_PRIVATE)
                    .getInt(AuroraSettingsActivity.KEY_STYLE, 0);
            int start, end, glow1, glow2;
            if (style == 1) {
                start = Color.rgb(18,65,103); end = Color.rgb(76,118,155);
                glow1 = Color.argb(170,104,194,220); glow2 = Color.argb(155,93,126,203);
            } else if (style == 2) {
                start = Color.rgb(18,20,24); end = Color.rgb(47,49,55);
                glow1 = Color.argb(105,120,132,150); glow2 = Color.argb(95,64,100,111);
            } else {
                start = Color.rgb(43,64,94); end = Color.rgb(110,83,127);
                glow1 = Color.argb(165,136,205,224); glow2 = Color.argb(150,57,143,158);
            }
            if (dark) { start = Color.rgb(18,22,30); end = Color.rgb(42,35,57); }
            p.setShader(new LinearGradient(0,0,w,h,start,end, Shader.TileMode.CLAMP));
            canvas.drawRect(0,0,w,h,p);
            p.setShader(new RadialGradient(w*.18f,h*.28f,w*.55f,glow1,
                    Color.TRANSPARENT, Shader.TileMode.CLAMP));
            canvas.drawCircle(w*.18f,h*.28f,w*.55f,p);
            p.setShader(new RadialGradient(w*.84f,h*.72f,w*.62f,glow2,
                    Color.TRANSPARENT, Shader.TileMode.CLAMP));
            canvas.drawCircle(w*.84f,h*.72f,w*.62f,p);
            p.setShader(null);
        }
        @Override public void setAlpha(int alpha) { p.setAlpha(alpha); }
        @Override public void setColorFilter(android.graphics.ColorFilter cf) { p.setColorFilter(cf); }
        @Override public int getOpacity() { return android.graphics.PixelFormat.OPAQUE; }
    }
}
