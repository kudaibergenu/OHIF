/** @type {AppTypes.Config} */
window.config = {
  routerBasename: null,
  showStudyList: true,
  extensions: [],
  modes: [],
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
  const DEFAULT_URL = 'http://localhost:8000'; // `chainlit run app.py -w` default
  const url = (window.localStorage?.getItem('askai.chainlitUrl') || DEFAULT_URL).replace(/\/$/, '');

  const s = document.createElement('script');
  s.src = `${url}/copilot/index.js`;
  s.async = true;
  s.onload = () => {
    if (typeof window.mountChainlitWidget !== 'function') {
      console.warn('[askai] mountChainlitWidget not defined after script load');
      return;
    }
    try {
      window.mountChainlitWidget({ chainlitServer: url, opened: true });
      console.log(`[askai] Chainlit Copilot mounted (server: ${url})`);
    } catch (e) {
      console.warn('[askai] mountChainlitWidget failed:', e);
    }
  };
  s.onerror = () => {
    console.warn(
      `[askai] Could not load Chainlit Copilot from ${url}. ` +
      `Is your Chainlit server running? (try: chainlit run app.py -w --port 8000)`
    );
  };
  document.head.appendChild(s);
})();
