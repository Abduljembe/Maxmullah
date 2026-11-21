/**
 * Advanced JS-Injected Redirect & Popunder Ad Blocker for MullahMax.
 * - Neutralizes unauthorized window.open, top/parent navigation hijacks, and synthetic <a target="_blank"> click redirects
 * - Injects anti-redirect JS guards into same-origin / embed-shielded player iframes on load
 * - Strips transparent full-screen clickjack overlays spawned by external ad scripts
 */

declare global {
  interface Window {
    __MULLAHMAX_SHIELD_BOOTED__?: boolean;
    __MULLAHMAX_ALLOW_POPUP__?: boolean;
  }
}

export const AD_NETWORK_PATTERN =
  /popads|popcash|propeller|adsterra|monetag|exoclick|juicyads|hilltopads|acscdn|onmarshtomorrow|onclickalgo|onclkds|doubleclick|googlesyndication|histats|ad-maven|bidvertiser|trafficjunky|clksite|clickadu|realsrv|trackwill|tsyndicate|adserver/i;

let isShieldInstalled = false;
const prewarmedOrigins = new Set<string>();

export function allowNextUserPopup() {
  if (typeof window === 'undefined') return;
  window.__MULLAHMAX_ALLOW_POPUP__ = true;
  setTimeout(() => {
    window.__MULLAHMAX_ALLOW_POPUP__ = false;
  }, 1500);
}

export function safeOpenTab(url: string) {
  allowNextUserPopup();
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Self-contained JS snippet injected inside accessible / proxied player iframes
 * to kill popup windows, click-hijack overlays, and redirect scripts.
 */
export function getInFrameAntiRedirectScript(): string {
  return `(function(){
    if(window.__MULLAHMAX_FRAME_SHIELD__)return;
    window.__MULLAHMAX_FRAME_SHIELD__=true;
    var AD_RE=/popads|popcash|propeller|adsterra|monetag|exoclick|juicyads|hilltopads|acscdn|onmarshtomorrow|onclickalgo|onclkds|doubleclick|googlesyndication|histats|ad-maven|bidvertiser|trafficjunky|clksite|clickadu|realsrv|trackwill|tsyndicate|adserver/i;
    try{Object.defineProperty(window,'open',{configurable:false,writable:false,value:function(){return null;}});}catch(e){window.open=function(){return null;};}
    try{
      var origAClick=HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click=function(){
        var href=this.getAttribute('href')||'';
        if(this.target==='_blank'||AD_RE.test(href)||/^https?:\\/\\//i.test(href))return;
        return origAClick.apply(this,arguments);
      };
    }catch(e){}
    try{
      var origCreate=document.createElement.bind(document);
      document.createElement=function(tag,opts){
        var el=origCreate(tag,opts);
        var low=String(tag).toLowerCase();
        if(low==='script'||low==='iframe'){
          var origSet=el.setAttribute.bind(el);
          el.setAttribute=function(k,v){
            if(k==='src'&&AD_RE.test(String(v)))return;
            return origSet(k,v);
          };
        }
        return el;
      };
    }catch(e){}
    function cleanOverlays(){
      try{
        document.querySelectorAll('a[target="_blank"],a[href*="pop"],a[href*="click"]').forEach(function(a){
          var h=a.getAttribute('href')||'';
          if(AD_RE.test(h)||(a.target==='_blank'&&!a.closest('.vjs-control-bar'))){
            a.removeAttribute('href');
            a.removeAttribute('target');
            a.style.pointerEvents='none';
          }
        });
        document.querySelectorAll('div,section,span').forEach(function(el){
          if(el.querySelector('video,iframe'))return;
          var cs=window.getComputedStyle(el);
          if((cs.position==='fixed'||cs.position==='absolute')&&parseInt(cs.zIndex||'0',10)>999&&cs.opacity==='0'){
            el.style.pointerEvents='none';
            el.style.display='none';
          }
        });
      }catch(e){}
    }
    document.addEventListener('click',function(e){
      var a=e.target&&e.target.closest?e.target.closest('a'):null;
      if(a&&(a.target==='_blank'||AD_RE.test(a.href||''))){
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },true);
    document.addEventListener('auxclick',function(e){
      var a=e.target&&e.target.closest?e.target.closest('a'):null;
      if(a){e.preventDefault();e.stopImmediatePropagation();}
    },true);
    cleanOverlays();
    if(document.documentElement&&typeof MutationObserver!=='undefined'){
      new MutationObserver(cleanOverlays).observe(document.documentElement,{childList:true,subtree:true});
    }
  })();`;
}

/**
 * Attempts direct JS injection into a loaded player <iframe> (succeeds cleanly for
 * /api/embed-shield same-origin frames and recursively neutralizes nested frames).
 */
export function injectAdShieldIntoIframe(iframe: HTMLIFrameElement | null) {
  if (!iframe) return;
  try {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    const headOrDoc = doc.head || doc.documentElement;
    if (!headOrDoc) return;

    if (!doc.getElementById('mullahmax-frame-js-shield')) {
      const script = doc.createElement('script');
      script.id = 'mullahmax-frame-js-shield';
      script.textContent = getInFrameAntiRedirectScript();
      headOrDoc.prepend(script);
    }
  } catch {
    // Cross-origin frame: protected via parent-window JS shield and embed-shield proxy
  }
}

/**
 * Routes external embed mirrors through the server-side JS-injection shield proxy
 * so popunder/redirect scripts are stripped and neutralized before execution.
 */
export function wrapWithEmbedShieldProxy(url: string): string {
  if (!url) return url;
  return `/api/embed-shield?url=${encodeURIComponent(url)}`;
}

/**
 * Preconnect & dns-prefetch for streaming CDN origins.
 */
export function prewarmStreamUrl(url: string) {
  if (typeof document === 'undefined' || !url || url.startsWith('/')) return;
  try {
    const origin = new URL(url).origin;
    if (prewarmedOrigins.has(origin)) return;
    prewarmedOrigins.add(origin);

    if (!document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
      const preconnect = document.createElement('link');
      preconnect.rel = 'preconnect';
      preconnect.href = origin;
      preconnect.crossOrigin = 'anonymous';
      document.head.appendChild(preconnect);
    }

    if (!document.querySelector(`link[rel="dns-prefetch"][href="${origin}"]`)) {
      const dns = document.createElement('link');
      dns.rel = 'dns-prefetch';
      dns.href = origin;
      document.head.appendChild(dns);
    }
  } catch {
    // Ignore malformed URLs
  }
}

export function installAdShield() {
  if (typeof window === 'undefined' || isShieldInstalled) return;
  isShieldInstalled = true;

  try {
    // Guard against uninvited external anchor popunders / redirects triggered outside MullahMax UI
    const blockExternalAnchorEvent = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
      if (!anchor || window.__MULLAHMAX_ALLOW_POPUP__) return;

      const href = anchor.getAttribute('href') || '';
      const isBlank = anchor.target === '_blank';
      const sameOrigin =
        !href ||
        href.startsWith('#') ||
        href.startsWith('/') ||
        href.startsWith('blob:') ||
        href.startsWith(window.location.origin);

      if ((isBlank && !sameOrigin && !anchor.dataset.mullahmaxAllowed) || AD_NETWORK_PATTERN.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    document.addEventListener('click', blockExternalAnchorEvent, true);
    document.addEventListener('auxclick', blockExternalAnchorEvent, true);

    const fastDomains = [
      'https://vidfast.pro',
      'https://vidlink.pro',
      'https://primesrc.me',
      'https://player.videasy.net',
      'https://vixsrc.to',
    ];
    fastDomains.forEach((domain) => prewarmStreamUrl(domain));
  } catch (err) {
    console.warn('[AdShield] Initialization notice:', err);
  }
}
