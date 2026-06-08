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
  // Default to local upload (matches prod saigalab.js) so the worklist doesn't
  // query Orthanc on landing — dev needs no PACS for upload / sample-study flows.
  // Orthanc is still selectable as a data source for anyone running it on :8042.
  defaultDataSourceName: 'dicomlocal',
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
        // Allow loading hosted teaching-study manifests from Firebase Storage
        // even in the (authenticated) anonymous-guest session.
        dangerouslyAllowedOriginsForAuthenticatedEnvironments: ['https://storage.googleapis.com'],
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
      // Hide the Upload entry point inside the viewer — you're already looking at
      // a study there, so it's only useful from the study list / landing.
      const inViewer = /\/viewer(\/|$|\?)/.test(window.location.pathname + window.location.search);
      const children = [
        React.createElement('img', {
          key: 'logo',
          src: '/askai-logo.png',
          alt: 'SaigaLab',
          style: { height: '40px', width: 'auto' },
        }),
        React.createElement(
          'div',
          {
            key: 'name',
            style: { display: 'flex', flexDirection: 'column', lineHeight: '1.15', whiteSpace: 'nowrap' },
          },
          React.createElement(
            'span',
            { key: 'n', style: { color: '#fff', fontSize: '18px', fontWeight: 600, letterSpacing: '0.01em' } },
            'SaigaLab'
          ),
          React.createElement(
            'span',
            { key: 't', style: { color: '#9fb2d6', fontSize: '11px', fontWeight: 500, letterSpacing: '0.02em' } },
            'AI Measurement Tool'
          )
        ),
      ];
      if (!inViewer) {
        // Upload entry point — routes to OHIF's local drag-and-drop loader.
        children.push(
          React.createElement(
            'a',
            {
              key: 'upload',
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
      }
      return React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        children
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

  // Sign-in navigates the whole page to the chat origin's /login, which then
  // redirects to APP_ORIGIN — dropping the loaded study. Carry the current
  // viewer URL along as ?next= so a guest who signs in lands back on the same
  // study. (Chat history is NOT preserved — it lives only in the session.)
  function gotoLogin() {
    window.location.href = `${url}/login?next=${encodeURIComponent(window.location.href)}`;
  }

  // Backend → page: the one-click sample demo. The chat fires
  // cl.CopilotFunction("loadStudy", {url}); we ack immediately, then navigate the
  // viewer to the dicomjson deep-link (a full reload). After reload the chat's
  // on_chat_start resumes the task via the seeded intent. (Verify the
  // `/viewer/dicomjson` route + that the manifest is a {"studies":[...]} JSON.)
  window.addEventListener('chainlit-call-fn', (e) => {
    const d = (e && e.detail) || {};
    if (d.name === 'loadStudy' && d.args && (d.args.path || d.args.url)) {
      try { d.callback && d.callback('navigating'); } catch (_) {}
      // `path` is a ready-made relative viewer route; `url` is the legacy
      // dicomjson-manifest form. Same-origin nav (full reload) — on_chat_start
      // resumes the task via the seeded intent.
      window.location.href =
        d.args.path || '/viewer/dicomjson?url=' + encodeURIComponent(d.args.url);
    }
  });

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
      /* Fix the "black gap" bug: the embedded Chainlit Copilot sidebar shrinks
         documentElement width, which react-remove-scroll (used by OHIF's Radix
         modal menus/dialogs) misreads as the scrollbar gap and re-adds as
         body padding-right — collapsing the OHIF content and exposing the page
         background. Neutralize that padding while a Radix modal is scroll-locked.
         Higher specificity than react-remove-scroll-bar's body[data-scroll-locked]. */
      html body[data-scroll-locked]{padding-right:0 !important;}
      #${NS}{position:fixed;top:9px;right:12px;z-index:2147483000;
        font-family:system-ui,-apple-system,sans-serif;color:#e8eefc}
      #${NS} *{box-sizing:border-box}
      #${NS} .chip{display:flex;align-items:center;gap:8px;cursor:pointer;height:34px;
        background:#16233f;border:1px solid #2f4570;border-radius:8px;
        padding:0 8px 0 6px;min-width:130px;max-width:260px;
        box-shadow:0 2px 10px rgba(0,0,0,.4),0 0 0 1px rgba(37,99,235,.18)}
      #${NS} .chip:hover{border-color:#3b82f6;box-shadow:0 2px 14px rgba(37,99,235,.4)}
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
      #${NS} .cta{flex:0 0 auto;display:none;align-items:center;gap:3px;
        font-size:12px;font-weight:700;color:#fff;background:#2563eb;border:0;
        border-radius:6px;padding:5px 9px;white-space:nowrap;cursor:pointer}
      #${NS} .cta:hover{background:#3b82f6}
      #${NS} .menu{position:absolute;top:calc(100% + 6px);right:0;width:300px;
        background:#121b2e;border:1px solid #1f2c45;border-radius:12px;padding:16px;
        box-shadow:0 12px 32px rgba(0,0,0,.5);display:none}
      #${NS}[data-open="1"] .menu{display:block}
      #${NS} .m-id{font-size:15px;font-weight:600;margin-bottom:2px}
      #${NS} .m-sub{font-size:13px;color:#8aa0c6;margin-bottom:10px}
      #${NS} .m-bar{height:8px;background:#1f2c45;border-radius:6px;overflow:hidden;margin:6px 0}
      #${NS} .m-bar>i{display:block;height:100%;width:0;background:#2563eb}
      #${NS} .m-usage{font-size:14px;color:#cdd9f0}
      #${NS} .m-reset{font-size:12px;color:#6c80a6;margin:2px 0 10px}
      #${NS} button.act{width:100%;padding:10px;border:0;border-radius:8px;cursor:pointer;
        font-weight:600;font-size:14px;background:#2563eb;color:#fff;margin-top:6px}
      #${NS} button.act.sec{background:#1f2c45;color:#e8eefc;font-weight:500}
      #${NS} .note{font-size:13px;color:#6c80a6;margin-top:12px;line-height:1.5}
      #${NS} .note a{color:#7aa2f7;text-decoration:none}
      #${NS} .contact{font-size:13px;color:#8aa0c6;margin-top:10px;line-height:1.5}
      #${NS} .contact a{color:#7aa2f7;text-decoration:none}
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
        <button class="cta" type="button">Sign in <span aria-hidden="true">→</span></button>
      </div>
      <div class="menu">
        <div class="m-id"></div><div class="m-sub"></div>
        <div class="m-bar"><i></i></div>
        <div class="m-usage"></div><div class="m-reset"></div>
        <button class="act primary"></button>
        <button class="act sec settings" style="display:none">Account settings</button>
        <button class="act sec logout" style="display:none">Sign out</button>
        <div class="note">Research / educational use only. Not a medical device and not for diagnosis.<br>Images &amp; text you send are processed by third-party AI providers in the US (Google Gemini; Replicate for segmentation) for every analysis, even as a guest. If you sign in and accept storage, your conversations &amp; images are also saved to your account (US servers) until you delete them.<br><a href="${url}/about" target="_blank" rel="noopener">About</a> · <a href="${url}/terms" target="_blank" rel="noopener">Terms</a> · <a href="${url}/privacy" target="_blank" rel="noopener">Privacy</a></div>
        <div class="contact">Inquiries: <a href="mailto:kuda@buildfast.studio">kuda@buildfast.studio</a><br>Connect on <a href="https://www.linkedin.com/in/kudakuda/" target="_blank" rel="noopener">LinkedIn</a>.</div>
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
          `You've used 80% of today's 300,000-token Guest limit. <a href="${url}/login">Sign in free</a> for 1,800,000/day.`
        );
      } else {
        toast(
          `You've used 80% of today's 1,800,000-token limit. <a href="${url}/account">Upgrade to Pro</a> for ~7× more.`
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
                'You’re on Pro — your daily cap is now 12,000,000 tokens. Thanks for supporting SaigaLab.'
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
      else if (anon) sub = 'Guest · 300,000 tokens/day';
      else sub = 'Free plan';
      $('.m-sub').textContent = sub;

      $('.m-bar>i').style.width = ratio * 100 + '%';
      $('.m-bar>i').style.background = color;
      $('.m-usage').textContent = `${fmt(used)} / ${fmt(cap)} tokens today`;
      $('.m-reset').textContent = `Resets 00:00 UTC (in ${untilUtcMidnight()})`;

      // Guest gets an inline "Sign in" pill on the chip itself (one click → login),
      // so the call-to-action is visible without opening the menu.
      const cta = $('.cta');
      cta.style.display = anon ? 'flex' : 'none';
      cta.onclick = (e) => {
        e.stopPropagation();
        gotoLogin();
      };

      const primary = $('.act.primary');
      const settings = $('.act.settings');
      const logout = $('.act.logout');
      if (anon) {
        primary.textContent = 'Sign in free — 1,800,000/day';
        primary.onclick = () => {
          gotoLogin();
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

    // The chip is anchored to the window's top-right edge via CSS (right:12px),
    // so it tracks the viewport natively on resize — no JS repositioning needed.
    refresh();
    setInterval(refresh, 45000);

    // One-shot post-logout reassurance (flag set just before the reload above).
    try {
      const so = sessionStorage.getItem('askai.signedOut');
      if (so) {
        sessionStorage.removeItem('askai.signedOut');
        if (JSON.parse(so).wasPro) {
          toast(
            `You're signed out and browsing as a Guest. Your Pro subscription is safe — <a href="${url}/login">sign back in</a> to use your 12,000,000 tokens/day.`,
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

  // ─── First-run onboarding card (picture-led; UI only, touches no OHIF source) ─
  // Explains what the Copilot does the first time a visitor lands, shown ONCE per
  // browser (localStorage, versioned key). Mirrors the chip's namespaced-DOM
  // pattern so OHIF upgrades can't merge-conflict with it. A persistent bottom-left
  // "?" re-opens it on demand (read-only — re-opening never re-arms the once flag).
  // All copy lives in STR for a one-object i18n pass later (fr/es/ar).
  function mountOnboarding() {
    const NS = 'askai-onb';
    const KEY = 'askai.onboarding.v1'; // bump to v2 to deliberately re-introduce
    if (document.getElementById(`${NS}-help`)) return; // already mounted

    // Never interrupt someone who arrived at a specific study, a seeded demo
    // reload, the upload page, or an explicitly suppressed (?onboarding=0) link.
    function suppressed() {
      const path = window.location.pathname;
      const search = window.location.search;
      return (
        /[?&]StudyInstanceUIDs=/.test(search) ||
        /[?&](url|seededIntent)=/.test(search) ||
        /[?&]onboarding=0\b/.test(search) ||
        /\/local(basic)?(\/|$)/.test(path)
      );
    }
    const seen = () => {
      try { return localStorage.getItem(KEY) === 'seen'; } catch (_) { return false; }
    };
    const markSeen = () => {
      try { localStorage.setItem(KEY, 'seen'); } catch (_) {}
    };

    const STR = {
      title: 'Meet your imaging Copilot',
      sub: 'Ask in plain language. It drives the viewer and drafts measurements — you verify and refine.',
      shots: [
        {
          src: '/assets/onboarding/measure.webp',
          alt: 'A brain MRI slice with a measurement line and a length label drawn on it',
          cap: 'Draft measurements you drag to refine',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="4" y1="20" x2="20" y2="4"/><line x1="6.5" y1="15" x2="9" y2="17.5"/><line x1="11" y1="10.5" x2="13.5" y2="13"/><line x1="15.5" y1="6" x2="18" y2="8.5"/><circle cx="4" cy="20" r="1.4" fill="currentColor" stroke="none"/><circle cx="20" cy="4" r="1.4" fill="currentColor" stroke="none"/></svg>',
        },
        {
          src: '/assets/onboarding/index.webp',
          alt: 'Frontal-horn and inner-skull lines on a brain MRI with an Evans index draft value',
          cap: 'Indices as drafts — Evans · Cobb · CTR',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 5H7l6 7-6 7h10"/></svg>',
        },
        {
          src: '/assets/onboarding/viewer.webp',
          alt: 'A plain-language chat command changing the viewer window/level',
          cap: 'Drive the viewer in plain language',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.3" fill="#0c1322"/><circle cx="15" cy="12" r="2.3" fill="#0c1322"/><circle cx="8" cy="17" r="2.3" fill="#0c1322"/></svg>',
        },
      ],
      callout: 'You’re the reader of record. Confirm every number before you use it.',
      trust:
        'Research &amp; education only — not a medical device, not for diagnosis. De-identified data only; ' +
        'the slices and text you send are processed by third-party AI in the US (Google Gemini; Replicate for segmentation).',
      trustLink: 'What this means →',
      go: 'Try it on a sample →',
      goHelp: 'Loads a sample brain MRI and measures the Evans index — a draft you’d refine.',
      hint: 'Press Esc or click outside to explore on your own.',
      help: 'What can SaigaLab do here?',
      pending:
        'The sample demo is being finalised. Drag a DICOM onto the viewer to start with your own study — de-identified data only.',
    };

    const style = document.createElement('style');
    style.textContent = `
      #${NS}{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;
        justify-content:center;padding:20px;background:rgba(8,12,22,.72);
        -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);
        font-family:system-ui,-apple-system,sans-serif}
      #${NS} *{box-sizing:border-box}
      #${NS} .card{position:relative;width:min(640px,94vw);max-height:92vh;overflow:auto;
        background:#121b2e;border:1px solid #1f2c45;border-radius:16px;padding:22px 24px;
        color:#e8eefc;box-shadow:0 24px 64px rgba(0,0,0,.55)}
      #${NS} .x{position:absolute;top:11px;right:14px;background:transparent;border:0;
        color:#6c80a6;font-size:22px;line-height:1;cursor:pointer}
      #${NS} .x:hover{color:#cdd9f0}
      #${NS} .brand{display:flex;align-items:center;gap:8px;margin-bottom:10px}
      #${NS} .brand img{height:24px;width:auto}
      #${NS} .brand span{font-size:14px;font-weight:600;color:#cdd9f0}
      #${NS} h1{margin:0 0 4px;font-size:21px;font-weight:600;letter-spacing:.01em}
      #${NS} .sub{margin:0 0 16px;font-size:14px;line-height:1.45;color:#8aa0c6}
      #${NS} .shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
        gap:12px;margin-bottom:16px}
      #${NS} figure.shot{margin:0}
      #${NS} .thumb{position:relative;aspect-ratio:4/3;background:#0c1322;border:1px solid #22304d;
        border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center}
      #${NS} .thumb .ic{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#4a6bb5}
      #${NS} .thumb .ic svg{width:34px;height:34px}
      #${NS} .thumb img{position:relative;z-index:1;width:100%;height:100%;object-fit:cover;display:block}
      #${NS} figcaption{margin-top:7px;font-size:12px;line-height:1.35;color:#9fb2d6}
      #${NS} .callout{border-left:3px solid #f59e0b;background:rgba(245,158,11,.08);
        padding:9px 12px;border-radius:6px;font-size:13px;line-height:1.4;color:#ecd9b0;margin-bottom:14px}
      #${NS} .trust{font-size:12px;line-height:1.5;color:#6c80a6;margin:0 0 16px}
      #${NS} .trust a{color:#7aa2f7;text-decoration:none;white-space:nowrap}
      #${NS} .go{display:block;width:100%;padding:12px;border:0;border-radius:9px;
        background:#2563eb;color:#fff;font-size:15px;font-weight:700;cursor:pointer}
      #${NS} .go:hover{background:#3b82f6}
      #${NS} .gohelp{margin:8px 0 0;text-align:center;font-size:12px;color:#6c80a6}
      #${NS} .hint{margin:10px 0 0;text-align:center;font-size:11px;color:#52658a}
      #${NS}-help{position:fixed;left:16px;bottom:16px;z-index:2147483000;width:34px;height:34px;
        border-radius:50%;background:#16233f;border:1px solid #2f4570;color:#cdd9f0;
        font-size:17px;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.4);
        font-family:system-ui,-apple-system,sans-serif}
      #${NS}-help:hover{border-color:#3b82f6;color:#fff}
    `;
    document.head.appendChild(style);

    // Persistent re-access button (bottom-left — the chip owns top-right, the chat
    // launcher owns bottom-right).
    const help = document.createElement('button');
    help.id = `${NS}-help`;
    help.type = 'button';
    help.textContent = '?';
    help.title = STR.help;
    help.setAttribute('aria-label', STR.help);
    help.onclick = () => openCard();
    document.body.appendChild(help);

    function onbToast(msg) {
      let wrap = document.getElementById('askai-chip-toasts');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'askai-chip-toasts';
        document.body.appendChild(wrap);
      }
      const t = document.createElement('div');
      t.className = 'toast';
      t.innerHTML = `<span class="x">×</span>${msg}`;
      t.querySelector('.x').onclick = () => t.remove();
      wrap.appendChild(t);
      setTimeout(() => t.remove(), 9000);
    }

    // The single CTA: navigate to the hosted sample if the backend reports one,
    // else fall back gracefully (never a dead/404 button). Lights up automatically
    // once a sample is hosted and the backend exposes /api/sample.
    async function triggerDemo(closeFn) {
      markSeen();
      try {
        const r = await fetch(`${url}/api/sample?key=brain_mri_evans`, { credentials: 'include' });
        if (r.ok) {
          const d = await r.json();
          if (d && d.ready && (d.path || d.viewer_url)) {
            window.location.href = d.path || d.viewer_url;
            return;
          }
        }
      } catch (_) {
        /* fall through to graceful fallback */
      }
      if (closeFn) closeFn();
      onbToast(STR.pending);
    }

    let lastFocus = null;
    function openCard() {
      if (document.getElementById(NS)) return;
      lastFocus = document.activeElement;

      const back = document.createElement('div');
      back.id = NS;
      back.setAttribute('role', 'dialog');
      back.setAttribute('aria-modal', 'true');
      back.setAttribute('aria-labelledby', `${NS}-title`);

      const shots = STR.shots
        .map(
          (s, i) => `
        <figure class="shot">
          <div class="thumb"><span class="ic">${s.icon}</span><img src="${s.src}" alt="${s.alt}" onerror="this.remove()"/></div>
          <figcaption>${s.cap}</figcaption>
        </figure>`
        )
        .join('');

      back.innerHTML = `
        <div class="card">
          <button class="x" type="button" aria-label="Close">×</button>
          <div class="brand"><img src="/askai-logo.png" alt=""/><span>SaigaLab</span></div>
          <h1 id="${NS}-title">${STR.title}</h1>
          <p class="sub">${STR.sub}</p>
          <div class="shots">${shots}</div>
          <div class="callout">${STR.callout}</div>
          <p class="trust">${STR.trust} <a href="${url}/privacy" target="_blank" rel="noopener">${STR.trustLink}</a></p>
          <button class="go" type="button">${STR.go}</button>
          <p class="gohelp">${STR.goHelp}</p>
          <p class="hint">${STR.hint}</p>
        </div>`;
      document.body.appendChild(back);

      const card = back.querySelector('.card');
      function close() {
        markSeen();
        document.removeEventListener('keydown', onKey, true);
        back.remove();
        try {
          (lastFocus && lastFocus.focus ? lastFocus : help).focus();
        } catch (_) {}
      }
      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
          return;
        }
        if (e.key !== 'Tab') return;
        const f = card.querySelectorAll('button, a[href]');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }

      back.querySelector('.x').onclick = close;
      // Click on the backdrop (i.e. "start working" in the viewer behind it) closes.
      back.addEventListener('mousedown', (e) => {
        if (e.target === back) close();
      });
      back.querySelector('.go').onclick = () => triggerDemo(close);
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => back.querySelector('.go').focus(), 30);
    }

    if (!seen() && !suppressed()) {
      setTimeout(openCard, 250); // let the viewer paint behind it first
    }
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
        mountOnboarding();
      })
      .catch((e) => {
        console.warn('[askai] could not establish a session, sending to login:', e);
        gotoLogin();
      });
  };
  s.onerror = () => console.warn(`[askai] Could not load Chainlit Copilot from ${url}.`);
  document.head.appendChild(s);
})();
