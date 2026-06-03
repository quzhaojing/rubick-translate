/* eslint-disable */
(function () {
  const DEFAULT_SETTINGS = {
    lastProvider: 'google',
    lastSourceLang: 'auto',
    lastTargetLang: 'zh',
    autoFallback: true,
    themeMode: 'system'
  };

  const PROVIDER_ORDER = ['google', 'bing'];

  const HISTORY_DOC_ID = 'rubick-translate/history';
  const SETTINGS_DOC_ID = 'rubick-translate/settings';
  const HISTORY_MAX = 30;
  const REQUEST_TIMEOUT = 15000;

  const PROVIDERS = {
    google: { label: 'Google', hint: '免费公开接口，无需 Key' },
    bing: { label: '必应 / 微软', hint: 'Edge 内置翻译授权，无需 Key' }
  };

  /** @type {{ token: string, expiresAt: number } | null} */
  let bingAuthCache = null;

  function isChinese(text) {
    return /[\u3400-\u9FBF]/.test(text);
  }

  function normalizeProvider(provider) {
    return provider === 'bing' ? 'bing' : 'google';
  }

  async function readDoc(id) {
    try {
      return await rubick.db.get(id);
    } catch (_) {
      return null;
    }
  }

  async function writeDoc(id, updater) {
    const existing = await readDoc(id);
    const base = existing ? { ...existing } : { _id: id };
    const next = await Promise.resolve(updater(base));
    return rubick.db.put(next);
  }

  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('请求超时，请稍后重试或切换引擎')), ms);
    });
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      timeout
    ]);
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`);
    }
    return res.json();
  }

  function mapLangForGoogle(code) {
    if (!code || code === 'auto') return 'auto';
    const map = { zh: 'zh-CN', en: 'en', ja: 'ja', ko: 'ko' };
    return map[code] || code;
  }

  function mapLangForBing(code) {
    if (!code || code === 'auto') return undefined;
    const map = {
      zh: 'zh-Hans',
      'zh-CN': 'zh-Hans',
      en: 'en',
      ja: 'ja',
      ko: 'ko',
      fr: 'fr',
      de: 'de',
      es: 'es',
      ru: 'ru',
      ar: 'ar',
      pt: 'pt',
      it: 'it',
      hi: 'hi'
    };
    return map[code] || code;
  }

  function normalizeDetectedLang(code, provider) {
    if (!code) return 'auto';
    const lower = String(code).toLowerCase();
    if (provider === 'bing') {
      if (lower.startsWith('zh')) return 'zh';
      return lower.split('-')[0];
    }
    if (lower.startsWith('zh')) return 'zh';
    return lower.split('-')[0];
  }

  async function translateWithGoogle({ text, source, target }) {
    const sl = mapLangForGoogle(source);
    const tl = mapLangForGoogle(target || (isChinese(text) ? 'en' : 'zh-CN'));
    const params = new URLSearchParams();
    params.set('client', 'gtx');
    params.set('sl', sl);
    params.set('tl', tl);
    params.set('dt', 't');
    params.set('q', text);

    const endpoints = [
      `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
      `https://translate.google.com/translate_a/single?${params.toString()}`
    ];

    let lastError;
    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const req = fetchJson(url, { signal: controller.signal });
        const data = await withTimeout(req, REQUEST_TIMEOUT);
        const sentences = Array.isArray(data?.[0]) ? data[0] : [];
        const translated = sentences.map((s) => (Array.isArray(s) ? s[0] || '' : '')).join('');
        const detectedSource = source === 'auto'
          ? normalizeDetectedLang(data?.[2] || (isChinese(text) ? 'zh' : 'en'), 'google')
          : source;
        if (translated) return { translated, detectedSource };
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('Google 翻译连接失败，请切换其他引擎');
  }

  async function getBingAuthToken() {
    if (bingAuthCache && bingAuthCache.expiresAt - Date.now() > 60000) {
      return bingAuthCache.token;
    }
    const controller = new AbortController();
    const req = fetch('https://edge.microsoft.com/translate/auth', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
      }
    }).then((r) => {
      if (!r.ok) throw new Error(`获取必应授权失败 (${r.status})`);
      return r.text();
    });
    const token = await withTimeout(req, REQUEST_TIMEOUT);
    let expiresAt = Date.now() + 9 * 60 * 1000;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload?.exp) expiresAt = payload.exp * 1000;
    } catch (_) {}
    bingAuthCache = { token, expiresAt };
    return token;
  }

  async function translateWithBing({ text, source, target }) {
    const token = await getBingAuthToken();
    const from = mapLangForBing(source);
    const to = mapLangForBing(target || (isChinese(text) ? 'en' : 'zh-Hans'));
    const params = new URLSearchParams([['api-version', '3.0'], ['to', to]]);
    if (from) params.set('from', from);

    const controller = new AbortController();
    const req = fetchJson(
      `https://api.cognitive.microsofttranslator.com/translate?${params.toString()}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
        },
        body: JSON.stringify([{ Text: text }])
      }
    );
    const data = await withTimeout(req, REQUEST_TIMEOUT);
    const item = Array.isArray(data) ? data[0] : null;
    const translated = item?.translations?.[0]?.text || '';
    const detectedSource = source === 'auto'
      ? normalizeDetectedLang(item?.detectedLanguage?.language || (isChinese(text) ? 'zh' : 'en'), 'bing')
      : source;
    if (!translated) throw new Error('必应翻译返回为空，请稍后重试');
    return { translated, detectedSource };
  }

  async function ensureDefaults() {
    if (!(await readDoc(SETTINGS_DOC_ID))) {
      await rubick.db.put({ _id: SETTINGS_DOC_ID, ...DEFAULT_SETTINGS });
    }
    if (!(await readDoc(HISTORY_DOC_ID))) {
      await rubick.db.put({ _id: HISTORY_DOC_ID, items: [] });
    }
  }

  async function getSettings() {
    const doc = await readDoc(SETTINGS_DOC_ID);
    const settings = { ...DEFAULT_SETTINGS, ...(doc || {}) };
    settings.lastProvider = normalizeProvider(settings.lastProvider);
    return settings;
  }

  async function updateSettings(partial) {
    if (partial.lastProvider) {
      partial.lastProvider = normalizeProvider(partial.lastProvider);
    }
    await writeDoc(SETTINGS_DOC_ID, (doc) => ({ ...doc, ...partial }));
    return getSettings();
  }

  async function addHistory(entry) {
    await writeDoc(HISTORY_DOC_ID, (doc) => {
      const items = Array.isArray(doc.items) ? doc.items.slice() : [];
      items.unshift({ ...entry, ts: Date.now() });
      if (items.length > HISTORY_MAX) items.length = HISTORY_MAX;
      return { ...doc, items };
    });
  }

  async function getHistory() {
    const doc = await readDoc(HISTORY_DOC_ID);
    return doc && Array.isArray(doc.items) ? doc.items : [];
  }

  async function clearHistory() {
    await writeDoc(HISTORY_DOC_ID, (doc) => ({ ...doc, items: [] }));
  }

  function toast(message) {
    try {
      rubick.showNotification(String(message || ''));
    } catch (_) {}
  }

  let readyResolver;
  const readyPromise = new Promise((resolve) => {
    readyResolver = resolve;
  });

  rubick.onPluginReady(async () => {
    try {
      await ensureDefaults();
      try {
        rubick.setExpendHeight(520);
      } catch (_) {}
    } catch (_) {}
    if (readyResolver) readyResolver(true);
  });

  rubick.onPluginEnter(({ type, payload }) => {
    if ((type === 'text' || type === 'over' || type === 'regex') && payload) {
      window.__rubickTranslateEnterText = String(payload);
    }
  });

  function consumeEnterText() {
    const text = window.__rubickTranslateEnterText || '';
    window.__rubickTranslateEnterText = '';
    return text;
  }

  function setSubInputValue(value) {
    try {
      return rubick.setSubInputValue(String(value ?? ''));
    } catch (_) {
      return false;
    }
  }

  function bindSubInput(onChange, placeholder) {
    try {
      return rubick.setSubInput(({ text }) => {
        try {
          onChange && onChange({ text });
        } catch (_) {}
      }, String(placeholder || ''));
    } catch (_) {
      return false;
    }
  }

  async function translateWithProvider(provider, { text, source, target }) {
    if (provider === 'bing') {
      return translateWithBing({ text, source, target });
    }
    return translateWithGoogle({ text, source, target });
  }

  function getFallbackProviders(primary) {
    return PROVIDER_ORDER.filter((p) => p !== primary);
  }

  async function translate({ text, provider, source, target, autoFallback }) {
    const settings = await getSettings();
    const cleanText = String(text || '').trim();
    if (!cleanText) {
      return { translated: '', detectedSource: source || 'auto', provider: normalizeProvider(provider || settings.lastProvider) };
    }

    const primary = normalizeProvider(provider || settings.lastProvider || 'google');
    const resolvedTarget = target || (isChinese(cleanText) ? 'en' : 'zh');
    const resolvedSource = source || 'auto';
    const useFallback = autoFallback !== undefined ? autoFallback : settings.autoFallback !== false;
    const providersToTry = useFallback
      ? [primary, ...getFallbackProviders(primary)]
      : [primary];

    let lastError;
    for (const current of providersToTry) {
      try {
        const result = await translateWithProvider(current, {
          text: cleanText,
          source: resolvedSource,
          target: resolvedTarget
        });
        const entry = {
          text: cleanText,
          translated: result.translated,
          provider: current,
          source: resolvedSource,
          target: resolvedTarget,
          detectedSource: result.detectedSource,
          fallbackFrom: current !== primary ? primary : undefined
        };
        await addHistory(entry);
        return {
          translated: result.translated,
          detectedSource: result.detectedSource,
          provider: current,
          fallbackFrom: entry.fallbackFrom
        };
      } catch (e) {
        lastError = e;
      }
    }

    const tried = providersToTry.map((p) => PROVIDERS[p]?.label || p).join(' → ');
    throw lastError || new Error(`所有引擎均失败（已尝试：${tried}）`);
  }

  window.rubickTranslate = {
    ready: () => readyPromise,
    init: async () => ({ settings: await getSettings(), history: await getHistory(), providers: PROVIDERS }),
    translate,
    updateSettings,
    getHistory,
    clearHistory,
    toast,
    bindSubInput,
    setSubInputValue,
    consumeEnterText
  };
})();
