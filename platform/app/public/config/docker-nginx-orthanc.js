/** @type {AppTypes.Config} */
window.config = {
  routerBasename: null,
  showStudyList: true,
  extensions: [],
  modes: [],
  // Hide OHIF's generic "for investigational use only" banner — SaigaLab shows
  // its own research/educational-use disclaimer (mirrors config/saigalab.js).
  investigationalUseDialog: { option: 'never' },
  // below flag is for performance reasons, but it might not work for all servers
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  experimentalStudyBrowserSort: false,
  strictZSpacingForVolumeViewport: true,
  studyPrefetcher: {
    enabled: true,
    displaySetsCount: 2,
    maxNumPrefetchRequests: 10,
    order: 'closest',
  },
  defaultDataSourceName: 'orthancProxy',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'orthancProxy',
      configuration: {
        friendlyName: 'Orthanc Server',
        name: 'Orthanc',
        wadoUriRoot: '/wado',
        qidoRoot: '/pacs/dicom-web',
        wadoRoot: '/pacs/dicom-web',
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        dicomUploadEnabled: true,
        omitQuotationForMultipartRequest: true,
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'ohif',
      configuration: {
        friendlyName: 'AWS S3 Static wado server',
        name: 'aws',
        wadoUriRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        wadoRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: true,
        supportsWildcard: false,
        staticWado: true,
        singlepart: 'bulkdata,video',
        // whether the data source should use retrieveBulkData to grab metadata,
        // and in case of relative path, what would it be relative to, options
        // are in the series level or study level (some servers like series some study)
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
          transform: url => url.replace('/pixeldata.mp4', '/rendered'),
        },
        omitQuotationForMultipartRequest: true,
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'local5000',
      configuration: {
        friendlyName: 'Static WADO Local Data',
        name: 'DCM4CHEE',
        qidoRoot: 'http://localhost:5000/dicomweb',
        wadoRoot: 'http://localhost:5000/dicomweb',
        qidoSupportsIncludeField: false,
        supportsReject: true,
        supportsStow: true,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        staticWado: true,
        singlepart: 'video',
        bulkDataURI: {
          enabled: true,
          relativeResolution: 'studies',
        },
      },
    },

    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomjson',
      sourceName: 'dicomjson',
      configuration: {
        friendlyName: 'dicom json',
        name: 'json',
      },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
      sourceName: 'dicomlocal',
      configuration: {
        friendlyName: 'dicom local',
      },
    },
  ],
  httpErrorHandler: error => {
    console.warn(`HTTP Error Handler (status: ${error.status})`, error);
  },
  // askaihealth: replace the default OHIF logo in the header / study list with
  // our own brand mark. Pure config — no OHIF source is touched.
  whiteLabeling: {
    createLogoComponentFn: function (React) {
      return React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        React.createElement('img', {
          src: './askai-logo.png',
          alt: 'SaigaLab',
          style: { height: '40px', width: 'auto' },
        }),
        React.createElement(
          'span',
          {
            style: {
              color: '#fff',
              fontSize: '18px',
              fontWeight: 600,
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
            },
          },
          'SaigaLab'
        ),
        // Upload entry point — routes to OHIF's local drag-and-drop loader.
        React.createElement(
          'a',
          {
            href: '/local',
            style: {
              marginLeft: '16px',
              padding: '6px 14px',
              borderRadius: '6px',
              background: '#2563eb',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            },
          },
          'Upload'
        )
      );
    },
  },
};

// ─── askaihealth: inject the Chainlit Copilot widget ───────────────────────
//
// Mounts the same floating chat bubble that lives in public/viewer.html today,
// but now floats on top of OHIF — visible across all routes (study list AND
// viewer), in every mode, no panel toggling required.
//
// This block runs in the browser at OHIF startup. It is pure config — no OHIF
// source code is touched. Upstream OHIF upgrades are append-only here.
//
// Override the Chainlit URL at runtime (browser console):
//   localStorage.setItem('askai.chainlitUrl', 'https://my-chainlit.fly.dev')
// then reload.
(function injectChainlitCopilot() {
  const DEFAULT_URL = 'http://localhost:8000';
  const url = (window.localStorage?.getItem('askai.chainlitUrl') || DEFAULT_URL).replace(/\/$/, '');
  // Publish the resolved URL synchronously so the askai-assistant extension
  // (viewportTracker / actionPoller / sliceRenderer start at preRegistration,
  // before this async widget script loads) pushes state to the same backend.
  window.__ASKAI_CHAINLIT_URL__ = url;

  // Public Firebase web config for the saigalab project (safe to embed; mirrors
  // the values the server-rendered /login page uses).
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyCClUekIVAxvtLpVzMNL-am0ZSZlacZE5s',
    authDomain: 'saigalab-7d1d7.firebaseapp.com',
    projectId: 'saigalab-7d1d7',
    storageBucket: 'saigalab-7d1d7.firebasestorage.app',
    messagingSenderId: '66329312482',
    appId: '1:66329312482:web:01be6a6e00aa74ffc572bb',
  };

  // First-time visitors get a real (anonymous) Firebase session automatically so
  // the chat connects and the viewer is usable without a signup wall. They can
  // upgrade to a named account later from the chat's account link.
  async function establishAnonymousSession() {
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    const auth = authMod.getAuth(appMod.initializeApp(FIREBASE_CONFIG));
    const cred = await authMod.signInAnonymously(auth);
    const idToken = await cred.user.getIdToken();
    const resp = await fetch(`${url}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken }),
    });
    if (!resp.ok) {
      throw new Error(`session exchange failed: ${resp.status}`);
    }
  }

  // Reuse an existing session if there is one, otherwise mint an anonymous one.
  async function ensureSession() {
    const me = await fetch(`${url}/api/me`, { credentials: 'include' });
    if (me.ok) {
      return;
    }
    if (me.status !== 401) {
      console.warn(`[askai] /api/me returned unexpected status ${me.status}`);
    }
    await establishAnonymousSession();
  }

  // ─── Account chip (UI only; all auth/billing stays on the Chainlit backend) ──
  // A self-positioned overlay in the top-right. It only READS state from
  // {url}/api/me and LAUNCHES the pages/APIs that already live on the backend:
  //   Sign in  -> {url}/login          (existing page; returns to APP_ORIGIN)
  //   Account / Upgrade / Manage -> {url}/account
  //   Sign out -> POST {url}/api/logout + Firebase signOut, then reload
  // It touches NO OHIF source and never reads OHIF's DOM, so OHIF upgrades can
  // neither merge-conflict with it nor break it.
  function mountAccountChip() {
    const NS = 'askai-chip';
    if (document.getElementById(NS)) return;

    const style = document.createElement('style');
    style.textContent = `
      #${NS}{position:fixed;top:9px;right:12px;z-index:2147483000;
        font-family:system-ui,-apple-system,sans-serif;color:#e8eefc}
      #${NS} *{box-sizing:border-box}
      #${NS} .chip{display:flex;align-items:center;gap:8px;cursor:pointer;
        background:#121b2e;border:1px solid #1f2c45;border-radius:999px;
        padding:5px 12px 5px 6px;min-width:130px;max-width:230px}
      #${NS} .chip:hover{border-color:#2a3b5c}
      #${NS} .av{flex:0 0 auto;width:26px;height:26px;border-radius:50%;
        background:#2563eb;color:#fff;font-weight:700;font-size:13px;
        display:flex;align-items:center;justify-content:center;text-transform:uppercase}
      #${NS} .meta{min-width:0;display:flex;flex-direction:column;gap:3px;flex:1 1 auto}
      #${NS} .name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;
        text-overflow:ellipsis;line-height:1}
      #${NS} .bar{height:3px;background:#1f2c45;border-radius:3px;overflow:hidden}
      #${NS} .bar>i{display:block;height:100%;width:0;background:#2563eb;transition:width .3s,background .3s}
      #${NS} .pro{flex:0 0 auto;font-size:9px;font-weight:800;letter-spacing:.04em;
        color:#fbbf24;border:1px solid #fbbf24;border-radius:4px;padding:1px 4px}
      #${NS} .menu{position:absolute;top:calc(100% + 6px);right:0;width:268px;
        background:#121b2e;border:1px solid #1f2c45;border-radius:12px;padding:14px;
        box-shadow:0 12px 32px rgba(0,0,0,.5);display:none}
      #${NS}[data-open="1"] .menu{display:block}
      #${NS} .m-id{font-size:13px;font-weight:600;margin-bottom:2px}
      #${NS} .m-sub{font-size:11px;color:#8aa0c6;margin-bottom:10px}
      #${NS} .m-bar{height:8px;background:#1f2c45;border-radius:6px;overflow:hidden;margin:6px 0}
      #${NS} .m-bar>i{display:block;height:100%;width:0;background:#2563eb}
      #${NS} .m-usage{font-size:12px;color:#cdd9f0}
      #${NS} .m-reset{font-size:11px;color:#6c80a6;margin:2px 0 10px}
      #${NS} button.act{width:100%;padding:9px;border:0;border-radius:8px;cursor:pointer;
        font-weight:600;font-size:13px;background:#2563eb;color:#fff;margin-top:6px}
      #${NS} button.act.sec{background:#1f2c45;color:#e8eefc;font-weight:500}
      #${NS} .note{font-size:10px;color:#6c80a6;margin-top:12px;line-height:1.4}
      #${NS} .note a{color:#7aa2f7;text-decoration:none}
      #askai-chip-toasts{position:fixed;top:52px;right:12px;z-index:2147483000;
        width:300px;display:flex;flex-direction:column;gap:8px;
        font-family:system-ui,-apple-system,sans-serif}
      #askai-chip-toasts .toast{position:relative;background:#121b2e;
        border:1px solid #2a3b5c;border-radius:10px;padding:11px 28px 11px 12px;
        color:#e8eefc;font-size:12.5px;line-height:1.45;
        box-shadow:0 8px 24px rgba(0,0,0,.45)}
      #askai-chip-toasts .toast a{color:#7aa2f7;font-weight:600;text-decoration:none}
      #askai-chip-toasts .toast .x{position:absolute;top:6px;right:9px;cursor:pointer;
        color:#6c80a6;font-size:14px;line-height:1}
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = NS;
    root.innerHTML = `
      <div class="chip">
        <div class="av">G</div>
        <div class="meta"><div class="name">Guest</div><div class="bar"><i></i></div></div>
        <div class="pro" style="display:none">PRO</div>
      </div>
      <div class="menu">
        <div class="m-id"></div><div class="m-sub"></div>
        <div class="m-bar"><i></i></div>
        <div class="m-usage"></div><div class="m-reset"></div>
        <button class="act primary"></button>
        <button class="act sec settings" style="display:none">Account settings</button>
        <button class="act sec logout" style="display:none">Sign out</button>
        <div class="note">Research / educational use only. Not a medical device and not for diagnosis.<br><a href="${url}/terms" target="_blank" rel="noopener">Terms</a> · <a href="${url}/privacy" target="_blank" rel="noopener">Privacy</a></div>
      </div>`;
    document.body.appendChild(root);

    const $ = (sel) => root.querySelector(sel);
    const chip = $('.chip');

    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = root.getAttribute('data-open') === '1';
      root.setAttribute('data-open', open ? '0' : '1');
      if (!open) refresh();
    });
    document.addEventListener('click', (e) => {
      if (!root.contains(e.target)) root.setAttribute('data-open', '0');
    });

    const fmt = (n) => (n || 0).toLocaleString();
    function untilUtcMidnight() {
      const now = new Date();
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      const mins = Math.max(0, Math.round((next - now) / 60000));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`;
    }

    // ── Toasts (transient notices, stacked under the chip) ──────────────────
    const toastWrap = document.createElement('div');
    toastWrap.id = 'askai-chip-toasts';
    document.body.appendChild(toastWrap);
    function toast(html, opts) {
      opts = opts || {};
      const t = document.createElement('div');
      t.className = 'toast';
      t.innerHTML = `<span class="x">×</span>${html}`;
      t.querySelector('.x').onclick = () => t.remove();
      toastWrap.appendChild(t);
      if (!opts.persist) setTimeout(() => t.remove(), opts.ms || 8000);
      return t;
    }

    // Subscription statuses that still grant Pro (incl. dunning grace).
    const GRACE = ['active', 'trialing', 'past_due'];
    function fmtDate(unixSecs) {
      if (!unixSecs) return '';
      try {
        return new Date(unixSecs * 1000).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      } catch (e) {
        return '';
      }
    }

    let lastData = null; // last /api/me payload (used by the logout reassurance)
    let nudgedDay = null; // UTC day we last showed the 80% nudge (once per day)
    function maybeNudge(anon, isPro, ratio) {
      if (ratio < 0.8 || ratio >= 1) return; // only the 80–99% band
      const day = new Date().toISOString().slice(0, 10);
      if (nudgedDay === day) return;
      nudgedDay = day;
      if (isPro) return; // nothing to sell a Pro
      if (anon) {
        toast(
          `You've used 80% of today's 10,000-token Guest limit. <a href="${url}/login">Sign in free</a> for 50,000/day.`
        );
      } else {
        toast(
          `You've used 80% of today's 50,000-token limit. <a href="${url}/account">Upgrade to Pro</a> for 40× more.`
        );
      }
    }

    // ── Stripe round-trip returns (?checkout=success|cancel, ?portal=return) ─
    function clearParams() {
      try {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      } catch (e) {
        /* non-fatal */
      }
    }
    function handleReturnParams() {
      const p = new URLSearchParams(window.location.search);
      const checkout = p.get('checkout');
      const portal = p.get('portal');
      if (checkout === 'success') {
        clearParams();
        activatePro();
      } else if (checkout === 'cancel') {
        clearParams();
        toast(
          'No changes made — you’re still on the Free plan. You can upgrade any time from the account menu.'
        );
      } else if (portal === 'return') {
        clearParams();
        refresh();
      }
    }
    async function activatePro() {
      const t = toast('Activating Pro…', { persist: true });
      for (let i = 0; i < 15; i++) {
        try {
          const r = await fetch(`${url}/api/me`, { credentials: 'include' });
          if (r.ok) {
            const d = await r.json();
            render(d);
            if (d.plan === 'pro' && GRACE.includes(d.subscription_status)) {
              t.remove();
              toast(
                'You’re on Pro — your daily cap is now 2,000,000 tokens. Thanks for supporting SaigaLab.'
              );
              return;
            }
          }
        } catch (e) {
          /* keep polling */
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
      t.remove();
      toast(
        'Your payment went through, but Pro is taking a moment to activate. You can keep working — we’ll switch you over automatically.',
        { persist: true }
      );
    }

    function render(d) {
      lastData = d;
      // No real identity (anonymous, or no email) => Guest, so the chip always
      // offers "Sign in" rather than showing a half-known "signed in" state.
      const anon = !!d.is_anonymous || !d.email;
      const isPro = d.plan === 'pro' && GRACE.includes(d.subscription_status);
      const pastDue = d.plan === 'pro' && d.subscription_status === 'past_due';
      const canceling = isPro && !!d.cancel_at_period_end;
      const used = d.usage_tokens_today || 0;
      const cap = d.daily_cap || 1;
      const ratio = Math.min(1, used / cap);
      const color = ratio >= 1 ? '#ef4444' : ratio >= 0.8 ? '#f59e0b' : '#2563eb';

      $('.av').textContent = anon ? 'G' : ((d.email || '?').trim()[0] || '?');
      $('.name').textContent = anon ? 'Guest' : d.email || 'Account';
      $('.chip .bar>i').style.width = ratio * 100 + '%';
      $('.chip .bar>i').style.background = color;
      // Pro badge: gold when active, dimmed when canceling, amber on payment issue.
      const badge = $('.pro');
      badge.style.display = isPro ? 'block' : 'none';
      if (isPro) {
        badge.style.opacity = canceling ? '0.5' : '1';
        badge.style.color = pastDue ? '#f59e0b' : '#fbbf24';
        badge.style.borderColor = pastDue ? '#f59e0b' : '#fbbf24';
      }

      $('.m-id').textContent = anon ? 'Browsing as Guest' : `Signed in as ${d.email}`;
      let sub;
      if (pastDue) sub = 'Pro · payment issue';
      else if (canceling) sub = `Pro · ends ${fmtDate(d.current_period_end)}`;
      else if (isPro) sub = 'Pro plan · active';
      else if (anon) sub = 'Guest · 10,000 tokens/day';
      else sub = 'Free plan';
      $('.m-sub').textContent = sub;

      $('.m-bar>i').style.width = ratio * 100 + '%';
      $('.m-bar>i').style.background = color;
      $('.m-usage').textContent = `${fmt(used)} / ${fmt(cap)} tokens today`;
      $('.m-reset').textContent = `Resets 00:00 UTC (in ${untilUtcMidnight()})`;

      const primary = $('.act.primary');
      const settings = $('.act.settings');
      const logout = $('.act.logout');
      if (anon) {
        primary.textContent = 'Sign in free — 50,000/day';
        primary.onclick = () => {
          window.location.href = `${url}/login`;
        };
        settings.style.display = 'none';
        logout.style.display = 'none';
      } else {
        if (pastDue) primary.textContent = 'Update payment';
        else if (canceling) primary.textContent = 'Resume Pro';
        else if (isPro) primary.textContent = 'Manage subscription';
        else primary.textContent = 'Upgrade to Pro';
        primary.onclick = () => {
          window.location.href = `${url}/account`;
        };
        settings.style.display = 'block';
        settings.onclick = () => {
          window.location.href = `${url}/account`;
        };
        logout.style.display = 'block';
        logout.onclick = doLogout;
      }

      maybeNudge(anon, isPro, ratio);
    }

    async function doLogout() {
      try {
        const wasPro =
          lastData && lastData.plan === 'pro' && GRACE.includes(lastData.subscription_status);
        sessionStorage.setItem('askai.signedOut', JSON.stringify({ wasPro: !!wasPro }));
      } catch (e) {
        /* sessionStorage may be unavailable */
      }
      try {
        await fetch(`${url}/api/logout`, { method: 'POST', credentials: 'include' });
      } catch (e) {
        /* clearing the cookie best-effort */
      }
      try {
        const appMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
        const authMod = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        await authMod.signOut(authMod.getAuth(appMod.initializeApp(FIREBASE_CONFIG)));
      } catch (e) {
        /* already signed out */
      }
      // Reload: the bootstrap below re-establishes a fresh anonymous session and
      // remounts the chat under the new guest identity — no dead logged-out screen.
      window.location.reload();
    }

    async function refresh() {
      try {
        const r = await fetch(`${url}/api/me`, { credentials: 'include' });
        if (r.ok) render(await r.json());
      } catch (e) {
        /* keep last-known state on a transient error */
      }
    }

    // Keep the chip clear of our own right-docked Chainlit sidebar. The copilot
    // renders in a shadow DOM (which querySelectorAll can't pierce) and shrinks
    // the host page, so we derive its width from the viewport-minus-page delta,
    // with a sane default so the chip is NEVER hidden behind the panel. We never
    // read OHIF's own DOM, so this stays decoupled from OHIF internals.
    function chatWidth() {
      const host = window.cl_shadowRootElement && window.cl_shadowRootElement.host;
      if (host) {
        const r = host.getBoundingClientRect();
        if (r.width > 40 && Math.abs(r.right - window.innerWidth) < 8) return r.width;
      }
      const delta = window.innerWidth - document.body.getBoundingClientRect().width;
      if (delta > 40) return delta;
      return Math.min(440, Math.round(window.innerWidth * 0.3));
    }
    function reposition() {
      const w = chatWidth();
      root.style.right = w + 12 + 'px';
      toastWrap.style.right = w + 12 + 'px';
    }
    window.addEventListener('resize', reposition);
    [200, 800, 2000, 4000].forEach((t) => setTimeout(reposition, t));
    reposition();

    refresh();
    setInterval(refresh, 45000);

    // One-shot post-logout reassurance (flag set just before the reload above).
    try {
      const so = sessionStorage.getItem('askai.signedOut');
      if (so) {
        sessionStorage.removeItem('askai.signedOut');
        if (JSON.parse(so).wasPro) {
          toast(
            `You're signed out and browsing as a Guest. Your Pro subscription is safe — <a href="${url}/login">sign back in</a> to use your 2,000,000 tokens/day.`,
            { ms: 12000 }
          );
        } else {
          toast(
            `Signed out — you're now a Guest. <a href="${url}/login">Sign back in</a> to restore your account.`
          );
        }
      }
    } catch (e) {
      /* sessionStorage may be unavailable */
    }

    // Stripe round-trip handling (checkout/portal returns land on the app root).
    handleReturnParams();
  }

  const s = document.createElement('script');
  s.src = `${url}/copilot/index.js`;
  s.async = true;
  s.onload = () => {
    if (typeof window.mountChainlitWidget !== 'function') {
      console.warn('[askai] mountChainlitWidget not defined after script load');
      return;
    }
    // Make sure we hold a session before mounting; if we can't establish one
    // (e.g. the Anonymous provider is disabled), fall back to the login page so
    // the user never lands on a dead, unauthenticated screen.
    ensureSession()
      .then(() => {
        window.mountChainlitWidget({ chainlitServer: url, opened: true, displayMode: 'sidebar' });
        mountAccountChip();
      })
      .catch((e) => {
        console.warn('[askai] could not establish a session, sending to login:', e);
        window.location.href = `${url}/login`;
      });
  };
  s.onerror = () => console.warn(`[askai] Could not load Chainlit Copilot from ${url}.`);
  document.head.appendChild(s);
})();
