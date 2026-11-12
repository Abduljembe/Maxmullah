/**
 * Advanced Ad & Popup Neutralizer for MullahMax Cinema.
 * Blocks unauthorized popup tabs, redirect takeovers, and clickjack scripts spawned by embedded media servers.
 */

let isShieldInstalled = false;
let userIntentAllowed = false;

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
      // Only permit popup if the user deliberately initiated it via MullahMax UI (e.g. "Open Tab" button)
      if (userIntentAllowed) {
        userIntentAllowed = false;
        return originalOpen(url, target, features);
      }

      const urlStr = String(url || '').trim();
      console.warn(
        '[MullahMax AdShield] Intercepted and blocked unauthorized ad/popup:',
        urlStr || 'about:blank'
      );
      return null;
    };

    // Preconnect and dns-prefetch to fastest streaming CDN domains for instant video start
    const fastDomains = [
      'https://vidlink.pro',
      'https://vidsrc.sh',
      'https://www.2embed.cc',
      'https://vidsrc.to',
      'https://multiembed.mov',
      'https://viduki.net',
    ];
    fastDomains.forEach((domain) => {
      if (!document.querySelector(`link[rel="preconnect"][href="${domain}"]`)) {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = domain;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      }
      if (!document.querySelector(`link[rel="dns-prefetch"][href="${domain}"]`)) {
        const dnsLink = document.createElement('link');
        dnsLink.rel = 'dns-prefetch';
        dnsLink.href = domain;
        document.head.appendChild(dnsLink);
      }
    });
  } catch (err) {
    console.warn('[AdShield] Initialization notice:', err);
  }
}
