/**
 * Advanced Ad & Popup Neutralizer for MullahMax Cinema.
 * Blocks unauthorized popup tabs, redirect takeovers, and clickjack scripts spawned by embedded media servers,
 * and prewarms ad-free streaming CDN connections on hover for instant 1-click playback.
 */

let isShieldInstalled = false;
let userIntentAllowed = false;
const prewarmedOrigins = new Set<string>();

export function allowNextUserPopup() {
  userIntentAllowed = true;
  setTimeout(() => {
    userIntentAllowed = false;
  }, 1500);
}

export function safeOpenTab(url: string) {
  allowNextUserPopup();
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Performs immediate preconnect & dns-prefetch for a target stream URL's origin
 * so TLS handshakes complete before the user clicks Play.
 */
export function prewarmStreamUrl(url: string) {
  if (typeof document === 'undefined' || !url) return;
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
    const originalOpen = window.open.bind(window);

    // Intercept window.open on parent window to block rogue ad popups
    window.open = function (
      url?: string | URL,
      target?: string,
      features?: string
    ): Window | null {
      // Only permit popup if the user deliberately initiated it via MullahMax UI
      if (userIntentAllowed) {
        userIntentAllowed = false;
        return originalOpen(url, target, features);
      }

      const urlStr = String(url || '').trim();
      console.warn(
        '[MullahMax AdShield] Blocked unauthorized ad/popup:',
        urlStr || 'about:blank'
      );
      return null;
    };

    // Guard against uninvited external anchor popunders triggered outside UI controls
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement | null;
        const anchor = target?.closest?.('a[target="_blank"]') as HTMLAnchorElement | null;
        if (anchor && !userIntentAllowed) {
          const href = anchor.getAttribute('href') || '';
          const sameOrigin = href.startsWith('/') || href.startsWith(window.location.origin);
          if (!sameOrigin && !anchor.dataset.mullahmaxAllowed) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      },
      true
    );

    // Preconnect and dns-prefetch to fastest ad-free streaming CDN domains for instant video start
    const fastDomains = [
      'https://vidlink.pro',
      'https://vidfast.pro',
      'https://player.videasy.net',
      'https://vixsrc.to',
      'https://primesrc.me',
    ];
    fastDomains.forEach((domain) => prewarmStreamUrl(domain));
  } catch (err) {
    console.warn('[AdShield] Initialization notice:', err);
  }
}
