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
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class AuroraControlActivity extends Activity {
    private static final int REQ_HOME = 5201;
    private static final String PREFS = AuroraSettingsActivity.PREFS;
    private static final String KEY_STYLE = AuroraSettingsActivity.KEY_STYLE;
    private static final String[] WALLS = {"Glass","Sky","Violet","Sunset","Aqua","Rose","Graphite","Midnight"};

    private FrameLayout root;
    private LinearLayout body;
    private TextView status;
    private TextView apply;
    private boolean selectingHome;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.rgb(246,247,251));
        w.setNavigationBarColor(Color.rgb(246,247,251));
        w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        build();
    }

    @Override protected void onResume() {
        super.onResume();
        refreshStatus();
        if (selectingHome && isHome()) {
            selectingHome = false;
            applyWallpaperAsync(true);
        }
    }

    private void build() {
        root = new FrameLayout(this);
        root.setBackground(pageBackground());
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        body = new LinearLayout(this);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18),dp(18),dp(18),dp(38));
        scroll.addView(body,new ScrollView.LayoutParams(-1,-2));
        root.addView(scroll,new FrameLayout.LayoutParams(-1,-1));

        TextView brand = text("AURORA",11.5f,Color.rgb(110,110,115),true);
        brand.setLetterSpacing(.10f);
        body.addView(brand);
        TextView title = text("Premium Light",34,Color.rgb(28,28,30),true);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-1,-2); tp.setMargins(0,dp(3),0,dp(3));
        body.addView(title,tp);
        TextView subtitle = text("Controle sua Tela de Início em um só lugar.",15,Color.rgb(110,110,115),false);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(-1,-2); sp.setMargins(0,0,0,dp(18));
        body.addView(subtitle,sp);

        body.addView(hero(),new LinearLayout.LayoutParams(-1,dp(196)));

        section("PERSONALIZAÇÃO");
        body.addView(group(
                row("Papéis de Parede","Escolha entre os visuais Premium Light","◐",v->wallpaperSheet()),
                row("Widgets","Adicionar e organizar widgets na Home","＋",v->openEditor()),
                row("Editar Tela de Início","Entrar no modo de edição do Aurora","⋯",v->openEditor())
        ), groupParams());

        section("TELA DE INÍCIO");
        body.addView(group(
                row("Abrir Aurora","Visualizar a Home agora","↗",v->openAurora()),
                row("Definir como padrão","Usar Aurora ao pressionar Início","⌂",v->requestHome()),
                row("Escolher outro launcher","Abrir as opções da One UI","›",v->openHomeSettings())
        ), groupParams());

        TextView foot = text("Aurora 5.1 • Premium Light",12,Color.rgb(142,142,147),false);
        foot.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(-1,-2); fp.setMargins(0,dp(18),0,dp(8));
        body.addView(foot,fp);
        setContentView(root);
    }

    private View hero() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18),dp(16),dp(18),dp(16));
        card.setBackground(heroBackground());
        card.setElevation(dp(8));

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView badge = text("PREMIUM LIGHT",11,Color.rgb(72,76,90),true);
        badge.setLetterSpacing(.05f); badge.setGravity(Gravity.CENTER);
        badge.setBackground(roundRect(Color.argb(145,255,255,255),14));
        top.addView(badge,new LinearLayout.LayoutParams(dp(126),dp(28)));
        top.addView(new View(this),new LinearLayout.LayoutParams(0,1,1f));
        status = text("",12.5f,Color.rgb(72,76,90),true); status.setGravity(Gravity.END|Gravity.CENTER_VERTICAL);
        top.addView(status,new LinearLayout.LayoutParams(dp(132),dp(30)));
        card.addView(top);

        TextView heading = text("Sua Home Premium",23,Color.rgb(28,28,30),true);
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(-1,-2); hp.setMargins(0,dp(12),0,dp(3));
        card.addView(heading,hp);
        card.addView(text("Aplique o Aurora como Tela de Início e mantenha seus apps com os ícones originais.",13.8f,Color.rgb(84,84,90),false));

        apply = text("Aplicar Aurora",16,Color.WHITE,true);
        apply.setGravity(Gravity.CENTER);
        apply.setBackground(roundRect(Color.rgb(29,29,33),18));
        press(apply,.975f);
        apply.setOnClickListener(v->requestHome());
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(-1,dp(48)); ap.setMargins(0,dp(14),0,0);
        card.addView(apply,ap);
        return card;
    }

    private void section(String s) {
        TextView t = text(s,11.5f,Color.rgb(110,110,115),false);
        t.setLetterSpacing(.06f);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1,-2); p.setMargins(dp(12),dp(20),0,dp(7));
        body.addView(t,p);
    }

    private LinearLayout group(View... rows) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(groupBackground());
        card.setClipToOutline(true);
        card.setElevation(dp(3));
        for(int i=0;i<rows.length;i++) {
            card.addView(rows[i],new LinearLayout.LayoutParams(-1,dp(74)));
            if(i<rows.length-1){View line=new View(this);line.setBackgroundColor(Color.argb(105,210,210,218));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,Math.max(1,dp(.5f)));lp.leftMargin=dp(62);card.addView(line,lp);}
        }
        return card;
    }

    private View row(String title,String desc,String symbol,View.OnClickListener click) {
        LinearLayout r = new LinearLayout(this);
        r.setGravity(Gravity.CENTER_VERTICAL);
        r.setPadding(dp(12),dp(8),dp(12),dp(8));
        r.setClickable(true); r.setOnClickListener(click); press(r,.985f);
        TextView icon = text(symbol,19,Color.rgb(0,122,255),true);
        icon.setGravity(Gravity.CENTER); icon.setBackground(roundRect(Color.argb(165,235,242,255),14));
        r.addView(icon,new LinearLayout.LayoutParams(dp(40),dp(40)));
        LinearLayout copy = new LinearLayout(this); copy.setOrientation(LinearLayout.VERTICAL); copy.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(0,-1,1f); cp.setMargins(dp(12),0,dp(6),0); r.addView(copy,cp);
        copy.addView(text(title,16.3f,Color.rgb(28,28,30),false));
        TextView d = text(desc,12.5f,Color.rgb(142,142,147),false); d.setSingleLine(true); d.setEllipsize(android.text.TextUtils.TruncateAt.END); copy.addView(d);
        TextView ch = text("›",27,Color.rgb(174,174,178),false); ch.setGravity(Gravity.CENTER); r.addView(ch,new LinearLayout.LayoutParams(dp(22),-1));
        return r;
    }

    private LinearLayout.LayoutParams groupParams(){return new LinearLayout.LayoutParams(-1,-2);}

    private void requestHome() {
        setApplying(true);
        try {
            RoleManager rm=(RoleManager)getSystemService(Context.ROLE_SERVICE);
            if(rm!=null&&rm.isRoleAvailable(RoleManager.ROLE_HOME)){
                if(rm.isRoleHeld(RoleManager.ROLE_HOME)){applyWallpaperAsync(true);return;}
                selectingHome=true;
                startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME),REQ_HOME);
                return;
            }
        } catch(Throwable ignored) {}
        selectingHome=true;
        openHomeSettings();
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==REQ_HOME){
            selectingHome=false;
            if(resultCode==RESULT_OK||isHome()) applyWallpaperAsync(true);
            else {setApplying(false);Toast.makeText(this,"Escolha Aurora como Tela de Início para concluir.",Toast.LENGTH_SHORT).show();}
        }
    }

    private boolean isHome(){try{RoleManager rm=(RoleManager)getSystemService(Context.ROLE_SERVICE);return rm!=null&&rm.isRoleAvailable(RoleManager.ROLE_HOME)&&rm.isRoleHeld(RoleManager.ROLE_HOME);}catch(Throwable t){return false;}}

    private void refreshStatus(){boolean active=isHome();if(status!=null)status.setText(active?"●  Ativo":"○  Não aplicado");if(!selectingHome)setApplying(false);}
    private void setApplying(boolean yes){if(apply==null)return;apply.setEnabled(!yes);apply.setAlpha(yes?.72f:1f);apply.setText(yes?"Aplicando…":(isHome()?"Abrir Aurora":"Aplicar Aurora"));if(!yes&&isHome())apply.setOnClickListener(v->openAurora());else if(!yes)apply.setOnClickListener(v->requestHome());}

    private void openAurora(){try{Intent i=new Intent(this,AuroraLauncherActivity.class);i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);startActivity(i);}catch(Throwable t){Toast.makeText(this,"Não foi possível abrir a Home.",Toast.LENGTH_SHORT).show();}}
    private void openEditor(){try{Intent i=new Intent(this,AuroraLauncherActivity.class);i.putExtra("openEditor",true);i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);startActivity(i);}catch(Throwable t){Toast.makeText(this,"Aplique o Aurora primeiro.",Toast.LENGTH_SHORT).show();}}
    private void openHomeSettings(){try{startActivity(new Intent(Settings.ACTION_HOME_SETTINGS));}catch(Throwable t){try{startActivity(new Intent(Settings.ACTION_SETTINGS));}catch(Throwable ignored){}}}

    private void applyWallpaperAsync(boolean openAfter){final int style=currentStyle();new Thread(()->{boolean ok=applyWallpaper(style,true);runOnUiThread(()->{setApplying(false);refreshStatus();if(!ok)Toast.makeText(this,"Aurora aplicado. O wallpaper do sistema não pôde ser alterado.",Toast.LENGTH_SHORT).show();if(openAfter)openAurora();});}).start();}

    private void wallpaperSheet(){
        View old=root.findViewWithTag("walls");if(old!=null)root.removeView(old);
        FrameLayout overlay=new FrameLayout(this);overlay.setTag("walls");overlay.setBackgroundColor(Color.argb(72,20,20,24));overlay.setOnClickListener(v->closeSheet(overlay));
        LinearLayout sheet=new LinearLayout(this);sheet.setOrientation(LinearLayout.VERTICAL);sheet.setPadding(dp(14),dp(11),dp(14),dp(14));sheet.setBackground(sheetBackground());sheet.setElevation(dp(24));sheet.setOnClickListener(v->{});
        View handle=new View(this);handle.setBackground(roundRect(Color.rgb(199,199,204),3));LinearLayout.LayoutParams hp=new LinearLayout.LayoutParams(dp(38),dp(5));hp.gravity=Gravity.CENTER_HORIZONTAL;hp.bottomMargin=dp(8);sheet.addView(handle,hp);
        TextView h=text("Papéis de Parede",20,Color.rgb(28,28,30),true);h.setGravity(Gravity.CENTER);sheet.addView(h,new LinearLayout.LayoutParams(-1,dp(42)));
        TextView note=text("Toque em um visual para aplicar",13,Color.rgb(142,142,147),false);note.setGravity(Gravity.CENTER);sheet.addView(note,new LinearLayout.LayoutParams(-1,dp(28)));
        ScrollView sc=new ScrollView(this);sc.setOverScrollMode(View.OVER_SCROLL_NEVER);GridLayout grid=new GridLayout(this);grid.setColumnCount(2);
        for(int x=0;x<WALLS.length;x++){final int style=x;LinearLayout option=new LinearLayout(this);option.setOrientation(LinearLayout.VERTICAL);option.setGravity(Gravity.CENTER_HORIZONTAL);option.setPadding(dp(6),dp(6),dp(6),dp(7));option.setBackground(roundRect(Color.argb(225,255,255,255),20));option.setElevation(dp(2));press(option,.975f);FrameLayout prev=new FrameLayout(this);View pv=new View(this);pv.setBackground(preview(style));prev.addView(pv,new FrameLayout.LayoutParams(-1,-1));if(currentStyle()==style){TextView ck=text("✓",17,Color.WHITE,true);ck.setGravity(Gravity.CENTER);ck.setBackground(roundRect(Color.rgb(29,29,33),14));FrameLayout.LayoutParams ckp=new FrameLayout.LayoutParams(dp(29),dp(29),Gravity.TOP|Gravity.END);ckp.topMargin=dp(7);ckp.rightMargin=dp(7);prev.addView(ck,ckp);}option.addView(prev,new LinearLayout.LayoutParams(-1,dp(112)));TextView n=text(WALLS[x],14,Color.rgb(28,28,30),true);n.setGravity(Gravity.CENTER);option.addView(n,new LinearLayout.LayoutParams(-1,dp(30)));option.setOnClickListener(v->{getSharedPreferences(PREFS,MODE_PRIVATE).edit().putInt(KEY_STYLE,style).apply();new Thread(()->applyWallpaper(style,true)).start();closeSheet(overlay);Toast.makeText(this,WALLS[style]+" aplicado",Toast.LENGTH_SHORT).show();});GridLayout.LayoutParams gp=new GridLayout.LayoutParams();gp.columnSpec=GridLayout.spec(x%2,1,1f);gp.width=0;gp.height=dp(166);gp.setMargins(dp(4),dp(4),dp(4),dp(4));option.setLayoutParams(gp);grid.addView(option);}
        sc.addView(grid,new ScrollView.LayoutParams(-1,-2));sheet.addView(sc,new LinearLayout.LayoutParams(-1,dp(430)));TextView done=text("Concluído",17,Color.rgb(0,122,255),true);done.setGravity(Gravity.CENTER);done.setOnClickListener(v->closeSheet(overlay));sheet.addView(done,new LinearLayout.LayoutParams(-1,dp(48)));
        FrameLayout.LayoutParams sp=new FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM);sp.leftMargin=dp(8);sp.rightMargin=dp(8);sp.bottomMargin=dp(8);overlay.addView(sheet,sp);root.addView(overlay,new FrameLayout.LayoutParams(-1,-1));overlay.setAlpha(0);sheet.setTranslationY(dp(55));overlay.animate().alpha(1).setDuration(170).start();sheet.animate().translationY(0).setDuration(260).setInterpolator(new DecelerateInterpolator(1.5f)).start();
    }

    private void closeSheet(FrameLayout o){if(o==null)return;View s=o.getChildCount()>0?o.getChildAt(0):null;if(s!=null)s.animate().translationY(dp(45)).setDuration(150).start();o.animate().alpha(0).setDuration(160).withEndAction(()->{try{root.removeView(o);}catch(Throwable ignored){}}).start();}

    private boolean applyWallpaper(int style,boolean lock){try{WallpaperManager wm=WallpaperManager.getInstance(this);Bitmap home=makeWallpaper(style,false);wm.setBitmap(home,null,true,WallpaperManager.FLAG_SYSTEM);home.recycle();if(lock){Bitmap b=makeWallpaper(style,true);wm.setBitmap(b,null,true,WallpaperManager.FLAG_LOCK);b.recycle();}return true;}catch(Throwable t){return false;}}
    private Bitmap makeWallpaper(int style,boolean lock){int w=Math.max(1080,getResources().getDisplayMetrics().widthPixels),h=Math.max(2340,getResources().getDisplayMetrics().heightPixels);Bitmap b=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(b);Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);int[] a=palette(style,lock);p.setShader(new LinearGradient(0,0,w,h,a[0],a[1],Shader.TileMode.CLAMP));c.drawRect(0,0,w,h,p);p.setShader(new RadialGradient(w*.16f,h*.22f,w*.64f,a[2],Color.TRANSPARENT,Shader.TileMode.CLAMP));c.drawCircle(w*.16f,h*.22f,w*.64f,p);p.setShader(new RadialGradient(w*.86f,h*.72f,w*.70f,a[3],Color.TRANSPARENT,Shader.TileMode.CLAMP));c.drawCircle(w*.86f,h*.72f,w*.70f,p);p.setShader(null);return b;}
    private int[] palette(int style,boolean lock){int[][] p={{0xFFF2F4FF,0xFFE8F2FF,0x99C6D7FF,0x88F4C8E4},{0xFFECF7FF,0xFFE4EBFF,0x99BDE7FF,0x889EBBFF},{0xFFF3ECFF,0xFFECEBFF,0x99CDB8FF,0x88F1C6FF},{0xFFFFF0EC,0xFFF4E9FF,0x99FFD0BD,0x88EFC7F7},{0xFFEAFBFA,0xFFE8F0FF,0x99B5F0E8,0x88BAD5FF},{0xFFFFEFF6,0xFFF2ECFF,0x99FFC5DB,0x88E0C8FF},{0xFFF0F1F4,0xFFE4E7EC,0x99CCD1DA,0x889FA9B8},{0xFFEEF1FA,0xFFE7E8F4,0x99B8C8EE,0x88CDB4E6}};int[] a=p[Math.max(0,Math.min(7,style))].clone();if(lock){a[0]=darken(a[0],.8f);a[1]=darken(a[1],.8f);a[2]=(a[2]&0x00FFFFFF)|(90<<24);a[3]=(a[3]&0x00FFFFFF)|(82<<24);}return a;}
    private GradientDrawable preview(int style){int[] a=palette(style,false);GradientDrawable g=new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{a[0],a[1]});g.setCornerRadius(dp(17));return g;}
    private int currentStyle(){return getSharedPreferences(PREFS,MODE_PRIVATE).getInt(KEY_STYLE,0);} private int darken(int c,float f){return Color.rgb((int)(Color.red(c)*f),(int)(Color.green(c)*f),(int)(Color.blue(c)*f));}

    private GradientDrawable pageBackground(){return new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{Color.rgb(248,249,253),Color.rgb(239,242,249),Color.rgb(248,244,251)});} private GradientDrawable heroBackground(){GradientDrawable g=new GradientDrawable(GradientDrawable.Orientation.TL_BR,new int[]{Color.argb(240,255,255,255),Color.argb(220,230,239,255)});g.setCornerRadius(dp(29));g.setStroke(Math.max(1,dp(.7f)),Color.argb(170,255,255,255));return g;} private GradientDrawable groupBackground(){GradientDrawable g=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{Color.argb(240,255,255,255),Color.argb(225,250,250,253)});g.setCornerRadius(dp(23));g.setStroke(Math.max(1,dp(.6f)),Color.argb(160,255,255,255));return g;} private GradientDrawable sheetBackground(){GradientDrawable g=new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{Color.rgb(252,252,254),Color.rgb(244,246,251)});g.setCornerRadius(dp(31));return g;} private GradientDrawable roundRect(int c,int r){GradientDrawable g=new GradientDrawable();g.setColor(c);g.setCornerRadius(dp(r));return g;}
    private TextView text(String s,float z,int c,boolean b){TextView t=new TextView(this);t.setText(s);t.setTextSize(z);t.setTextColor(c);if(b)t.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);return t;} private void press(View v,float p){v.setOnTouchListener((view,e)->{if(e.getAction()==MotionEvent.ACTION_DOWN)view.animate().scaleX(p).scaleY(p).setDuration(80).start();else if(e.getAction()==MotionEvent.ACTION_UP||e.getAction()==MotionEvent.ACTION_CANCEL)view.animate().scaleX(1).scaleY(1).setDuration(170).setInterpolator(new DecelerateInterpolator(1.6f)).start();return false;});} private int dp(float n){return(int)(n*getResources().getDisplayMetrics().density+.5f);}
}
