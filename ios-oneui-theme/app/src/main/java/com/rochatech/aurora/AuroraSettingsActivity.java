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
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class AuroraSettingsActivity extends Activity {
    public static final String PREFS = "aurora_settings";
    public static final String KEY_STYLE = "wallpaper_style";
    private LinearLayout body;
    private FrameLayout root;

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
                row("Papel de Parede", "Escolher o visual da Tela de Início e Bloqueada", v -> showWallpaperChoices()),
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
        dim.setBackgroundColor(Color.argb(70,0,0,0));
        dim.setOnClickListener(v -> root.removeView(dim));

        LinearLayout sheet = new LinearLayout(this);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(16), dp(14), dp(16), dp(18));
        sheet.setBackground(roundRect(Color.rgb(248,248,250), 28));
        sheet.setElevation(dp(24));
        sheet.setOnClickListener(v -> {});

        TextView heading = text("Papel de Parede", 20, Color.rgb(28,28,30), true);
        heading.setGravity(Gravity.CENTER);
        sheet.addView(heading, new LinearLayout.LayoutParams(-1, dp(42)));

        String[] names = {"Glass", "Azul", "Grafite"};
        for (int i=0;i<names.length;i++) {
            final int style = i;
            LinearLayout option = new LinearLayout(this);
            option.setGravity(Gravity.CENTER_VERTICAL);
            option.setPadding(dp(14), dp(8), dp(14), dp(8));
            option.setBackground(roundRect(Color.WHITE, 14));

            View preview = new View(this);
            preview.setBackground(makePreview(style));
            option.addView(preview, new LinearLayout.LayoutParams(dp(52), dp(52)));

            TextView name = text(names[i], 17, Color.rgb(28,28,30), false);
            LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(0,-2,1f);
            np.leftMargin = dp(14);
            option.addView(name,np);

            TextView check = text(currentStyle()==style ? "✓" : "", 20, Color.rgb(0,122,255), true);
            option.addView(check,new LinearLayout.LayoutParams(dp(30),-2));
            option.setOnClickListener(v -> {
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_STYLE, style).apply();
                applyWallpapers(style, true);
                root.removeView(dim);
                Toast.makeText(this, "Visual aplicado", Toast.LENGTH_SHORT).show();
            });
            LinearLayout.LayoutParams op = new LinearLayout.LayoutParams(-1, dp(68));
            op.setMargins(0, dp(4), 0, dp(4));
            sheet.addView(option, op);
        }

        TextView cancel = text("Cancelar", 17, Color.rgb(0,122,255), true);
        cancel.setGravity(Gravity.CENTER);
        cancel.setOnClickListener(v -> root.removeView(dim));
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(-1, dp(48));
        cp.topMargin = dp(6);
        sheet.addView(cancel, cp);

        FrameLayout.LayoutParams sp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        sp.leftMargin = dp(10); sp.rightMargin = dp(10); sp.bottomMargin = dp(10);
        dim.addView(sheet, sp);
        root.addView(dim, new FrameLayout.LayoutParams(-1,-1));
    }

    private GradientDrawable makePreview(int style) {
        int[] colors;
        if (style == 1) colors = new int[]{Color.rgb(48,104,165), Color.rgb(124,164,202)};
        else if (style == 2) colors = new int[]{Color.rgb(23,25,31), Color.rgb(70,73,82)};
        else colors = new int[]{Color.rgb(78,99,158), Color.rgb(157,96,167)};
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TL_BR, colors);
        g.setCornerRadius(dp(13));
        return g;
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

        int start, end, glow1, glow2;
        if (style == 1) {
            start = Color.rgb(23,61,106); end = Color.rgb(95,121,164);
            glow1 = Color.argb(lock?105:178,102,194,230); glow2 = Color.argb(lock?95:160,111,84,202);
        } else if (style == 2) {
            start = Color.rgb(15,17,22); end = Color.rgb(45,47,55);
            glow1 = Color.argb(lock?70:110,116,130,160); glow2 = Color.argb(lock?60:92,58,95,115);
        } else {
            start = Color.rgb(55,69,111); end = Color.rgb(125,82,134);
            glow1 = Color.argb(lock?100:174,132,211,235); glow2 = Color.argb(lock?90:155,59,146,175);
        }
        if (lock) { start = darken(start,.74f); end = darken(end,.74f); }

        p.setShader(new LinearGradient(0,0,w,h,start,end, Shader.TileMode.CLAMP));
        c.drawRect(0,0,w,h,p);
        p.setShader(new RadialGradient(w*.14f,h*.22f,w*.60f,glow1,Color.TRANSPARENT,Shader.TileMode.CLAMP));
        c.drawCircle(w*.14f,h*.22f,w*.60f,p);
        p.setShader(new RadialGradient(w*.88f,h*.70f,w*.68f,glow2,Color.TRANSPARENT,Shader.TileMode.CLAMP));
        c.drawCircle(w*.88f,h*.70f,w*.68f,p);
        p.setShader(null);
        return b;
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
