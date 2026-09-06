package com.rochatech.aurora;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.app.WallpaperManager;
import android.app.role.RoleManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
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
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
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
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class AuroraLauncherActivity extends Activity {

    private static final int REQUEST_HOME_ROLE = 7001;
    private final Locale ptBR = new Locale("pt", "BR");
    private final Handler clockHandler = new Handler();
    private final List<AppInfo> apps = new ArrayList<>();

    private FrameLayout root;
    private TextView clockView;
    private TextView dateView;
    private TextView greetingView;

    private final Runnable clockTick = new Runnable() {
        @Override public void run() {
            updateClock();
            clockHandler.postDelayed(this, 30_000L);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();
        loadApps();
        buildHome();
        clockHandler.post(clockTick);
    }

    @Override
    protected void onResume() {
        super.onResume();
        loadApps();
        if (root != null) buildHome();
        updateClock();
    }

    @Override
    protected void onDestroy() {
        clockHandler.removeCallbacks(clockTick);
        super.onDestroy();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_HOME_ROLE) {
            if (isDefaultLauncher()) {
                applyWallpaper();
                Toast.makeText(this, "Aurora Glass aplicado ✨", Toast.LENGTH_SHORT).show();
            }
            buildHome();
        }
    }

    private void configureWindow() {
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.setFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS,
                WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    private void buildHome() {
        root = new FrameLayout(this);
        root.setBackground(makeHomeBackground());

        ScrollView scroller = new ScrollView(this);
        scroller.setFillViewport(true);
        scroller.setOverScrollMode(View.OVER_SCROLL_NEVER);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(54), dp(20), dp(24));
        scroller.addView(content, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout topRow = new LinearLayout(this);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.TOP | Gravity.CENTER_VERTICAL);

        LinearLayout timeBlock = new LinearLayout(this);
        timeBlock.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams timeParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        topRow.addView(timeBlock, timeParams);

        clockView = new TextView(this);
        clockView.setTextColor(Color.WHITE);
        clockView.setTextSize(55);
        clockView.setTypeface(android.graphics.Typeface.create("sans", android.graphics.Typeface.BOLD));
        clockView.setLetterSpacing(-0.03f);
        timeBlock.addView(clockView);

        dateView = new TextView(this);
        dateView.setTextColor(Color.argb(220, 255, 255, 255));
        dateView.setTextSize(17);
        timeBlock.addView(dateView);

        TextView settingsButton = new TextView(this);
        settingsButton.setText("⚙");
        settingsButton.setTextSize(23);
        settingsButton.setTextColor(Color.WHITE);
        settingsButton.setGravity(Gravity.CENTER);
        settingsButton.setBackground(glassShape(48, 44));
        settingsButton.setElevation(dp(10));
        settingsButton.setOnClickListener(v -> showSettings());
        topRow.addView(settingsButton, new LinearLayout.LayoutParams(dp(50), dp(50)));
        content.addView(topRow);

        LinearLayout hero = new LinearLayout(this);
        hero.setOrientation(LinearLayout.VERTICAL);
        hero.setPadding(dp(18), dp(16), dp(18), dp(16));
        hero.setBackground(glassShape(32, 26));
        hero.setElevation(dp(8));
        LinearLayout.LayoutParams heroParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        heroParams.topMargin = dp(22);
        content.addView(hero, heroParams);

        TextView brand = new TextView(this);
        brand.setText("AURORA GLASS");
        brand.setTextSize(11);
        brand.setLetterSpacing(0.16f);
        brand.setTextColor(Color.rgb(247, 245, 239));
        brand.setTypeface(android.graphics.Typeface.create("sans", android.graphics.Typeface.BOLD));
        hero.addView(brand);

        greetingView = new TextView(this);
        greetingView.setTextSize(21);
        greetingView.setTextColor(Color.WHITE);
        greetingView.setTypeface(android.graphics.Typeface.create("sans", android.graphics.Typeface.BOLD));
        LinearLayout.LayoutParams greetingParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        greetingParams.topMargin = dp(7);
        hero.addView(greetingView, greetingParams);

        TextView battery = new TextView(this);
        battery.setText("Bateria  " + batteryPercent() + "%   •   Galaxy S25 FE");
        battery.setTextSize(14);
        battery.setTextColor(Color.argb(215, 255, 255, 255));
        LinearLayout.LayoutParams batteryParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        batteryParams.topMargin = dp(5);
        hero.addView(battery, batteryParams);

        TextView search = new TextView(this);
        search.setText("⌕   Buscar aplicativos");
        search.setTextSize(16);
        search.setTextColor(Color.argb(235, 255, 255, 255));
        search.setGravity(Gravity.CENTER_VERTICAL);
        search.setPadding(dp(18), 0, dp(18), 0);
        search.setBackground(glassShape(38, 30));
        search.setElevation(dp(7));
        search.setOnClickListener(v -> showAppDrawer());
        LinearLayout.LayoutParams searchParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        searchParams.topMargin = dp(18);
        content.addView(search, searchParams);

        TextView sectionTitle = new TextView(this);
        sectionTitle.setText("Aplicativos");
        sectionTitle.setTextSize(15);
        sectionTitle.setTextColor(Color.argb(230, 255, 255, 255));
        sectionTitle.setTypeface(android.graphics.Typeface.create("sans", android.graphics.Typeface.BOLD));
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        titleParams.topMargin = dp(24);
        titleParams.bottomMargin = dp(8);
        content.addView(sectionTitle, titleParams);

        GridLayout homeGrid = new GridLayout(this);
        homeGrid.setColumnCount(4);
        homeGrid.setAlignmentMode(GridLayout.ALIGN_BOUNDS);
        List<AppInfo> favorites = pickHomeApps(12);
        for (AppInfo app : favorites) homeGrid.addView(appTile(app, true));
        content.addView(homeGrid, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout dock = new LinearLayout(this);
        dock.setOrientation(LinearLayout.HORIZONTAL);
        dock.setGravity(Gravity.CENTER);
        dock.setPadding(dp(10), dp(8), dp(10), dp(8));
        dock.setBackground(glassShape(55, 34));
        dock.setElevation(dp(12));
        LinearLayout.LayoutParams dockParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(82));
        dockParams.topMargin = dp(14);
        content.addView(dock, dockParams);

        List<AppInfo> dockApps = pickDockApps();
        for (AppInfo app : dockApps) {
            View tile = appTile(app, false);
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f);
            dock.addView(tile, p);
        }

        root.addView(scroller, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        updateClock();

        if (!isDefaultLauncher()) showSetupCard();
    }

    private void showSetupCard() {
        final LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(18), dp(20), dp(18));
        card.setBackground(glassShape(230, 28));
        card.setElevation(dp(22));

        TextView title = new TextView(this);
        title.setText("Pronto para aplicar ✨");
        title.setTextSize(20);
        title.setTextColor(Color.rgb(18, 40, 48));
        title.setTypeface(android.graphics.Typeface.create("sans", android.graphics.Typeface.BOLD));
        card.addView(title);

        TextView desc = new TextView(this);
        desc.setText("Um toque define o Aurora Glass como sua tela inicial. O wallpaper também é aplicado automaticamente.");
        desc.setTextSize(14);
        desc.setTextColor(Color.rgb(45, 67, 73));
        desc.setLineSpacing(0, 1.12f);
        LinearLayout.LayoutParams descP = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        descP.topMargin = dp(7);
        card.addView(desc, descP);

        Button apply = new Button(this);
        apply.setText("APLICAR TEMA");
        apply.setTextSize(14);
        apply.setTextColor(Color.WHITE);
        apply.setAllCaps(false);
        apply.setTypeface(android.graphics.Typeface.create("sans", android.graphics.Typeface.BOLD));
        apply.setBackground(solidShape(Color.rgb(15, 76, 92), 22));
        apply.setOnClickListener(v -> {
            applyWallpaper();
            requestHomeRole();
        });
        LinearLayout.LayoutParams applyP = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        applyP.topMargin = dp(14);
        card.addView(apply, applyP);

        FrameLayout.LayoutParams cardP = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        cardP.leftMargin = dp(16);
        cardP.rightMargin = dp(16);
        cardP.bottomMargin = dp(24);
        root.addView(card, cardP);
    }

    private View appTile(AppInfo app, boolean showLabel) {
        LinearLayout wrapper = new LinearLayout(this);
        wrapper.setOrientation(LinearLayout.VERTICAL);
        wrapper.setGravity(Gravity.CENTER_HORIZONTAL);
        wrapper.setPadding(dp(4), dp(8), dp(4), dp(7));
        wrapper.setOnClickListener(v -> launch(app));

        FrameLayout iconCard = new FrameLayout(this);
        iconCard.setBackground(glassShape(218, 20));
        iconCard.setElevation(dp(5));

        ImageView icon = new ImageView(this);
        icon.setImageDrawable(app.icon);
        icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        int inner = dp(showLabel ? 43 : 46);
        FrameLayout.LayoutParams iconP = new FrameLayout.LayoutParams(inner, inner, Gravity.CENTER);
        iconCard.addView(icon, iconP);
        wrapper.addView(iconCard, new LinearLayout.LayoutParams(dp(58), dp(58)));

        if (showLabel) {
            TextView label = new TextView(this);
            label.setText(app.label);
            label.setTextColor(Color.WHITE);
            label.setTextSize(11);
            label.setGravity(Gravity.CENTER);
            label.setSingleLine(true);
            label.setEllipsize(android.text.TextUtils.TruncateAt.END);
            LinearLayout.LayoutParams labelP = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            labelP.topMargin = dp(5);
            wrapper.addView(label, labelP);
        }

        GridLayout.LayoutParams gridP = new GridLayout.LayoutParams();
        gridP.width = 0;
        gridP.height = ViewGroup.LayoutParams.WRAP_CONTENT;
        gridP.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f);
        gridP.setMargins(dp(1), dp(1), dp(1), dp(1));
        wrapper.setLayoutParams(gridP);
        return wrapper;
    }

    private void showAppDrawer() {
        Dialog dialog = new Dialog(this, android.R.style.Theme_Material_Light_NoActionBar);
        Window w = dialog.getWindow();
        if (w != null) {
            w.setBackgroundDrawableResource(android.R.color.transparent);
            w.setDimAmount(0f);
        }

        FrameLayout page = new FrameLayout(this);
        page.setBackgroundColor(Color.rgb(16, 35, 42));

        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18), dp(48), dp(18), dp(18));
        page.addView(body, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout heading = new LinearLayout(this);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText("Biblioteca de Apps");
        title.setTextSize(25);
        title.setTextColor(Color.WHITE);
        title.setTypeface(android.graphics.Typeface.create("sans", android.graphics.Typeface.BOLD));
        heading.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView close = new TextView(this);
        close.setText("✕");
        close.setTextSize(20);
        close.setTextColor(Color.WHITE);
        close.setGravity(Gravity.CENTER);
        close.setBackground(glassShape(42, 20));
        close.setOnClickListener(v -> dialog.dismiss());
        heading.addView(close, new LinearLayout.LayoutParams(dp(44), dp(44)));
        body.addView(heading);

        EditText search = new EditText(this);
        search.setHint("Buscar");
        search.setHintTextColor(Color.argb(160, 255, 255, 255));
        search.setTextColor(Color.WHITE);
        search.setSingleLine(true);
        search.setTextSize(16);
        search.setPadding(dp(16), 0, dp(16), 0);
        search.setBackground(glassShape(34, 24));
        LinearLayout.LayoutParams searchP = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        searchP.topMargin = dp(20);
        searchP.bottomMargin = dp(14);
        body.addView(search, searchP);

        ScrollView scroll = new ScrollView(this);
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(4);
        grid.setPadding(0, dp(4), 0, dp(30));
        scroll.addView(grid, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        body.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        fillDrawerGrid(grid, "");
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                fillDrawerGrid(grid, s.toString());
            }
            @Override public void afterTextChanged(Editable s) {}
        });

        dialog.setContentView(page);
        dialog.show();
        Window dw = dialog.getWindow();
        if (dw != null) {
            dw.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            dw.setStatusBarColor(Color.rgb(16, 35, 42));
            dw.setNavigationBarColor(Color.rgb(16, 35, 42));
        }
    }

    private void fillDrawerGrid(GridLayout grid, String query) {
        grid.removeAllViews();
        String q = query == null ? "" : query.trim().toLowerCase(ptBR);
        for (AppInfo app : apps) {
            if (!q.isEmpty() && !app.label.toLowerCase(ptBR).contains(q)) continue;
            grid.addView(appTile(app, true));
        }
    }

    private void showSettings() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(6), dp(8), dp(6), dp(4));

        TextView info = new TextView(this);
        info.setText("Aurora Glass 1.0\nTema-launcher otimizado para Galaxy S25 FE e One UI.");
        info.setTextSize(14);
        info.setTextColor(Color.DKGRAY);
        info.setPadding(dp(12), dp(8), dp(12), dp(14));
        box.addView(info);

        box.addView(settingsAction("Aplicar / atualizar tema", () -> {
            applyWallpaper();
            requestHomeRole();
        }));
        box.addView(settingsAction("Aplicar wallpaper novamente", this::applyWallpaper));
        box.addView(settingsAction("Escolher tela inicial padrão", this::openHomeSettings));
        box.addView(settingsAction("Voltar para One UI", this::openHomeSettings));

        new AlertDialog.Builder(this)
                .setTitle("Aurora Glass")
                .setView(box)
                .setNegativeButton("Fechar", null)
                .show();
    }

    private View settingsAction(String text, Runnable action) {
        TextView row = new TextView(this);
        row.setText(text);
        row.setTextSize(16);
        row.setTextColor(Color.rgb(15, 76, 92));
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), 0, dp(14), 0);
        row.setBackground(solidShape(Color.rgb(244, 247, 246), 16));
        row.setOnClickListener(v -> action.run());
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(50));
        p.bottomMargin = dp(7);
        row.setLayoutParams(p);
        return row;
    }

    private void requestHomeRole() {
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            RoleManager rm = (RoleManager) getSystemService(Context.ROLE_SERVICE);
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)) {
                if (rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                    Toast.makeText(this, "Aurora Glass já é sua tela inicial.", Toast.LENGTH_SHORT).show();
                    return;
                }
                startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), REQUEST_HOME_ROLE);
                return;
            }
        }
        openHomeSettings();
    }

    private boolean isDefaultLauncher() {
        try {
            Intent home = new Intent(Intent.ACTION_MAIN);
            home.addCategory(Intent.CATEGORY_HOME);
            ResolveInfo ri = getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
            return ri != null && ri.activityInfo != null && getPackageName().equals(ri.activityInfo.packageName);
        } catch (Exception e) {
            return false;
        }
    }

    private void openHomeSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_HOME_SETTINGS));
        } catch (Exception e) {
            Intent chooser = new Intent(Intent.ACTION_MAIN);
            chooser.addCategory(Intent.CATEGORY_HOME);
            startActivity(Intent.createChooser(chooser, "Escolha a tela inicial"));
        }
    }

    private void applyWallpaper() {
        try {
            int width = Math.max(getResources().getDisplayMetrics().widthPixels, 1080);
            int height = Math.max(getResources().getDisplayMetrics().heightPixels, 2340);
            Bitmap bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

            p.setShader(new LinearGradient(0, 0, width, height,
                    new int[]{Color.rgb(9, 49, 61), Color.rgb(15, 76, 92), Color.rgb(66, 112, 105)},
                    new float[]{0f, .46f, 1f}, Shader.TileMode.CLAMP));
            c.drawRect(0, 0, width, height, p);

            p.setShader(new RadialGradient(width * .82f, height * .18f, width * .72f,
                    new int[]{Color.argb(150, 124, 169, 130), Color.argb(0, 124, 169, 130)},
                    null, Shader.TileMode.CLAMP));
            c.drawCircle(width * .82f, height * .18f, width * .72f, p);

            p.setShader(new RadialGradient(width * .08f, height * .76f, width * .65f,
                    new int[]{Color.argb(105, 212, 163, 115), Color.argb(0, 212, 163, 115)},
                    null, Shader.TileMode.CLAMP));
            c.drawCircle(width * .08f, height * .76f, width * .65f, p);

            p.setShader(new LinearGradient(0, height * .55f, width, height,
                    Color.argb(0, 247, 245, 239), Color.argb(30, 247, 245, 239), Shader.TileMode.CLAMP));
            c.drawRect(0, height * .55f, width, height, p);

            WallpaperManager wm = WallpaperManager.getInstance(this);
            wm.setBitmap(bmp, null, true, WallpaperManager.FLAG_SYSTEM | WallpaperManager.FLAG_LOCK);
            bmp.recycle();
            Toast.makeText(this, "Wallpaper Aurora aplicado.", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Não consegui alterar o wallpaper: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void loadApps() {
        apps.clear();
        Intent intent = new Intent(Intent.ACTION_MAIN, null);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> resolved = getPackageManager().queryIntentActivities(intent, 0);
        Set<String> seen = new HashSet<>();
        for (ResolveInfo r : resolved) {
            if (r.activityInfo == null) continue;
            String pkg = r.activityInfo.packageName;
            if (getPackageName().equals(pkg) || seen.contains(pkg)) continue;
            seen.add(pkg);
            CharSequence labelCs = r.loadLabel(getPackageManager());
            Drawable icon = r.loadIcon(getPackageManager());
            apps.add(new AppInfo(labelCs == null ? pkg : labelCs.toString(), pkg,
                    r.activityInfo.name, icon));
        }
        Collator collator = Collator.getInstance(ptBR);
        apps.sort((a, b) -> collator.compare(a.label, b.label));
    }

    private List<AppInfo> pickHomeApps(int max) {
        String[] preferred = new String[]{
                "com.android.chrome",
                "com.google.android.gm",
                "com.google.android.apps.maps",
                "com.google.android.youtube",
                "com.whatsapp",
                "com.instagram.android",
                "com.spotify.music",
                "com.google.android.apps.photos",
                "com.samsung.android.calendar",
                "com.sec.android.app.sbrowser",
                "com.sec.android.app.samsungapps",
                "com.google.android.googlequicksearchbox"
        };
        List<AppInfo> result = new ArrayList<>();
        Set<String> used = new HashSet<>();
        for (String pkg : preferred) {
            AppInfo a = findPackage(pkg);
            if (a != null && used.add(a.packageName)) result.add(a);
        }
        for (AppInfo a : apps) {
            if (result.size() >= max) break;
            if (used.add(a.packageName)) result.add(a);
        }
        if (result.size() > max) return new ArrayList<>(result.subList(0, max));
        return result;
    }

    private List<AppInfo> pickDockApps() {
        String[][] choices = new String[][]{
                {"com.samsung.android.dialer", "com.google.android.dialer"},
                {"com.google.android.apps.messaging", "com.samsung.android.messaging"},
                {"com.android.chrome", "com.sec.android.app.sbrowser"},
                {"com.sec.android.app.camera"}
        };
        List<AppInfo> result = new ArrayList<>();
        Set<String> used = new HashSet<>();
        for (String[] group : choices) {
            AppInfo chosen = null;
            for (String pkg : group) {
                chosen = findPackage(pkg);
                if (chosen != null) break;
            }
            if (chosen != null && used.add(chosen.packageName)) result.add(chosen);
        }
        for (AppInfo a : apps) {
            if (result.size() >= 4) break;
            if (used.add(a.packageName)) result.add(a);
        }
        return result;
    }

    private AppInfo findPackage(String pkg) {
        for (AppInfo a : apps) if (a.packageName.equals(pkg)) return a;
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
            Toast.makeText(this, "Não foi possível abrir " + app.label, Toast.LENGTH_SHORT).show();
        }
    }

    private void updateClock() {
        if (clockView == null || dateView == null || greetingView == null) return;
        Calendar now = Calendar.getInstance();
        clockView.setText(new SimpleDateFormat("HH:mm", ptBR).format(now.getTime()));
        String date = new SimpleDateFormat("EEEE, d 'de' MMMM", ptBR).format(now.getTime());
        dateView.setText(capitalize(date));
        int hour = now.get(Calendar.HOUR_OF_DAY);
        String greeting = hour < 12 ? "Bom dia" : (hour < 18 ? "Boa tarde" : "Boa noite");
        greetingView.setText(greeting + ". Seu Galaxy, do seu jeito.");
    }

    private int batteryPercent() {
        try {
            BatteryManager bm = (BatteryManager) getSystemService(BATTERY_SERVICE);
            return bm == null ? 0 : bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
        } catch (Exception e) {
            return 0;
        }
    }

    private Drawable makeHomeBackground() {
        GradientDrawable d = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{Color.rgb(8, 46, 57), Color.rgb(15, 76, 92), Color.rgb(70, 112, 103)});
        return d;
    }

    private GradientDrawable glassShape(int alpha, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(Color.argb(alpha, 255, 255, 255));
        d.setCornerRadius(dp(radiusDp));
        d.setStroke(dp(1), Color.argb(Math.min(90, alpha + 18), 255, 255, 255));
        return d;
    }

    private GradientDrawable solidShape(int color, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(dp(radiusDp));
        return d;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return s.substring(0, 1).toUpperCase(ptBR) + s.substring(1);
    }

    private static class AppInfo {
        final String label;
        final String packageName;
        final String activityName;
        final Drawable icon;

        AppInfo(String label, String packageName, String activityName, Drawable icon) {
            this.label = label;
            this.packageName = packageName;
            this.activityName = activityName;
            this.icon = icon;
        }
    }
}
