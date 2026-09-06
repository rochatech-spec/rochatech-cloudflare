package com.rochatech.aurora;

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
import android.graphics.RadialGradient;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.view.inputmethod.InputMethodManager;
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

public class PremiumLauncherActivity extends Activity {
    private static final int HOST_ID = 27026;
    private static final int REQ_PICK_WIDGET = 8101;
    private static final int REQ_BIND_WIDGET = 8102;
    private static final int REQ_CONFIG_WIDGET = 8103;
    private static final String PREFS = "aurora_home";
    private static final String KEY_WIDGET = "widget_id";

    private final Locale ptBR = new Locale("pt", "BR");
    private final List<AppInfo> apps = new ArrayList<>();
    private final List<View> editableIcons = new ArrayList<>();

    private FrameLayout root;
    private LinearLayout scene;
    private Pager pager;
    private FrameLayout dockLayer;
    private LinearLayout dots;
    private EditText librarySearch;
    private AppWidgetHost widgetHost;
    private AppWidgetManager widgetManager;
    private int pendingWidgetId = -1;
    private int screenWidth;
    private int homePageCount = 1;
    private int firstHomePage = 1;
    private int libraryPage = 2;
    private boolean editing = false;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        configureWindow();
        screenWidth = getResources().getDisplayMetrics().widthPixels;
        widgetHost = new AppWidgetHost(this, HOST_ID);
        widgetManager = AppWidgetManager.getInstance(this);
        loadApps();
        buildHome();
        if (getIntent().getBooleanExtra("openEditor", false)) root.postDelayed(this::enterEditMode, 240);
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getBooleanExtra("openEditor", false) && root != null) root.postDelayed(this::enterEditMode, 180);
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
        hideSystemBars();
        loadApps();
        if (root != null && !editing && root.findViewWithTag("folder_overlay") == null) buildHome();
    }

    private void configureWindow() {
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        hideSystemBars();
    }

    private void hideSystemBars() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN |
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    private void buildHome() {
        editing = false;
        editableIcons.clear();

        root = new FrameLayout(this);
        root.setBackground(new PremiumWallpaperDrawable());
        root.setOnLongClickListener(v -> { enterEditMode(); return true; });

        scene = new LinearLayout(this);
        scene.setOrientation(LinearLayout.VERTICAL);
        root.addView(scene, new FrameLayout.LayoutParams(-1, -1));

        scene.addView(buildStatusBar(), new LinearLayout.LayoutParams(-1, dp(48)));

        pager = new Pager(this);
        pager.setHorizontalScrollBarEnabled(false);
        pager.setOverScrollMode(View.OVER_SCROLL_NEVER);
        pager.setFillViewport(true);

        LinearLayout strip = new LinearLayout(this);
        strip.setOrientation(LinearLayout.HORIZONTAL);
        pager.addView(strip, new HorizontalScrollView.LayoutParams(-2, -1));

        List<AppInfo> dockApps = pickDockApps();
        List<AppInfo> homeApps = orderedHomeApps(dockApps);
        int widgetId = prefs().getInt(KEY_WIDGET, -1);
        AppWidgetProviderInfo widgetInfo = widgetId > 0 ? widgetManager.getAppWidgetInfo(widgetId) : null;
        int firstCapacity = widgetInfo == null ? 24 : 16;
        int remaining = Math.max(0, homeApps.size() - firstCapacity);
        homePageCount = Math.max(1, 1 + (int)Math.ceil(remaining / 24.0));
        firstHomePage = 1;
        libraryPage = firstHomePage + homePageCount;

        strip.addView(buildTodayView(), new LinearLayout.LayoutParams(screenWidth, -1));
        int cursor = 0;
        for (int p = 0; p < homePageCount; p++) {
            int cap = p == 0 ? firstCapacity : 24;
            List<AppInfo> slice = new ArrayList<>();
            while (cursor < homeApps.size() && slice.size() < cap) slice.add(homeApps.get(cursor++));
            strip.addView(buildHomePage(slice, p == 0 ? widgetInfo : null), new LinearLayout.LayoutParams(screenWidth, -1));
        }
        strip.addView(buildLibraryPage(), new LinearLayout.LayoutParams(screenWidth, -1));
        scene.addView(pager, new LinearLayout.LayoutParams(-1, 0, 1f));

        dockLayer = buildDockLayer(dockApps);
        FrameLayout.LayoutParams dlp = new FrameLayout.LayoutParams(-1, dp(122), Gravity.BOTTOM);
        dlp.leftMargin = dp(14);
        dlp.rightMargin = dp(14);
        dlp.bottomMargin = dp(12);
        root.addView(dockLayer, dlp);

        View gesture = new View(this);
        gesture.setBackground(roundRect(Color.argb(145, 28,28,30), 4));
        FrameLayout.LayoutParams gp = new FrameLayout.LayoutParams(dp(132), dp(5), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        gp.bottomMargin = dp(4);
        root.addView(gesture, gp);

        setContentView(root);
        pager.setPageCount(libraryPage + 1);
        pager.setOnPageChangedListener(this::onPageChanged);
        root.post(() -> pager.goToPage(firstHomePage, false));
    }

    private View buildStatusBar() {
        FrameLayout bar = new FrameLayout(this);
        bar.setPadding(dp(20), dp(5), dp(18), 0);

        TextView time = new TextView(this);
        time.setText(new SimpleDateFormat("HH:mm", ptBR).format(new Date()));
        time.setTextSize(15.5f);
        time.setTextColor(Color.rgb(28,28,30));
        time.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        time.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        bar.addView(time, new FrameLayout.LayoutParams(dp(88), -1, Gravity.START));

        StatusIconsView icons = new StatusIconsView();
        bar.addView(icons, new FrameLayout.LayoutParams(dp(94), dp(32), Gravity.END | Gravity.CENTER_VERTICAL));
        return bar;
    }

    private View buildTodayView() {
        ScrollView scroll = new ScrollView(this);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(18), dp(10), dp(18), dp(150));
        scroll.addView(page, new ScrollView.LayoutParams(-1, -2));

        TextView eyebrow = label(new SimpleDateFormat("EEEE, d 'de' MMMM", ptBR).format(new Date()), 14, Color.rgb(99,99,102), false);
        page.addView(eyebrow);
        TextView title = label("Hoje", 34, Color.rgb(28,28,30), true);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-1, -2);
        tp.setMargins(0, dp(2), 0, dp(16));
        page.addView(title, tp);

        LinearLayout pair = new LinearLayout(this);
        pair.setOrientation(LinearLayout.HORIZONTAL);
        pair.addView(infoCard("Bateria", batteryPercent() + "%", "S25 FE"), new LinearLayout.LayoutParams(0, dp(148), 1f));
        View gap = new View(this);
        pair.addView(gap, new LinearLayout.LayoutParams(dp(12), 1));
        pair.addView(infoCard("Calendário", new SimpleDateFormat("d", ptBR).format(new Date()), new SimpleDateFormat("MMMM", ptBR).format(new Date())), new LinearLayout.LayoutParams(0, dp(148), 1f));
        page.addView(pair);

        LinearLayout suggestions = glassCard();
        suggestions.setOrientation(LinearLayout.VERTICAL);
        suggestions.setPadding(dp(15), dp(12), dp(15), dp(10));
        suggestions.addView(label("Sugestões", 15, Color.rgb(99,99,102), false), new LinearLayout.LayoutParams(-1, dp(26)));
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER);
        List<AppInfo> fav = preferredApps(4);
        for (AppInfo a : fav) row.addView(iconOnly(a, dp(55)), new LinearLayout.LayoutParams(0, dp(86), 1f));
        suggestions.addView(row, new LinearLayout.LayoutParams(-1, 0, 1f));
        pressable(suggestions);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, dp(132));
        sp.topMargin = dp(12);
        page.addView(suggestions, sp);

        int widgetId = prefs().getInt(KEY_WIDGET, -1);
        AppWidgetProviderInfo info = widgetId > 0 ? widgetManager.getAppWidgetInfo(widgetId) : null;
        if (info != null) {
            FrameLayout frame = new FrameLayout(this);
            frame.setBackground(glassDrawable(28));
            frame.setClipToOutline(true);
            AppWidgetHostView host = widgetHost.createView(this, widgetId, info);
            host.setAppWidget(widgetId, info);
            frame.addView(host, new FrameLayout.LayoutParams(-1, -1));
            LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-1, dp(174));
            wp.topMargin = dp(12);
            page.addView(frame, wp);
        }
        return scroll;
    }

    private LinearLayout infoCard(String heading, String value, String footer) {
        LinearLayout card = glassCard();
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(13), dp(14), dp(12));
        card.addView(label(heading, 14, Color.rgb(99,99,102), false));
        TextView big = label(value, value.length() <= 3 ? 46 : 32, Color.rgb(28,28,30), true);
        big.setGravity(Gravity.CENTER);
        card.addView(big, new LinearLayout.LayoutParams(-1, 0, 1f));
        TextView foot = label(footer, 13, Color.rgb(99,99,102), false);
        foot.setGravity(Gravity.CENTER);
        card.addView(foot);
        pressable(card);
        return card;
    }

    private View buildHomePage(List<AppInfo> pageApps, AppWidgetProviderInfo widgetInfo) {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(12), dp(10), dp(12), dp(138));
        page.setOnLongClickListener(v -> { enterEditMode(); return true; });

        if (widgetInfo != null) {
            int widgetId = prefs().getInt(KEY_WIDGET, -1);
            FrameLayout frame = new FrameLayout(this);
            frame.setBackground(glassDrawable(25));
            frame.setClipToOutline(true);
            AppWidgetHostView host = widgetHost.createView(this, widgetId, widgetInfo);
            host.setAppWidget(widgetId, widgetInfo);
            frame.addView(host, new FrameLayout.LayoutParams(-1, -1));
            LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-1, dp(158));
            wp.setMargins(dp(4), 0, dp(4), dp(8));
            page.addView(frame, wp);
        }

        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        grid.setRowCount(widgetInfo == null ? 6 : 4);
        grid.setAlignmentMode(GridLayout.ALIGN_BOUNDS);
        for (int i = 0; i < pageApps.size(); i++) {
            View tile = appTile(pageApps.get(i), true, false);
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
            lp.columnSpec = GridLayout.spec(i % 4, 1, 1f);
            lp.rowSpec = GridLayout.spec(i / 4, 1, 1f);
            lp.width = 0;
            lp.height = 0;
            lp.setMargins(dp(4), dp(2), dp(4), dp(2));
            tile.setLayoutParams(lp);
            grid.addView(tile);
        }
        page.addView(grid, new LinearLayout.LayoutParams(-1, 0, 1f));
        return page;
    }

    private FrameLayout buildDockLayer(List<AppInfo> dockApps) {
        FrameLayout layer = new FrameLayout(this);
        dots = new LinearLayout(this);
        dots.setGravity(Gravity.CENTER);
        for (int i = 0; i < homePageCount; i++) {
            View dot = new View(this);
            dot.setBackground(roundRect(Color.argb(i == 0 ? 210 : 92, 52,52,54), 4));
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(7), dp(7));
            p.setMargins(dp(3), 0, dp(3), 0);
            dots.addView(dot, p);
        }
        FrameLayout.LayoutParams dip = new FrameLayout.LayoutParams(-2, dp(20), Gravity.TOP | Gravity.CENTER_HORIZONTAL);
        layer.addView(dots, dip);

        LinearLayout dock = new LinearLayout(this);
        dock.setGravity(Gravity.CENTER);
        dock.setPadding(dp(12), dp(8), dp(12), dp(8));
        dock.setBackground(glassDrawable(34));
        dock.setElevation(dp(8));
        for (AppInfo app : dockApps) dock.addView(appTile(app, false, true), new LinearLayout.LayoutParams(0, -1, 1f));
        FrameLayout.LayoutParams dockP = new FrameLayout.LayoutParams(-1, dp(84), Gravity.BOTTOM);
        layer.addView(dock, dockP);
        return layer;
    }

    private void onPageChanged(int page) {
        int homeIndex = page - firstHomePage;
        if (dots != null) {
            for (int i = 0; i < dots.getChildCount(); i++) {
                int alpha = homeIndex == i ? 215 : 88;
                dots.getChildAt(i).setBackground(roundRect(Color.argb(alpha, 52,52,54), 4));
            }
        }
        boolean onHome = page >= firstHomePage && page < libraryPage;
        if (dockLayer != null) {
            dockLayer.animate().cancel();
            dockLayer.animate()
                    .alpha(onHome ? 1f : 0f)
                    .translationY(onHome ? 0 : dp(30))
                    .setDuration(220)
                    .setInterpolator(new DecelerateInterpolator())
                    .start();
        }
    }

    private View buildLibraryPage() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(18), dp(8), dp(18), dp(24));

        page.addView(label("Biblioteca de Apps", 32, Color.rgb(28,28,30), true), new LinearLayout.LayoutParams(-1, dp(48)));
        librarySearch = new EditText(this);
        librarySearch.setHint("Buscar");
        librarySearch.setHintTextColor(Color.rgb(142,142,147));
        librarySearch.setTextColor(Color.rgb(28,28,30));
        librarySearch.setSingleLine(true);
        librarySearch.setTextSize(16);
        librarySearch.setPadding(dp(16), 0, dp(16), 0);
        librarySearch.setBackground(glassDrawable(17));
        LinearLayout.LayoutParams searchP = new LinearLayout.LayoutParams(-1, dp(46));
        searchP.setMargins(0, dp(4), 0, dp(12));
        page.addView(librarySearch, searchP);

        ScrollView scroll = new ScrollView(this);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, 0, 0, dp(20));
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));
        page.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1f));
        fillLibraryCategories(content);

        librarySearch.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                String q = s == null ? "" : s.toString().trim();
                if (q.isEmpty()) fillLibraryCategories(content); else fillLibrarySearch(content, q);
            }
            public void afterTextChanged(Editable s) {}
        });
        return page;
    }

    private void fillLibraryCategories(LinearLayout content) {
        content.removeAllViews();
        List<Map.Entry<String, List<AppInfo>>> groups = new ArrayList<>(categorizeApps().entrySet());
        for (int i = 0; i < groups.size(); i += 2) {
            LinearLayout row = new LinearLayout(this);
            row.setGravity(Gravity.TOP);
            Map.Entry<String,List<AppInfo>> left = groups.get(i);
            row.addView(categoryCard(left.getKey(), left.getValue()), new LinearLayout.LayoutParams(0, dp(190), 1f));
            if (i + 1 < groups.size()) {
                row.addView(new View(this), new LinearLayout.LayoutParams(dp(12), 1));
                Map.Entry<String,List<AppInfo>> right = groups.get(i + 1);
                row.addView(categoryCard(right.getKey(), right.getValue()), new LinearLayout.LayoutParams(0, dp(190), 1f));
            }
            LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-1, dp(202));
            content.addView(row, rp);
        }
    }

    private View categoryCard(String name, List<AppInfo> group) {
        LinearLayout card = glassCard();
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(10), dp(9), dp(10), dp(9));
        card.addView(label(name, 14, Color.rgb(58,58,60), true), new LinearLayout.LayoutParams(-1, dp(24)));

        GridLayout area = new GridLayout(this);
        area.setColumnCount(2);
        area.setRowCount(2);
        int count = Math.min(4, group.size());
        for (int i = 0; i < count; i++) {
            View icon = iconOnly(group.get(i), dp(54));
            icon.setClickable(false);
            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(i % 2, 1, 1f);
            gp.rowSpec = GridLayout.spec(i / 2, 1, 1f);
            gp.width = 0;
            gp.height = 0;
            gp.setMargins(dp(2), dp(2), dp(2), dp(2));
            icon.setLayoutParams(gp);
            area.addView(icon);
        }
        card.addView(area, new LinearLayout.LayoutParams(-1, 0, 1f));
        pressable(card);
        card.setOnClickListener(v -> openFolder(name, group, card));
        return card;
    }

    private void openFolder(String name, List<AppInfo> group, View source) {
        if (group == null || group.isEmpty() || root.findViewWithTag("folder_overlay") != null) return;
        applySceneBlur(true);

        FrameLayout overlay = new FrameLayout(this);
        overlay.setTag("folder_overlay");
        overlay.setBackgroundColor(Color.argb(42, 245,245,247));
        overlay.setAlpha(0f);
        overlay.setOnClickListener(v -> closeFolder(overlay));

        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(16), dp(15), dp(16), dp(18));
        panel.setBackground(glassDrawable(30));
        panel.setElevation(dp(20));
        panel.setScaleX(.82f);
        panel.setScaleY(.82f);
        panel.setAlpha(0f);
        panel.setOnClickListener(v -> {});

        TextView title = label(name, 18, Color.rgb(28,28,30), true);
        title.setGravity(Gravity.CENTER);
        panel.addView(title, new LinearLayout.LayoutParams(-1, dp(38)));

        ScrollView scroll = new ScrollView(this);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        for (int i = 0; i < group.size(); i++) {
            View tile = appTile(group.get(i), true, false);
            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(i % 4, 1, 1f);
            gp.width = 0;
            gp.height = dp(96);
            gp.setMargins(dp(2), dp(3), dp(2), dp(3));
            tile.setLayoutParams(gp);
            grid.addView(tile);
        }
        scroll.addView(grid, new ScrollView.LayoutParams(-1, -2));
        panel.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1f));

        FrameLayout.LayoutParams pp = new FrameLayout.LayoutParams(-1, dp(520), Gravity.CENTER);
        pp.leftMargin = dp(20);
        pp.rightMargin = dp(20);
        overlay.addView(panel, pp);
        root.addView(overlay, new FrameLayout.LayoutParams(-1, -1));

        overlay.animate().alpha(1f).setDuration(180).start();
        panel.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(285)
                .setInterpolator(new DecelerateInterpolator(1.7f)).start();
    }

    private void closeFolder(FrameLayout overlay) {
        if (overlay == null) return;
        View panel = overlay.getChildCount() > 0 ? overlay.getChildAt(0) : null;
        if (panel != null) panel.animate().scaleX(.90f).scaleY(.90f).alpha(0f).setDuration(170).start();
        overlay.animate().alpha(0f).setDuration(185).withEndAction(() -> {
            if (root != null) root.removeView(overlay);
            applySceneBlur(false);
        }).start();
    }

    private void applySceneBlur(boolean enabled) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && scene != null) {
            scene.setRenderEffect(enabled ? RenderEffect.createBlurEffect(18f, 18f, Shader.TileMode.CLAMP) : null);
            if (dockLayer != null) dockLayer.setRenderEffect(enabled ? RenderEffect.createBlurEffect(18f, 18f, Shader.TileMode.CLAMP) : null);
        }
        if (scene != null) scene.animate().alpha(enabled ? .82f : 1f).setDuration(180).start();
    }

    private void fillLibrarySearch(LinearLayout content, String raw) {
        content.removeAllViews();
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        int idx = 0;
        String q = normalize(raw);
        for (AppInfo app : apps) {
            if (!normalize(app.label).contains(q)) continue;
            View tile = appTile(app, true, false);
            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(idx % 4, 1, 1f);
            gp.width = 0;
            gp.height = dp(96);
            gp.setMargins(dp(2), dp(4), dp(2), dp(4));
            tile.setLayoutParams(gp);
            grid.addView(tile);
            idx++;
        }
        content.addView(grid, new LinearLayout.LayoutParams(-1, -2));
    }

    private View appTile(AppInfo app, boolean label, boolean dock) {
        LinearLayout cell = new LinearLayout(this);
        cell.setOrientation(LinearLayout.VERTICAL);
        cell.setGravity(Gravity.CENTER);
        cell.setPadding(dp(2), dp(1), dp(2), dp(1));
        cell.setClickable(true);
        ImageView icon = new ImageView(this);
        icon.setImageDrawable(app.icon);
        icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        int size = dp(dock ? 59 : 58);
        cell.addView(icon, new LinearLayout.LayoutParams(size, size));

        if (label) {
            TextView name = label(app.label, 11.2f, Color.rgb(45,45,48), false);
            name.setGravity(Gravity.CENTER);
            name.setSingleLine(true);
            name.setEllipsize(android.text.TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(-1, dp(20));
            np.topMargin = dp(3);
            cell.addView(name, np);
        }
        iconPress(cell);
        cell.setOnClickListener(v -> { if (!editing) launch(app); });
        cell.setOnLongClickListener(v -> { if (!editing) enterEditMode(); return true; });
        editableIcons.add(cell);
        return cell;
    }

    private View iconOnly(AppInfo app, int size) {
        FrameLayout wrap = new FrameLayout(this);
        ImageView icon = new ImageView(this);
        icon.setImageDrawable(app.icon);
        icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        wrap.addView(icon, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        iconPress(wrap);
        wrap.setOnClickListener(v -> launch(app));
        return wrap;
    }

    private void iconPress(View v) {
        v.setOnTouchListener((view, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                view.animate().cancel();
                view.animate().scaleX(.90f).scaleY(.90f).setDuration(85).start();
            } else if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
                view.animate().cancel();
                view.animate().scaleX(1f).scaleY(1f).setDuration(175).setInterpolator(new DecelerateInterpolator(1.8f)).start();
            }
            return false;
        });
    }

    private void pressable(View v) {
        v.setOnTouchListener((view, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) view.animate().scaleX(.975f).scaleY(.975f).setDuration(90).start();
            if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL)
                view.animate().scaleX(1f).scaleY(1f).setDuration(190).setInterpolator(new DecelerateInterpolator()).start();
            return false;
        });
    }

    private void enterEditMode() {
        if (editing || root.findViewWithTag("folder_overlay") != null) return;
        editing = true;
        applySceneBlur(true);
        for (View v : editableIcons) {
            ObjectAnimator r = ObjectAnimator.ofFloat(v, View.ROTATION, -1.0f, 1.0f);
            r.setDuration(120);
            r.setRepeatMode(ObjectAnimator.REVERSE);
            r.setRepeatCount(ObjectAnimator.INFINITE);
            r.start();
        }
        LinearLayout controls = new LinearLayout(this);
        controls.setTag("edit_controls");
        controls.setGravity(Gravity.CENTER_VERTICAL);
        controls.setPadding(dp(8), dp(5), dp(8), dp(5));
        controls.setBackground(glassDrawable(24));
        controls.setElevation(dp(16));

        TextView add = actionPill("＋");
        add.setTextSize(23);
        add.setOnClickListener(v -> beginPickWidget());
        controls.addView(add, new LinearLayout.LayoutParams(dp(48), dp(42)));
        controls.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1f));
        TextView done = actionPill("Concluído");
        done.setOnClickListener(v -> leaveEditMode());
        controls.addView(done, new LinearLayout.LayoutParams(dp(110), dp(42)));

        FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(-1, dp(54), Gravity.TOP);
        cp.leftMargin = dp(18);
        cp.rightMargin = dp(18);
        cp.topMargin = dp(8);
        root.addView(controls, cp);
        controls.setAlpha(0f);
        controls.setTranslationY(-dp(15));
        controls.animate().alpha(1f).translationY(0).setDuration(220).start();
    }

    private void leaveEditMode() {
        editing = false;
        for (View v : editableIcons) {
            v.animate().cancel();
            v.clearAnimation();
            v.setRotation(0f);
        }
        View controls = root.findViewWithTag("edit_controls");
        if (controls != null) controls.animate().alpha(0f).translationY(-dp(12)).setDuration(150).withEndAction(() -> root.removeView(controls)).start();
        applySceneBlur(false);
    }

    private TextView actionPill(String text) {
        TextView v = label(text, 14, Color.rgb(0,122,255), true);
        v.setGravity(Gravity.CENTER);
        v.setBackground(roundRect(Color.argb(115,255,255,255), 21));
        pressable(v);
        return v;
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
        int old = prefs().getInt(KEY_WIDGET, -1);
        if (old > 0 && old != id) try { widgetHost.deleteAppWidgetId(old); } catch (Exception ignored) {}
        prefs().edit().putInt(KEY_WIDGET, id).apply();
        pendingWidgetId = -1;
        buildHome();
    }

    private void cleanupPendingWidget() {
        if (pendingWidgetId > 0) try { widgetHost.deleteAppWidgetId(pendingWidgetId); } catch (Exception ignored) {}
        pendingWidgetId = -1;
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
        apps.sort((a,b) -> c.compare(a.label, b.label));
    }

    private List<AppInfo> preferredApps(int max) {
        List<AppInfo> out = new ArrayList<>();
        String[] wanted = {"WhatsApp", "Instagram", "YouTube", "Chrome", "Gmail", "Maps"};
        for (String w : wanted) {
            AppInfo a = findByLabel(w);
            if (a != null && !out.contains(a) && out.size() < max) out.add(a);
        }
        for (AppInfo a : apps) if (!a.packageName.equals(getPackageName()) && !out.contains(a) && out.size() < max) out.add(a);
        return out;
    }

    private List<AppInfo> orderedHomeApps(List<AppInfo> dock) {
        List<AppInfo> out = new ArrayList<>();
        String[] order = {"Calendário","Calendar","Fotos","Photos","Galeria","Gallery","Câmera","Camera","Gmail","Mapas","Maps","Relógio","Clock","Notas","Notes","WhatsApp","Instagram","YouTube","Spotify","ChatGPT","Drive","Google","Play Store"};
        for (String w : order) {
            AppInfo a = findByLabel(w);
            if (a != null && !dock.contains(a) && !out.contains(a) && !a.packageName.equals(getPackageName())) out.add(a);
        }
        for (AppInfo a : apps) if (!dock.contains(a) && !out.contains(a) && !a.packageName.equals(getPackageName())) out.add(a);
        return out;
    }

    private List<AppInfo> pickDockApps() {
        List<AppInfo> out = new ArrayList<>();
        String[] order = {"Telefone","Phone","Chrome","Mensagens","Messages","Spotify","Música","Music"};
        for (String w : order) {
            AppInfo a = findByLabel(w);
            if (a != null && !out.contains(a) && out.size() < 4) out.add(a);
        }
        for (AppInfo a : apps) if (!a.packageName.equals(getPackageName()) && !out.contains(a) && out.size() < 4) out.add(a);
        return out;
    }

    private Map<String,List<AppInfo>> categorizeApps() {
        LinkedHashMap<String,List<AppInfo>> m = new LinkedHashMap<>();
        m.put("Sugestões", new ArrayList<>());
        m.put("Adicionados Recentemente", new ArrayList<>());
        m.put("Redes Sociais", new ArrayList<>());
        m.put("Entretenimento", new ArrayList<>());
        m.put("Produtividade", new ArrayList<>());
        m.put("Utilitários", new ArrayList<>());
        m.put("Criatividade", new ArrayList<>());
        m.put("Outros", new ArrayList<>());
        for (int i=0;i<apps.size() && m.get("Sugestões").size()<8;i++) if (!apps.get(i).packageName.equals(getPackageName())) m.get("Sugestões").add(apps.get(i));
        for (int i=Math.max(0, apps.size()-8);i<apps.size();i++) if (!apps.get(i).packageName.equals(getPackageName())) m.get("Adicionados Recentemente").add(apps.get(i));
        for (AppInfo app : apps) {
            if (app.packageName.equals(getPackageName())) continue;
            String n = normalize(app.label + " " + app.packageName);
            String key;
            if (contains(n,"whatsapp","instagram","facebook","telegram","messenger","tiktok","threads")) key="Redes Sociais";
            else if (contains(n,"youtube","netflix","spotify","prime","disney","music","música","game","jogo")) key="Entretenimento";
            else if (contains(n,"gmail","outlook","drive","docs","sheets","office","notion","chatgpt","calendar","calend")) key="Produtividade";
            else if (contains(n,"camera","câmera","clock","relog","calcul","settings","configura","files","arquivo","phone","telefone","maps","mapas")) key="Utilitários";
            else if (contains(n,"photo","foto","gallery","galeria","canva","editor","capcut")) key="Criatividade";
            else key="Outros";
            if (!m.get(key).contains(app)) m.get(key).add(app);
        }
        return m;
    }

    private AppInfo findByLabel(String wanted) {
        String q = normalize(wanted);
        for (AppInfo a : apps) if (normalize(a.label).equals(q)) return a;
        for (AppInfo a : apps) if (normalize(a.label).contains(q)) return a;
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

    private int batteryPercent() {
        try {
            BatteryManager bm = (BatteryManager)getSystemService(BATTERY_SERVICE);
            return bm == null ? 0 : Math.max(0, bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY));
        } catch (Exception e) { return 0; }
    }

    private LinearLayout glassCard() {
        LinearLayout v = new LinearLayout(this);
        v.setBackground(glassDrawable(27));
        v.setElevation(dp(5));
        return v;
    }

    private GradientDrawable glassDrawable(int radius) {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.argb(208,255,255,255), Color.argb(170,248,248,252)});
        g.setCornerRadius(dp(radius));
        g.setStroke(dp(.7f), Color.argb(115,255,255,255));
        return g;
    }

    private GradientDrawable roundRect(int color, int radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radius));
        return g;
    }

    private TextView label(String text, float size, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setTextSize(size);
        v.setTextColor(color);
        if (bold) v.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return v;
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, MODE_PRIVATE); }
    private String normalize(String s) { return s == null ? "" : s.toLowerCase(ptBR); }
    private boolean contains(String s, String... terms) { for (String t : terms) if (s.contains(t)) return true; return false; }
    private int dp(float n) { return (int)(n * getResources().getDisplayMetrics().density + .5f); }

    @Override public void onBackPressed() {
        View overlay = root == null ? null : root.findViewWithTag("folder_overlay");
        if (overlay instanceof FrameLayout) { closeFolder((FrameLayout)overlay); return; }
        if (editing) { leaveEditMode(); return; }
        if (pager != null) pager.goToPage(firstHomePage, true); else super.onBackPressed();
    }

    private class PremiumWallpaperDrawable extends Drawable {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        @Override public void draw(Canvas c) {
            int w = getBounds().width(), h = getBounds().height();
            int style = getSharedPreferences(AuroraSettingsActivity.PREFS, MODE_PRIVATE).getInt(AuroraSettingsActivity.KEY_STYLE, 0);
            int[][] palettes = {
                    {0xFFF2F4FF,0xFFE8F2FF,0x99C6D7FF,0x88F4C8E4},
                    {0xFFECF7FF,0xFFE4EBFF,0x99BDE7FF,0x889EBBFF},
                    {0xFFF3ECFF,0xFFECEBFF,0x99CDB8FF,0x88F1C6FF},
                    {0xFFFFF0EC,0xFFF4E9FF,0x99FFD0BD,0x88EFC7F7},
                    {0xFFEAFBFA,0xFFE8F0FF,0x99B5F0E8,0x88BAD5FF},
                    {0xFFFFEFF6,0xFFF2ECFF,0x99FFC5DB,0x88E0C8FF},
                    {0xFFF0F1F4,0xFFE4E7EC,0x99CCD1DA,0x889FA9B8},
                    {0xFFEEF1FA,0xFFE7E8F4,0x99B8C8EE,0x88CDB4E6}
            };
            int[] a = palettes[Math.max(0, Math.min(palettes.length-1, style))];
            p.setShader(new LinearGradient(0,0,w,h,a[0],a[1], Shader.TileMode.CLAMP));
            c.drawRect(0,0,w,h,p);
            p.setShader(new RadialGradient(w*.18f,h*.22f,w*.68f,a[2],Color.TRANSPARENT,Shader.TileMode.CLAMP));
            c.drawCircle(w*.18f,h*.22f,w*.68f,p);
            p.setShader(new RadialGradient(w*.86f,h*.74f,w*.72f,a[3],Color.TRANSPARENT,Shader.TileMode.CLAMP));
            c.drawCircle(w*.86f,h*.74f,w*.72f,p);
            p.setShader(null);
        }
        public void setAlpha(int alpha) { p.setAlpha(alpha); }
        public void setColorFilter(android.graphics.ColorFilter cf) { p.setColorFilter(cf); }
        public int getOpacity() { return android.graphics.PixelFormat.OPAQUE; }
    }

    private class StatusIconsView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        StatusIconsView() { super(PremiumLauncherActivity.this); }
        @Override protected void onDraw(Canvas c) {
            super.onDraw(c);
            float h = getHeight(), y = h*.52f;
            p.setColor(Color.rgb(28,28,30));
            p.setStyle(Paint.Style.FILL);
            float x = dp(4);
            for (int i=0;i<4;i++) c.drawRect(x+i*dp(4.2f), y-dp(2+i*1.7f), x+dp(2.5f)+i*dp(4.2f), y+dp(5), p);
            x += dp(24);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(dp(1.8f));
            c.drawArc(x, y-dp(8), x+dp(20), y+dp(10), 210, 120, false, p);
            c.drawArc(x+dp(4), y-dp(4), x+dp(16), y+dp(8), 210, 120, false, p);
            c.drawCircle(x+dp(10), y+dp(5), dp(1.8f), p);
            x += dp(29);
            p.setStyle(Paint.Style.STROKE); p.setStrokeWidth(dp(1.5f));
            c.drawRoundRect(x, y-dp(7), x+dp(25), y+dp(7), dp(4), dp(4), p);
            p.setStyle(Paint.Style.FILL);
            int level = Math.max(5, batteryPercent());
            c.drawRoundRect(x+dp(2), y-dp(5), x+dp(2)+dp(20)*(level/100f), y+dp(5), dp(2), dp(2), p);
            c.drawRect(x+dp(26), y-dp(3), x+dp(28), y+dp(3), p);
        }
    }

    private static class AppInfo {
        final String label, packageName, activityName;
        final Drawable icon;
        AppInfo(String l, String p, String a, Drawable i) { label=l; packageName=p; activityName=a; icon=i; }
    }

    private class Pager extends HorizontalScrollView {
        private int count = 1;
        private int page = 0;
        private PageChangedListener listener;
        private ObjectAnimator animator;
        Pager(android.content.Context c) { super(c); }
        void setPageCount(int c) { count = Math.max(1,c); }
        void setOnPageChangedListener(PageChangedListener l) { listener = l; }
        void goToPage(int p, boolean smooth) {
            page = Math.max(0, Math.min(count-1,p));
            int target = page * screenWidth;
            if (animator != null) animator.cancel();
            if (!smooth) scrollTo(target,0);
            else {
                animator = ObjectAnimator.ofInt(this, "scrollX", getScrollX(), target);
                animator.setDuration(285);
                animator.setInterpolator(new DecelerateInterpolator(1.55f));
                animator.start();
            }
            if (listener != null) listener.onChanged(page);
        }
        @Override public boolean onTouchEvent(MotionEvent e) {
            boolean r = super.onTouchEvent(e);
            if (e.getAction() == MotionEvent.ACTION_UP || e.getAction() == MotionEvent.ACTION_CANCEL) {
                int target = Math.round(getScrollX()/(float)Math.max(1,screenWidth));
                goToPage(target,true);
            }
            return r;
        }
        @Override protected void onScrollChanged(int l,int t,int oldl,int oldt) {
            super.onScrollChanged(l,t,oldl,oldt);
            int p = Math.round(l/(float)Math.max(1,screenWidth));
            if (p != page) {
                page = Math.max(0, Math.min(count-1,p));
                if (listener != null) listener.onChanged(page);
            }
        }
    }

    private interface PageChangedListener { void onChanged(int page); }
}
