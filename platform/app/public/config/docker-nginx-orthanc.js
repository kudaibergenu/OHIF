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
  // Hosted sample study (dicomjson manifest) — mirrors config/saigalab.js.
  // @ohif/extension-askai-assistant injects it into DicomMetadataStore in
  // preRegistration so it shows as a Study List row + opens. The bucket CORS
  // allows http://localhost:3000, so dev uses the same hosted manifest.
  sampleStudyManifestUrl:
    'https://storage.googleapis.com/saigalab-7d1d7.firebasestorage.app/teaching/brain-mri/manifest.json',
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

  // ─── Language (i18n) — self-contained; touches NO OHIF source ────────────────
  // The 🌐 selector in the account menu switches the whole experience by reloading
  // with ?lng=<code>: OHIF's own i18next detector (querystring → cache, see
  // platform/i18n/src/config.js) re-renders the viewer UI, this chip re-renders its
  // copy from I18N below, and the Chainlit Copilot is re-mounted in the mapped
  // locale. LANGS mirrors @ohif/i18n's shipped set (platform/i18n/src/locales) —
  // kept here, not imported, so OHIF upgrades can't break the chip. `chat` is the
  // Chainlit locale to mount the Copilot with; null = Chainlit ships no translation
  // for it, so the chat UI stays English while OHIF + this chip are translated.
  const LANGS = [
    { value: 'en-US', label: 'English',            chat: 'en-US', rtl: false },
    { value: 'es',    label: 'Español',            chat: 'es',    rtl: false },
    { value: 'fr',    label: 'Français',           chat: 'fr-FR', rtl: false },
    { value: 'de',    label: 'Deutsch',            chat: 'de-DE', rtl: false },
    { value: 'nl',    label: 'Nederlands',         chat: 'nl-NL', rtl: false },
    { value: 'pt-BR', label: 'Português (Brasil)', chat: 'pt-PT', rtl: false },
    { value: 'ru',    label: 'Русский',            chat: null,    rtl: false },
    { value: 'tr-TR', label: 'Türkçe',             chat: null,    rtl: false },
    { value: 'vi',    label: 'Tiếng Việt',         chat: null,    rtl: false },
    { value: 'ja-JP', label: '日本語',              chat: 'ja',    rtl: false },
    { value: 'zh',    label: '中文',                chat: 'zh-CN', rtl: false },
    { value: 'ar',    label: 'العربية',            chat: 'ar-SA', rtl: true  },
  ];

  // Resolve the active language: URL ?lng= first, then OHIF's cached choice,
  // normalized to a value we ship; default English.
  function askaiCurrentLang() {
    let v = null;
    try { v = new URLSearchParams(window.location.search).get('lng'); } catch (_) {}
    if (!v) { try { v = window.localStorage.getItem('i18nextLng'); } catch (_) {} }
    if (!v) return 'en-US';
    if (LANGS.some((l) => l.value === v)) return v;
    const base = String(v).split('-')[0];
    const hit = LANGS.find((l) => l.value === base || l.value.split('-')[0] === base);
    return hit ? hit.value : 'en-US';
  }
  const LANG = askaiCurrentLang();
  const LANG_DEF = LANGS.find((l) => l.value === LANG) || LANGS[0];

  // Switch language by reloading with ?lng=<code> (OHIF treats the querystring as
  // highest priority and caches it). One reload brings the viewer, this chip, and
  // the chat back up consistently; server-side chat history is keyed by session.
  function askaiSetLang(code) {
    if (!code || code === LANG) return;
    try { window.localStorage.setItem('i18nextLng', code); } catch (_) {}
    // Cross-subdomain carrier so the chat backend (chat.saigalab.com) can localize
    // its server-rendered welcome/status copy too: a .saigalab.com cookie rides the
    // Chainlit websocket handshake, which saigalab/i18n.py reads (negotiate()).
    try {
      document.cookie =
        'saiga_lang=' + encodeURIComponent(code) +
        ';Domain=.saigalab.com;Path=/;Max-Age=31536000;SameSite=Lax;Secure';
    } catch (_) {}
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('lng', code);
      window.location.assign(u.toString());
    } catch (_) {
      window.location.reload();
    }
  }

  // Short UI-label catalog (machine-translated, native-reviewed). Legal /
  // disclaimer / consent / onboarding copy is intentionally NOT translated here —
  // it stays English pending per-language legal review. A missing key or language
  // falls back to en-US.
  const I18N = {
      "en-US": {
          "signIn": "Sign in",
          "guest": "Guest",
          "account": "Account",
          "browsingAsGuest": "Browsing as Guest",
          "signedInAs": "Signed in as {{email}}",
          "freePlan": "Free plan",
          "proPlanActive": "Pro plan · active",
          "proPaymentIssue": "Pro · payment issue",
          "proEnds": "Pro · ends {{date}}",
          "guestTokensPerDay": "Guest · {{count}} tokens/day",
          "tokensToday": "{{used}} / {{cap}} tokens today",
          "resetsAt": "Resets 00:00 UTC (in {{time}})",
          "accountSettings": "Account settings",
          "signOut": "Sign out",
          "upgradeToPro": "Upgrade to Pro",
          "manageSubscription": "Manage subscription",
          "updatePayment": "Update payment",
          "resumePro": "Resume Pro",
          "signInFreePerDay": "Sign in free — {{count}}/day",
          "language": "Language"
      },
      "es": {
          "signIn": "Iniciar sesión",
          "guest": "Invitado",
          "account": "Cuenta",
          "browsingAsGuest": "Navegando como invitado",
          "signedInAs": "Sesión iniciada como {{email}}",
          "freePlan": "Plan gratuito",
          "proPlanActive": "Plan Pro · activo",
          "proPaymentIssue": "Pro · problema de pago",
          "proEnds": "Pro · termina {{date}}",
          "guestTokensPerDay": "Invitado · {{count}} tokens/día",
          "tokensToday": "{{used}} / {{cap}} tokens hoy",
          "resetsAt": "Se reinicia a las 00:00 UTC (en {{time}})",
          "accountSettings": "Configuración de cuenta",
          "signOut": "Cerrar sesión",
          "upgradeToPro": "Mejorar a Pro",
          "manageSubscription": "Gestionar suscripción",
          "updatePayment": "Actualizar pago",
          "resumePro": "Reanudar Pro",
          "signInFreePerDay": "Inicia sesión gratis — {{count}}/día",
          "language": "Idioma"
      },
      "fr": {
          "signIn": "Se connecter",
          "guest": "Invité",
          "account": "Compte",
          "browsingAsGuest": "Navigation en tant qu'invité",
          "signedInAs": "Connecté en tant que {{email}}",
          "freePlan": "Forfait gratuit",
          "proPlanActive": "Forfait Pro · actif",
          "proPaymentIssue": "Pro · problème de paiement",
          "proEnds": "Pro · se termine le {{date}}",
          "guestTokensPerDay": "Invité · {{count}} jetons/jour",
          "tokensToday": "{{used}} / {{cap}} jetons aujourd'hui",
          "resetsAt": "Réinitialisation à 00:00 UTC (dans {{time}})",
          "accountSettings": "Paramètres du compte",
          "signOut": "Se déconnecter",
          "upgradeToPro": "Passer à Pro",
          "manageSubscription": "Gérer l'abonnement",
          "updatePayment": "Mettre à jour le paiement",
          "resumePro": "Reprendre Pro",
          "signInFreePerDay": "Connexion gratuite — {{count}}/jour",
          "language": "Langue"
      },
      "de": {
          "signIn": "Anmelden",
          "guest": "Gast",
          "account": "Konto",
          "browsingAsGuest": "Als Gast unterwegs",
          "signedInAs": "Angemeldet als {{email}}",
          "freePlan": "Kostenloser Tarif",
          "proPlanActive": "Pro-Tarif · aktiv",
          "proPaymentIssue": "Pro · Zahlungsproblem",
          "proEnds": "Pro · endet {{date}}",
          "guestTokensPerDay": "Gast · {{count}} Tokens/Tag",
          "tokensToday": "{{used}} / {{cap}} Tokens heute",
          "resetsAt": "Reset 00:00 UTC (in {{time}})",
          "accountSettings": "Kontoeinstellungen",
          "signOut": "Abmelden",
          "upgradeToPro": "Auf Pro upgraden",
          "manageSubscription": "Abo verwalten",
          "updatePayment": "Zahlung aktualisieren",
          "resumePro": "Pro fortsetzen",
          "signInFreePerDay": "Kostenlos anmelden — {{count}}/Tag",
          "language": "Sprache"
      },
      "nl": {
          "signIn": "Inloggen",
          "guest": "Gast",
          "account": "Account",
          "browsingAsGuest": "Je gebruikt SaigaLab als gast",
          "signedInAs": "Ingelogd als {{email}}",
          "freePlan": "Gratis abonnement",
          "proPlanActive": "Pro-abonnement · actief",
          "proPaymentIssue": "Pro · betaalprobleem",
          "proEnds": "Pro · eindigt {{date}}",
          "guestTokensPerDay": "Gast · {{count}} tokens/dag",
          "tokensToday": "{{used}} / {{cap}} tokens vandaag",
          "resetsAt": "Reset om 00:00 UTC (over {{time}})",
          "accountSettings": "Accountinstellingen",
          "signOut": "Uitloggen",
          "upgradeToPro": "Upgraden naar Pro",
          "manageSubscription": "Abonnement beheren",
          "updatePayment": "Betaling bijwerken",
          "resumePro": "Pro hervatten",
          "signInFreePerDay": "Gratis inloggen — {{count}}/dag",
          "language": "Taal"
      },
      "pt-BR": {
          "signIn": "Entrar",
          "guest": "Convidado",
          "account": "Conta",
          "browsingAsGuest": "Navegando como convidado",
          "signedInAs": "Conectado como {{email}}",
          "freePlan": "Plano gratuito",
          "proPlanActive": "Plano Pro · ativo",
          "proPaymentIssue": "Pro · problema no pagamento",
          "proEnds": "Pro · termina em {{date}}",
          "guestTokensPerDay": "Convidado · {{count}} tokens/dia",
          "tokensToday": "{{used}} / {{cap}} tokens hoje",
          "resetsAt": "Redefine às 00:00 UTC (em {{time}})",
          "accountSettings": "Configurações da conta",
          "signOut": "Sair",
          "upgradeToPro": "Assinar o Pro",
          "manageSubscription": "Gerenciar assinatura",
          "updatePayment": "Atualizar pagamento",
          "resumePro": "Retomar o Pro",
          "signInFreePerDay": "Entre grátis — {{count}}/dia",
          "language": "Idioma"
      },
      "ru": {
          "signIn": "Войти",
          "guest": "Гость",
          "account": "Аккаунт",
          "browsingAsGuest": "Просматриваете как гость",
          "signedInAs": "Вы вошли как {{email}}",
          "freePlan": "Бесплатный план",
          "proPlanActive": "План Pro · активен",
          "proPaymentIssue": "Pro · проблема с оплатой",
          "proEnds": "Pro · до {{date}}",
          "guestTokensPerDay": "Гость · {{count}} токенов/день",
          "tokensToday": "{{used}} / {{cap}} токенов сегодня",
          "resetsAt": "Сброс в 00:00 UTC (через {{time}})",
          "accountSettings": "Настройки аккаунта",
          "signOut": "Выйти",
          "upgradeToPro": "Перейти на Pro",
          "manageSubscription": "Управление подпиской",
          "updatePayment": "Обновить способ оплаты",
          "resumePro": "Возобновить Pro",
          "signInFreePerDay": "Войти бесплатно — {{count}}/день",
          "language": "Язык"
      },
      "tr-TR": {
          "signIn": "Oturum aç",
          "guest": "Misafir",
          "account": "Hesap",
          "browsingAsGuest": "Misafir olarak geziniyorsunuz",
          "signedInAs": "{{email}} olarak oturum açıldı",
          "freePlan": "Ücretsiz plan",
          "proPlanActive": "Pro plan · etkin",
          "proPaymentIssue": "Pro · ödeme sorunu",
          "proEnds": "Pro · {{date}} tarihinde bitiyor",
          "guestTokensPerDay": "Misafir · {{count}} jeton/gün",
          "tokensToday": "Bugün {{used}} / {{cap}} jeton",
          "resetsAt": "00:00 UTC'de sıfırlanır ({{time}} içinde)",
          "accountSettings": "Hesap ayarları",
          "signOut": "Oturumu kapat",
          "upgradeToPro": "Pro'ya yükselt",
          "manageSubscription": "Aboneliği yönet",
          "updatePayment": "Ödemeyi güncelle",
          "resumePro": "Pro'yu sürdür",
          "signInFreePerDay": "Ücretsiz oturum aç — {{count}}/gün",
          "language": "Dil"
      },
      "vi": {
          "signIn": "Đăng nhập",
          "guest": "Khách",
          "account": "Tài khoản",
          "browsingAsGuest": "Đang dùng với tư cách Khách",
          "signedInAs": "Đã đăng nhập với {{email}}",
          "freePlan": "Gói miễn phí",
          "proPlanActive": "Gói Pro · đang hoạt động",
          "proPaymentIssue": "Pro · lỗi thanh toán",
          "proEnds": "Pro · kết thúc {{date}}",
          "guestTokensPerDay": "Khách · {{count}} token/ngày",
          "tokensToday": "{{used}} / {{cap}} token hôm nay",
          "resetsAt": "Đặt lại 00:00 UTC (sau {{time}})",
          "accountSettings": "Cài đặt tài khoản",
          "signOut": "Đăng xuất",
          "upgradeToPro": "Nâng cấp lên Pro",
          "manageSubscription": "Quản lý gói đăng ký",
          "updatePayment": "Cập nhật thanh toán",
          "resumePro": "Tiếp tục Pro",
          "signInFreePerDay": "Đăng nhập miễn phí — {{count}}/ngày",
          "language": "Ngôn ngữ"
      },
      "ja-JP": {
          "signIn": "ログイン",
          "guest": "ゲスト",
          "account": "アカウント",
          "browsingAsGuest": "ゲストとして利用中",
          "signedInAs": "{{email}} でログイン中",
          "freePlan": "無料プラン",
          "proPlanActive": "Pro プラン · 有効",
          "proPaymentIssue": "Pro · お支払いの問題",
          "proEnds": "Pro · {{date}} に終了",
          "guestTokensPerDay": "ゲスト · 1日 {{count}} トークン",
          "tokensToday": "本日 {{used}} / {{cap}} トークン",
          "resetsAt": "00:00 UTC にリセット（あと {{time}}）",
          "accountSettings": "アカウント設定",
          "signOut": "ログアウト",
          "upgradeToPro": "Pro にアップグレード",
          "manageSubscription": "サブスクリプションの管理",
          "updatePayment": "お支払い情報を更新",
          "resumePro": "Pro を再開",
          "signInFreePerDay": "無料でログイン — 1日 {{count}} トークン",
          "language": "言語"
      },
      "zh": {
          "signIn": "登录",
          "guest": "访客",
          "account": "账户",
          "browsingAsGuest": "以访客身份浏览",
          "signedInAs": "已登录：{{email}}",
          "freePlan": "免费版",
          "proPlanActive": "Pro 版 · 已启用",
          "proPaymentIssue": "Pro · 付款异常",
          "proEnds": "Pro · {{date}} 到期",
          "guestTokensPerDay": "访客 · 每日 {{count}} 个令牌",
          "tokensToday": "今日令牌 {{used}} / {{cap}}",
          "resetsAt": "UTC 00:00 重置（{{time}}后）",
          "accountSettings": "账户设置",
          "signOut": "退出登录",
          "upgradeToPro": "升级到 Pro",
          "manageSubscription": "管理订阅",
          "updatePayment": "更新付款方式",
          "resumePro": "恢复 Pro",
          "signInFreePerDay": "免费登录 — 每日 {{count}} 个",
          "language": "语言"
      },
      "ar": {
          "signIn": "تسجيل الدخول",
          "guest": "ضيف",
          "account": "الحساب",
          "browsingAsGuest": "التصفح كضيف",
          "signedInAs": "مسجّل الدخول باسم {{email}}",
          "freePlan": "الخطة المجانية",
          "proPlanActive": "خطة Pro · نشطة",
          "proPaymentIssue": "Pro · مشكلة في الدفع",
          "proEnds": "Pro · تنتهي {{date}}",
          "guestTokensPerDay": "ضيف · {{count}} رمز/يوم",
          "tokensToday": "{{used}} / {{cap}} رمز اليوم",
          "resetsAt": "يُعاد الضبط 00:00 UTC (خلال {{time}})",
          "accountSettings": "إعدادات الحساب",
          "signOut": "تسجيل الخروج",
          "upgradeToPro": "الترقية إلى Pro",
          "manageSubscription": "إدارة الاشتراك",
          "updatePayment": "تحديث الدفع",
          "resumePro": "استئناف Pro",
          "signInFreePerDay": "سجّل الدخول مجانًا — {{count}}/يوم",
          "language": "اللغة"
      }
  };

  function askaiT(key, vars) {
    const dict = I18N[LANG] || I18N['en-US'];
    let s = dict && dict[key] != null ? dict[key] : I18N['en-US'][key];
    if (s == null) return key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        s = s.split('{{' + k + '}}').join(vars[k]);
      });
    }
    return s;
  }

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
      #${NS} .lang-row{display:flex;align-items:center;gap:8px;margin-top:12px;
        padding-top:12px;border-top:1px solid #1f2c45}
      #${NS} .lang-ico{font-size:14px;line-height:1;flex:0 0 auto}
      #${NS} .lang-label{font-size:13px;color:#8aa0c6;flex:0 0 auto}
      #${NS} .lang{flex:1 1 auto;min-width:0;background:#16233f;color:#e8eefc;
        border:1px solid #2f4570;border-radius:8px;padding:6px 8px;font-size:13px;cursor:pointer}
      #${NS} .lang:hover{border-color:#3b82f6}
      #${NS} .menu[dir="rtl"]{direction:rtl;text-align:right}
      #${NS} .menu[dir="rtl"] .note,#${NS} .menu[dir="rtl"] .contact{direction:ltr;text-align:left}
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
        <div class="meta"><div class="name">${askaiT('guest')}</div><div class="bar"><i></i></div></div>
        <div class="pro" style="display:none">PRO</div>
        <button class="cta" type="button">${askaiT('signIn')} <span aria-hidden="true">→</span></button>
      </div>
      <div class="menu">
        <div class="m-id"></div><div class="m-sub"></div>
        <div class="m-bar"><i></i></div>
        <div class="m-usage"></div><div class="m-reset"></div>
        <button class="act primary"></button>
        <button class="act sec settings" style="display:none">${askaiT('accountSettings')}</button>
        <button class="act sec logout" style="display:none">${askaiT('signOut')}</button>
        <div class="lang-row">
          <span class="lang-ico" aria-hidden="true">🌐</span>
          <label class="lang-label" for="${NS}-lang">${askaiT('language')}</label>
          <select class="lang" id="${NS}-lang" aria-label="${askaiT('language')}"></select>
        </div>
        <div class="note">Research / educational use only. Not a medical device and not for diagnosis.<br>Images &amp; text you send are processed by third-party AI providers in the US (Google Gemini; Replicate for segmentation) for every analysis, even as a guest. If you accept saving (the one-tap prompt as a guest, or storage when you sign in), your conversations &amp; images are also saved (US servers) until you delete them — guest sessions auto-delete after 90 days.<br><a href="${url}/about" target="_blank" rel="noopener">About</a> · <a href="${url}/terms" target="_blank" rel="noopener">Terms</a> · <a href="${url}/privacy" target="_blank" rel="noopener">Privacy</a></div>
        <div class="contact">Inquiries: <a href="mailto:kuda@buildfast.studio">kuda@buildfast.studio</a><br>Connect on <a href="https://www.linkedin.com/in/kudakuda/" target="_blank" rel="noopener">LinkedIn</a>.</div>
      </div>`;
    document.body.appendChild(root);

    const $ = (sel) => root.querySelector(sel);
    const chip = $('.chip');

    // Language selector: list every locale OHIF's UI ships; changing it reloads so
    // OHIF, this chip, and the Chainlit chat all come back up in the chosen language.
    const langSel = $('.lang');
    if (langSel) {
      LANGS.forEach((l) => {
        const opt = document.createElement('option');
        opt.value = l.value;
        opt.textContent = l.label;
        if (l.value === LANG) opt.selected = true;
        langSel.appendChild(opt);
      });
      langSel.addEventListener('change', (e) => askaiSetLang(e.target.value));
      langSel.addEventListener('click', (e) => e.stopPropagation());
    }
    if (LANG_DEF.rtl) { const m = $('.menu'); if (m) m.setAttribute('dir', 'rtl'); }

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
      $('.name').textContent = anon ? askaiT('guest') : (d.email || askaiT('account'));
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

      $('.m-id').textContent = anon ? askaiT('browsingAsGuest') : askaiT('signedInAs', { email: d.email });
      let sub;
      if (pastDue) sub = askaiT('proPaymentIssue');
      else if (canceling) sub = askaiT('proEnds', { date: fmtDate(d.current_period_end) });
      else if (isPro) sub = askaiT('proPlanActive');
      else if (anon) sub = askaiT('guestTokensPerDay', { count: '300,000' });
      else sub = askaiT('freePlan');
      $('.m-sub').textContent = sub;

      $('.m-bar>i').style.width = ratio * 100 + '%';
      $('.m-bar>i').style.background = color;
      $('.m-usage').textContent = askaiT('tokensToday', { used: fmt(used), cap: fmt(cap) });
      $('.m-reset').textContent = askaiT('resetsAt', { time: untilUtcMidnight() });

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
        primary.textContent = askaiT('signInFreePerDay', { count: '1,800,000' });
        primary.onclick = () => {
          gotoLogin();
        };
        settings.style.display = 'none';
        logout.style.display = 'none';
      } else {
        if (pastDue) primary.textContent = askaiT('updatePayment');
        else if (canceling) primary.textContent = askaiT('resumePro');
        else if (isPro) primary.textContent = askaiT('manageSubscription');
        else primary.textContent = askaiT('upgradeToPro');
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
  // ─── One-tap guest acknowledgement (the consent gate for recording) ──────────
  // Guests stay usable without a signup wall, but we only RECORD a guest's
  // conversation + images after this single affirmative tap — which is both their
  // explicit consent to storage AND the same de-identified / no-PHI undertaking a
  // named account accepts at signup. "Start" POSTs /api/account/consent, stamping
  // the consent_version that storage_enabled checks, so a consenting guest hits the
  // identical persistence path a signed-in user does (the next message they send is
  // recorded; the thread is created lazily server-side — no reload). "Browse without
  // saving" leaves the session ephemeral. consent_current from /api/me is the source
  // of truth; a local "dismissed" flag just stops it nagging every reload until they
  // choose from the account menu. onDone() runs once the gate resolves (shown +
  // answered, or skipped) so the onboarding card follows without stacking. Copy lives
  // in STR for the later i18n pass.
  async function mountGuestConsent(onDone) {
    const NS = 'askai-gc';
    const KEY = 'askai.guestConsent.v1';
    let finished = false;
    const done = () => { if (finished) return; finished = true; try { onDone && onDone(); } catch (_) {} };
    if (document.getElementById(NS)) return;

    let me = null;
    try {
      const r = await fetch(`${url}/api/me`, { credentials: 'include' });
      if (r.ok) me = await r.json();
    } catch (_) { /* no session info → just skip the gate */ }
    const isGuest = me && (me.is_anonymous || !me.email);
    let dismissed = false;
    try { dismissed = localStorage.getItem(KEY) === 'dismissed'; } catch (_) {}
    if (!isGuest || me.consent_current || dismissed) { done(); return; }

    const STR = {
      title: 'Before you start',
      body:
        'SaigaLab is for <b>research and educational use only</b> — not a medical device, not for ' +
        'diagnosis or patient care. Upload only <b>de-identified</b> data — never PHI. To answer ' +
        'you, the images and text you send are processed by third-party AI providers in the US ' +
        '(Google Gemini; Replicate for segmentation).',
      save:
        'Tap <b>Start</b> and your guest session — your conversation and the images you send — is ' +
        'saved so you can revisit it, then <b>auto-deleted after 90 days</b> (or whenever you delete ' +
        'it). You can delete it any time from the account menu.',
      agree: 'Start — save my session',
      decline: 'Browse without saving',
      signin: 'or sign in for a free account →',
      trustLink: 'Terms & Privacy',
      err: 'Couldn’t enable saving just now — you can try again from the account menu.',
    };

    const style = document.createElement('style');
    style.textContent = `
      #${NS}{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;
        justify-content:center;padding:20px;background:rgba(8,12,22,.72);
        -webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);
        font-family:system-ui,-apple-system,sans-serif}
      #${NS} *{box-sizing:border-box}
      #${NS} .card{position:relative;width:min(460px,94vw);max-height:92vh;overflow:auto;
        background:#121b2e;border:1px solid #1f2c45;border-radius:16px;padding:22px 24px;
        color:#e8eefc;box-shadow:0 24px 64px rgba(0,0,0,.55);text-align:left}
      #${NS} .brand{display:flex;align-items:center;gap:8px;margin-bottom:10px}
      #${NS} .brand img{height:22px;width:auto}
      #${NS} .brand span{font-size:13px;font-weight:600;color:#cdd9f0}
      #${NS} h1{margin:0 0 10px;font-size:19px;font-weight:600}
      #${NS} .body{margin:0 0 12px;font-size:13.5px;line-height:1.5;color:#aab8d4}
      #${NS} .body b{color:#dde6f7}
      #${NS} .save{color:#8aa0c6}
      #${NS} .err{margin:0 0 10px;font-size:12.5px;color:#fca5a5}
      #${NS} button{display:block;width:100%;border-radius:10px;font-size:14px;
        font-weight:600;cursor:pointer;padding:11px 14px}
      #${NS} .agree{background:#2563eb;border:1px solid #2563eb;color:#fff;margin-bottom:8px}
      #${NS} .agree:hover{background:#1d4ed8}
      #${NS} .agree:disabled{opacity:.6;cursor:default}
      #${NS} .decline{background:transparent;border:1px solid #2c3a59;color:#aab8d4}
      #${NS} .decline:hover{border-color:#3b4d72;color:#cdd9f0}
      #${NS} .fine{margin:12px 0 0;font-size:12px;color:#6c80a6;text-align:center}
      #${NS} .fine a{color:#8aa0c6}`;
    document.head.appendChild(style);

    const back = document.createElement('div');
    back.id = NS;
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.setAttribute('aria-labelledby', `${NS}-title`);
    back.innerHTML = `
      <div class="card">
        <div class="brand"><img src="/askai-logo.png" alt=""/><span>SaigaLab</span></div>
        <h1 id="${NS}-title">${STR.title}</h1>
        <p class="body">${STR.body}</p>
        <p class="body save">${STR.save}</p>
        <div class="err" role="alert" hidden></div>
        <button class="agree" type="button">${STR.agree}</button>
        <button class="decline" type="button">${STR.decline}</button>
        <p class="fine"><a class="signin" href="#">${STR.signin}</a> · <a href="${url}/terms" target="_blank" rel="noopener">${STR.trustLink}</a></p>
      </div>`;
    document.body.appendChild(back);

    const card = back.querySelector('.card');
    function finish(markDismiss) {
      if (markDismiss) { try { localStorage.setItem(KEY, 'dismissed'); } catch (_) {} }
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      done();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(true); return; }
      if (e.key !== 'Tab') return;
      const f = card.querySelectorAll('button, a[href]');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    back.querySelector('.decline').onclick = () => finish(true);
    back.querySelector('.signin').onclick = (e) => { e.preventDefault(); gotoLogin(); };
    back.querySelector('.agree').onclick = async () => {
      const btn = back.querySelector('.agree');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      try {
        const r = await fetch(`${url}/api/account/consent`, { method: 'POST', credentials: 'include' });
        if (!r.ok) throw new Error(`consent failed: ${r.status}`);
        try { localStorage.setItem(KEY, 'acked'); } catch (_) {}
        finish(false);
      } catch (_) {
        const e = back.querySelector('.err');
        e.hidden = false;
        e.textContent = STR.err;
        btn.disabled = false;
        btn.textContent = STR.agree;
      }
    };
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => { try { back.querySelector('.agree').focus(); } catch (_) {} }, 30);
  }

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
      title: 'AI Measurement Tool for DICOM Images',
      sub: 'Ask in plain language. It drafts distance, angle, and volume measurements and drives the viewer — you verify and refine.',
      shots: [
        {
          src: '/assets/onboarding/measure.webp',
          alt: 'A brain MRI slice with a measurement line and a length label drawn on it',
          cap: 'Automatic distance measurement',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="4" y1="20" x2="20" y2="4"/><line x1="6.5" y1="15" x2="9" y2="17.5"/><line x1="11" y1="10.5" x2="13.5" y2="13"/><line x1="15.5" y1="6" x2="18" y2="8.5"/><circle cx="4" cy="20" r="1.4" fill="currentColor" stroke="none"/><circle cx="20" cy="4" r="1.4" fill="currentColor" stroke="none"/></svg>',
        },
        {
          src: '/assets/onboarding/angle.webp',
          alt: 'Two lines meeting at a vertex on an MRI with an angle value in degrees',
          cap: 'Automatic angle measurement',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M4 19 19 6"/><path d="M10.5 19a6.5 6.5 0 0 1 2-4.7"/></svg>',
        },
        {
          src: '/assets/onboarding/volume.webp',
          alt: 'A segmented organ on an MRI shaded as a volume with its size in millilitres',
          cap: 'Automatic volume measurement',
          icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7.5 4.2v9.6L12 21l-7.5-4.2V7.2z"/><path d="M4.5 7.2 12 11.4l7.5-4.2"/><path d="M12 11.4V21"/></svg>',
          info:
            'Volumes come from automatic segmentation, powered by <strong>TotalSegmentator</strong> (CT &amp; MRI) — 100+ structures, including:' +
            '<ul>' +
            '<li><b>Organs</b> — brain, heart, liver, spleen, pancreas, gallbladder, stomach, kidneys, adrenal glands, lungs, bladder, prostate</li>' +
            '<li><b>Vessels</b> — aorta, lung vessels, liver vessels</li>' +
            '<li><b>Spine &amp; bones</b> — vertebrae (C1–S1), spinal cord, teeth, head &amp; neck bones, hip implant</li>' +
            '<li><b>Neuro</b> — ventricles, cerebral hemorrhage</li>' +
            '<li><b>Lung</b> — nodules, pleural effusion</li>' +
            '<li><b>Liver</b> — Couinaud segments, lesions</li>' +
            '<li><b>Head &amp; neck</b> — glands, muscles, eye muscles, craniofacial structures</li>' +
            '<li><b>Body</b> — breasts, abdominal muscles, trunk cavities, whole body</li>' +
            '</ul>' +
            '<span class="muted">Plus licensed (non-commercial) tasks: tissue types, coronary arteries, brain substructures, heart &amp; aortic chambers, vertebral bodies, and more.</span>',
        },
      ],
      callout: 'You’re the reader of record. Confirm every number before you use it.',
      trust:
        'Research &amp; education only — not a medical device, not for diagnosis. De-identified data only; ' +
        'the slices and text you send are processed by third-party AI in the US (Google Gemini; Replicate for segmentation).',
      trustLink: 'What this means →',
      cont: 'Continue',
      go: 'Try it on a Brain MRI sample →',
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
      #${NS} .cont{display:block;width:100%;padding:13px;border:0;border-radius:9px;
        background:#2563eb;color:#fff;font-size:15px;font-weight:700;cursor:pointer}
      #${NS} .cont:hover{background:#3b82f6}
      #${NS} .go{display:block;width:100%;margin-top:9px;padding:11px;border:1px solid #2f4570;
        border-radius:9px;background:transparent;color:#cdd9f0;font-size:14px;font-weight:600;cursor:pointer}
      #${NS} .go:hover{border-color:#3b82f6;color:#fff;background:rgba(37,99,235,.08)}
      #${NS} .infowrap{position:relative;display:inline-flex;align-items:center}
      #${NS} .infobtn{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;
        margin-left:5px;border-radius:50%;border:1px solid #3a4d74;background:transparent;color:#9fb2d6;
        font-size:10px;font-weight:700;line-height:1;cursor:pointer;padding:0;flex:none}
      #${NS} .infobtn:hover{border-color:#3b82f6;color:#fff}
      #${NS} .infopop{position:absolute;bottom:calc(100% + 7px);right:0;z-index:5;width:250px;max-width:78vw;
        background:#0e1830;border:1px solid #2f4570;border-radius:9px;padding:10px 11px;font-size:11px;
        line-height:1.5;color:#bcccea;box-shadow:0 12px 32px rgba(0,0,0,.5);text-align:left}
      #${NS} .infopop[hidden]{display:none}
      #${NS} .infopop strong{color:#e8eefc;font-weight:600}
      #${NS} .infopop ul{margin:6px 0 0;padding-left:15px}
      #${NS} .infopop li{margin:1px 0}
      #${NS} .infopop b{color:#dde7fb}
      #${NS} .infopop .muted{display:block;margin-top:7px;color:#7e93ba}
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
          <figcaption>${s.cap}${
            s.info
              ? ` <span class="infowrap"><button class="infobtn" type="button" data-i="${i}" aria-label="What it can segment">i</button><div class="infopop" id="${NS}-info-${i}" role="tooltip" hidden>${s.info}</div></span>`
              : ''
          }</figcaption>
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
          <button class="cont" type="button">${STR.cont}</button>
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
      back.querySelector('.cont').onclick = close;
      back.querySelector('.go').onclick = () => triggerDemo(close);
      // Info popovers (e.g. "what can volume segmentation cover?"). Toggle in
      // place; never re-arms the once flag.
      back.querySelectorAll('.infobtn').forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const pop = btn.parentNode.querySelector('.infopop');
          if (pop) pop.hidden = !pop.hidden;
        };
      });
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => back.querySelector('.cont').focus(), 30);
    }

    if (!seen() && !suppressed()) {
      markSeen(); // first-run only: never reappear on later visits, even if dismissed without a click
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
        window.mountChainlitWidget(
          LANG_DEF.chat
            ? { chainlitServer: url, opened: true, displayMode: 'sidebar', language: LANG_DEF.chat }
            : { chainlitServer: url, opened: true, displayMode: 'sidebar' }
        );
        mountAccountChip();
        // Resolve the guest recording-consent gate first; the onboarding card follows
        // once it's answered (or skipped for named / already-consented sessions).
        mountGuestConsent(mountOnboarding);
      })
      .catch((e) => {
        console.warn('[askai] could not establish a session, sending to login:', e);
        gotoLogin();
      });
  };
  s.onerror = () => console.warn(`[askai] Could not load Chainlit Copilot from ${url}.`);
  document.head.appendChild(s);
})();
