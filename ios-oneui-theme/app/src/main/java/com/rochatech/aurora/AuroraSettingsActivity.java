package com.rochatech.aurora;

import android.app.Activity;
import android.app.WallpaperManager;
import android.app.role.RoleManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Shader;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class AuroraSettingsActivity extends Activity {
    public static final String PREFS = "aurora_settings";
    public static final String KEY_STYLE = "wallpaper_style";
    private static final int REQ_HOME_ROLE = 4201;

    private static final String[] WALLPAPER_NAMES = {
            "Glass", "Sky", "Violet", "Sunset", "Aqua", "Rose", "Graphite", "Midnight"
    };

    private FrameLayout root;
    private LinearLayout body;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        configureWindow();
        build();
    }

    private void configureWindow() {
        Window w = getWindow();
        w.setStatusBarColor(Color.rgb(246,247,251));
        w.setNavigationBarColor(Color.rgb(246,247,251));
        w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    }

    private void build() {
        root = new FrameLayout(this);
        root.setBackground(makePageBackground());

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);

        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18), dp(22), dp(18), dp(34));
        scroll.addView(body, new ScrollView.LayoutParams(-1, -2));
        root.addView(scroll, new FrameLayout.LayoutParams(-1, -1));

        TextView eyebrow = text("AURORA", 12, Color.rgb(110,110,115), true);
        eyebrow.setLetterSpacing(.10f);
        body.addView(eyebrow);

        TextView title = text("Premium Light", 34, Color.rgb(28,28,30), true);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-1, -2);
        tp.setMargins(0, dp(3), 0, dp(4));
        body.addView(title, tp);

        TextView sub = text("Sua Tela de Início, com visual refinado e fluido.", 15, Color.rgb(110,110,115), false);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, -2);
        sp.setMargins(0, 0, 0, dp(18));
        body.addView(sub, sp);

        body.addView(heroCard(), new LinearLayout.LayoutParams(-1, dp(158)));

        addSection("PERSONALIZAÇÃO",
                settingsRow("Papéis de Parede", "Escolha o visual da Home e da Tela Bloqueada", "◐", v -> showWallpaperChoices()),
                settingsRow("Editar Tela de Início", "Widgets, organização e modo de edição", "＋", v -> openHomeEditor()));

        addSection("TELA DE INÍCIO",
                settingsRow("Abrir Aurora", "Visualizar sua Home agora", "↗", v -> openPremiumHome()),
                settingsRow("Definir como padrão", "Escolher Aurora como Tela de Início", "⌂", v -> requestHomeRole()));

        addSection("SISTEMA",
                settingsRow("Trocar launcher", "Voltar para One UI ou escolher outro", "⚙", v -> openHomeSettings()),
                settingsRow("Reaplicar fundo", "Atualizar Home e Tela Bloqueada", "↻", v -> {
                    applyWallpapers(currentStyle(), true);
                    Toast.makeText(this, "Papel de parede atualizado", Toast.LENGTH_SHORT).show();
                }));

        TextView footer = text("Aurora 5.1", 12, Color.rgb(142,142,147), false);
        footer.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(-1, -2);
        fp.setMargins(0, dp(18), 0, dp(8));
        body.addView(footer, fp);

        setContentView(root);
        if ("wallpaper".equals(getIntent().getStringExtra("section"))) {
            body.postDelayed(this::showWallpaperChoices, 140);
        }
    }

    private View heroCard() {
        FrameLayout card = new FrameLayout(this);
        card.setBackground(glassCard(28));
        card.setElevation(dp(8));
        card.setPadding(dp(18), dp(16), dp(18), dp(16));

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.addView(text("Aurora está pronto", 19, Color.rgb(28,28,30), true));
        TextView desc = text("Aplicar visual, fundo e definir como Tela de Início.", 14, Color.rgb(99,99,102), false);
        LinearLayout.LayoutParams dpv = new LinearLayout.LayoutParams(-1, -2);
        dpv.topMargin = dp(4);
        content.addView(desc, dpv);

        TextView button = text("Aplicar Aurora", 16, Color.WHITE, true);
        button.setGravity(Gravity.CENTER);
        button.setBackground(roundRect(Color.rgb(0,122,255), 22));
        pressable(button);
        button.setOnClickListener(v -> applyAurora());
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1, dp(46));
        bp.topMargin = dp(16);
        content.addView(button, bp);

        card.addView(content, new FrameLayout.LayoutParams(-1, -1));
        pressable(card);
        return card;
    }

    private void addSection(String label, View... rows) {
        TextView h = text(label, 12, Color.rgb(110,110,115), false);
        h.setLetterSpacing(.06f);
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(-1, -2);
        hp.setMargins(dp(12), dp(20), 0, dp(8));
        body.addView(h, hp);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(glassCard(20));
        card.setClipToOutline(true);
        card.setElevation(dp(4));
        for (int i=0;i<rows.length;i++) {
            card.addView(rows[i], new LinearLayout.LayoutParams(-1, dp(72)));
            if (i < rows.length-1) {
                View line = new View(this);
                line.setBackgroundColor(Color.argb(105, 198,198,203));
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(.6f));
                lp.leftMargin = dp(62);
                card.addView(line, lp);
            }
        }
        body.addView(card, new LinearLayout.LayoutParams(-1, -2));
    }

    private View settingsRow(String title, String desc, String symbol, View.OnClickListener click) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(12), dp(8), dp(12), dp(8));
        row.setOnClickListener(click);
        pressable(row);

        TextView icon = text(symbol, 19, Color.rgb(0,122,255), true);
        icon.setGravity(Gravity.CENTER);
        icon.setBackground(roundRect(Color.argb(155, 235,242,255), 13));
        row.addView(icon, new LinearLayout.LayoutParams(dp(38), dp(38)));

        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0, -1, 1f);
        cp.setMargins(dp(12), 0, dp(8), 0);
        row.addView(copy, cp);
        copy.addView(text(title, 16, Color.rgb(28,28,30), false));
        TextView d = text(desc, 12.5f, Color.rgb(142,142,147), false);
        d.setSingleLine(true);
        d.setEllipsize(android.text.TextUtils.TruncateAt.END);
        copy.addView(d);

        TextView chevron = text("›", 27, Color.rgb(174,174,178), false);
        chevron.setGravity(Gravity.CENTER);
        row.addView(chevron, new LinearLayout.LayoutParams(dp(20), -1));
        return row;
    }

    private void applyAurora() {
        applyWallpapers(currentStyle(), true);
        requestHomeRole();
    }

    private void requestHomeRole() {
        try {
            RoleManager rm = (RoleManager)getSystemService(Context.ROLE_SERVICE);
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)) {
                if (rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                    openPremiumHome();
                } else {
                    startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), REQ_HOME_ROLE);
                }
            } else {
                openHomeSettings();
            }
        } catch (Exception e) {
            openHomeSettings();
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_HOME_ROLE) {
            if (resultCode == RESULT_OK) openPremiumHome();
            else openHomeSettings();
        }
    }

    private void openPremiumHome() {
        try {
            Intent i = new Intent(this, PremiumLauncherActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "Não foi possível abrir a Tela de Início.", Toast.LENGTH_SHORT).show();
        }
    }

    private void openHomeEditor() {
        try {
            Intent i = new Intent(this, PremiumLauncherActivity.class);
            i.putExtra("openEditor", true);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "Aplique o Aurora primeiro.", Toast.LENGTH_SHORT).show();
        }
    }

    private void openHomeSettings() {
        try { startActivity(new Intent(Settings.ACTION_HOME_SETTINGS)); }
        catch (Exception e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
    }

    private void showWallpaperChoices() {
        View old = root.findViewWithTag("wallpaper_sheet");
        if (old != null) root.removeView(old);

        FrameLayout overlay = new FrameLayout(this);
        overlay.setTag("wallpaper_sheet");
        overlay.setBackgroundColor(Color.argb(74, 0,0,0));
        overlay.setOnClickListener(v -> closeSheet(overlay));

        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(14), dp(10), dp(14), dp(14));
        sheet.setBackground(roundRect(Color.rgb(249,249,251), 30));
        sheet.setElevation(dp(24));
        sheet.setTranslationY(dp(70));
        sheet.setAlpha(0f);
        sheet.setOnClickListener(v -> {});

        View handle = new View(this);
        handle.setBackground(roundRect(Color.rgb(198,198,203), 3));
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(dp(38), dp(5));
        hp.gravity = Gravity.CENTER_HORIZONTAL;
        hp.bottomMargin = dp(8);
        sheet.addView(handle, hp);

        TextView heading = text("Papéis de Parede", 21, Color.rgb(28,28,30), true);
        heading.setGravity(Gravity.CENTER);
        sheet.addView(heading, new LinearLayout.LayoutParams(-1, dp(42)));

        ScrollView scroll = new ScrollView(this);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(2);
        grid.setPadding(0, dp(4), 0, dp(8));

        for (int i=0;i<WALLPAPER_NAMES.length;i++) {
            final int style = i;
            LinearLayout option = new LinearLayout(this);
            option.setOrientation(LinearLayout.VERTICAL);
            option.setGravity(Gravity.CENTER_HORIZONTAL);
            option.setPadding(dp(5), dp(5), dp(5), dp(7));
            option.setBackground(roundRect(Color.WHITE, 18));
            option.setElevation(dp(2));
            pressable(option);

            FrameLayout previewWrap = new FrameLayout(this);
            View preview = new View(this);
            preview.setBackground(makePreview(style));
            previewWrap.addView(preview, new FrameLayout.LayoutParams(-1, -1));
            if (currentStyle() == style) {
                TextView check = text("✓", 16, Color.WHITE, true);
                check.setGravity(Gravity.CENTER);
                check.setBackground(roundRect(Color.rgb(0,122,255), 13));
                FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(dp(26), dp(26), Gravity.TOP | Gravity.END);
                cp.topMargin = dp(6); cp.rightMargin = dp(6);
                previewWrap.addView(check, cp);
            }
            option.addView(previewWrap, new LinearLayout.LayoutParams(-1, dp(108)));

            TextView name = text(WALLPAPER_NAMES[i], 14, Color.rgb(28,28,30), false);
            name.setGravity(Gravity.CENTER);
            option.addView(name, new LinearLayout.LayoutParams(-1, dp(30)));

            option.setOnClickListener(v -> {
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_STYLE, style).apply();
                applyWallpapers(style, true);
                closeSheet(overlay);
                Toast.makeText(this, WALLPAPER_NAMES[style] + " aplicado", Toast.LENGTH_SHORT).show();
            });

            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(i % 2, 1, 1f);
            gp.width = 0;
            gp.height = dp(150);
            gp.setMargins(dp(4), dp(4), dp(4), dp(4));
            option.setLayoutParams(gp);
            grid.addView(option);
        }

        scroll.addView(grid, new ScrollView.LayoutParams(-1, -2));
        sheet.addView(scroll, new LinearLayout.LayoutParams(-1, dp(430)));

        TextView cancel = text("Cancelar", 17, Color.rgb(0,122,255), true);
        cancel.setGravity(Gravity.CENTER);
        cancel.setOnClickListener(v -> closeSheet(overlay));
        sheet.addView(cancel, new LinearLayout.LayoutParams(-1, dp(48)));

        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        sp.leftMargin = dp(8); sp.rightMargin = dp(8); sp.bottomMargin = dp(8);
        overlay.addView(sheet, sp);
        root.addView(overlay, new FrameLayout.LayoutParams(-1, -1));
        overlay.setAlpha(0f);
        overlay.animate().alpha(1f).setDuration(170).start();
        sheet.animate().translationY(0).alpha(1f).setDuration(240).start();
    }

    private void closeSheet(FrameLayout overlay) {
        if (overlay == null) return;
        View sheet = overlay.getChildCount() > 0 ? overlay.getChildAt(0) : null;
        if (sheet != null) sheet.animate().translationY(dp(60)).alpha(0f).setDuration(170).start();
        overlay.animate().alpha(0f).setDuration(180).withEndAction(() -> {
            if (root != null) root.removeView(overlay);
        }).start();
    }

    public void applyWallpapers(int style, boolean includeLock) {
        try {
            WallpaperManager wm = WallpaperManager.getInstance(this);
            Bitmap home = makeWallpaper(style, false);
            wm.setBitmap(home, null, true, WallpaperManager.FLAG_SYSTEM);
            home.recycle();
            if (includeLock) {
                Bitmap lock = makeWallpaper(style, true);
                wm.setBitmap(lock, null, true, WallpaperManager.FLAG_LOCK);
                lock.recycle();
            }
        } catch (Exception e) {
            Toast.makeText(this, "O Aurora continuará usando o fundo interno selecionado.", Toast.LENGTH_SHORT).show();
        }
    }

    private Bitmap makeWallpaper(int style, boolean lock) {
        int w = Math.max(1080, getResources().getDisplayMetrics().widthPixels);
        int h = Math.max(2340, getResources().getDisplayMetrics().heightPixels);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        int[] a = wallpaperPalette(style, lock);
        p.setShader(new LinearGradient(0,0,w,h,a[0],a[1], Shader.TileMode.CLAMP));
        c.drawRect(0,0,w,h,p);
        p.setShader(new RadialGradient(w*.16f,h*.22f,w*.64f,a[2],Color.TRANSPARENT,Shader.TileMode.CLAMP));
        c.drawCircle(w*.16f,h*.22f,w*.64f,p);
        p.setShader(new RadialGradient(w*.86f,h*.72f,w*.70f,a[3],Color.TRANSPARENT,Shader.TileMode.CLAMP));
        c.drawCircle(w*.86f,h*.72f,w*.70f,p);
        p.setShader(null);
        return b;
    }

    private int[] wallpaperPalette(int style, boolean lock) {
        int[][] p = {
                {0xFFF2F4FF,0xFFE8F2FF,0x99C6D7FF,0x88F4C8E4},
                {0xFFECF7FF,0xFFE4EBFF,0x99BDE7FF,0x889EBBFF},
                {0xFFF3ECFF,0xFFECEBFF,0x99CDB8FF,0x88F1C6FF},
                {0xFFFFF0EC,0xFFF4E9FF,0x99FFD0BD,0x88EFC7F7},
                {0xFFEAFBFA,0xFFE8F0FF,0x99B5F0E8,0x88BAD5FF},
                {0xFFFFEFF6,0xFFF2ECFF,0x99FFC5DB,0x88E0C8FF},
                {0xFFF0F1F4,0xFFE4E7EC,0x99CCD1DA,0x889FA9B8},
                {0xFFEEF1FA,0xFFE7E8F4,0x99B8C8EE,0x88CDB4E6}
        };
        int[] a = p[Math.max(0, Math.min(p.length-1, style))].clone();
        if (lock) {
            a[0] = darken(a[0], .80f);
            a[1] = darken(a[1], .80f);
            a[2] = (a[2] & 0x00FFFFFF) | (90 << 24);
            a[3] = (a[3] & 0x00FFFFFF) | (82 << 24);
        }
        return a;
    }

    private GradientDrawable makePreview(int style) {
        int[] a = wallpaperPalette(style, false);
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{a[0],a[1]});
        g.setCornerRadius(dp(15));
        return g;
    }

    private int currentStyle() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getInt(KEY_STYLE, 0);
    }

    private int darken(int color, float f) {
        return Color.rgb((int)(Color.red(color)*f), (int)(Color.green(color)*f), (int)(Color.blue(color)*f));
    }

    private TextView text(String s, float size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(size);
        t.setTextColor(color);
        if (bold) t.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return t;
    }

    private GradientDrawable glassCard(int radius) {
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.argb(235,255,255,255), Color.argb(210,248,249,252)});
        g.setCornerRadius(dp(radius));
        g.setStroke(dp(.7f), Color.argb(150,255,255,255));
        return g;
    }

    private GradientDrawable roundRect(int color, int radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radius));
        return g;
    }

    private GradientDrawable makePageBackground() {
        return new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{Color.rgb(247,248,252), Color.rgb(240,244,252), Color.rgb(248,244,251)});
    }

    private void pressable(View v) {
        v.setOnTouchListener((view, event) -> {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                view.animate().scaleX(.985f).scaleY(.985f).setDuration(85).start();
            } else if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
                view.animate().scaleX(1f).scaleY(1f).setDuration(160).start();
            }
            return false;
        });
    }

    private int dp(float n) {
        return (int)(n * getResources().getDisplayMetrics().density + .5f);
    }
}
