package com.rochatech.aurora;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.app.Activity;
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
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
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
import android.widget.HorizontalScrollView;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
    private final Handler statusHandler = new Handler();
    private final List<View> editableIcons = new ArrayList<>();
    private FrameLayout root;
    private Pager pager;
    private LinearLayout pageStrip;
    private LinearLayout dots;
    private TextView statusTime;
    private TextView statusBattery;
    private AppWidgetHost widgetHost;
    private AppWidgetManager widgetManager;
    private int pendingWidgetId = -1;
    private int homePageCount = 1;
    private int screenWidth;
    private boolean editing = false;

    private final Runnable statusTick = new Runnable() {
        @Override public void run() {
            updateStatus();
            statusHandler.postDelayed(this, 60_000L);
        }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        configureWindow();
        screenWidth = getResources().getDisplayMetrics().widthPixels;
        widgetHost = new AppWidgetHost(this, HOST_ID);
        widgetManager = AppWidgetManager.getInstance(this);
        loadApps();
        buildHome();
        if (getIntent().getBooleanExtra("openEditor", false)) root.postDelayed(this::enterEditMode, 220);
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
        if (root != null && !editing) buildHome();
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
        editing = false;
        editableIcons.clear();
        root = new FrameLayout(this);
        root.setBackground(new HomeBackgroundDrawable(false));
        root.setOnLongClickListener(v -> { enterEditMode(); return true; });

        LinearLayout vertical = new LinearLayout(this);
        vertical.setOrientation(LinearLayout.VERTICAL);
        root.addView(vertical, new FrameLayout.LayoutParams(-1, -1));

        vertical.addView(buildStatusBar(), new LinearLayout.LayoutParams(-1, dp(50)));

        pager = new Pager(this);
        pager.setHorizontalScrollBarEnabled(false);
        pager.setOverScrollMode(View.OVER_SCROLL_NEVER);
        pager.setFillViewport(true);
        pageStrip = new LinearLayout(this);
        pageStrip.setOrientation(LinearLayout.HORIZONTAL);
        pager.addView(pageStrip, new HorizontalScrollView.LayoutParams(-2, -1));

        List<AppInfo> dockApps = pickDockApps();
        List<AppInfo> pageApps = new ArrayList<>();
        for (AppInfo app : apps) if (!dockApps.contains(app)) pageApps.add(app);

        int widgetId = getPreferences().getInt(KEY_WIDGET, -1);
        AppWidgetProviderInfo widgetInfo = widgetId > 0 ? widgetManager.getAppWidgetInfo(widgetId) : null;
        boolean hasWidget = widgetInfo != null;
        int firstCapacity = hasWidget ? 16 : 24;
        int remaining = Math.max(0, pageApps.size() - firstCapacity);
        homePageCount = Math.max(1, 1 + (int)Math.ceil(remaining / 24.0));

        int cursor = 0;
        for (int p = 0; p < homePageCount; p++) {
            int cap = p == 0 ? firstCapacity : 24;
            List<AppInfo> slice = new ArrayList<>();
            while (cursor < pageApps.size() && slice.size() < cap) slice.add(pageApps.get(cursor++));
            pageStrip.addView(buildAppPage(slice, p == 0 ? widgetInfo : null),
                    new LinearLayout.LayoutParams(screenWidth, -1));
        }
        pageStrip.addView(buildLibraryPage(), new LinearLayout.LayoutParams(screenWidth, -1));

        LinearLayout.LayoutParams pagerP = new LinearLayout.LayoutParams(-1, 0, 1f);
        vertical.addView(pager, pagerP);

        LinearLayout lower = new LinearLayout(this);
        lower.setOrientation(LinearLayout.VERTICAL);
        lower.setGravity(Gravity.CENTER_HORIZONTAL);
        lower.setPadding(dp(10), 0, dp(10), dp(10));
        lower.addView(buildPageIndicator(), new LinearLayout.LayoutParams(-1, dp(34)));
        lower.addView(buildDock(dockApps), new LinearLayout.LayoutParams(-1, dp(82)));
        vertical.addView(lower, new LinearLayout.LayoutParams(-1, dp(126)));

        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int bottom = insets.getSystemWindowInsetBottom();
            lower.setPadding(dp(10), 0, dp(10), Math.max(dp(8), bottom));
            return insets;
        });

        setContentView(root);
        pager.setPageCount(homePageCount + 1);
        pager.setOnPageChangedListener(this::updatePageIndicator);
        updatePageIndicator(0);
    }

    private View buildStatusBar() {
        FrameLayout status = new FrameLayout(this);
        status.setPadding(dp(18), dp(6), dp(18), 0);

        statusTime = new TextView(this);
        statusTime.setTextColor(Color.WHITE);
        statusTime.setTextSize(15);
        statusTime.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        statusTime.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        status.addView(statusTime, new FrameLayout.LayoutParams(dp(92), -1, Gravity.START));

        View island = new View(this);
        island.setBackground(roundRect(Color.BLACK, 22));
        FrameLayout.LayoutParams islandP = new FrameLayout.LayoutParams(dp(112), dp(34), Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        islandP.topMargin = dp(2);
        status.addView(island, islandP);

        statusBattery = new TextView(this);
        statusBattery.setTextColor(Color.WHITE);
        statusBattery.setTextSize(12);
        statusBattery.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        statusBattery.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        status.addView(statusBattery, new FrameLayout.LayoutParams(dp(120), -1, Gravity.END));
        updateStatus();
        return status;
    }

    private View buildAppPage(List<AppInfo> pageApps, AppWidgetProviderInfo widgetInfo) {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(14), dp(6), dp(14), 0);
        page.setGravity(Gravity.TOP);
        page.setOnLongClickListener(v -> { enterEditMode(); return true; });

        if (widgetInfo != null) {
            int widgetId = getPreferences().getInt(KEY_WIDGET, -1);
            FrameLayout frame = new FrameLayout(this);
            frame.setBackground(roundRect(Color.argb(34, 255, 255, 255), 23));
            frame.setClipToOutline(true);
            AppWidgetHostView hostView = widgetHost.createView(this, widgetId, widgetInfo);
            hostView.setAppWidget(widgetId, widgetInfo);
            frame.addView(hostView, new FrameLayout.LayoutParams(-1, -1));
            LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-1, dp(164));
            wp.setMargins(dp(3), 0, dp(3), dp(8));
            page.addView(frame, wp);
        }

        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        int rows = widgetInfo == null ? 6 : 4;
        grid.setRowCount(rows);
        grid.setAlignmentMode(GridLayout.ALIGN_BOUNDS);
        for (int i = 0; i < pageApps.size(); i++) {
            View tile = appTile(pageApps.get(i), true, false);
            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(i % 4, 1, 1f);
            gp.rowSpec = GridLayout.spec(i / 4, 1, 1f);
            gp.width = 0;
            gp.height = 0;
            gp.setMargins(dp(3), dp(1), dp(3), dp(1));
            tile.setLayoutParams(gp);
            grid.addView(tile);
        }
        page.addView(grid, new LinearLayout.LayoutParams(-1, 0, 1f));
        return page;
    }

    private View buildDock(List<AppInfo> dockApps) {
        LinearLayout dock = new LinearLayout(this);
        dock.setOrientation(LinearLayout.HORIZONTAL);
        dock.setGravity(Gravity.CENTER);
        dock.setPadding(dp(10), dp(8), dp(10), dp(8));
        dock.setBackground(roundRect(Color.argb(142, 235, 238, 243), 32));
        dock.setElevation(dp(7));
        for (AppInfo app : dockApps) {
            View tile = appTile(app, false, true);
            dock.addView(tile, new LinearLayout.LayoutParams(0, -1, 1f));
        }
        return dock;
    }

    private View buildPageIndicator() {
        FrameLayout holder = new FrameLayout(this);
        dots = new LinearLayout(this);
        dots.setOrientation(LinearLayout.HORIZONTAL);
        dots.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams dpv = new FrameLayout.LayoutParams(-2, dp(28), Gravity.CENTER);
        holder.addView(dots, dpv);
        for (int i = 0; i < homePageCount; i++) {
            View dot = new View(this);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(7), dp(7));
            p.setMargins(dp(3), 0, dp(3), 0);
            dots.addView(dot, p);
        }
        TextView search = new TextView(this);
        search.setText("⌕");
        search.setTextSize(18);
        search.setTextColor(Color.WHITE);
        search.setGravity(Gravity.CENTER);
        search.setBackground(roundRect(Color.argb(68, 30, 32, 38), 15));
        search.setOnClickListener(v -> pager.goToPage(homePageCount));
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(dp(30), dp(26), Gravity.END | Gravity.CENTER_VERTICAL);
        sp.rightMargin = dp(5);
        holder.addView(search, sp);
        return holder;
    }

    private void updatePageIndicator(int page) {
        if (dots == null) return;
        for (int i = 0; i < dots.getChildCount(); i++) {
            View d = dots.getChildAt(i);
            int alpha = (page == i) ? 235 : 95;
            d.setBackground(roundRect(Color.argb(alpha, 255, 255, 255), 4));
        }
        dots.setAlpha(page >= homePageCount ? .35f : 1f);
    }

    private View appTile(AppInfo app, boolean label, boolean dock) {
        LinearLayout cell = new LinearLayout(this);
        cell.setOrientation(LinearLayout.VERTICAL);
        cell.setGravity(Gravity.CENTER);
        cell.setPadding(dp(2), dp(1), dp(2), dp(1));
        cell.setClickable(true);
        cell.setOnClickListener(v -> {
            if (editing) return;
            launch(app);
        });
        cell.setOnLongClickListener(v -> {
            if (!editing) enterEditMode();
            return true;
        });

        FrameLayout iconFrame = new FrameLayout(this);
        iconFrame.setBackground(roundRect(Color.TRANSPARENT, 15));
        iconFrame.setClipToOutline(true);

        ImageView icon = new ImageView(this);
        icon.setImageDrawable(makeIosIcon(app));
        icon.setScaleType(ImageView.ScaleType.FIT_XY);
        iconFrame.addView(icon, new FrameLayout.LayoutParams(-1, -1));
        int size = dp(dock ? 58 : 59);
        cell.addView(iconFrame, new LinearLayout.LayoutParams(size, size));

        if (label) {
            TextView name = new TextView(this);
            name.setText(app.label);
            name.setTextColor(Color.WHITE);
            name.setShadowLayer(3f, 0f, 1f, Color.argb(155, 0, 0, 0));
            name.setTextSize(11);
            name.setGravity(Gravity.CENTER);
            name.setSingleLine(true);
            name.setEllipsize(android.text.TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(-1, dp(19));
            np.topMargin = dp(3);
            cell.addView(name, np);
        }
        editableIcons.add(cell);
        return cell;
    }

    private Drawable makeIosIcon(AppInfo app) {
        String n = normalize(app.label);
        int kind = 0;
        if (contains(n, "telefone", "phone")) kind = 1;
        else if (contains(n, "mensag", "messages")) kind = 2;
        else if (contains(n, "camera", "câmera")) kind = 3;
        else if (contains(n, "foto", "photos", "galeria", "gallery")) kind = 4;
        else if (contains(n, "calend", "calendar")) kind = 5;
        else if (contains(n, "nota", "notes")) kind = 6;
        else if (contains(n, "ajustes", "configura", "settings")) kind = 7;
        else if (contains(n, "relog", "relóg", "clock")) kind = 8;
        else if (contains(n, "mapas", "maps")) kind = 9;
        else if (contains(n, "music", "música")) kind = 10;
        else if (contains(n, "clima", "weather")) kind = 11;
        else if (contains(n, "mail", "email", "gmail")) kind = 12;
        else if (contains(n, "chrome", "internet", "browser", "safari")) kind = 13;
        return new IosIconDrawable(kind, app.icon);
    }

    private void enterEditMode() {
        if (editing) return;
        editing = true;
        for (View v : editableIcons) startWiggle(v);
        showEditOverlay();
    }

    private void leaveEditMode() {
        editing = false;
        for (View v : editableIcons) {
            v.animate().cancel();
            v.setRotation(0f);
            v.setScaleX(1f);
            v.setScaleY(1f);
        }
        View overlay = root.findViewWithTag("edit_overlay");
        if (overlay != null) root.removeView(overlay);
    }

    private void startWiggle(View v) {
        ObjectAnimator r = ObjectAnimator.ofFloat(v, View.ROTATION, -1.2f, 1.2f);
        r.setDuration(120);
        r.setRepeatMode(ObjectAnimator.REVERSE);
        r.setRepeatCount(ObjectAnimator.INFINITE);
        r.start();
    }

    private void showEditOverlay() {
        LinearLayout bar = new LinearLayout(this);
        bar.setTag("edit_overlay");
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(12), dp(7), dp(12), dp(7));
        bar.setBackground(roundRect(Color.argb(235, 245, 245, 247), 24));
        bar.setElevation(dp(18));

        TextView add = editButton("＋", "Widget", v -> beginPickWidget());
        TextView wallpaper = editButton("◉", "Fundo", v -> startActivity(new Intent(this, AuroraSettingsActivity.class).putExtra("section", "wallpaper")));
        TextView done = editButton("✓", "OK", v -> leaveEditMode());
        bar.addView(add, new LinearLayout.LayoutParams(0, -1, 1f));
        bar.addView(wallpaper, new LinearLayout.LayoutParams(0, -1, 1f));
        bar.addView(done, new LinearLayout.LayoutParams(0, -1, 1f));

        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-1, dp(66), Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        p.leftMargin = dp(18);
        p.rightMargin = dp(18);
        p.topMargin = dp(54);
        root.addView(bar, p);
    }

    private TextView editButton(String icon, String label, View.OnClickListener click) {
        TextView b = new TextView(this);
        b.setText(icon + "  " + label);
        b.setTextSize(14);
        b.setTextColor(Color.rgb(25, 25, 27));
        b.setGravity(Gravity.CENTER);
        b.setOnClickListener(click);
        return b;
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
            } else configureOrSaveWidget(id, info);
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

    private View buildLibraryPage() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(18), dp(2), dp(18), dp(4));

        TextView title = new TextView(this);
        title.setText("Biblioteca de Apps");
        title.setTextSize(28);
        title.setTextColor(Color.WHITE);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        page.addView(title, new LinearLayout.LayoutParams(-1, dp(44)));

        EditText search = new EditText(this);
        search.setHint("Buscar");
        search.setHintTextColor(Color.argb(165, 255, 255, 255));
        search.setTextColor(Color.WHITE);
        search.setSingleLine(true);
        search.setTextSize(16);
        search.setPadding(dp(16), 0, dp(16), 0);
        search.setBackground(roundRect(Color.argb(90, 255, 255, 255), 16));
        page.addView(search, new LinearLayout.LayoutParams(-1, dp(46)));

        ScrollView scroll = new ScrollView(this);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, dp(12), 0, dp(16));
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));
        page.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1f));
        fillLibraryCategories(content);

        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                String q = s == null ? "" : s.toString().trim();
                if (q.isEmpty()) fillLibraryCategories(content); else fillLibrarySearch(content, q);
            }
            @Override public void afterTextChanged(Editable s) {}
        });
        return page;
    }

    private void fillLibraryCategories(LinearLayout content) {
        content.removeAllViews();
        Map<String, List<AppInfo>> groups = categorizeApps();
        List<Map.Entry<String, List<AppInfo>>> entries = new ArrayList<>(groups.entrySet());
        for (int i = 0; i < entries.size(); i += 2) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.TOP);
            row.addView(categoryCard(entries.get(i).getKey(), entries.get(i).getValue()),
                    new LinearLayout.LayoutParams(0, dp(194), 1f));
            if (i + 1 < entries.size()) {
                LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(dp(12), 1);
                View spacer = new View(this);
                row.addView(spacer, gap);
                row.addView(categoryCard(entries.get(i + 1).getKey(), entries.get(i + 1).getValue()),
                        new LinearLayout.LayoutParams(0, dp(194), 1f));
            }
            LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-1, dp(204));
            content.addView(row, rp);
        }
    }

    private View categoryCard(String name, List<AppInfo> group) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(10), dp(9), dp(10), dp(8));
        card.setBackground(roundRect(Color.argb(68, 255, 255, 255), 23));
        TextView title = new TextView(this);
        title.setText(name);
        title.setTextColor(Color.WHITE);
        title.setTextSize(14);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        card.addView(title, new LinearLayout.LayoutParams(-1, dp(24)));
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(2);
        int count = Math.min(4, group.size());
        for (int i = 0; i < count; i++) {
            View tile = libraryMiniTile(group.get(i));
            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(i % 2, 1, 1f);
            gp.rowSpec = GridLayout.spec(i / 2, 1, 1f);
            gp.width = 0;
            gp.height = 0;
            gp.setMargins(dp(3), dp(3), dp(3), dp(3));
            tile.setLayoutParams(gp);
            grid.addView(tile);
        }
        card.addView(grid, new LinearLayout.LayoutParams(-1, 0, 1f));
        return card;
    }

    private View libraryMiniTile(AppInfo app) {
        FrameLayout wrap = new FrameLayout(this);
        ImageView icon = new ImageView(this);
        icon.setImageDrawable(makeIosIcon(app));
        icon.setScaleType(ImageView.ScaleType.FIT_XY);
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(dp(54), dp(54), Gravity.CENTER);
        wrap.addView(icon, p);
        wrap.setOnClickListener(v -> launch(app));
        return wrap;
    }

    private void fillLibrarySearch(LinearLayout content, String raw) {
        content.removeAllViews();
        String q = normalize(raw);
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        int idx = 0;
        for (AppInfo app : apps) {
            if (!normalize(app.label).contains(q)) continue;
            View tile = appTile(app, true, false);
            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(idx % 4, 1, 1f);
            gp.width = 0;
            gp.height = dp(94);
            gp.setMargins(dp(2), dp(4), dp(2), dp(4));
            tile.setLayoutParams(gp);
            grid.addView(tile);
            idx++;
        }
        content.addView(grid, new LinearLayout.LayoutParams(-1, -2));
    }

    private Map<String, List<AppInfo>> categorizeApps() {
        LinkedHashMap<String, List<AppInfo>> map = new LinkedHashMap<>();
        map.put("Sugestões", new ArrayList<>());
        map.put("Adicionados Recentemente", new ArrayList<>());
        map.put("Redes Sociais", new ArrayList<>());
        map.put("Entretenimento", new ArrayList<>());
        map.put("Produtividade", new ArrayList<>());
        map.put("Utilitários", new ArrayList<>());
        map.put("Criatividade", new ArrayList<>());
        map.put("Outros", new ArrayList<>());

        for (int i = 0; i < apps.size() && map.get("Sugestões").size() < 4; i++) map.get("Sugestões").add(apps.get(i));
        for (int i = Math.max(0, apps.size() - 4); i < apps.size(); i++) map.get("Adicionados Recentemente").add(apps.get(i));

        for (AppInfo app : apps) {
            String n = normalize(app.label + " " + app.packageName);
            String key;
            if (contains(n, "whatsapp", "instagram", "facebook", "telegram", "messenger", "tiktok", "threads", "x.com")) key = "Redes Sociais";
            else if (contains(n, "youtube", "netflix", "spotify", "prime", "disney", "music", "música", "games", "jogo")) key = "Entretenimento";
            else if (contains(n, "gmail", "outlook", "drive", "docs", "sheets", "office", "notion", "chatgpt", "calendar", "calend")) key = "Produtividade";
            else if (contains(n, "camera", "câmera", "clock", "relog", "calcul", "settings", "configura", "files", "arquivo", "phone", "telefone", "maps", "mapas")) key = "Utilitários";
            else if (contains(n, "photo", "foto", "gallery", "galeria", "canva", "editor", "capcut")) key = "Criatividade";
            else key = "Outros";
            if (!map.get(key).contains(app)) map.get(key).add(app);
        }
        return map;
    }

    private void loadApps() {
        apps.clear();
        PackageManager pm = getPackageManager();
        Intent query = new Intent(Intent.ACTION_MAIN);
        query.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> found = pm.queryIntentActivities(query, 0);
        Set<String> seen = new HashSet<>();
        for (ResolveInfo r : found) {
            String key = r.activityInfo.packageName + "/" + r.activityInfo.name;
            if (!seen.add(key)) continue;
            CharSequence label = r.loadLabel(pm);
            apps.add(new AppInfo(label == null ? r.activityInfo.packageName : label.toString(),
                    r.activityInfo.packageName, r.activityInfo.name, r.loadIcon(pm)));
        }
        Collator c = Collator.getInstance(ptBR);
        apps.sort((a, b) -> c.compare(a.label, b.label));
    }

    private List<AppInfo> pickDockApps() {
        List<AppInfo> out = new ArrayList<>();
        String[] priorities = {"Telefone", "Phone", "Mensagens", "Messages", "Safari", "Chrome", "Música", "Music", "WhatsApp"};
        for (String p : priorities) {
            AppInfo a = findByLabel(p);
            if (a != null && !out.contains(a) && out.size() < 4) out.add(a);
        }
        for (AppInfo a : apps) if (!out.contains(a) && out.size() < 4) out.add(a);
        return out;
    }

    private AppInfo findByLabel(String wanted) {
        String w = normalize(wanted);
        for (AppInfo a : apps) if (normalize(a.label).equals(w)) return a;
        for (AppInfo a : apps) if (normalize(a.label).contains(w)) return a;
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
            statusBattery.setText("▮▮▮   5G   " + Math.max(0, level) + "%");
        }
    }

    private SharedPreferences getPreferences() { return getSharedPreferences(PREFS, MODE_PRIVATE); }

    private String normalize(String s) { return s == null ? "" : s.toLowerCase(ptBR); }
    private boolean contains(String s, String... terms) {
        for (String t : terms) if (s.contains(t)) return true;
        return false;
    }

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
        AppInfo(String l, String p, String a, Drawable i) { label = l; packageName = p; activityName = a; icon = i; }
    }

    private class Pager extends HorizontalScrollView {
        private int count = 1;
        private int page = 0;
        private PageChangedListener listener;
        Pager(android.content.Context c) { super(c); }
        void setPageCount(int c) { count = Math.max(1, c); }
        void setOnPageChangedListener(PageChangedListener l) { listener = l; }
        void goToPage(int p) {
            page = Math.max(0, Math.min(count - 1, p));
            smoothScrollTo(page * screenWidth, 0);
            if (listener != null) listener.onChanged(page);
        }
        @Override public boolean onTouchEvent(MotionEvent e) {
            boolean r = super.onTouchEvent(e);
            if (e.getAction() == MotionEvent.ACTION_UP || e.getAction() == MotionEvent.ACTION_CANCEL) {
                int target = Math.round(getScrollX() / (float)screenWidth);
                goToPage(target);
            }
            return r;
        }
        @Override protected void onScrollChanged(int l, int t, int oldl, int oldt) {
            super.onScrollChanged(l, t, oldl, oldt);
            int p = Math.round(l / (float)Math.max(1, screenWidth));
            if (p != page) {
                page = Math.max(0, Math.min(count - 1, p));
                if (listener != null) listener.onChanged(page);
            }
        }
    }

    private interface PageChangedListener { void onChanged(int page); }

    private class IosIconDrawable extends Drawable {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int kind;
        private final Drawable fallback;
        IosIconDrawable(int kind, Drawable fallback) { this.kind = kind; this.fallback = fallback; }

        @Override public void draw(Canvas c) {
            RectF r = new RectF(getBounds());
            float rad = r.width() * .23f;
            p.setShader(null);
            p.setStyle(Paint.Style.FILL);
            int bg = Color.rgb(242, 242, 247);
            if (kind == 1 || kind == 2) bg = Color.rgb(52, 199, 89);
            else if (kind == 3) bg = Color.rgb(232, 232, 237);
            else if (kind == 8) bg = Color.rgb(20, 20, 22);
            else if (kind == 10) bg = Color.rgb(252, 55, 95);
            else if (kind == 11 || kind == 12) bg = Color.rgb(0, 122, 255);
            c.drawRoundRect(r, rad, rad, paint(bg));

            float w = r.width(), h = r.height(), cx = r.centerX(), cy = r.centerY();
            if (kind == 0 || kind == 9 || kind == 13) {
                if (fallback != null) {
                    int inset = (int)(w * .07f);
                    fallback.setBounds((int)r.left + inset, (int)r.top + inset, (int)r.right - inset, (int)r.bottom - inset);
                    fallback.draw(c);
                }
                return;
            }
            if (kind == 1) {
                p.setColor(Color.WHITE); p.setStrokeWidth(w*.10f); p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND);
                Path path = new Path(); path.moveTo(cx-w*.22f, cy-h*.22f); path.cubicTo(cx-w*.10f, cy+h*.10f, cx+w*.02f, cy+h*.20f, cx+w*.24f, cy+h*.23f); c.drawPath(path,p);
                p.setStyle(Paint.Style.FILL);
            } else if (kind == 2) {
                p.setColor(Color.WHITE); RectF b = new RectF(cx-w*.26f, cy-h*.20f, cx+w*.26f, cy+h*.15f); c.drawOval(b,p);
                Path tail = new Path(); tail.moveTo(cx-w*.10f, cy+h*.10f); tail.lineTo(cx-w*.18f, cy+h*.25f); tail.lineTo(cx+w*.02f, cy+h*.14f); c.drawPath(tail,p);
            } else if (kind == 3) {
                p.setColor(Color.rgb(35,35,38)); c.drawCircle(cx,cy,w*.25f,p); p.setColor(Color.rgb(90,90,95)); c.drawCircle(cx,cy,w*.15f,p); p.setColor(Color.rgb(210,210,215)); c.drawCircle(cx-w*.22f,cy-h*.22f,w*.06f,p);
            } else if (kind == 4) {
                p.setColor(Color.WHITE); c.drawRoundRect(r,rad,rad,p);
                int[] cols = {0xFFFF3B30,0xFFFF9500,0xFFFFCC00,0xFF34C759,0xFF00C7BE,0xFF007AFF,0xFF5856D6,0xFFAF52DE};
                for(int i=0;i<8;i++){ double a=Math.PI*2*i/8; p.setColor(cols[i]); c.drawCircle(cx+(float)Math.cos(a)*w*.16f, cy+(float)Math.sin(a)*h*.16f, w*.11f,p); }
                p.setColor(Color.WHITE); c.drawCircle(cx,cy,w*.07f,p);
            } else if (kind == 5) {
                p.setColor(Color.WHITE); c.drawRoundRect(r,rad,rad,p); p.setColor(Color.rgb(255,59,48)); c.drawRoundRect(new RectF(r.left,r.top,r.right,r.top+h*.28f),rad,rad,p); c.drawRect(r.left,r.top+h*.15f,r.right,r.top+h*.29f,p);
                p.setColor(Color.rgb(35,35,38)); p.setTextAlign(Paint.Align.CENTER); p.setTextSize(w*.36f); p.setTypeface(android.graphics.Typeface.DEFAULT_BOLD); c.drawText(new SimpleDateFormat("d",ptBR).format(new Date()),cx,cy+h*.23f,p); p.setTypeface(null);
            } else if (kind == 6) {
                p.setColor(Color.WHITE); c.drawRoundRect(r,rad,rad,p); p.setColor(Color.rgb(255,204,0)); c.drawRect(r.left,r.top,r.right,r.top+h*.23f,p); p.setColor(Color.rgb(190,190,195)); p.setStrokeWidth(w*.03f); for(int i=0;i<4;i++) c.drawLine(r.left+w*.18f,r.top+h*(.38f+i*.12f),r.right-w*.14f,r.top+h*(.38f+i*.12f),p);
            } else if (kind == 7) {
                p.setColor(Color.rgb(142,142,147)); c.drawCircle(cx,cy,w*.27f,p); p.setColor(Color.rgb(242,242,247)); c.drawCircle(cx,cy,w*.13f,p); p.setColor(Color.rgb(142,142,147)); c.drawCircle(cx,cy,w*.065f,p);
                p.setStrokeWidth(w*.075f); for(int i=0;i<8;i++){ double a=Math.PI*2*i/8; c.drawLine(cx+(float)Math.cos(a)*w*.25f,cy+(float)Math.sin(a)*w*.25f,cx+(float)Math.cos(a)*w*.34f,cy+(float)Math.sin(a)*w*.34f,p); }
            } else if (kind == 8) {
                p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(w*.035f); p.setColor(Color.WHITE); c.drawCircle(cx,cy,w*.32f,p); p.setStrokeCap(Paint.Cap.ROUND); c.drawLine(cx,cy,cx,cy-h*.19f,p); c.drawLine(cx,cy,cx+w*.14f,cy+h*.10f,p); p.setStyle(Paint.Style.FILL);
            } else if (kind == 10) {
                p.setColor(Color.WHITE); p.setTextAlign(Paint.Align.CENTER); p.setTextSize(w*.62f); p.setTypeface(android.graphics.Typeface.DEFAULT_BOLD); c.drawText("♪",cx,cy+h*.22f,p); p.setTypeface(null);
            } else if (kind == 11) {
                p.setColor(Color.rgb(255,204,0)); c.drawCircle(cx-w*.11f,cy-h*.08f,w*.16f,p); p.setColor(Color.WHITE); c.drawCircle(cx+w*.04f,cy+h*.07f,w*.18f,p); c.drawCircle(cx-w*.13f,cy+h*.11f,w*.14f,p); c.drawRect(cx-w*.15f,cy+h*.06f,cx+w*.25f,cy+h*.22f,p);
            } else if (kind == 12) {
                p.setColor(Color.WHITE); RectF env = new RectF(cx-w*.28f,cy-h*.19f,cx+w*.28f,cy+h*.19f); c.drawRoundRect(env,w*.04f,w*.04f,p); p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(w*.035f); p.setColor(Color.rgb(0,122,255)); Path path=new Path(); path.moveTo(env.left,env.top); path.lineTo(cx,cy+h*.05f); path.lineTo(env.right,env.top); c.drawPath(path,p); p.setStyle(Paint.Style.FILL);
            }
        }

        private Paint paint(int color){ p.setColor(color); p.setStyle(Paint.Style.FILL); p.setShader(null); return p; }
        @Override public void setAlpha(int alpha) { p.setAlpha(alpha); }
        @Override public void setColorFilter(android.graphics.ColorFilter cf) { p.setColorFilter(cf); }
        @Override public int getOpacity() { return android.graphics.PixelFormat.TRANSLUCENT; }
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
                start = Color.rgb(23, 61, 106); end = Color.rgb(95, 121, 164);
                glow1 = Color.argb(178, 102, 194, 230); glow2 = Color.argb(160, 111, 84, 202);
            } else if (style == 2) {
                start = Color.rgb(15, 17, 22); end = Color.rgb(45, 47, 55);
                glow1 = Color.argb(110, 116, 130, 160); glow2 = Color.argb(92, 58, 95, 115);
            } else {
                start = Color.rgb(55, 69, 111); end = Color.rgb(125, 82, 134);
                glow1 = Color.argb(174, 132, 211, 235); glow2 = Color.argb(155, 59, 146, 175);
            }
            if (dark) { start = Color.rgb(18,22,30); end = Color.rgb(42,35,57); }
            p.setShader(new LinearGradient(0,0,w,h,start,end, Shader.TileMode.CLAMP));
            canvas.drawRect(0,0,w,h,p);
            p.setShader(new RadialGradient(w*.14f,h*.22f,w*.60f,glow1,Color.TRANSPARENT, Shader.TileMode.CLAMP));
            canvas.drawCircle(w*.14f,h*.22f,w*.60f,p);
            p.setShader(new RadialGradient(w*.88f,h*.70f,w*.68f,glow2,Color.TRANSPARENT, Shader.TileMode.CLAMP));
            canvas.drawCircle(w*.88f,h*.70f,w*.68f,p);
            p.setShader(null);
        }
        @Override public void setAlpha(int alpha) { p.setAlpha(alpha); }
        @Override public void setColorFilter(android.graphics.ColorFilter cf) { p.setColorFilter(cf); }
        @Override public int getOpacity() { return android.graphics.PixelFormat.OPAQUE; }
    }
}
