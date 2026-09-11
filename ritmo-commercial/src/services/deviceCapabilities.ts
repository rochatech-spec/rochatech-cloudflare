type Platform = 'ios'|'android'|'windows'|'macos'|'other';

function detectPlatform(): Platform {
  const nav=navigator as Navigator & {userAgentData?:{platform?:string;mobile?:boolean};standalone?:boolean};
  const ua=navigator.userAgent||'';
  const reported=(nav.userAgentData?.platform||navigator.platform||'').toLowerCase();
  const ipadAsMac=reported.includes('mac')&&navigator.maxTouchPoints>1;
  if(/iphone|ipad|ipod/i.test(ua)||ipadAsMac)return 'ios';
  if(/android/i.test(ua)||reported.includes('android'))return 'android';
  if(/windows/i.test(ua)||reported.includes('win'))return 'windows';
  if(/macintosh|mac os x/i.test(ua)||reported.includes('mac'))return 'macos';
  return 'other';
}

function detectStandalone(){
  const nav=navigator as Navigator & {standalone?:boolean};
  return window.matchMedia('(display-mode: standalone)').matches||nav.standalone===true;
}

function classifyRefreshRate(samples:number[]){
  if(samples.length<8)return 'standard';
  const clean=samples.filter(v=>v>4&&v<40).sort((a,b)=>a-b);
  if(clean.length<8)return 'standard';
  const median=clean[Math.floor(clean.length/2)];
  const hz=1000/median;
  if(hz>=105)return 'high';
  if(hz>=75)return 'medium';
  return 'standard';
}

export function initializeDeviceCapabilities(){
  const root=document.documentElement;
  const platform=detectPlatform();
  root.dataset.platform=platform;
  root.dataset.displayMode=detectStandalone()?'standalone':'browser';

  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse=window.matchMedia('(pointer: coarse)');
  const contrast=window.matchMedia('(prefers-contrast: more)');

  const syncPreferences=()=>{
    root.dataset.motion=reduced.matches?'reduced':'full';
    root.dataset.pointer=coarse.matches?'coarse':'fine';
    root.dataset.contrast=contrast.matches?'more':'normal';
  };
  syncPreferences();

  const listeners:[[MediaQueryList,()=>void],[MediaQueryList,()=>void],[MediaQueryList,()=>void]]=[
    [reduced,syncPreferences],[coarse,syncPreferences],[contrast,syncPreferences]
  ];
  for(const [m,l] of listeners)m.addEventListener?.('change',l);

  let raf=0;
  const deltas:number[]=[];
  let previous=0;
  let frames=0;
  const sample=(ts:number)=>{
    if(previous)deltas.push(ts-previous);
    previous=ts;
    frames++;
    if(frames<28){
      raf=requestAnimationFrame(sample);
      return;
    }
    root.dataset.refresh=classifyRefreshRate(deltas);
  };
  if(!reduced.matches)raf=requestAnimationFrame(sample);
  else root.dataset.refresh='standard';

  return()=>{
    if(raf)cancelAnimationFrame(raf);
    for(const [m,l] of listeners)m.removeEventListener?.('change',l);
  };
}
