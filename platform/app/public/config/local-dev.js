/** @type {AppTypes.Config} */
// SaigaLab LOCAL DEV config — mirrors config/saigalab.js (browser-only local
// upload, no PACS / no DICOM database), but points the Copilot at a local
// Chainlit backend instead of the Fly production server. Select with
// APP_CONFIG=config/local-dev.js. Do NOT use for the cloud build.
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
          'SaigaLab (dev)'
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
        ),
        // Data note — local files view in-browser, but anything sent to the AI
        // goes to the backend and on to third-party providers (Google/Replicate).
        React.createElement(
          'span',
          {
            style: {
              marginLeft: '20px',
              color: '#9fb3d1',
              fontSize: '12px',
              lineHeight: 1.3,
              maxWidth: '560px',
            },
          },
          'Your files view in your browser, but anything you send to the AI for analysis or segmentation is processed by third-party AI providers in the US (Google, Replicate). Research use only, not for diagnosis.'
        )
      );
    },
  },
};

// ─── Chainlit Copilot widget (points at the LOCAL Chainlit backend) ──────────
// Defaults to http://localhost:8000. Override at runtime in the browser console:
//   localStorage.setItem('askai.chainlitUrl', 'http://localhost:8000')
// Unlike the production config, this does NOT hard-redirect to a login page on
// 401 — it just logs a warning and skips mounting, so a local viewer still
// works whether or not Chainlit is running / authenticated.
(function injectChainlitCopilot() {
  const DEFAULT_URL = 'http://localhost:8000';
  const url = (window.localStorage?.getItem('askai.chainlitUrl') || DEFAULT_URL).replace(/\/$/, '');
  const s = document.createElement('script');
  s.src = `${url}/copilot/index.js`;
  s.async = true;
  s.onload = () => {
    if (typeof window.mountChainlitWidget !== 'function') {
      console.warn('[askai] mountChainlitWidget not defined after script load');
      return;
    }
    fetch(`${url}/api/me`, { credentials: 'include' })
      .then((r) => {
        if (r.status === 401) {
          console.warn('[askai] Chainlit session not authenticated (401) — skipping Copilot mount.');
          return;
        }
        try {
          window.mountChainlitWidget({ chainlitServer: url, opened: true });
        } catch (e) {
          console.warn('[askai] mountChainlitWidget failed:', e);
        }
      })
      .catch((e) => console.warn('[askai] auth check failed:', e));
  };
  s.onerror = () => console.warn(`[askai] Could not load Chainlit Copilot from ${url}.`);
  document.head.appendChild(s);
})();
