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

public class StablePremiumLauncherActivity extends Activity {
    private static final int HOST_ID = 27027;
    private static final int REQ_PICK_WIDGET = 8201;
    private static final int REQ_BIND_WIDGET = 8202;
    private static final int REQ_CONFIG_WIDGET = 8203;
    private static final String PREFS = "aurora_home";
    private static final String KEY_WIDGET = "widget_id";

    private final Locale ptBR = new Locale("pt", "BR");
    private final List<AppInfo> apps = new ArrayList<>();
    private final List<View> editable = new ArrayList<>();
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
    private int firstHomePage = 1;
    private int homePages = 1;
    private int libraryPage = 2;
    private boolean editing;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            configureWindow();
            screenWidth = Math.max(1, getResources().getDisplayMetrics().widthPixels);
            widgetHost = new AppWidgetHost(this, HOST_ID);
            widgetManager = AppWidgetManager.getInstance(this);
            loadApps();
            buildHome();
            if (getIntent().getBooleanExtra("openEditor", false)) root.postDelayed(this::enterEditMode, 250);
        } catch (Throwable t) {
            showRecovery();
        }
    }

    @Override protected void onStart() {
        super.onStart();
        try { if (widgetHost != null) widgetHost.startListening(); } catch (Throwable ignored) {}
    }

    @Override protected void onStop() {
        try { if (widgetHost != null) widgetHost.stopListening(); } catch (Throwable ignored) {}
        super.onStop();
    }

    @Override protected void onResume() {
        super.onResume();
        hideBarsSafely();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getBooleanExtra("openEditor", false) && root != null) root.postDelayed(this::enterEditMode, 160);
    }

    private void configureWindow() {
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        hideBarsSafely();
    }

    private void hideBarsSafely() {
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                WindowInsetsController c = getWindow().getInsetsController();
                if (c != null) {
                    c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            } else {
                getWindow().getDecorView().setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            }
        } catch (Throwable ignored) {}
    }

    private void buildHome() {
        editing = false;
        editable.clear();
        root = new FrameLayout(this);
        root.setBackground(new WallpaperDrawable());
        root.setOnLongClickListener(v -> { enterEditMode(); return true; });

        scene = new LinearLayout(this);
        scene.setOrientation(LinearLayout.VERTICAL);
        root.addView(scene, new FrameLayout.LayoutParams(-1, -1));
        scene.addView(statusBar(), new LinearLayout.LayoutParams(-1, dp(46)));

        pager = new Pager();
        pager.setFillViewport(true);
        pager.setHorizontalScrollBarEnabled(false);
        pager.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout strip = new LinearLayout(this);
        strip.setOrientation(LinearLayout.HORIZONTAL);
        pager.addView(strip, new HorizontalScrollView.LayoutParams(-2, -1));

        List<AppInfo> dock = pickDock();
        List<AppInfo> home = orderedHome(dock);
        if (home.size() > 40) home = new ArrayList<>(home.subList(0, 40));

        int widgetId = prefs().getInt(KEY_WIDGET, -1);
        AppWidgetProviderInfo widgetInfo = widgetId > 0 && widgetManager != null ? widgetManager.getAppWidgetInfo(widgetId) : null;
        int firstCap = widgetInfo == null ? 20 : 12;
        int remaining = Math.max(0, home.size() - firstCap);
        homePages = Math.max(1, 1 + (int)Math.ceil(remaining / 20.0));
        libraryPage = firstHomePage + homePages;

        strip.addView(todayPage(), new LinearLayout.LayoutParams(screenWidth, -1));
        int cursor = 0;
        for (int p = 0; p < homePages; p++) {
            int cap = p == 0 ? firstCap : 20;
            List<AppInfo> slice = new ArrayList<>();
            while (cursor < home.size() && slice.size() < cap) slice.add(home.get(cursor++));
            strip.addView(homePage(slice, p == 0 ? widgetInfo : null), new LinearLayout.LayoutParams(screenWidth, -1));
        }
        strip.addView(libraryPage(), new LinearLayout.LayoutParams(screenWidth, -1));
        scene.addView(pager, new LinearLayout.LayoutParams(-1, 0, 1f));

        dockLayer = dockLayer(dock);
        FrameLayout.LayoutParams dl = new FrameLayout.LayoutParams(-1, dp(118), Gravity.BOTTOM);
        dl.leftMargin = dp(15); dl.rightMargin = dp(15); dl.bottomMargin = dp(12);
        root.addView(dockLayer, dl);

        View gesture = new View(this);
        gesture.setBackground(roundRect(Color.argb(135, 30,30,32), 4));
        FrameLayout.LayoutParams gp = new FrameLayout.LayoutParams(dp(132), dp(5), Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        gp.bottomMargin = dp(4);
        root.addView(gesture, gp);

        setContentView(root);
        pager.setCount(libraryPage + 1);
        pager.setListener(this::pageChanged);
        root.post(() -> pager.go(firstHomePage, false));
    }

    private View statusBar() {
        FrameLayout bar = new FrameLayout(this);
        bar.setPadding(dp(20), dp(4), dp(18), 0);
        TextView time = text(new SimpleDateFormat("HH:mm", ptBR).format(new Date()), 15.5f, Color.rgb(28,28,30), true);
        time.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
        bar.addView(time, new FrameLayout.LayoutParams(dp(86), -1, Gravity.START));
        TextView right = text("▮▮▮  ◒  " + battery() + "%", 12, Color.rgb(28,28,30), true);
        right.setGravity(Gravity.CENTER_VERTICAL | Gravity.END);
        bar.addView(right, new FrameLayout.LayoutParams(dp(130), -1, Gravity.END));
        return bar;
    }

    private View todayPage() {
        ScrollView scroll = new ScrollView(this);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(18), dp(10), dp(18), dp(150));
        scroll.addView(page, new ScrollView.LayoutParams(-1, -2));

        page.addView(text(new SimpleDateFormat("EEEE, d 'de' MMMM", ptBR).format(new Date()), 14, Color.rgb(99,99,102), false));
        TextView h = text("Hoje", 34, Color.rgb(28,28,30), true);
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(-1, -2); hp.setMargins(0, dp(2), 0, dp(16));
        page.addView(h, hp);

        LinearLayout pair = new LinearLayout(this);
        pair.addView(infoCard("Bateria", battery() + "%", "S25 FE"), new LinearLayout.LayoutParams(0, dp(146), 1f));
        pair.addView(new View(this), new LinearLayout.LayoutParams(dp(12), 1));
        pair.addView(infoCard("Calendário", new SimpleDateFormat("d", ptBR).format(new Date()), new SimpleDateFormat("MMMM", ptBR).format(new Date())), new LinearLayout.LayoutParams(0, dp(146), 1f));
        page.addView(pair);

        LinearLayout suggestions = glassCard(27);
        suggestions.setOrientation(LinearLayout.VERTICAL);
        suggestions.setPadding(dp(14), dp(12), dp(14), dp(10));
        suggestions.addView(text("Sugestões", 15, Color.rgb(99,99,102), false), new LinearLayout.LayoutParams(-1, dp(26)));
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER);
        for (AppInfo a : preferred(4)) row.addView(iconOnly(a, dp(54), true), new LinearLayout.LayoutParams(0, dp(82), 1f));
        suggestions.addView(row, new LinearLayout.LayoutParams(-1, 0, 1f));
        touchScale(suggestions, .98f);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1, dp(130)); sp.topMargin = dp(12);
        page.addView(suggestions, sp);

        int widgetId = prefs().getInt(KEY_WIDGET, -1);
        AppWidgetProviderInfo info = widgetId > 0 && widgetManager != null ? widgetManager.getAppWidgetInfo(widgetId) : null;
        if (info != null) {
            try {
                FrameLayout frame = new FrameLayout(this);
                frame.setBackground(glass(28)); frame.setClipToOutline(true);
                AppWidgetHostView host = widgetHost.createView(this, widgetId, info);
                host.setAppWidget(widgetId, info);
                frame.addView(host, new FrameLayout.LayoutParams(-1, -1));
                LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-1, dp(174)); wp.topMargin = dp(12);
                page.addView(frame, wp);
            } catch (Throwable ignored) {}
        }
        return scroll;
    }

    private LinearLayout infoCard(String title, String value, String footer) {
        LinearLayout card = glassCard(27);
        card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(14), dp(13), dp(14), dp(12));
        card.addView(text(title, 14, Color.rgb(99,99,102), false));
        TextView big = text(value, value.length() <= 3 ? 44 : 31, Color.rgb(28,28,30), true); big.setGravity(Gravity.CENTER);
        card.addView(big, new LinearLayout.LayoutParams(-1, 0, 1f));
        TextView foot = text(footer, 13, Color.rgb(99,99,102), false); foot.setGravity(Gravity.CENTER); card.addView(foot);
        touchScale(card, .98f);
        return card;
    }

    private View homePage(List<AppInfo> list, AppWidgetProviderInfo widgetInfo) {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL); page.setPadding(dp(12), dp(8), dp(12), dp(136));
        page.setOnLongClickListener(v -> { enterEditMode(); return true; });
        if (widgetInfo != null) {
            try {
                int id = prefs().getInt(KEY_WIDGET, -1);
                FrameLayout frame = new FrameLayout(this); frame.setBackground(glass(25)); frame.setClipToOutline(true);
                AppWidgetHostView host = widgetHost.createView(this, id, widgetInfo); host.setAppWidget(id, widgetInfo);
                frame.addView(host, new FrameLayout.LayoutParams(-1, -1));
                LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(-1, dp(152)); wp.setMargins(dp(4),0,dp(4),dp(8));
                page.addView(frame, wp);
            } catch (Throwable ignored) {}
        }
        GridLayout grid = new GridLayout(this); grid.setColumnCount(4); grid.setRowCount(5); grid.setAlignmentMode(GridLayout.ALIGN_BOUNDS);
        for (int i=0;i<list.size();i++) {
            View tile = appTile(list.get(i), true, false);
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
            lp.columnSpec = GridLayout.spec(i%4,1,1f); lp.rowSpec = GridLayout.spec(i/4,1,1f); lp.width=0; lp.height=0;
            lp.setMargins(dp(4),dp(2),dp(4),dp(2)); tile.setLayoutParams(lp); grid.addView(tile);
        }
        page.addView(grid, new LinearLayout.LayoutParams(-1,0,1f));
        return page;
    }

    private FrameLayout dockLayer(List<AppInfo> dockApps) {
        FrameLayout layer = new FrameLayout(this);
        dots = new LinearLayout(this); dots.setGravity(Gravity.CENTER);
        for (int i=0;i<homePages;i++) {
            View d = new View(this); d.setBackground(roundRect(Color.argb(i==0?210:90,52,52,54),4));
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(dp(7),dp(7)); p.setMargins(dp(3),0,dp(3),0); dots.addView(d,p);
        }
        layer.addView(dots, new FrameLayout.LayoutParams(-2,dp(20),Gravity.TOP|Gravity.CENTER_HORIZONTAL));
        LinearLayout dock = new LinearLayout(this); dock.setGravity(Gravity.CENTER); dock.setPadding(dp(12),dp(8),dp(12),dp(8));
        dock.setBackground(glass(34)); dock.setElevation(dp(7));
        for (AppInfo a:dockApps) dock.addView(appTile(a,false,true), new LinearLayout.LayoutParams(0,-1,1f));
        layer.addView(dock, new FrameLayout.LayoutParams(-1,dp(84),Gravity.BOTTOM));
        return layer;
    }

    private void pageChanged(int page) {
        int hi = page-firstHomePage;
        if (dots!=null) for(int i=0;i<dots.getChildCount();i++) dots.getChildAt(i).setBackground(roundRect(Color.argb(hi==i?215:88,52,52,54),4));
        boolean home = page>=firstHomePage && page<libraryPage;
        if (dockLayer!=null) dockLayer.animate().alpha(home?1f:0f).translationY(home?0:dp(28)).setDuration(210).start();
    }

    private View libraryPage() {
        LinearLayout page = new LinearLayout(this); page.setOrientation(LinearLayout.VERTICAL); page.setPadding(dp(18),dp(8),dp(18),dp(22));
        page.addView(text("Biblioteca de Apps",32,Color.rgb(28,28,30),true), new LinearLayout.LayoutParams(-1,dp(48)));
        librarySearch = new EditText(this); librarySearch.setHint("Buscar"); librarySearch.setHintTextColor(Color.rgb(142,142,147));
        librarySearch.setTextColor(Color.rgb(28,28,30)); librarySearch.setTextSize(16); librarySearch.setSingleLine(true); librarySearch.setPadding(dp(16),0,dp(16),0); librarySearch.setBackground(glass(17));
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(-1,dp(46)); bp.setMargins(0,dp(4),0,dp(12)); page.addView(librarySearch,bp);
        ScrollView scroll = new ScrollView(this); scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(0,0,0,dp(20));
        scroll.addView(content,new ScrollView.LayoutParams(-1,-2)); page.addView(scroll,new LinearLayout.LayoutParams(-1,0,1f));
        fillCategories(content);
        librarySearch.addTextChangedListener(new TextWatcher(){ public void beforeTextChanged(CharSequence s,int a,int b,int c){} public void afterTextChanged(Editable e){} public void onTextChanged(CharSequence s,int a,int b,int c){String q=s==null?"":s.toString().trim(); if(q.isEmpty())fillCategories(content);else fillSearch(content,q);}});
        return page;
    }

    private void fillCategories(LinearLayout content) {
        content.removeAllViews();
        List<Map.Entry<String,List<AppInfo>>> groups = new ArrayList<>(categories().entrySet());
        for(int i=0;i<groups.size();i+=2){
            LinearLayout row=new LinearLayout(this);
            Map.Entry<String,List<AppInfo>> a=groups.get(i); row.addView(categoryCard(a.getKey(),a.getValue()),new LinearLayout.LayoutParams(0,dp(188),1f));
            if(i+1<groups.size()){row.addView(new View(this),new LinearLayout.LayoutParams(dp(12),1));Map.Entry<String,List<AppInfo>> b=groups.get(i+1);row.addView(categoryCard(b.getKey(),b.getValue()),new LinearLayout.LayoutParams(0,dp(188),1f));}
            content.addView(row,new LinearLayout.LayoutParams(-1,dp(200)));
        }
    }

    private View categoryCard(String name,List<AppInfo> group) {
        LinearLayout card=glassCard(25); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(10),dp(9),dp(10),dp(9));
        card.addView(text(name,14,Color.rgb(58,58,60),true),new LinearLayout.LayoutParams(-1,dp(24)));
        GridLayout grid=new GridLayout(this);grid.setColumnCount(2);grid.setRowCount(2);
        for(int i=0;i<Math.min(4,group.size());i++){
            View icon=previewIcon(group.get(i),dp(52));
            GridLayout.LayoutParams gp=new GridLayout.LayoutParams();gp.columnSpec=GridLayout.spec(i%2,1,1f);gp.rowSpec=GridLayout.spec(i/2,1,1f);gp.width=0;gp.height=0;gp.setMargins(dp(2),dp(2),dp(2),dp(2));icon.setLayoutParams(gp);grid.addView(icon);
        }
        card.addView(grid,new LinearLayout.LayoutParams(-1,0,1f));
        card.setClickable(true); touchScale(card,.97f); card.setOnClickListener(v->openFolder(name,group));
        return card;
    }

    private View previewIcon(AppInfo app,int size){FrameLayout w=new FrameLayout(this);ImageView i=new ImageView(this);i.setImageDrawable(app.icon);i.setScaleType(ImageView.ScaleType.CENTER_INSIDE);w.addView(i,new FrameLayout.LayoutParams(size,size,Gravity.CENTER));return w;}

    private void openFolder(String name,List<AppInfo> group){
        if(group==null||group.isEmpty()||root.findViewWithTag("folder")!=null)return;
        safeBlur(true);
        FrameLayout overlay=new FrameLayout(this);overlay.setTag("folder");overlay.setBackgroundColor(Color.argb(52,245,245,247));overlay.setAlpha(0f);overlay.setOnClickListener(v->closeFolder(overlay));
        LinearLayout panel=glassCard(30);panel.setOrientation(LinearLayout.VERTICAL);panel.setPadding(dp(16),dp(14),dp(16),dp(18));panel.setElevation(dp(20));panel.setOnClickListener(v->{});panel.setScaleX(.84f);panel.setScaleY(.84f);panel.setAlpha(0f);
        TextView title=text(name,18,Color.rgb(28,28,30),true);title.setGravity(Gravity.CENTER);panel.addView(title,new LinearLayout.LayoutParams(-1,dp(40)));
        ScrollView s=new ScrollView(this);GridLayout g=new GridLayout(this);g.setColumnCount(4);
        for(int x=0;x<group.size();x++){View tile=appTile(group.get(x),true,false);GridLayout.LayoutParams gp=new GridLayout.LayoutParams();gp.columnSpec=GridLayout.spec(x%4,1,1f);gp.width=0;gp.height=dp(94);gp.setMargins(dp(2),dp(3),dp(2),dp(3));tile.setLayoutParams(gp);g.addView(tile);}s.addView(g,new ScrollView.LayoutParams(-1,-2));panel.addView(s,new LinearLayout.LayoutParams(-1,0,1f));
        FrameLayout.LayoutParams pp=new FrameLayout.LayoutParams(-1,dp(510),Gravity.CENTER);pp.leftMargin=dp(20);pp.rightMargin=dp(20);overlay.addView(panel,pp);root.addView(overlay,new FrameLayout.LayoutParams(-1,-1));
        overlay.animate().alpha(1f).setDuration(170).start();panel.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(280).setInterpolator(new DecelerateInterpolator(1.7f)).start();
    }

    private void closeFolder(FrameLayout overlay){if(overlay==null)return;View panel=overlay.getChildCount()>0?overlay.getChildAt(0):null;if(panel!=null)panel.animate().scaleX(.91f).scaleY(.91f).alpha(0f).setDuration(150).start();overlay.animate().alpha(0f).setDuration(170).withEndAction(()->{try{root.removeView(overlay);}catch(Throwable ignored){}safeBlur(false);}).start();}

    private void safeBlur(boolean on){try{if(Build.VERSION.SDK_INT>=31&&scene!=null)scene.setRenderEffect(on?RenderEffect.createBlurEffect(14f,14f,Shader.TileMode.CLAMP):null);if(Build.VERSION.SDK_INT>=31&&dockLayer!=null)dockLayer.setRenderEffect(on?RenderEffect.createBlurEffect(14f,14f,Shader.TileMode.CLAMP):null);}catch(Throwable ignored){}if(scene!=null)scene.animate().alpha(on?.84f:1f).setDuration(160).start();}

    private void fillSearch(LinearLayout content,String raw){content.removeAllViews();GridLayout g=new GridLayout(this);g.setColumnCount(4);String q=normalize(raw);int x=0;for(AppInfo a:apps){if(a.packageName.equals(getPackageName())||!normalize(a.label).contains(q))continue;View tile=appTile(a,true,false);GridLayout.LayoutParams gp=new GridLayout.LayoutParams();gp.columnSpec=GridLayout.spec(x%4,1,1f);gp.width=0;gp.height=dp(94);tile.setLayoutParams(gp);g.addView(tile);x++;}content.addView(g,new LinearLayout.LayoutParams(-1,-2));}

    private View appTile(AppInfo app,boolean label,boolean dock){LinearLayout cell=new LinearLayout(this);cell.setOrientation(LinearLayout.VERTICAL);cell.setGravity(Gravity.CENTER);ImageView icon=new ImageView(this);icon.setImageDrawable(app.icon);icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);int size=dp(dock?58:57);cell.addView(icon,new LinearLayout.LayoutParams(size,size));if(label){TextView n=text(app.label,11.2f,Color.rgb(45,45,48),false);n.setGravity(Gravity.CENTER);n.setSingleLine(true);n.setEllipsize(android.text.TextUtils.TruncateAt.END);LinearLayout.LayoutParams np=new LinearLayout.LayoutParams(-1,dp(20));np.topMargin=dp(3);cell.addView(n,np);}touchScale(cell,.90f);cell.setOnClickListener(v->{if(!editing)launch(app);});cell.setOnLongClickListener(v->{if(!editing)enterEditMode();return true;});editable.add(cell);return cell;}

    private View iconOnly(AppInfo app,int size,boolean clickable){FrameLayout w=new FrameLayout(this);ImageView i=new ImageView(this);i.setImageDrawable(app.icon);i.setScaleType(ImageView.ScaleType.CENTER_INSIDE);w.addView(i,new FrameLayout.LayoutParams(size,size,Gravity.CENTER));if(clickable){touchScale(w,.90f);w.setOnClickListener(v->launch(app));}return w;}

    private void touchScale(View v,float pressed){v.setOnTouchListener((view,e)->{if(e.getAction()==MotionEvent.ACTION_DOWN)view.animate().scaleX(pressed).scaleY(pressed).setDuration(80).start();else if(e.getAction()==MotionEvent.ACTION_UP||e.getAction()==MotionEvent.ACTION_CANCEL)view.animate().scaleX(1f).scaleY(1f).setDuration(170).setInterpolator(new DecelerateInterpolator(1.6f)).start();return false;});}

    private void enterEditMode(){if(editing||root==null||root.findViewWithTag("folder")!=null)return;editing=true;safeBlur(true);for(View v:editable){ObjectAnimator r=ObjectAnimator.ofFloat(v,View.ROTATION,-1f,1f);r.setDuration(120);r.setRepeatMode(ObjectAnimator.REVERSE);r.setRepeatCount(ObjectAnimator.INFINITE);r.start();}LinearLayout bar=glassCard(24);bar.setTag("edit");bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(dp(8),dp(5),dp(8),dp(5));TextView add=action("＋");add.setTextSize(23);add.setOnClickListener(v->beginPickWidget());bar.addView(add,new LinearLayout.LayoutParams(dp(48),dp(42)));bar.addView(new View(this),new LinearLayout.LayoutParams(0,1,1f));TextView done=action("Concluído");done.setOnClickListener(v->leaveEditMode());bar.addView(done,new LinearLayout.LayoutParams(dp(110),dp(42)));FrameLayout.LayoutParams p=new FrameLayout.LayoutParams(-1,dp(54),Gravity.TOP);p.leftMargin=dp(18);p.rightMargin=dp(18);p.topMargin=dp(8);root.addView(bar,p);bar.setAlpha(0);bar.animate().alpha(1).setDuration(180).start();}

    private void leaveEditMode(){editing=false;for(View v:editable){v.animate().cancel();v.clearAnimation();v.setRotation(0);}View bar=root.findViewWithTag("edit");if(bar!=null)root.removeView(bar);safeBlur(false);}
    private TextView action(String s){TextView v=text(s,14,Color.rgb(0,122,255),true);v.setGravity(Gravity.CENTER);v.setBackground(roundRect(Color.argb(130,255,255,255),21));touchScale(v,.96f);return v;}

    private void beginPickWidget(){try{pendingWidgetId=widgetHost.allocateAppWidgetId();Intent i=new Intent(AppWidgetManager.ACTION_APPWIDGET_PICK);i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,pendingWidgetId);startActivityForResult(i,REQ_PICK_WIDGET);}catch(Throwable t){Toast.makeText(this,"Não foi possível abrir os widgets.",Toast.LENGTH_SHORT).show();}}

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode==REQ_PICK_WIDGET){if(resultCode!=RESULT_OK){cleanupWidget();return;}int id=data!=null?data.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,pendingWidgetId):pendingWidgetId;AppWidgetProviderInfo info=widgetManager.getAppWidgetInfo(id);if(info==null){cleanupWidget();return;}if(!widgetManager.bindAppWidgetIdIfAllowed(id,info.provider)){Intent b=new Intent(AppWidgetManager.ACTION_APPWIDGET_BIND);b.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id);b.putExtra(AppWidgetManager.EXTRA_APPWIDGET_PROVIDER,info.provider);pendingWidgetId=id;startActivityForResult(b,REQ_BIND_WIDGET);}else configureWidget(id,info);}else if(requestCode==REQ_BIND_WIDGET){if(resultCode!=RESULT_OK){cleanupWidget();return;}AppWidgetProviderInfo info=widgetManager.getAppWidgetInfo(pendingWidgetId);if(info!=null)configureWidget(pendingWidgetId,info);}else if(requestCode==REQ_CONFIG_WIDGET){if(resultCode==RESULT_OK)saveWidget(pendingWidgetId);else cleanupWidget();}}
    private void configureWidget(int id,AppWidgetProviderInfo info){pendingWidgetId=id;if(info.configure!=null){try{Intent c=new Intent(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE);c.setComponent(info.configure);c.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,id);startActivityForResult(c,REQ_CONFIG_WIDGET);return;}catch(Throwable ignored){}}saveWidget(id);}
    private void saveWidget(int id){int old=prefs().getInt(KEY_WIDGET,-1);if(old>0&&old!=id)try{widgetHost.deleteAppWidgetId(old);}catch(Throwable ignored){}prefs().edit().putInt(KEY_WIDGET,id).apply();pendingWidgetId=-1;try{buildHome();}catch(Throwable t){showRecovery();}}
    private void cleanupWidget(){if(pendingWidgetId>0)try{widgetHost.deleteAppWidgetId(pendingWidgetId);}catch(Throwable ignored){}pendingWidgetId=-1;}

    private void loadApps(){apps.clear();PackageManager pm=getPackageManager();Intent q=new Intent(Intent.ACTION_MAIN);q.addCategory(Intent.CATEGORY_LAUNCHER);List<ResolveInfo> found=pm.queryIntentActivities(q,0);Set<String> seen=new HashSet<>();for(ResolveInfo r:found){if(r.activityInfo==null)continue;String key=r.activityInfo.packageName+"/"+r.activityInfo.name;if(!seen.add(key))continue;try{CharSequence l=r.loadLabel(pm);apps.add(new AppInfo(l==null?r.activityInfo.packageName:l.toString(),r.activityInfo.packageName,r.activityInfo.name,r.loadIcon(pm)));}catch(Throwable ignored){}}Collator c=Collator.getInstance(ptBR);apps.sort((a,b)->c.compare(a.label,b.label));}
    private List<AppInfo> preferred(int max){List<AppInfo> o=new ArrayList<>();String[] w={"WhatsApp","Instagram","YouTube","Chrome","Gmail","Maps"};for(String s:w){AppInfo a=find(s);if(a!=null&&!o.contains(a)&&o.size()<max)o.add(a);}for(AppInfo a:apps)if(!a.packageName.equals(getPackageName())&&!o.contains(a)&&o.size()<max)o.add(a);return o;}
    private List<AppInfo> orderedHome(List<AppInfo> dock){List<AppInfo> o=new ArrayList<>();String[] w={"Calendário","Calendar","Fotos","Photos","Galeria","Gallery","Câmera","Camera","Gmail","Mapas","Maps","Relógio","Clock","Notas","Notes","WhatsApp","Instagram","YouTube","Spotify","ChatGPT","Drive","Google","Play Store"};for(String s:w){AppInfo a=find(s);if(a!=null&&!dock.contains(a)&&!o.contains(a)&&!a.packageName.equals(getPackageName()))o.add(a);}for(AppInfo a:apps)if(!dock.contains(a)&&!o.contains(a)&&!a.packageName.equals(getPackageName()))o.add(a);return o;}
    private List<AppInfo> pickDock(){List<AppInfo> o=new ArrayList<>();String[] w={"Telefone","Phone","Chrome","Mensagens","Messages","Spotify","Música","Music"};for(String s:w){AppInfo a=find(s);if(a!=null&&!o.contains(a)&&o.size()<4)o.add(a);}for(AppInfo a:apps)if(!a.packageName.equals(getPackageName())&&!o.contains(a)&&o.size()<4)o.add(a);return o;}
    private AppInfo find(String wanted){String q=normalize(wanted);for(AppInfo a:apps)if(normalize(a.label).equals(q))return a;for(AppInfo a:apps)if(normalize(a.label).contains(q))return a;return null;}
    private Map<String,List<AppInfo>> categories(){LinkedHashMap<String,List<AppInfo>> m=new LinkedHashMap<>();m.put("Sugestões",new ArrayList<>());m.put("Adicionados Recentemente",new ArrayList<>());m.put("Redes Sociais",new ArrayList<>());m.put("Entretenimento",new ArrayList<>());m.put("Produtividade",new ArrayList<>());m.put("Utilitários",new ArrayList<>());m.put("Criatividade",new ArrayList<>());m.put("Outros",new ArrayList<>());for(AppInfo a:preferred(8))m.get("Sugestões").add(a);for(int i=Math.max(0,apps.size()-8);i<apps.size();i++)if(!apps.get(i).packageName.equals(getPackageName()))m.get("Adicionados Recentemente").add(apps.get(i));for(AppInfo a:apps){if(a.packageName.equals(getPackageName()))continue;String n=normalize(a.label+" "+a.packageName),k;if(contains(n,"whatsapp","instagram","facebook","telegram","messenger","tiktok","threads"))k="Redes Sociais";else if(contains(n,"youtube","netflix","spotify","prime","disney","music","música","game","jogo"))k="Entretenimento";else if(contains(n,"gmail","outlook","drive","docs","office","notion","chatgpt","calendar","calend"))k="Produtividade";else if(contains(n,"camera","câmera","clock","relog","calcul","settings","configura","files","arquivo","phone","telefone","maps","mapas"))k="Utilitários";else if(contains(n,"photo","foto","gallery","galeria","canva","editor","capcut"))k="Criatividade";else k="Outros";if(!m.get(k).contains(a))m.get(k).add(a);}return m;}

    private void launch(AppInfo a){try{Intent i=new Intent(Intent.ACTION_MAIN);i.addCategory(Intent.CATEGORY_LAUNCHER);i.setComponent(new ComponentName(a.packageName,a.activityName));i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);startActivity(i);}catch(Throwable t){try{Intent i=getPackageManager().getLaunchIntentForPackage(a.packageName);if(i!=null)startActivity(i);}catch(Throwable ignored){}}}
    private int battery(){try{BatteryManager b=(BatteryManager)getSystemService(BATTERY_SERVICE);return b==null?0:Math.max(0,b.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY));}catch(Throwable t){return 0;}}
    private LinearLayout glassCard(int r){LinearLayout v=new LinearLayout(this);v.setBackground(glass(r));v.setElevation(dp(5));return v;}
    private GradientDrawable glass(int r){GradientDrawable g=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{Color.argb(220,255,255,255),Color.argb(178,248,248,252)});g.setCornerRadius(dp(r));g.setStroke(Math.max(1,dp(.6f)),Color.argb(135,255,255,255));return g;}
    private GradientDrawable roundRect(int color,int r){GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(dp(r));return g;}
    private TextView text(String s,float size,int color,boolean bold){TextView v=new TextView(this);v.setText(s);v.setTextSize(size);v.setTextColor(color);if(bold)v.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);return v;}
    private SharedPreferences prefs(){return getSharedPreferences(PREFS,MODE_PRIVATE);} private String normalize(String s){return s==null?"":s.toLowerCase(ptBR);} private boolean contains(String s,String...x){for(String q:x)if(s.contains(q))return true;return false;} private int dp(float n){return(int)(n*getResources().getDisplayMetrics().density+.5f);}

    private void showRecovery(){FrameLayout r=new FrameLayout(this);r.setBackgroundColor(Color.rgb(244,246,251));LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setGravity(Gravity.CENTER);box.setPadding(dp(28),dp(28),dp(28),dp(28));TextView t=text("Aurora",30,Color.rgb(28,28,30),true);t.setGravity(Gravity.CENTER);box.addView(t);TextView d=text("A tela inicial precisa ser recarregada.",15,Color.rgb(99,99,102),false);d.setGravity(Gravity.CENTER);LinearLayout.LayoutParams dpv=new LinearLayout.LayoutParams(-1,-2);dpv.topMargin=dp(10);box.addView(d,dpv);TextView b=action("Recarregar");b.setOnClickListener(v->{try{loadApps();buildHome();}catch(Throwable x){Toast.makeText(this,"Abra o Aurora e escolha a Tela de Início novamente.",Toast.LENGTH_LONG).show();}});LinearLayout.LayoutParams bp=new LinearLayout.LayoutParams(-1,dp(50));bp.setMargins(0,dp(24),0,0);box.addView(b,bp);r.addView(box,new FrameLayout.LayoutParams(-1,-2,Gravity.CENTER));setContentView(r);}

    @Override public void onBackPressed(){View f=root==null?null:root.findViewWithTag("folder");if(f instanceof FrameLayout){closeFolder((FrameLayout)f);return;}if(editing){leaveEditMode();return;}if(pager!=null)pager.go(firstHomePage,true);else super.onBackPressed();}

    private class WallpaperDrawable extends Drawable {private final Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);public void draw(Canvas c){int w=getBounds().width(),h=getBounds().height();int style=getSharedPreferences(AuroraSettingsActivity.PREFS,MODE_PRIVATE).getInt(AuroraSettingsActivity.KEY_STYLE,0);int[][] a={{0xFFF3F5FF,0xFFE8F1FF,0x99CBDCFF,0x88F1C9E2},{0xFFEDF8FF,0xFFE6EDFF,0x99BDE7FF,0x889EBBFF},{0xFFF4EEFF,0xFFEDEBFF,0x99CFBBFF,0x88F2C8FF},{0xFFFFF1ED,0xFFF4EAFF,0x99FFD2C0,0x88EFC9F8},{0xFFECFBFA,0xFFE8F1FF,0x99B6EFE8,0x88BAD5FF},{0xFFFFF0F6,0xFFF2EDFF,0x99FFC7DD,0x88E1CAFF},{0xFFF1F2F5,0xFFE7E9EE,0x99CDD2DB,0x889FA9B8},{0xFFEFF2FA,0xFFE8E9F4,0x99BAC9EE,0x88CDB5E6}};int[] q=a[Math.max(0,Math.min(7,style))];p.setShader(new LinearGradient(0,0,w,h,q[0],q[1],Shader.TileMode.CLAMP));c.drawRect(0,0,w,h,p);p.setShader(new RadialGradient(w*.18f,h*.22f,w*.68f,q[2],Color.TRANSPARENT,Shader.TileMode.CLAMP));c.drawCircle(w*.18f,h*.22f,w*.68f,p);p.setShader(new RadialGradient(w*.86f,h*.74f,w*.72f,q[3],Color.TRANSPARENT,Shader.TileMode.CLAMP));c.drawCircle(w*.86f,h*.74f,w*.72f,p);p.setShader(null);}public void setAlpha(int a){p.setAlpha(a);}public void setColorFilter(android.graphics.ColorFilter c){p.setColorFilter(c);}public int getOpacity(){return android.graphics.PixelFormat.OPAQUE;}}
    private static class AppInfo{final String label,packageName,activityName;final Drawable icon;AppInfo(String l,String p,String a,Drawable i){label=l;packageName=p;activityName=a;icon=i;}}
    private interface PageListener{void changed(int p);}
    private class Pager extends HorizontalScrollView{int count=1,page=0;PageListener listener;ObjectAnimator anim;Pager(){super(StablePremiumLauncherActivity.this);}void setCount(int c){count=Math.max(1,c);}void setListener(PageListener l){listener=l;}void go(int p,boolean smooth){page=Math.max(0,Math.min(count-1,p));int target=page*screenWidth;if(anim!=null)anim.cancel();if(smooth){anim=ObjectAnimator.ofInt(this,"scrollX",getScrollX(),target);anim.setDuration(270);anim.setInterpolator(new DecelerateInterpolator(1.55f));anim.start();}else scrollTo(target,0);if(listener!=null)listener.changed(page);}@Override public boolean onTouchEvent(MotionEvent e){boolean r=super.onTouchEvent(e);if(e.getAction()==MotionEvent.ACTION_UP||e.getAction()==MotionEvent.ACTION_CANCEL)go(Math.round(getScrollX()/(float)screenWidth),true);return r;}@Override protected void onScrollChanged(int l,int t,int ol,int ot){super.onScrollChanged(l,t,ol,ot);int p=Math.round(l/(float)screenWidth);if(p!=page){page=Math.max(0,Math.min(count-1,p));if(listener!=null)listener.changed(page);}}}
}
