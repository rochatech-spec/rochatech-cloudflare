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

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.rgb(245,245,247));
        w.setNavigationBarColor(Color.rgb(245,245,247));
        w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        build();
    }

    private void build() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(245,245,247));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18), dp(28), dp(18), dp(34));
        scroll.addView(body, new ScrollView.LayoutParams(-1, -2));
        root.addView(scroll, new FrameLayout.LayoutParams(-1,-1));

        TextView title = text("Aurora", 34, Color.BLACK, true);
        body.addView(title);

        TextView subtitle = text("Tela de início com aparência iPhone, feita para o seu Galaxy.", 15, Color.rgb(110,110,115), false);
        LinearLayout.LayoutParams subP = new LinearLayout.LayoutParams(-1,-2);
        subP.setMargins(0, dp(4), 0, dp(24));
        body.addView(subtitle, subP);

        addGroup("Aparência",
                row("Aplicar Aurora", "Define o Aurora como sua Tela de Início", v -> applyAurora()),
                row("Papéis de parede", "Escolher o visual da Home e da tela de bloqueio", v -> showWallpaperChoices()),
                row("Tela de bloqueio", "Aplicar novamente o visual combinado", v -> {
                    applyWallpapers(currentStyle(), true);
                    Toast.makeText(this, "Tela de bloqueio atualizada", Toast.LENGTH_SHORT).show();
                }));

        addGroup("Widgets",
                row("Adicionar widget", "Compatível com widgets Android e iWidgets", v -> openHomeEditor()));

        addGroup("Samsung",
                row("Personalizar bloqueio", "Abrir os controles da One UI", v -> openLockCustomization()),
                row("Voltar para One UI", "Escolher outra Tela de Início", v -> openHomeSettings()));

        TextView footer = text("Aurora • RochaTech", 12, Color.rgb(142,142,147), false);
        footer.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(-1,-2);
        fp.setMargins(0, dp(18), 0, dp(8));
        body.addView(footer, fp);

        setContentView(root);

        if ("wallpaper".equals(getIntent().getStringExtra("section"))) {
            body.postDelayed(this::showWallpaperChoices, 180);
        }
    }

    private View row(String title, String desc, View.OnClickListener click) {
        LinearLayout r = new LinearLayout(this);
        r.setOrientation(LinearLayout.VERTICAL);
        r.setPadding(dp(16), dp(13), dp(16), dp(13));
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
            } else {
                startActivity(new Intent(this, AuroraLauncherActivity.class));
            }
        } catch (Exception e) {
            openHomeSettings();
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 4201) {
            try { startActivity(new Intent(this, AuroraLauncherActivity.class)); } catch (Exception ignored) {}
        }
    }

    private void showWallpaperChoices() {
        String[] names = {"iOS Glass", "Azul Aurora", "Grafite"};
        new android.app.AlertDialog.Builder(this)
                .setTitle("Papéis de parede")
                .setSingleChoiceItems(names, currentStyle(), (dialog, which) -> {
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_STYLE, which).apply();
                    applyWallpapers(which, true);
                    dialog.dismiss();
                    Toast.makeText(this, "Visual aplicado", Toast.LENGTH_SHORT).show();
                }).show();
    }

    private void openHomeEditor() {
        try {
            Intent i = new Intent(this, AuroraLauncherActivity.class);
            i.putExtra("openEditor", true);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, "Aplique o Aurora primeiro.", Toast.LENGTH_SHORT).show();
        }
    }

    private void openLockCustomization() {
        try {
            Intent goodLock = getPackageManager().getLaunchIntentForPackage("com.samsung.android.goodlock");
            if (goodLock != null) { startActivity(goodLock); return; }
        } catch (Exception ignored) {}
        try { startActivity(new Intent("android.settings.LOCK_SCREEN_SETTINGS")); }
        catch (Exception e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
    }

    private void openHomeSettings() {
        try { startActivity(new Intent(Settings.ACTION_HOME_SETTINGS)); }
        catch (Exception e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
    }

    private int currentStyle() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getInt(KEY_STYLE, 0);
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
            Toast.makeText(this, "Não foi possível aplicar o papel de parede.", Toast.LENGTH_SHORT).show();
        }
    }

    private Bitmap makeWallpaper(int style, boolean lock) {
        int w = Math.max(1080, getResources().getDisplayMetrics().widthPixels);
        int h = Math.max(2340, getResources().getDisplayMetrics().heightPixels);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        int start, end, glow1, glow2;
        if (style == 1) {
            start = Color.rgb(18,65,103); end = Color.rgb(76,118,155);
            glow1 = Color.argb(lock?105:170, 104,194,220);
            glow2 = Color.argb(lock?95:155, 93,126,203);
        } else if (style == 2) {
            start = Color.rgb(18,20,24); end = Color.rgb(47,49,55);
            glow1 = Color.argb(lock?70:105, 120,132,150);
            glow2 = Color.argb(lock?60:95, 64,100,111);
        } else {
            start = Color.rgb(43,64,94); end = Color.rgb(110,83,127);
            glow1 = Color.argb(lock?100:165, 136,205,224);
            glow2 = Color.argb(lock?90:150, 57,143,158);
        }

        if (lock) { start = darken(start, .72f); end = darken(end, .72f); }

        p.setShader(new LinearGradient(0,0,w,h,start,end, Shader.TileMode.CLAMP));
        c.drawRect(0,0,w,h,p);

        p.setShader(new RadialGradient(w*.16f,h*.24f,w*.62f,glow1,Color.TRANSPARENT, Shader.TileMode.CLAMP));
        c.drawCircle(w*.16f,h*.24f,w*.62f,p);
        p.setShader(new RadialGradient(w*.88f,h*.72f,w*.68f,glow2,Color.TRANSPARENT, Shader.TileMode.CLAMP));
        c.drawCircle(w*.88f,h*.72f,w*.68f,p);

        p.setShader(null);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(w*.035f);
        p.setColor(Color.argb(lock?22:34,255,255,255));
        c.drawOval(-w*.18f,h*.47f,w*1.10f,h*1.02f,p);
        p.setStyle(Paint.Style.FILL);
        return b;
    }

    private int darken(int color, float f) {
        return Color.rgb((int)(Color.red(color)*f),(int)(Color.green(color)*f),(int)(Color.blue(color)*f));
    }

    private TextView text(String s, float size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(size);
        t.setTextColor(color);
        if (bold) t.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        return t;
    }

    private GradientDrawable roundRect(int color, int radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radius));
        return g;
    }

    private int dp(float n) { return (int)(n * getResources().getDisplayMetrics().density + .5f); }
}
