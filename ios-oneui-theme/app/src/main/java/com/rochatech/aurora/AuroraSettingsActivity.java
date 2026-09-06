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
    private LinearLayout body;
    private FrameLayout root;

    private static final String[] WALLPAPER_NAMES = {
            "Glass", "Sky", "Violet", "Sunset", "Aqua", "Rose", "Graphite", "Midnight"
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.rgb(242,242,247));
        w.setNavigationBarColor(Color.rgb(242,242,247));
        w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        build();
    }

    private void build() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(242,242,247));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18), dp(22), dp(18), dp(36));
        scroll.addView(body, new ScrollView.LayoutParams(-1, -2));
        root.addView(scroll, new FrameLayout.LayoutParams(-1,-1));

        TextView title = text("Aurora", 34, Color.rgb(28,28,30), true);
        body.addView(title);

        TextView subtitle = text("Tela de Início", 15, Color.rgb(110,110,115), false);
        LinearLayout.LayoutParams subP = new LinearLayout.LayoutParams(-1,-2);
        subP.setMargins(0, dp(2), 0, dp(22));
        body.addView(subtitle, subP);

        addGroup("Aparência",
                row("Aplicar Aurora", "Usar esta Tela de Início", v -> applyAurora()),
                row("Papéis de Parede", "Escolher entre os visuais do Aurora", v -> showWallpaperChoices()),
                row("Tela Bloqueada", "Aplicar novamente o visual combinado", v -> {
                    applyWallpapers(currentStyle(), true);
                    Toast.makeText(this, "Tela Bloqueada atualizada", Toast.LENGTH_SHORT).show();
                }));

        addGroup("Tela de Início",
                row("Adicionar Widget", "Adicionar um widget à primeira página", v -> openHomeEditor()),
                row("Editar Tela de Início", "Organizar a aparência e os widgets", v -> openHomeEditor()));

        addGroup("Sistema",
                row("Alterar Tela de Início", "Escolher outra Tela de Início padrão", v -> openHomeSettings()));

        TextView footer = text("Aurora", 12, Color.rgb(142,142,147), false);
        footer.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(-1,-2);
        fp.setMargins(0, dp(18), 0, dp(8));
        body.addView(footer, fp);

        setContentView(root);
        if ("wallpaper".equals(getIntent().getStringExtra("section"))) body.postDelayed(this::showWallpaperChoices, 160);
    }

    private View row(String title, String desc, View.OnClickListener click) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.VERTICAL);
        r.setPadding(dp(16), dp(12), dp(16), dp(12));
        r.setBackgroundColor(Color.WHITE);
        r.setOnClickListener(click);
        r.setClickable(true);

        TextView t = text(title, 17, Color.rgb(28,28,30), false);
        r.addView(t);
        TextView d = text(desc, 13, Color.rgb(142,142,147), false);
        LinearLayout.LayoutParams dpv = new LinearLayout.LayoutParams(-1,-2);
        dpv.topMargin = dp(2);
        r.addView(d, dpv);
        return r;
    }

    private void addGroup(String name, View... rows) {
        TextView label = text(name.toUpperCase(), 12, Color.rgb(110,110,115), false);
        label.setLetterSpacing(.05f);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1,-2);
        lp.setMargins(dp(14), dp(10), 0, dp(7));
        body.addView(label, lp);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(roundRect(Color.WHITE, 14));
        card.setClipToOutline(true);
        for (int i=0;i<rows.length;i++) {
            card.addView(rows[i], new LinearLayout.LayoutParams(-1,-2));
            if (i < rows.length-1) {
                View line = new View(this);
                line.setBackgroundColor(Color.rgb(229,229,234));
                LinearLayout.LayoutParams lineP = new LinearLayout.LayoutParams(-1, dp(.5f));
                lineP.leftMargin = dp(16);
                card.addView(line, lineP);
            }
        }
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-1,-2);
        cp.setMargins(0,0,0,dp(12));
        body.addView(card, cp);
    }

    private void applyAurora() {
        applyWallpapers(currentStyle(), true);
        try {
            RoleManager rm = (RoleManager)getSystemService(Context.ROLE_SERVICE);
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME) && !rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), 4201);
            } else startActivity(new Intent(this, AuroraLauncherActivity.class));
        } catch (Exception e) { openHomeSettings(); }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 4201) {
            try { startActivity(new Intent(this, AuroraLauncherActivity.class)); } catch (Exception ignored) {}
        }
    }

    private void showWallpaperChoices() {
        View old = root.findViewWithTag("wallpaper_sheet");
        if (old != null) root.removeView(old);

        FrameLayout dim = new FrameLayout(this);
        dim.setTag("wallpaper_sheet");
        dim.setBackgroundColor(Color.argb(75,0,0,0));
        dim.setOnClickListener(v -> root.removeView(dim));

        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(14), dp(12), dp(14), dp(14));
        sheet.setBackground(roundRect(Color.rgb(248,248,250), 28));
        sheet.setElevation(dp(24));
        sheet.setOnClickListener(v -> {});

        View handle = new View(this);
        handle.setBackground(roundRect(Color.rgb(199,199,204), 3));
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(dp(38), dp(5));
        hp.gravity = Gravity.CENTER_HORIZONTAL;
        hp.bottomMargin = dp(9);
        sheet.addView(handle, hp);

        TextView heading = text("Papéis de Parede", 20, Color.rgb(28,28,30), true);
        heading.setGravity(Gravity.CENTER);
        sheet.addView(heading, new LinearLayout.LayoutParams(-1, dp(40)));

        ScrollView scroller = new ScrollView(this);
        scroller.setOverScrollMode(View.OVER_SCROLL_NEVER);
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(2);
        grid.setPadding(0, dp(4), 0, dp(4));

        for (int i=0;i<WALLPAPER_NAMES.length;i++) {
            final int style = i;
            LinearLayout option = new LinearLayout(this);
            option.setOrientation(LinearLayout.VERTICAL);
            option.setGravity(Gravity.CENTER_HORIZONTAL);
            option.setPadding(dp(6), dp(6), dp(6), dp(8));
            option.setBackground(roundRect(Color.WHITE, 18));

            FrameLayout previewWrap = new FrameLayout(this);
            View preview = new View(this);
            preview.setBackground(makePreview(style));
            previewWrap.addView(preview, new FrameLayout.LayoutParams(-1,-1));
            if (currentStyle() == style) {
                TextView check = text("✓", 18, Color.WHITE, true);
                check.setGravity(Gravity.CENTER);
                check.setBackground(roundRect(Color.rgb(0,122,255), 13));
                FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(dp(27), dp(27), Gravity.TOP | Gravity.END);
                cp.setMargins(0, dp(6), dp(6), 0);
                previewWrap.addView(check, cp);
            }
            option.addView(previewWrap, new LinearLayout.LayoutParams(-1, dp(104)));

            TextView name = text(WALLPAPER_NAMES[i], 14, Color.rgb(28,28,30), false);
            name.setGravity(Gravity.CENTER);
            LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(-1, dp(30));
            np.topMargin = dp(4);
            option.addView(name,np);

            option.setOnClickListener(v -> {
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_STYLE, style).apply();
                applyWallpapers(style, true);
                root.removeView(dim);
                try { startActivity(new Intent(this, AuroraLauncherActivity.class)); } catch (Exception ignored) {}
                Toast.makeText(this, WALLPAPER_NAMES[style] + " aplicado", Toast.LENGTH_SHORT).show();
            });

            GridLayout.LayoutParams gp = new GridLayout.LayoutParams();
            gp.columnSpec = GridLayout.spec(i % 2, 1, 1f);
            gp.width = 0;
            gp.height = dp(154);
            gp.setMargins(dp(4), dp(4), dp(4), dp(4));
            option.setLayoutParams(gp);
            grid.addView(option);
        }

        scroller.addView(grid, new ScrollView.LayoutParams(-1,-2));
        sheet.addView(scroller, new LinearLayout.LayoutParams(-1, dp(430)));

        TextView cancel = text("Cancelar", 17, Color.rgb(0,122,255), true);
        cancel.setGravity(Gravity.CENTER);
        cancel.setOnClickListener(v -> root.removeView(dim));
        sheet.addView(cancel, new LinearLayout.LayoutParams(-1, dp(48)));

        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        sp.leftMargin = dp(8); sp.rightMargin = dp(8); sp.bottomMargin = dp(8);
        dim.addView(sheet, sp);
        root.addView(dim, new FrameLayout.LayoutParams(-1,-1));
    }

    private GradientDrawable makePreview(int style) {
        int[] c = previewColors(style);
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{c[0], c[1]});
        g.setCornerRadius(dp(15));
        return g;
    }

    private int[] previewColors(int style) {
        switch (style) {
            case 1: return new int[]{Color.rgb(92,174,236), Color.rgb(97,112,202)};
            case 2: return new int[]{Color.rgb(104,82,174), Color.rgb(184,111,207)};
            case 3: return new int[]{Color.rgb(249,142,120), Color.rgb(171,91,177)};
            case 4: return new int[]{Color.rgb(46,184,197), Color.rgb(71,123,198)};
            case 5: return new int[]{Color.rgb(237,126,169), Color.rgb(164,99,191)};
            case 6: return new int[]{Color.rgb(48,51,60), Color.rgb(99,104,116)};
            case 7: return new int[]{Color.rgb(14,23,43), Color.rgb(54,44,86)};
            default:return new int[]{Color.rgb(85,112,177), Color.rgb(162,104,178)};
        }
    }

    private void openHomeEditor() {
        try {
            Intent i = new Intent(this, AuroraLauncherActivity.class);
            i.putExtra("openEditor", true);
            startActivity(i);
        } catch (Exception e) { Toast.makeText(this, "Aplique o Aurora primeiro.", Toast.LENGTH_SHORT).show(); }
    }

    private void openHomeSettings() {
        try { startActivity(new Intent(Settings.ACTION_HOME_SETTINGS)); }
        catch (Exception e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
    }

    private int currentStyle() { return getSharedPreferences(PREFS, MODE_PRIVATE).getInt(KEY_STYLE, 0); }

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
        } catch (Exception e) { Toast.makeText(this, "Não foi possível aplicar o papel de parede.", Toast.LENGTH_SHORT).show(); }
    }

    private Bitmap makeWallpaper(int style, boolean lock) {
        int w = Math.max(1080, getResources().getDisplayMetrics().widthPixels);
        int h = Math.max(2340, getResources().getDisplayMetrics().heightPixels);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        int[] palette = wallpaperPalette(style, lock);
        int start = palette[0], end = palette[1], glow1 = palette[2], glow2 = palette[3];

        p.setShader(new LinearGradient(0,0,w,h,start,end, Shader.TileMode.CLAMP));
        c.drawRect(0,0,w,h,p);
        p.setShader(new RadialGradient(w*.15f,h*.22f,w*.61f,glow1,Color.TRANSPARENT,Shader.TileMode.CLAMP));
        c.drawCircle(w*.15f,h*.22f,w*.61f,p);
        p.setShader(new RadialGradient(w*.86f,h*.72f,w*.69f,glow2,Color.TRANSPARENT,Shader.TileMode.CLAMP));
        c.drawCircle(w*.86f,h*.72f,w*.69f,p);
        p.setShader(null);
        return b;
    }

    private int[] wallpaperPalette(int style, boolean lock) {
        int start, end, g1, g2;
        switch (style) {
            case 1:
                start=Color.rgb(54,117,190); end=Color.rgb(112,109,188);
                g1=Color.argb(176,137,220,245); g2=Color.argb(156,104,122,224); break;
            case 2:
                start=Color.rgb(73,55,132); end=Color.rgb(151,82,167);
                g1=Color.argb(170,181,142,235); g2=Color.argb(150,225,132,201); break;
            case 3:
                start=Color.rgb(189,87,114); end=Color.rgb(103,58,139);
                g1=Color.argb(174,255,183,135); g2=Color.argb(150,216,108,190); break;
            case 4:
                start=Color.rgb(30,126,146); end=Color.rgb(58,82,160);
                g1=Color.argb(174,105,232,215); g2=Color.argb(148,84,153,229); break;
            case 5:
                start=Color.rgb(166,72,121); end=Color.rgb(102,60,143);
                g1=Color.argb(172,255,170,197); g2=Color.argb(148,211,129,228); break;
            case 6:
                start=Color.rgb(34,37,44); end=Color.rgb(74,78,88);
                g1=Color.argb(112,136,149,172); g2=Color.argb(90,79,112,129); break;
            case 7:
                start=Color.rgb(9,18,36); end=Color.rgb(37,30,69);
                g1=Color.argb(122,52,101,171); g2=Color.argb(106,110,65,151); break;
            default:
                start=Color.rgb(55,69,111); end=Color.rgb(125,82,134);
                g1=Color.argb(174,132,211,235); g2=Color.argb(155,59,146,175); break;
        }
        if (lock) {
            start=darken(start,.72f); end=darken(end,.72f);
            g1=(g1 & 0x00FFFFFF) | (88 << 24);
            g2=(g2 & 0x00FFFFFF) | (78 << 24);
        }
        return new int[]{start,end,g1,g2};
    }

    private int darken(int color, float f) {
        return Color.rgb((int)(Color.red(color)*f),(int)(Color.green(color)*f),(int)(Color.blue(color)*f));
    }

    private TextView text(String s, float size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextSize(size); t.setTextColor(color);
        if (bold) t.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return t;
    }

    private GradientDrawable roundRect(int color, int radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color); g.setCornerRadius(dp(radius)); return g;
    }

    private int dp(float n) { return (int)(n * getResources().getDisplayMetrics().density + .5f); }
}
