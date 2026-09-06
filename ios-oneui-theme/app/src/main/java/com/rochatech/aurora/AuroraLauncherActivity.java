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
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.os.BatteryManager;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
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

public class AuroraLauncherActivity extends Activity {
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
    private Pager pager;
    private LinearLayout dots;
    private AppWidgetHost widgetHost;
    private AppWidgetManager widgetManager;
    private EditText librarySearch;
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
        if (getIntent().getBooleanExtra("openEditor", false)) {
            root.postDelayed(this::enterEditMode, 260);
        }
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
    }

    private void configureWindow() {
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS |
                WindowManager.LayoutParams.FLAG_SHOW_WALLPAPER);
        w.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    private void buildHome() {
        editing = false;
        editableIcons.clear();

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.TRANSPARENT);
        root.setOnLongClickListener(v -> { enterEditMode(); return true; });

        LinearLayout vertical = new LinearLayout(this);
        vertical.setOrientation(LinearLayout.VERTICAL);
        root.addView(vertical, new FrameLayout.LayoutParams(-1, -1));

        pager = new Pager(this);
        pager.setHorizontalScrollBarEnabled(false);
        pager.setOverScrollMode(View.OVER_SCROLL_NEVER);
        pager.setFillViewport(true);

        LinearLayout strip = new LinearLayout(this);
        strip.setOrientation(LinearLayout.HORIZONTAL);
        pager.addView(strip, new HorizontalScrollView.LayoutParams(-2, -1));

        List<AppInfo> dockApps = pickDockApps();
        List<AppInfo> orderedHomeApps = orderedHomeApps(dockApps);

        int widgetId = prefs().getInt(KEY_WIDGET, -1);
        AppWidgetProviderInfo widgetInfo = widgetId > 0 ? widgetManager.getAppWidgetInfo(widgetId) : null;
        boolean hasWidget = widgetInfo != null;
        int firstCapacity = hasWidget ? 16 : 24;
        int remaining = Math.max(0, orderedHomeApps.size() - firstCapacity);
        homePageCount = Math.max(1, 1 + (int)Math.ceil(remaining / 24.0));
        firstHomePage = 1;
        libraryPage = firstHomePage + homePageCount;

        strip.addView(buildTodayView(), new LinearLayout.LayoutParams(screenWidth, -1));

        int cursor = 0;
        for (int p = 0; p < homePageCount; p++) {
            int cap = p == 0 ? firstCapacity : 24;
            List<AppInfo> slice = new ArrayList<>();
            while (cursor < orderedHomeApps.size() && slice.size() < cap) {
                slice.add(orderedHomeApps.get(cursor++));
            }
            strip.addView(buildHomePage(slice, p == 0 ? widgetInfo : null),
                    new LinearLayout.LayoutParams(screenWidth, -1));
        }

        strip.addView(buildLibraryPage(), new LinearLayout.LayoutParams(screenWidth, -1));
        vertical.addView(pager, new LinearLayout.LayoutParams(-1, 0, 1f));

        LinearLayout footer = new LinearLayout(this);
        footer.setOrientation(LinearLayout.VERTICAL);
        footer.setGravity(Gravity.CENTER_HORIZONTAL);
        footer.setPadding(dp(16), 0, dp(16), dp(10));
        footer.addView(buildHomeIndicator(), new LinearLayout.LayoutParams(-1, dp(34)));
        footer.addView(buildDock(dockApps), new LinearLayout.LayoutParams(-1, dp(84)));
        vertical.addView(footer, new LinearLayout.LayoutParams(-1, dp(126)));

        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int bottom = insets.getSystemWindowInsetBottom();
            footer.setPadding(dp(16), 0, dp(16), Math.max(dp(8), bottom));
            return insets;
        });

        setContentView(root);
        pager.setPageCount(libraryPage + 1);
        pager.setOnPageChangedListener(this::updateIndicator);
        root.post(() -> pager.goToPage(firstHomePage, false));
    }

    private View buildTodayView() {
        ScrollView scroll = new ScrollView(this);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);

        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(18), dp(18), dp(18), dp(20));
        scroll.addView(page, new ScrollView.LayoutParams(-1, -2));

        TextView date = new TextView(this);
        date.setText(new SimpleDateFormat("EEEE, d 'de' MMMM", ptBR).format(new Date()));
        date.setTextSize(15);
        date.setTextColor(Color.WHITE);
        date.setShadowLayer(3f, 0, 1, Color.argb(120, 0, 0, 0));
        page.addView(date);

        TextView title = new TextView(this);
        title.setText("Visão do Dia");
        title.setTextSize(34);
        title.setTextColor(Color.WHITE);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setShadowLayer(3f, 0, 1, Color.argb(120, 0, 0, 0));
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-1, -2);
        tp.setMargins(0, dp(2), 0, dp(18));
        page.addView(title, tp);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.addView(todayCard("Bateria", batteryPercent() + "%", "Galaxy", 0),
                new LinearLayout.LayoutParams(0, dp(150), 1f));
        View spacer = new View(this);
        row.addView(spacer, new LinearLayout.LayoutParams(dp(12), 1));
        row.addView(todayCard("Hoje", new SimpleDateFormat("d", ptBR).format(new Date()),
                        new SimpleDateFormat("MMMM", ptBR).format(new Date()), 1),
                new LinearLayout.LayoutParams(0, dp(150), 1f));
        page.addView(row);

        LinearLayout.LayoutParams cardP = new LinearLayout.LayoutParams(-1, dp(150));
        cardP.topMargin = dp(12);
        page.addView(todaySuggestionsCard(), cardP);

        int widgetId = prefs().getInt(KEY_WIDGET, -1);
        AppWidgetProviderInfo info = widgetId > 0 ? widgetManager.getAppWidgetInfo(widgetId) : null;
        if (info != null) {
            FrameLayout frame = new FrameLayout(this);
            frame.setBackground(roundRect(Color.argb(70, 245, 245, 247), 26));
            frame.setClipToOutline(true);
            AppWidgetHostView host = widgetHost.createView(this, widgetId, info);
            host.setAppWidget(widgetId, info);
            frame.addView(host, new FrameLayout.LayoutParams(-1, -1));
            LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-1, dp(170));
            wp.topMargin = dp(12);
            page.addView(frame, wp);
        }

        TextView add = pill("＋  Adicionar Widget");
        add.setOnClickListener(v -> beginPickWidget());
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(-1, dp(46));
        ap.setMargins(dp(34), dp(18), dp(34), 0);
        page.addView(add, ap);
        return scroll;
    }

    private View todayCard(String heading, String value, String footer, int kind) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setPadding(dp(14), dp(14), dp(14), dp(12));
        card.setBackground(roundRect(Color.argb(184, 242, 242, 247), 26));

        TextView h = new TextView(this);
        h.setText(heading);
        h.setTextSize(14);
        h.setTextColor(Color.rgb(99, 99, 102));
        card.addView(h, new LinearLayout.LayoutParams(-1, -2));

        TextView v = new TextView(this);
        v.setText(value);
        v.setTextSize(kind == 1 ? 48 : 34);
        v.setTextColor(Color.rgb(28, 28, 30));
        v.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        v.setGravity(Gravity.CENTER);
        card.addView(v, new LinearLayout.LayoutParams(-1, 0, 1f));

        TextView f = new TextView(this);
        f.setText(footer);
        f.setTextSize(13);
        f.setTextColor(Color.rgb(99, 99, 102));
        f.setGravity(Gravity.CENTER);
        card.addView(f, new LinearLayout.LayoutParams(-1, -2));
        return card;
    }

    private View todaySuggestionsCard() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(14), dp(12), dp(14), dp(10));
        card.setBackground(roundRect(Color.argb(184, 242, 242, 247), 26));

        TextView title = new TextView(this);
        title.setText("Sugestões");
        title.setTextSize(15);
        title.setTextColor(Color.rgb(99, 99, 102));
        card.addView(title, new LinearLayout.LayoutParams(-1, dp(24)));

        LinearLayout appsRow = new LinearLayout(this);
        appsRow.setOrientation(LinearLayout.HORIZONTAL);
        appsRow.setGravity(Gravity.CENTER);
        List<AppInfo> suggestions = new ArrayList<>();
        String[] wanted = {"WhatsApp", "Instagram", "YouTube", "Chrome", "Gmail", "Maps"};
        for (String w : wanted) {
            AppInfo a = findByLabel(w);
            if (a != null && !suggestions.contains(a) && suggestions.size() < 4) suggestions.add(a);
        }
        for (AppInfo a : apps) if (!suggestions.contains(a) && suggestions.size() < 4) suggestions.add(a);
        for (AppInfo app : suggestions) {
            appsRow.addView(simpleIconButton(app, dp(54)), new LinearLayout.LayoutParams(0, -1, 1f));
        }
        card.addView(appsRow, new LinearLayout.LayoutParams(-1, 0, 1f));
        return card;
    }

    private View buildHomePage(List<AppInfo> pageApps, AppWidgetProviderInfo widgetInfo) {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(14), dp(16), dp(14), 0);
        page.setGravity(Gravity.TOP);
        page.setOnLongClickListener(v -> { enterEditMode(); return true; });

        if (widgetInfo != null) {
            int widgetId = prefs().getInt(KEY_WIDGET, -1);
            FrameLayout frame = new FrameLayout(this);
            frame.setClipToOutline(true);
            frame.setBackground(roundRect(Color.argb(36, 255, 255, 255), 24));
            AppWidgetHostView host = widgetHost.createView(this, widgetId, widgetInfo);
            host.setAppWidget(widgetId, widgetInfo);
            frame.addView(host, new FrameLayout.LayoutParams(-1, -1));
            LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-1, dp(158));
            wp.setMargins(dp(3), 0, dp(3), dp(12));
            page.addView(frame, wp);
        }

        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        grid.setRowCount(widgetInfo == null ? 6 : 4);
        grid.setAlignmentMode(GridLayout.ALIGN_BOUNDS);
        for (int i = 0; i < pageApps.size(); i++) {
            View tile = appTile(pageApps.get(i), true, false);
            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(i % 4, 1, 1f);
            gp.rowSpec = GridLayout.spec(i / 4, 1, 1f);
            gp.width = 0;
            gp.height = 0;
            gp.setMargins(dp(4), dp(2), dp(4), dp(2));
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
        dock.setPadding(dp(12), dp(9), dp(12), dp(9));
        dock.setBackground(roundRect(Color.argb(154, 238, 238, 242), 31));
        dock.setElevation(dp(5));
        for (AppInfo app : dockApps) {
            dock.addView(appTile(app, false, true), new LinearLayout.LayoutParams(0, -1, 1f));
        }
        return dock;
    }

    private View buildHomeIndicator() {
        FrameLayout holder = new FrameLayout(this);

        dots = new LinearLayout(this);
        dots.setOrientation(LinearLayout.HORIZONTAL);
        dots.setGravity(Gravity.CENTER);
        for (int i = 0; i < homePageCount; i++) {
            View dot = new View(this);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(7), dp(7));
            p.setMargins(dp(3), 0, dp(3), 0);
            dots.addView(dot, p);
        }
        holder.addView(dots, new FrameLayout.LayoutParams(-2, dp(28), Gravity.CENTER));

        TextView search = pill("⌕  Buscar");
        search.setTextSize(13);
        search.setOnClickListener(v -> openLibrarySearch());
        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(dp(108), dp(30), Gravity.CENTER);
        holder.addView(search, sp);
        search.setVisibility(View.GONE);
        search.setTag("search_pill");
        return holder;
    }

    private void updateIndicator(int page) {
        if (dots == null) return;
        for (int i = 0; i < dots.getChildCount(); i++) {
            View d = dots.getChildAt(i);
            int currentHome = page - firstHomePage;
            int alpha = currentHome == i ? 235 : 100;
            d.setBackground(roundRect(Color.argb(alpha, 255, 255, 255), 4));
        }
        dots.setAlpha(page >= firstHomePage && page < libraryPage ? 1f : .28f);
    }

    private void openLibrarySearch() {
        pager.goToPage(libraryPage, true);
        root.postDelayed(() -> {
            if (librarySearch != null) {
                librarySearch.requestFocus();
                InputMethodManager imm = (InputMethodManager)getSystemService(INPUT_METHOD_SERVICE);
                if (imm != null) imm.showSoftInput(librarySearch, InputMethodManager.SHOW_IMPLICIT);
            }
        }, 260);
    }

    private View appTile(AppInfo app, boolean label, boolean dock) {
        LinearLayout cell = new LinearLayout(this);
        cell.setOrientation(LinearLayout.VERTICAL);
        cell.setGravity(Gravity.CENTER);
        cell.setPadding(dp(2), dp(1), dp(2), dp(1));
        cell.setClickable(true);
        cell.setOnClickListener(v -> { if (!editing) launch(app); });
        cell.setOnLongClickListener(v -> { if (!editing) enterEditMode(); return true; });

        ImageView icon = new ImageView(this);
        icon.setImageDrawable(app.icon);
        icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        int size = dp(dock ? 58 : 59);
        cell.addView(icon, new LinearLayout.LayoutParams(size, size));

        if (label) {
            TextView name = new TextView(this);
            name.setText(app.label);
            name.setTextColor(Color.WHITE);
            name.setTextSize(11.5f);
            name.setGravity(Gravity.CENTER);
            name.setSingleLine(true);
            name.setEllipsize(android.text.TextUtils.TruncateAt.END);
            name.setShadowLayer(3f, 0, 1, Color.argb(165, 0, 0, 0));
            LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(-1, dp(20));
            np.topMargin = dp(3);
            cell.addView(name, np);
        }
        editableIcons.add(cell);
        return cell;
    }

    private View simpleIconButton(AppInfo app, int size) {
        FrameLayout wrap = new FrameLayout(this);
        ImageView icon = new ImageView(this);
        icon.setImageDrawable(app.icon);
        icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        wrap.addView(icon, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        wrap.setOnClickListener(v -> launch(app));
        return wrap;
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
            v.clearAnimation();
            v.setRotation(0f);
        }
        View overlay = root.findViewWithTag("edit_overlay");
        if (overlay != null) root.removeView(overlay);
    }

    private void startWiggle(View v) {
        ObjectAnimator r = ObjectAnimator.ofFloat(v, View.ROTATION, -1.0f, 1.0f);
        r.setDuration(125);
        r.setRepeatMode(ObjectAnimator.REVERSE);
        r.setRepeatCount(ObjectAnimator.INFINITE);
        r.start();
    }

    private void showEditOverlay() {
        LinearLayout bar = new LinearLayout(this);
        bar.setTag("edit_overlay");
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(12), dp(6), dp(12), dp(6));

        TextView add = pill("＋");
        add.setTextSize(22);
        add.setOnClickListener(v -> beginPickWidget());
        bar.addView(add, new LinearLayout.LayoutParams(dp(46), dp(42)));

        View gap = new View(this);
        bar.addView(gap, new LinearLayout.LayoutParams(0, 1, 1f));

        TextView done = pill("Concluído");
        done.setTextSize(14);
        done.setOnClickListener(v -> leaveEditMode());
        bar.addView(done, new LinearLayout.LayoutParams(dp(100), dp(42)));

        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-1, dp(54), Gravity.TOP);
        p.leftMargin = dp(16);
        p.rightMargin = dp(16);
        p.topMargin = dp(10);
        root.addView(bar, p);
    }

    private View buildLibraryPage() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(18), dp(16), dp(18), dp(6));

        TextView title = new TextView(this);
        title.setText("Biblioteca de Apps");
        title.setTextSize(32);
        title.setTextColor(Color.WHITE);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setShadowLayer(3f, 0, 1, Color.argb(135, 0, 0, 0));
        page.addView(title, new LinearLayout.LayoutParams(-1, dp(46)));

        librarySearch = new EditText(this);
        librarySearch.setHint("Biblioteca de Apps");
        librarySearch.setHintTextColor(Color.argb(175, 255, 255, 255));
        librarySearch.setTextColor(Color.WHITE);
        librarySearch.setSingleLine(true);
        librarySearch.setTextSize(16);
        librarySearch.setPadding(dp(16), 0, dp(16), 0);
        librarySearch.setBackground(roundRect(Color.argb(102, 118, 118, 128), 16));
        LinearLayout.LayoutParams searchP = new LinearLayout.LayoutParams(-1, dp(46));
        searchP.setMargins(0, dp(8), 0, dp(12));
        page.addView(librarySearch, searchP);

        ScrollView scroll = new ScrollView(this);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, dp(2), 0, dp(18));
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));
        page.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1f));

        fillLibraryCategories(content);
        librarySearch.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                String q = s == null ? "" : s.toString().trim();
                if (q.isEmpty()) fillLibraryCategories(content);
                else fillLibrarySearch(content, q);
            }
            @Override public void afterTextChanged(Editable s) {}
        });
        return page;
    }

    private void fillLibraryCategories(LinearLayout content) {
        content.removeAllViews();
        List<Map.Entry<String, List<AppInfo>>> entries = new ArrayList<>(categorizeApps().entrySet());
        for (int i = 0; i < entries.size(); i += 2) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.TOP);
            row.addView(categoryCard(entries.get(i).getKey(), entries.get(i).getValue()),
                    new LinearLayout.LayoutParams(0, dp(190), 1f));
            if (i + 1 < entries.size()) {
                View spacer = new View(this);
                row.addView(spacer, new LinearLayout.LayoutParams(dp(12), 1));
                row.addView(categoryCard(entries.get(i + 1).getKey(), entries.get(i + 1).getValue()),
                        new LinearLayout.LayoutParams(0, dp(190), 1f));
            }
            LinearLayout.LayoutParams rp = new LinearLayout.LayoutParams(-1, dp(200));
            content.addView(row, rp);
        }
    }

    private View categoryCard(String name, List<AppInfo> group) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(10), dp(9), dp(10), dp(8));
        card.setBackground(roundRect(Color.argb(70, 245, 245, 247), 24));

        TextView title = new TextView(this);
        title.setText(name);
        title.setTextColor(Color.WHITE);
        title.setTextSize(14);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setShadowLayer(2f, 0, 1, Color.argb(110, 0, 0, 0));
        card.addView(title, new LinearLayout.LayoutParams(-1, dp(24)));

        GridLayout area = new GridLayout(this);
        area.setColumnCount(2);
        area.setRowCount(2);
        int largeCount = Math.min(3, group.size());
        for (int i = 0; i < largeCount; i++) {
            View tile = simpleIconButton(group.get(i), dp(52));
            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(i % 2, 1, 1f);
            gp.rowSpec = GridLayout.spec(i / 2, 1, 1f);
            gp.width = 0;
            gp.height = 0;
            gp.setMargins(dp(2), dp(2), dp(2), dp(2));
            tile.setLayoutParams(gp);
            area.addView(tile);
        }

        GridLayout mini = new GridLayout(this);
        mini.setColumnCount(2);
        mini.setRowCount(2);
        for (int j = 3; j < Math.min(group.size(), 7); j++) {
            View m = simpleIconButton(group.get(j), dp(23));
            GridLayout.LayoutParams mgp = new GridLayout.LayoutParams();
            int k = j - 3;
            mgp.columnSpec = GridLayout.spec(k % 2, 1, 1f);
            mgp.rowSpec = GridLayout.spec(k / 2, 1, 1f);
            mgp.width = 0;
            mgp.height = 0;
            mini.addView(m, mgp);
        }
        GridLayout.LayoutParams miniP = new GridLayout.LayoutParams();
        miniP.columnSpec = GridLayout.spec(1, 1, 1f);
        miniP.rowSpec = GridLayout.spec(1, 1, 1f);
        miniP.width = 0;
        miniP.height = 0;
        mini.setLayoutParams(miniP);
        area.addView(mini);

        card.addView(area, new LinearLayout.LayoutParams(-1, 0, 1f));
        return card;
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

        for (int i = 0; i < apps.size() && map.get("Sugestões").size() < 7; i++) {
            map.get("Sugestões").add(apps.get(i));
        }
        for (int i = Math.max(0, apps.size() - 7); i < apps.size(); i++) {
            map.get("Adicionados Recentemente").add(apps.get(i));
        }
        for (AppInfo app : apps) {
            String n = normalize(app.label + " " + app.packageName);
            String key;
            if (contains(n, "whatsapp", "instagram", "facebook", "telegram", "messenger", "tiktok", "threads")) key = "Redes Sociais";
            else if (contains(n, "youtube", "netflix", "spotify", "prime", "disney", "music", "música", "games", "jogo")) key = "Entretenimento";
            else if (contains(n, "gmail", "outlook", "drive", "docs", "sheets", "office", "notion", "chatgpt", "calendar", "calend")) key = "Produtividade";
            else if (contains(n, "camera", "câmera", "clock", "relog", "calcul", "settings", "configura", "files", "arquivo", "phone", "telefone", "maps", "mapas")) key = "Utilitários";
            else if (contains(n, "photo", "foto", "gallery", "galeria", "canva", "editor", "capcut")) key = "Criatividade";
            else key = "Outros";
            if (!map.get(key).contains(app)) map.get(key).add(app);
        }
        return map;
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
            if (resultCode == RESULT_OK) saveWidget(pendingWidgetId);
            else cleanupPendingWidget();
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
        if (old > 0 && old != id) {
            try { widgetHost.deleteAppWidgetId(old); } catch (Exception ignored) {}
        }
        prefs().edit().putInt(KEY_WIDGET, id).apply();
        pendingWidgetId = -1;
        buildHome();
    }

    private void cleanupPendingWidget() {
        if (pendingWidgetId > 0) {
            try { widgetHost.deleteAppWidgetId(pendingWidgetId); } catch (Exception ignored) {}
        }
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
        apps.sort((a, b) -> c.compare(a.label, b.label));
    }

    private List<AppInfo> orderedHomeApps(List<AppInfo> dockApps) {
        List<AppInfo> out = new ArrayList<>();
        String[] priorities = {
                "Calendário", "Calendar", "Fotos", "Photos", "Galeria", "Gallery", "Câmera", "Camera",
                "Gmail", "Mail", "Mapas", "Maps", "Relógio", "Clock", "Notas", "Notes",
                "Configurações", "Settings", "WhatsApp", "Instagram", "YouTube", "Spotify",
                "ChatGPT", "Drive", "Google", "Play Store"
        };
        for (String p : priorities) {
            AppInfo a = findByLabel(p);
            if (a != null && !dockApps.contains(a) && !out.contains(a) && !a.packageName.equals(getPackageName())) out.add(a);
        }
        for (AppInfo a : apps) {
            if (!dockApps.contains(a) && !out.contains(a) && !a.packageName.equals(getPackageName())) out.add(a);
        }
        return out;
    }

    private List<AppInfo> pickDockApps() {
        List<AppInfo> out = new ArrayList<>();
        String[] priorities = {"Telefone", "Phone", "Safari", "Chrome", "Mensagens", "Messages", "Música", "Music", "Spotify"};
        for (String p : priorities) {
            AppInfo a = findByLabel(p);
            if (a != null && !out.contains(a) && out.size() < 4) out.add(a);
        }
        for (AppInfo a : apps) {
            if (!out.contains(a) && !a.packageName.equals(getPackageName()) && out.size() < 4) out.add(a);
        }
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

    private int batteryPercent() {
        try {
            BatteryManager bm = (BatteryManager)getSystemService(BATTERY_SERVICE);
            return bm == null ? 0 : Math.max(0, bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY));
        } catch (Exception e) { return 0; }
    }

    private TextView pill(String text) {
        TextView v = new TextView(this);
        v.setText(text);
        v.setGravity(Gravity.CENTER);
        v.setTextColor(Color.WHITE);
        v.setTextSize(14);
        v.setBackground(roundRect(Color.argb(92, 60, 60, 67), 22));
        return v;
    }

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, MODE_PRIVATE); }
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
        AppInfo(String l, String p, String a, Drawable i) {
            label = l; packageName = p; activityName = a; icon = i;
        }
    }

    private class Pager extends HorizontalScrollView {
        private int count = 1;
        private int page = 0;
        private PageChangedListener listener;

        Pager(android.content.Context c) { super(c); }
        void setPageCount(int c) { count = Math.max(1, c); }
        void setOnPageChangedListener(PageChangedListener l) { listener = l; }

        void goToPage(int p, boolean smooth) {
            page = Math.max(0, Math.min(count - 1, p));
            if (smooth) smoothScrollTo(page * screenWidth, 0);
            else scrollTo(page * screenWidth, 0);
            if (listener != null) listener.onChanged(page);
        }

        @Override public boolean onTouchEvent(MotionEvent e) {
            boolean r = super.onTouchEvent(e);
            if (e.getAction() == MotionEvent.ACTION_UP || e.getAction() == MotionEvent.ACTION_CANCEL) {
                int target = Math.round(getScrollX() / (float)Math.max(1, screenWidth));
                goToPage(target, true);
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
}
