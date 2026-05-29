/** @type {AppTypes.Config} */
// SaigaLab production config — static hosting (Firebase), browser-only local
// upload (no PACS / no server-side PHI). The Copilot points at the Chainlit
// backend on Fly. Select at build time with APP_CONFIG=config/saigalab.js.
window.config = {
  routerBasename: null,
  extensions: [],
  modes: [],
  showStudyList: true,
  maxNumberOfWebWorkers: 4,
  showWarningMessageForCrossOrigin: true,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  defaultDataSourceName: 'dicomlocal',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomlocal',
      sourceName: 'dicomlocal',
      configuration: { friendlyName: 'Upload DICOM (local)' },
    },
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomjson',
      sourceName: 'dicomjson',
      configuration: { friendlyName: 'dicom json', name: 'json' },
    },
  ],
  httpErrorHandler: error => {
    console.warn(`HTTP Error Handler (status: ${error.status})`, error);
  },
  // SaigaLab brand mark in the header / study list.
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

// ─── Chainlit Copilot widget + auth gate (points at the Fly chat backend) ─────
// Override at runtime in the browser console with:
//   localStorage.setItem('askai.chainlitUrl', 'https://chat.saigalab.com')
(function injectChainlitCopilot() {
  const DEFAULT_URL = 'https://chat.saigalab.com';
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
      })
      .catch((e) => {
        console.warn('[askai] could not establish a session, sending to login:', e);
        window.location.href = `${url}/login`;
      });
  };
  s.onerror = () => console.warn(`[askai] Could not load Chainlit Copilot from ${url}.`);
  document.head.appendChild(s);
})();
