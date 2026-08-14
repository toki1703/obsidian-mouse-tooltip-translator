const { Plugin, PluginSettingTab, Setting, Notice, requestUrl, ItemView, Platform } = require('obsidian');
const nodeCrypto = require('crypto');

const DEFAULT_SETTINGS = {
  mouseoverEngine: 'google',
  selectionEngine: 'google',
  pageEngine: 'google',
  sourceLang: 'auto',
  targetLang: 'ja',
  enableHover: true,
  enableSelection: true,
  enablePage: true,
  enableHoverMobile: true,
  enableSelectionMobile: true,
  enablePageMobile: true,
  textType: 'word',               // 'word' | 'sentence'
  delayMs: 500,
  // Where the tooltip opens relative to the hovered text (upstream 0.1.244).
  // 'top' opens above like the reference extension; 'bottom' keeps this
  // plugin's original below-the-text behavior. Flips when out of room.
  tooltipPlacement: 'bottom',     // 'top' | 'bottom'
  showSourceText: false,
  showDetectedLang: false,
  showDictionary: true,
  showTransliteration: false,
  enabled: true,
  // When true, only react inside Obsidian note content (editor / preview / rendered embeds).
  // When false, react across the entire UI (sidebars, headers, etc.) — original behavior.
  restrictToNoteContent: true,
  // Which Obsidian view modes to react in (requires restrictToNoteContent: true).
  // 'edit'    : editor only (source / live preview)
  // 'reading' : reading view only
  // 'both'    : both (default)
  activeMode: 'both',
  // Suppress the tooltip when detected source language equals the target language.
  skipSameLanguage: true,
  // Stricter fallback: suppress when the translated text is identical to the input.
  // Helps when language detection is wrong (e.g. short tokens, proper nouns).
  skipIdenticalText: false,
  // When true, always call the translation API and never read from in-memory cache.
  disableCache: false,
  // 'system' | 'ja' | 'en'
  uiLang: 'system',
  // When true and page translation is showing, hover shows the pre-translation text
  // of the paragraph instead of running the normal word/sentence tooltip.
  pageTranslationHoverOriginal: true,
  // Integrated LLM engine (mirrors upstream localLlm, 0.1.246). The endpoint
  // is an OpenAI-compatible base URL including the version path (…/v1).
  llmProvider: 'custom',
  llmApiEndpoint: '',
  llmApiKey: '',
  llmModel: '',
  // Per-provider saved { apiEndpoint, apiKey, model }, restored when the user
  // switches back to a provider (mirrors upstream llmProviderSettings).
  llmProviderSettings: {},
  // Retry a failed request with another engine (google/bing/baidu), temporarily
  // benching the failed one (mirrors upstream fallbackTranslatorEngine).
  fallbackTranslatorEngine: true,
};

// ── i18n ─────────────────────────────────────────────────────────────────────
const STRINGS = {
  en: {
    // Tooltip
    origLabel: 'Original:',
    noTranslation: '(no translation)',
    // Vocab view
    vocabTitle: 'Vocabulary',
    vocabReload: 'Reload',
    sortByCount: 'By view count',
    sortByRecent: 'Recently viewed',
    sortAlpha: 'Alphabetical',
    filterAll: 'All',
    filterWord: 'Word',
    filterSentence: 'Sentence',
    vocabEmpty: 'No translation history',
    vocabCopy: 'Copy',
    vocabCopied: 'Copied!',
    copyTranslation: 'Copy translation',
    copyTranslationNotice: (text) => `Copied: ${text}`,
    copyTranslationNone: 'No translation to copy.',
    // Page translator
    pageAlreadyRunning: 'Page translation is already running.',
    pageNeedReadingView: 'Please switch to Reading View to translate the page.',
    pageNoText: 'No text found to translate.',
    pageTranslating: (cur, tot) => `Translating... ${cur}/${tot}`,
    pageCancel: 'Cancel',
    pageDone: (done, tot) => `Page translation complete (${done}/${tot} sections)`,
    pageRestoreReadingOnly: 'Page restore is only available in Reading View.',
    pageNoTranslated: 'No translated text found.',
    pageRestored: (n) => `Restored original text (${n} sections)`,
    // Plugin actions
    pageDisabled: 'Page translation is disabled.',
    pluginToggle: (on) => `Mouse Tooltip Translator: ${on ? 'ON' : 'OFF'}`,
    // Ribbon / commands
    ribbonVocab: 'Open vocabulary list',
    ribbonPage: 'Translate page / Restore',
    // Settings headings
    settingsTitle: 'Mouse Tooltip Translator',
    secFeatures: 'Features',
    secDesktop: 'Desktop',
    secMobile: 'Mobile',
    secTranslation: 'Translation',
    secEngines: 'Engine Settings',
    secPerFeature: '🎯Per-feature Settings',
    secHoverSelection: 'Hover / Text Selection',
    secPage: 'Page Translation',
    secTooltip: 'Tooltip',
    // Master toggle
    masterEnabled: 'Enabled',
    masterEnabledDesc: 'Master switch for the translator.',
    masterRestrict: 'Restrict to note content',
    masterRestrictDesc: 'Only react inside the note body (editor, preview, embeds). Turn off to translate anywhere in the Obsidian UI — sidebars, headings, settings, etc.',
    // Feature toggles
    featHover: 'Hover translation',
    featHoverDesc: 'Show a translation tooltip when hovering over text.',
    featSelection: 'Text selection translation',
    featSelectionDesc: 'Show a translation tooltip when text is selected.',
    featPage: 'Page translation',
    featPageDesc: 'Enable full-page translation via the ribbon button or command.',
    featHoverMobile: 'Tap translation',
    featHoverMobileDesc: 'Show a translation tooltip when tapping on a word.',
    featSelectionMobile: 'Selection translation',
    featSelectionMobileDesc: 'Show a translation tooltip when text is selected after a touch.',
    featPageMobile: 'Page translation',
    featPageMobileDesc: 'Enable full-page translation via the ribbon button or command.',
    // Translation settings
    translateFrom: 'Translate from',
    translateTo: 'Translate to',
    langAuto: 'Auto detect',
    skipSame: 'Skip same-language translations',
    skipSameDesc: "Hide the tooltip when the detected source language matches the target language (e.g. Japanese → Japanese).",
    skipIdentical: 'Skip identical translations',
    skipIdenticalDesc: 'Also hide the tooltip when the translated text is identical to the source text. Useful for short tokens, proper nouns, or code.',
    // Engine settings
    engineHover: 'Hover translation engine',
    engineHoverDesc: 'Engine to use when hovering.',
    engineSelection: 'Text translation engine',
    engineSelectionDesc: 'Engine to use for text selection.',
    enginePage: 'Page translation engine',
    enginePageDesc: 'Engine to use for full-page translation.',
    // Integrated LLM engine
    llmSection: 'LLM Settings',
    llmProvider: 'LLM Provider',
    llmProviderDesc: 'Choosing a preset fills in the endpoint URL. Custom accepts any OpenAI-compatible endpoint.',
    llmApiUrl: 'LLM API Endpoint URL',
    llmApiUrlDesc: 'OpenAI-compatible base URL including the version path (e.g. https://api.openai.com/v1).',
    llmApiKey: 'LLM API Key',
    llmModel: 'LLM Model',
    llmModelDesc: 'Model name. Click ↻ to fetch the model list from the endpoint using the API key.',
    llmFetchModels: 'Fetch models from endpoint',
    llmFetchNoEndpoint: 'API endpoint is empty',
    llmFetchNoModels: 'No models returned by endpoint',
    llmFetchFailed: (msg) => `Failed to fetch LLM models: ${msg}`,
    llmFetchOk: (n) => `Fetched ${n} models — open the model field to pick one`,
    fallbackEngine: 'Fallback translator engine',
    fallbackEngineDesc: 'When the selected engine fails, retry the request with another engine (Google / Bing / Baidu), temporarily benching the failed one.',
    // Per-feature settings
    activeMode: 'Active mode',
    activeModeDesc: 'Select which Obsidian view mode to enable tooltip translation in.',
    modeBoth: 'Edit + Reading',
    modeEdit: 'Edit only',
    modeReading: 'Reading only',
    mouseUnit: 'Mouseover unit',
    mouseUnitDesc: 'Word picks one word under the cursor. Sentence expands to sentence boundary.',
    hoverDelay: 'Hover delay (ms)',
    hoverDelayDesc: 'Wait time before the tooltip is requested.',
    tooltipPlacement: 'Tooltip placement',
    tooltipPlacementDesc: 'Open the tooltip above or below the hovered text. It flips to the other side when there is no room on screen.',
    placementAbove: 'Above',
    placementBelow: 'Below',
    pageHoverOrig: 'Show original paragraph on hover during page translation',
    pageHoverOrigDesc: 'While page translation is active, disable normal hover/selection translation and show the pre-translation text of the hovered paragraph instead.',
    // Tooltip contents
    showDict: 'Show dictionary (POS) for single words',
    showDictDesc: 'When Google returns a bilingual dictionary, show "noun: ..." / "verb: ..." lines instead of the plain translation. Other engines do not return POS info.',
    unitWord: 'Word',
    unitSentence: 'Sentence',
    showTranslit: 'Show transliteration (romanization)',
    showTranslitDesc: 'Display the romanized reading of the source word (Google / Bing only).',
    showSource: 'Show source text',
    showDetected: 'Show detected language',
    uiLang: 'Interface language',
    uiLangDesc: 'Language used in the plugin settings UI.',
    uiLangSystem: 'Follow system',
    // Translation panel
    ribbonTrans: 'Open translation panel',
    transPanelTitle: 'Translation',
    transPanelPlaceholder: 'Enter text to translate…',
    transPanelSwap: 'Swap languages',
    transPanelClear: 'Clear',
    transPanelCopy: 'Copy',
    transPanelCopied: 'Copied!',
  },
  ja: {
    origLabel: '原文:',
    noTranslation: '(翻訳なし)',
    vocabTitle: '単語帳',
    vocabReload: '再読み込み',
    sortByCount: '閲覧数順',
    sortByRecent: '最近見た順',
    sortAlpha: 'アルファベット順',
    filterAll: 'すべて',
    filterWord: '単語',
    filterSentence: '文',
    vocabEmpty: '翻訳履歴がありません',
    vocabCopy: 'コピー',
    vocabCopied: 'コピー済み',
    copyTranslation: '翻訳をコピー',
    copyTranslationNotice: (text) => `コピーしました: ${text}`,
    copyTranslationNone: 'コピーできる翻訳がありません。',
    // Page translator
    pageAlreadyRunning: 'ページ翻訳は既に実行中です。',
    pageNeedReadingView: 'ページ翻訳には閲覧モード（Reading View）に切り替えてください。',
    pageNoText: '翻訳するテキストが見つかりませんでした。',
    pageTranslating: (cur, tot) => `ページ翻訳中... ${cur}/${tot}`,
    pageCancel: 'キャンセル',
    pageDone: (done, tot) => `ページ翻訳完了 (${done}/${tot} セクション)`,
    pageRestoreReadingOnly: '閲覧モードでのみ復元できます。',
    pageNoTranslated: '翻訳済みのテキストが見つかりませんでした。',
    pageRestored: (n) => `元のテキストに復元しました (${n} セクション)`,
    pageDisabled: 'ページ翻訳は無効になっています。',
    ribbonVocab: '単語帳を開く',
    ribbonPage: 'ページを翻訳 / 元に戻す',
    secFeatures: '機能の有効化/無効化',
    secDesktop: 'デスクトップ',
    secMobile: 'モバイル',
    secTranslation: '翻訳設定',
    secEngines: 'エンジン設定',
    secPerFeature: '🎯機能ごとの設定',
    secHoverSelection: 'ホバー翻訳 / テキスト選択翻訳',
    secPage: 'ページ翻訳',
    featHover: 'ホバー翻訳',
    featHoverDesc: 'マウスカーソルを合わせたときに翻訳ツールチップを表示します。',
    featSelection: 'テキスト選択翻訳',
    featSelectionDesc: 'テキストを選択したときに翻訳ツールチップを表示します。',
    featPage: 'ページ翻訳',
    featPageDesc: 'リボンボタンやコマンドからページ全体を翻訳する機能を有効にします。',
    featHoverMobile: 'タップ翻訳',
    featHoverMobileDesc: '単語をタップしたときに翻訳ツールチップを表示します。',
    featSelectionMobile: 'テキスト選択翻訳',
    featSelectionMobileDesc: 'タッチ後にテキストを選択したときに翻訳ツールチップを表示します。',
    featPageMobile: 'ページ翻訳',
    featPageMobileDesc: 'リボンボタンやコマンドからページ全体を翻訳する機能を有効にします。',
    skipSameDesc: '翻訳先と同じ言語が検出された場合にツールチップを非表示にします。',
    skipIdenticalDesc: '翻訳結果が原文と同一の場合もツールチップを非表示にします。短いトークン、固有名詞、コードなどに有効です。',
    engineHover: 'ホバー翻訳エンジン',
    engineHoverDesc: 'マウスカーソルを合わせたときに使うエンジン',
    engineSelection: 'テキスト翻訳エンジン',
    engineSelectionDesc: 'テキストを選択したときに使うエンジン',
    enginePage: 'ページ翻訳エンジン',
    enginePageDesc: 'ページ全体を翻訳するときに使うエンジン',
    llmSection: 'LLM設定',
    llmProvider: 'LLMプロバイダー',
    llmProviderDesc: 'プリセットを選ぶとエンドポイントURLが自動入力されます。Custom では任意のOpenAI互換エンドポイントを指定できます。',
    llmApiUrl: 'LLM APIエンドポイントURL',
    llmApiUrlDesc: 'バージョンパスを含むOpenAI互換ベースURL（例: https://api.openai.com/v1）',
    llmApiKey: 'LLM APIキー',
    llmModel: 'LLMモデル',
    llmModelDesc: 'モデル名。↻ ボタンでAPIキーを使ってエンドポイントからモデル一覧を取得できます。',
    llmFetchModels: 'エンドポイントからモデル一覧を取得',
    llmFetchNoEndpoint: 'APIエンドポイントが未入力です',
    llmFetchNoModels: 'エンドポイントからモデルが返されませんでした',
    llmFetchFailed: (msg) => `モデル一覧の取得に失敗しました: ${msg}`,
    llmFetchOk: (n) => `${n}件のモデルを取得しました — モデル欄をクリックして選択できます`,
    fallbackEngine: 'フォールバックエンジン',
    fallbackEngineDesc: '選択中のエンジンが失敗した場合、別のエンジン (Google / Bing / Baidu) でそのリクエストを再試行し、失敗したエンジンを一時的に休止させます。',
    activeMode: '適用するモード',
    activeModeDesc: 'ツールチップ翻訳を有効にするObsidianのビューモードを選択します。',
    modeBoth: '編集モード + リーディングモード',
    modeEdit: '編集モードのみ',
    modeReading: 'リーディングモードのみ',
    pageHoverOrig: '翻訳表示中は段落原文をホバー表示',
    pageHoverOrigDesc: 'ページ翻訳の結果を表示しているとき、通常のホバー翻訳・テキスト選択翻訳を無効にし、ホバーした段落の翻訳前テキストをツールチップに表示します。',
    masterEnabled: '有効',
    masterEnabledDesc: '翻訳機能のマスタースイッチ。',
    masterRestrict: 'ノートコンテンツ内に制限',
    masterRestrictDesc: 'ノート本文（エディター・プレビュー・埋め込み）内でのみ反応します。オフにすると、サイドバーや見出し、設定など Obsidian UI 全体で翻訳します。',
    translateFrom: '翻訳元言語',
    translateTo: '翻訳先言語',
    langAuto: '自動検出',
    skipSame: '同一言語の翻訳をスキップ',
    skipSameDesc: '翻訳先と同じ言語が検出された場合にツールチップを非表示にします（例: 日本語 → 日本語）。',
    skipIdentical: '同一テキストの翻訳をスキップ',
    skipIdenticalDesc: '翻訳結果が原文と同一の場合もツールチップを非表示にします。短いトークン、固有名詞、コードなどに有効です。',
    unitWord: '単語',
    unitSentence: '文',
    mouseUnit: 'ホバー単位',
    mouseUnitDesc: '「単語」はカーソル直下の1語を取得します。「文」は文境界まで展開します。',
    hoverDelay: 'ホバー遅延 (ms)',
    hoverDelayDesc: 'ツールチップを表示するまでの待機時間。',
    tooltipPlacement: 'ツールチップの表示位置',
    tooltipPlacementDesc: 'ホバーしたテキストの上と下のどちらにツールチップを表示するか。画面に入り切らない場合は反対側に表示します。',
    placementAbove: '上',
    placementBelow: '下',
    secTooltip: 'ツールチップ',
    showDict: '単語の品詞（辞書）情報を表示',
    showDictDesc: 'Google が二言語辞書を返した場合、単純な翻訳の代わりに「名詞: ...」/「動詞: ...」形式で表示します。他のエンジンは品詞情報を返しません。',
    showTranslit: '転写（ローマ字読み）を表示',
    showTranslitDesc: '原語のローマ字読みを表示します（Google・Bing のみ）。',
    showSource: '原文を表示',
    showDetected: '検出言語を表示',
    uiLang: 'UI言語',
    uiLangDesc: 'プラグイン設定UIに使用する言語。',
    uiLangSystem: 'システムに従う',
    // Translation panel
    ribbonTrans: '翻訳パネルを開く',
    transPanelTitle: '翻訳',
    transPanelPlaceholder: '翻訳するテキストを入力…',
    transPanelSwap: '言語を入れ替え',
    transPanelClear: 'クリア',
    transPanelCopy: 'コピー',
    transPanelCopied: 'コピー済み',
  },
};

// Returns the merged strings for the current Obsidian locale (falls back to English).
let _mttSettings = null;
function i18n() {
  if (_mttSettings?.uiLang === 'ja') return { ...STRINGS.en, ...STRINGS.ja };
  if (_mttSettings?.uiLang === 'en') return STRINGS.en;
  const loc = (typeof window !== 'undefined' && window.moment?.locale?.()) || 'en';
  const lang = /^ja/.test(loc) ? 'ja' : 'en';
  return lang === 'ja' ? { ...STRINGS.en, ...STRINGS.ja } : STRINGS.en;
}

// Selector for nodes that count as "note content".
// .cm-content       : CodeMirror 6 editor content (source / live preview)
// .markdown-preview-view : reading mode container
// .markdown-rendered     : rendered markdown anywhere (embeds, hover preview, etc.)
const NOTE_CONTENT_SELECTOR = '.cm-content, .markdown-preview-view, .markdown-rendered';

function isInNoteContent(node, selector) {
  if (!node) return false;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!el) return false;
  return !!el.closest(selector || NOTE_CONTENT_SELECTOR);
}

// Extracts the pre-translation text stored in data-mtt-orig (which is raw innerHTML).
function getOriginalText(el) {
  const orig = el.getAttribute('data-mtt-orig');
  if (!orig) return null;
  const tmp = document.createElement('div');
  tmp.innerHTML = orig;
  return tmp.textContent.trim() || null;
}

// A "no-op translation" is one we don't want to display. Each check is gated
// by its own user setting so the behavior can be tuned:
//   - skipSameLanguage : detected source language equals target language.
//   - skipIdenticalText: translated text is identical to the source text
//                        (catches mis-detected language codes for proper nouns,
//                         codes, single tokens that the API echoed back, etc.).
function isNoopTranslation(result, text, opts) {
  if (!result || !result.targetText) return false;
  const { skipSameLanguage = true, skipIdenticalText = false } = opts || {};
  if (skipSameLanguage
      && result.sourceLang && result.targetLang
      && result.sourceLang === result.targetLang) return true;
  if (skipIdenticalText && result.targetText.trim() === (text || '').trim()) return true;
  return false;
}

const COMMON_LANGS = {
  auto: 'Auto detect',
  en: 'English',
  ja: 'Japanese',
  zh: 'Chinese',
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ar: 'Arabic',
  hi: 'Hindi',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  uk: 'Ukrainian',
};

// ── Localized language names (mirrors upstream getLocalizedLangName, 0.1.246) ─
// Uses Intl.DisplayNames (CLDR data built into Chromium) with the plugin UI
// language; falls back to the curated English name / raw code when the tag is
// invalid or CLDR has no data. English UI keeps the curated names as-is.
const _displayNamesCache = {};
function getDisplayNames(uiLang) {
  if (!(uiLang in _displayNamesCache)) {
    try {
      _displayNamesCache[uiLang] = new Intl.DisplayNames([uiLang], {
        type: 'language',
        fallback: 'none',
      });
    } catch {
      _displayNamesCache[uiLang] = null;
    }
  }
  return _displayNamesCache[uiLang];
}

function getLocalizedLangName(code, englishName, uiLang) {
  if (!code) return englishName || '';
  const lang = String(uiLang || 'en').replace(/_/g, '-');
  if (englishName && lang.startsWith('en')) return englishName;
  const fallback = englishName || code;
  const displayNames = getDisplayNames(lang);
  if (!displayNames) return fallback;
  let name;
  try {
    name = displayNames.of(String(code));
  } catch {
    return fallback;
  }
  if (!name || name === String(code)) return fallback;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// UI language used for localized language names: the user-picked plugin
// language, else the Obsidian locale / system language.
function getUiLangCode() {
  const ui = _mttSettings?.uiLang;
  if (ui && ui !== 'system') return ui;
  const loc = (typeof window !== 'undefined' && window.moment?.locale?.()) || '';
  return loc || (typeof navigator !== 'undefined' && navigator.language) || 'en';
}

// Display label for a language code in the current UI language. 'auto' comes
// from the plugin locale strings (the reference keeps Auto/None/Default rows as
// locale-message specials).
function langLabel(code) {
  if (code === 'auto') return i18n().langAuto;
  return getLocalizedLangName(code, COMMON_LANGS[code], getUiLangCode());
}

// Language dropdown entries localized to the UI language and sorted with that
// language's collation, 'auto' pinned first — mirrors the reference settings
// dropdowns (langOptionList, 0.1.246).
function localizedLangEntries(includeAuto) {
  const uiLang = getUiLangCode();
  const entries = Object.keys(COMMON_LANGS)
    .filter((c) => c !== 'auto')
    .map((c) => [c, langLabel(c)]);
  try {
    entries.sort((a, b) => a[1].localeCompare(b[1], uiLang));
  } catch {
    entries.sort((a, b) => a[1].localeCompare(b[1]));
  }
  if (includeAuto) entries.unshift(['auto', langLabel('auto')]);
  return entries;
}

// ---- HTTP helpers wrapping Obsidian's requestUrl (bypasses CORS) ----
function buildUrl(base, searchParams) {
  if (!searchParams) return base;
  const u = new URL(base);
  for (const [k, v] of Object.entries(searchParams)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function http(method, url, { headers, body, searchParams } = {}) {
  const finalUrl = buildUrl(url, searchParams);
  let bodyStr;
  if (body instanceof URLSearchParams) bodyStr = body.toString();
  else if (body !== undefined && typeof body !== 'string') bodyStr = JSON.stringify(body);
  else bodyStr = body;
  const res = await requestUrl({
    url: finalUrl,
    method,
    headers: headers || undefined,
    body: bodyStr,
    throw: false,
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
  return res;
}
async function httpGetText(url, opts) { return (await http('GET', url, opts)).text; }
// Extract "name=value" cookie pairs from a Set-Cookie response header.
// Obsidian's requestUrl may expose it as an array (one entry per cookie) or as a
// single comma-joined string; handle both, avoiding the comma inside Expires=...GMT.
function parseSetCookie(setCookie) {
  if (!setCookie) return '';
  const list = Array.isArray(setCookie)
    ? setCookie
    : String(setCookie).split(/,(?=\s*[A-Za-z0-9!#$%&'*+\-.^_`|~]+=)/);
  return list.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}
async function httpJson(method, url, opts) {
  const res = await http(method, url, opts);
  try { return res.json; } catch { return JSON.parse(res.text); }
}

// Local language detection for engines whose endpoint doesn't detect
// (googleWeb / googleWebImage). The reference uses browser.i18n.detectLanguage,
// which doesn't exist in Obsidian: prefer Chromium's LanguageDetector API when
// present, else fall back to a rough Unicode-script heuristic.
let _langDetector = null;
async function detectLangLocal(text) {
  try {
    if (typeof LanguageDetector !== 'undefined') {
      if (!_langDetector) _langDetector = await LanguageDetector.create();
      const results = await _langDetector.detect(text);
      let lang = results?.[0]?.detectedLanguage;
      if (lang) return lang === 'zh' ? 'zh-CN' : lang;
    }
  } catch { /* fall through to heuristic */ }
  if (/[぀-ヿ]/.test(text)) return 'ja';   // hiragana / katakana
  if (/[가-힯]/.test(text)) return 'ko';   // hangul
  if (/[一-鿿]/.test(text)) return 'zh-CN'; // CJK ideographs (after kana check)
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[฀-๿]/.test(text)) return 'th';
  if (/[֐-׿]/.test(text)) return 'he';
  if (/[Ͱ-Ͽ]/.test(text)) return 'el';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  return 'en';
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Fetch an image and return it as a data: URL (mirrors upstream util.getBase64).
async function getBase64(url) {
  const res = await http('GET', url);
  const type = (res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || 'image/jpeg';
  return `data:${type};base64,${arrayBufferToBase64(res.arrayBuffer)}`;
}

// ---- Base translator (mirrors module 2760 of Chrome ext) ----
class BaseTranslator {
  static langCodeJson = {};
  static encodeLang(c) {
    return Object.prototype.hasOwnProperty.call(this.langCodeJson, c) ? this.langCodeJson[c] : c;
  }
  static decodeLang(c) {
    if (!this._swap) {
      this._swap = Object.fromEntries(
        Object.entries(this.langCodeJson).map(([k, v]) => [v, k])
      );
    }
    return Object.prototype.hasOwnProperty.call(this._swap, c) ? this._swap[c] : c;
  }
  static async translate(text, src, tgt, settings) {
    try {
      const esrc = this.encodeLang(src || 'auto');
      const etgt = this.encodeLang(tgt);
      const raw = await this.requestTranslate(text, esrc, etgt, settings);
      const wrapped = await this.wrapResponse(raw, text, esrc, etgt);
      if (!wrapped || wrapped.targetText == null) return null;
      return {
        targetText: wrapped.targetText,
        sourceLang: this.decodeLang(wrapped.detectedLang || esrc),
        targetLang: this.decodeLang(etgt),
        transliteration: wrapped.transliteration || '',
        dict: Array.isArray(wrapped.dict) && wrapped.dict.length ? wrapped.dict : null,
        imageUrl: wrapped.imageUrl || null,
      };
    } catch (e) {
      console.warn('[mtt]', this.name || 'translator', 'failed:', e);
      return null;
    }
  }
  static async requestTranslate() { throw new Error('not implemented'); }
  static async wrapResponse() { throw new Error('not implemented'); }
}

// ---- Google (translate_a/single) ----
// dj=1: JSON object form.  dt=bd: bilingual dictionary (POS).  dt=rm: transliteration.
class GoogleEngine extends BaseTranslator {
  static langCodeJson = { auto: 'auto' };
  static async requestTranslate(text, src, tgt) {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: src || 'auto',
      tl: tgt,
      dj: '1',
      hl: tgt,
      q: text,
    });
    params.append('dt', 't');
    params.append('dt', 'bd');
    params.append('dt', 'rm');
    return await httpJson('GET', `https://translate.googleapis.com/translate_a/single?${params.toString()}`);
  }
  static async wrapResponse(data, text, src) {
    if (!data || typeof data !== 'object') return null;
    const sentences = Array.isArray(data.sentences) ? data.sentences : [];
    // Google returns each sentence with its own trailing space (and "\n" for
    // line breaks) already baked in, so join with '' — joining with ' ' doubles
    // the space between every sentence (upstream fix, 0.1.246).
    let targetText = sentences.map((s) => (s && s.trans) || '').filter(Boolean).join('');
    if (targetText) targetText = targetText.replace(/\n /g, '\n');
    let transliteration = sentences.map((s) => (s && s.src_translit) || '').filter(Boolean).join(' ').trim();
    if (transliteration) transliteration = transliteration.replace(/\n /g, '\n');
    if (!targetText) return null;
    const dict = Array.isArray(data.dict)
      ? data.dict
          .filter((d) => d && Array.isArray(d.terms) && d.terms.length > 0)
          .map((d) => ({ pos: d.pos || '', terms: d.terms.slice(0, 3) }))
      : null;
    return { targetText, detectedLang: data.src || src, transliteration, dict };
  }
}

// ---- Google GTX (translate_a/t) ----
class GoogleGTXEngine extends BaseTranslator {
  static langCodeJson = { auto: 'auto' };
  static async requestTranslate(text, src, tgt) {
    return await httpJson('GET', 'https://translate.googleapis.com/translate_a/t', {
      searchParams: { client: 'dict-chrome-ex', sl: src || 'auto', tl: tgt, q: text },
    });
  }
  static async wrapResponse(data, text, src) {
    if (!Array.isArray(data)) return null;
    const first = Array.isArray(data[0]) ? data[0] : data;
    const targetText = Array.isArray(first) ? (first[0] || '') : String(first);
    const detected = Array.isArray(first) ? (first[1] || src) : src;
    return { targetText, detectedLang: detected };
  }
}

// ---- DeepL (free web jsonrpc) ----
class DeepLEngine extends BaseTranslator {
  static langCodeJson = {
    auto: 'auto', ar: 'AR', bg: 'BG', cs: 'CS', da: 'DA', de: 'DE', el: 'EL',
    en: 'EN', es: 'ES', et: 'ET', fi: 'FI', fr: 'FR', hu: 'HU', id: 'ID',
    it: 'IT', ja: 'JA', ko: 'KO', lt: 'LT', lv: 'LV', no: 'NB', nl: 'NL',
    pl: 'PL', pt: 'PT', ro: 'RO', ru: 'RU', sk: 'SK', sl: 'SL', sv: 'SV',
    tr: 'TR', uk: 'UK', 'zh-CN': 'ZH',
  };
  static async requestTranslate(text, src, tgt) {
    const id = (Math.floor(Math.random() * 99999) + 100000) * 1000;
    const iCount = text.split('i').length - 1;
    const now = Date.now();
    const stamp = iCount !== 0 ? (now - (now % (iCount + 1))) + (iCount + 1) : now;
    const payload = {
      jsonrpc: '2.0',
      method: 'LMT_handle_texts',
      id,
      params: {
        splitting: 'newlines',
        lang: { source_lang_user_selected: src, target_lang: tgt },
        texts: [{ text, requestAlternatives: 3 }],
        timestamp: stamp,
      },
    };
    let body = JSON.stringify(payload);
    body = ((id + 5) % 29 === 0 || (id + 3) % 13 === 0)
      ? body.replace('"method":"', '"method" : "')
      : body.replace('"method":"', '"method": "');
    return await httpJson('POST', 'https://www2.deepl.com/jsonrpc', {
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  }
  static async wrapResponse(resp) {
    if (resp && resp.result) {
      return { targetText: resp.result.texts[0].text, detectedLang: resp.result.lang };
    }
    return null;
  }
}

// ---- Bing (ttranslatev3) ----
class BingEngine extends BaseTranslator {
  static langCodeJson = {
    auto: 'auto-detect', ar: 'ar', bg: 'bg', bn: 'bn', cs: 'cs', da: 'da',
    de: 'de', el: 'el', en: 'en', es: 'es', et: 'et', fa: 'fa', fi: 'fi',
    fr: 'fr', he: 'he', iw: 'he', hi: 'hi', hu: 'hu', id: 'id', it: 'it',
    ja: 'ja', kk: 'kk', ko: 'ko', lt: 'lt', lv: 'lv', ms: 'ms', nl: 'nl',
    no: 'nb', pl: 'pl', pt: 'pt', 'pt-BR': 'pt', 'pt-PT': 'pt-pt',
    ro: 'ro', ru: 'ru', sk: 'sk', sl: 'sl', sv: 'sv', th: 'th', tr: 'tr',
    uk: 'uk', ur: 'ur', vi: 'vi', 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant',
  };
  static tokenUrl = 'https://www.bing.com/translator';
  static chinaTokenUrl = 'https://cn.bing.com/translator';
  static baseUrl = 'https://www.bing.com/ttranslatev3';
  static chinaBaseUrl = 'https://cn.bing.com/ttranslatev3';
  static accessToken = null;
  static useChina = false;

  static get userAgent() {
    return (typeof navigator !== 'undefined' && navigator.userAgent) || 'Mozilla/5.0';
  }

  static async fetchToken(tokenUrl) {
    const res = await http('GET', tokenUrl, { headers: { 'User-Agent': this.userAgent } });
    const html = res.text;
    const cookie = parseSetCookie(
      res.headers && (res.headers['set-cookie'] || res.headers['Set-Cookie'])
    );
    const IG = (html.match(/IG:"([^"]+)"/) || [])[1];
    const IID = (html.match(/data-iid="([^"]+)"/) || [])[1];
    const m = html.match(/params_AbusePreventionHelper\s?=\s?(\[[^\]]+\])/);
    if (!IG || !m) throw new Error('Bing token parse failed');
    // params_AbusePreventionHelper = [key, token, expiryInterval]
    const [key, token, expiryInterval] = JSON.parse(m[1]);
    return { IG, IID, key, token, tokenTs: Date.now(), expiryInterval, count: 0, cookie };
  }

  static async getAccessToken() {
    if (this.accessToken && Date.now() - this.accessToken.tokenTs <= this.accessToken.expiryInterval) {
      return this.accessToken;
    }
    // Try the global endpoint first, then fall back to the China endpoint.
    let lastErr;
    for (const china of [false, true]) {
      try {
        this.accessToken = await this.fetchToken(china ? this.chinaTokenUrl : this.tokenUrl);
        this.useChina = china;
        return this.accessToken;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Bing token fetch failed');
  }

  static async requestTranslate(text, src, tgt) {
    const tk = await this.getAccessToken();
    const body = new URLSearchParams({ text, fromLang: src, to: tgt, token: tk.token, key: String(tk.key) });
    return await httpJson('POST', this.useChina ? this.chinaBaseUrl : this.baseUrl, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent,
        Referer: this.useChina ? this.chinaTokenUrl : this.tokenUrl,
        ...(tk.cookie ? { Cookie: tk.cookie } : {}),
      },
      searchParams: {
        IG: tk.IG,
        IID: tk.IID && tk.IID.length ? `${tk.IID}.${tk.count++}` : '',
        isVertical: '1',
      },
      body,
    });
  }

  static async wrapResponse(resp) {
    if (Array.isArray(resp) && resp[0] && resp[0].translations) {
      const t = resp[0];
      const transliteration = resp[1] ? (resp[1].inputTransliteration || '') : '';
      return {
        targetText: t.translations[0].text,
        detectedLang: t.detectedLanguage && t.detectedLanguage.language,
        transliteration,
      };
    }
    return null;
  }
}

// ---- Yandex ----
class YandexEngine extends BaseTranslator {
  static langCodeJson = {
    af: 'af', sq: 'sq', am: 'am', ar: 'ar', hy: 'hy', az: 'az', eu: 'eu',
    be: 'be', bn: 'bn', bs: 'bs', bg: 'bg', ca: 'ca', hr: 'hr', cs: 'cs',
    da: 'da', nl: 'nl', en: 'en', eo: 'eo', et: 'et', fi: 'fi', fr: 'fr',
    gl: 'gl', ka: 'ka', de: 'de', el: 'el', gu: 'gu', ht: 'ht', hi: 'hi',
    hu: 'hu', is: 'is', id: 'id', ga: 'ga', it: 'it', ja: 'ja', kn: 'kn',
    kk: 'kk', km: 'km', ko: 'ko', ky: 'ky', lo: 'lo', la: 'la', lv: 'lv',
    lt: 'lt', lb: 'lb', mk: 'mk', mg: 'mg', ms: 'ms', ml: 'ml', mt: 'mt',
    mi: 'mi', mr: 'mr', mn: 'mn', my: 'my', ne: 'ne', no: 'no', fa: 'fa',
    pl: 'pl', pt: 'pt', pa: 'pa', ro: 'ro', ru: 'ru', gd: 'gd', sr: 'sr',
    si: 'si', sk: 'sk', sl: 'sl', es: 'es', su: 'su', sw: 'sw', sv: 'sv',
    tg: 'tg', ta: 'ta', te: 'te', th: 'th', tr: 'tr', uk: 'uk', ur: 'ur',
    uz: 'uz', vi: 'vi', cy: 'cy', xh: 'xh', yi: 'yi', tl: 'tl', iw: 'he',
    jw: 'jv', 'zh-CN': 'zh',
  };
  static async requestTranslate(text, src, tgt) {
    const uuid = (nodeCrypto.randomUUID ? nodeCrypto.randomUUID() : require('crypto').randomBytes(16).toString('hex'))
      .replaceAll('-', '');
    const lang = src === 'auto' ? tgt : `${src}-${tgt}`;
    return await httpJson('POST', 'https://translate.yandex.net/api/v1/tr.json/translate', {
      searchParams: { id: `${uuid}-0-0`, srv: 'android' },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ lang, text }),
    });
  }
  static async wrapResponse(resp) {
    if (resp && String(resp.code) === '200') {
      return { targetText: resp.text[0], detectedLang: resp.lang.split('-')[0] };
    }
    return null;
  }
}

// ---- Papago (HMAC-MD5 signed) ----
class PapagoEngine extends BaseTranslator {
  static langCodeJson = {
    ar: 'ar', en: 'en', fa: 'fa', fr: 'fr', de: 'de', hi: 'hi', id: 'id',
    it: 'it', ja: 'ja', ko: 'ko', my: 'mm', pt: 'pt', ru: 'ru', es: 'es',
    th: 'th', vi: 'vi', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW',
  };
  static version = '';
  static endpoint = 'https://papago.naver.com/apis/n2mt/translate';
  static detectEndpoint = 'https://papago.naver.com/apis/langs/dect';

  static async getVersion() {
    if (this.version) return this.version;
    const home = await httpGetText('https://papago.naver.com/');
    const main = (home.match(/"\/main\.([^"]+)"/) || [])[1];
    if (!main) throw new Error('Papago main file lookup failed');
    const js = await httpGetText(`https://papago.naver.com/main.${main}`);
    const v = (js.match(/"v1\.([^"]+)"/) || [])[1];
    if (!v) throw new Error('Papago version lookup failed');
    this.version = `v1.${v}`;
    return this.version;
  }

  static async getToken(url) {
    const version = await this.getVersion();
    const uuid = nodeCrypto.randomUUID
      ? nodeCrypto.randomUUID()
      : require('crypto').randomBytes(16).toString('hex');
    const time = Date.now();
    const hash = nodeCrypto.createHmac('md5', version)
      .update(`${uuid}\n${url}\n${time}`)
      .digest('base64');
    return { uuid, time, hash };
  }

  static authHeaders(uuid, time, hash) {
    return {
      Authorization: `PPG ${uuid}:${hash}`,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Timestamp: String(time),
    };
  }

  static async requestTranslate(text, src, tgt) {
    if (src === 'auto') {
      const t = await this.getToken(this.detectEndpoint);
      const dect = await httpJson('POST', this.detectEndpoint, {
        searchParams: { query: text },
        headers: this.authHeaders(t.uuid, t.time, t.hash),
      });
      src = dect && dect.langCode ? dect.langCode : 'en';
    }
    const t = await this.getToken(this.endpoint);
    return await httpJson('POST', this.endpoint, {
      searchParams: {
        deviceId: t.uuid, locale: 'ko', dict: 'true', dictDisplay: '30',
        honorific: 'false', instant: 'false', paging: 'false',
        source: src, target: tgt, text,
      },
      headers: this.authHeaders(t.uuid, t.time, t.hash),
    });
  }
  static async wrapResponse(resp) {
    if (resp && resp.translatedText != null) {
      return { targetText: resp.translatedText, detectedLang: resp.srcLangType };
    }
    return null;
  }
}

// ---- Baidu (fanyi.baidu.com/transapi) — mirrors upstream baidu.js ----
class BaiduEngine extends BaseTranslator {
  static langCodeJson = {
    en: 'en', ja: 'jp', ko: 'kor', fr: 'fra', es: 'spa', th: 'th', ar: 'ara',
    ru: 'ru', pt: 'pt', de: 'de', it: 'it', el: 'el', nl: 'nl', pl: 'pl',
    bg: 'bul', et: 'est', da: 'dan', fi: 'fin', cs: 'cs', ro: 'rom', sl: 'slo',
    sv: 'swe', hu: 'hu', vi: 'vie', 'zh-CN': 'zh', 'zh-TW': 'cht',
  };
  static async requestTranslate(text, src, tgt) {
    // Browser-shaped headers; the endpoint may still reject sessions without
    // its JS-set anti-bot state (errno 1022) — the fallback engine covers that.
    return await httpJson('POST', 'https://fanyi.baidu.com/transapi', {
      searchParams: { from: src, to: tgt },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': (typeof navigator !== 'undefined' && navigator.userAgent) || 'Mozilla/5.0',
        Referer: 'https://fanyi.baidu.com/',
      },
      body: new URLSearchParams({
        from: src,
        to: tgt,
        query: text,
        source: 'txt',
        isAi: 'false',
        sseStartTime: String(Date.now()),
        reference: '',
        corpusIds: '',
        needPhonetic: 'false',
        domain: 'common',
        detectLang: '',
        milliTimestamp: String(Date.now()),
      }),
    });
  }
  static async wrapResponse(resp) {
    const targetText = resp?.data?.[0]?.result
      ?.map((t) => t?.[1])
      .filter(Boolean)
      .join(' ');
    if (!targetText) return null;
    return { targetText, detectedLang: resp.from, transliteration: '' };
  }
}

// ---- Browser API (Chromium built-in Translator / LanguageDetector) ----
// Mirrors upstream browserAPI.js. Needs the Translator API (Chrome 138+ /
// matching Electron); unavailable runtimes just yield "(no translation)".
class BrowserAPIEngine extends BaseTranslator {
  static detector = null;
  static translators = {};
  static async requestTranslate(text, src, tgt) {
    if (typeof Translator === 'undefined' || typeof LanguageDetector === 'undefined') {
      throw new Error('Chrome Translator API not available. Requires Chrome 138+');
    }
    let detectedLang = src;
    if (src === 'auto') {
      if (!this.detector) this.detector = await LanguageDetector.create();
      const results = await this.detector.detect(text);
      if (results && results.length > 0 && results[0].confidence > 0.5) {
        detectedLang = results[0].detectedLanguage;
      } else {
        throw new Error('Language detection failed or confidence too low.');
      }
    }
    // Same language: echo the source like upstream (skipped result); the
    // skip-same-language option then hides the tooltip.
    if (detectedLang === tgt) {
      return { targetText: text, detectedLang };
    }
    const availability = await Translator.availability({
      sourceLanguage: detectedLang,
      targetLanguage: tgt,
    });
    if (availability === 'unavailable') {
      throw new Error(`Translator not available for ${detectedLang} to ${tgt}.`);
    }
    const key = `${detectedLang}-${tgt}`;
    if (!this.translators[key]) {
      this.translators[key] = await Translator.create({
        sourceLanguage: detectedLang,
        targetLanguage: tgt,
      });
    }
    const targetText = await this.translators[key].translate(text);
    return { targetText, detectedLang };
  }
  static async wrapResponse(res) {
    return { targetText: res.targetText, detectedLang: res.detectedLang };
  }
}

// ---- Google Web (google search "meaning:" dictionary scrape) ----
// Mirrors upstream googleWeb.js: returns the English dictionary definition of
// the hovered word, not a translation.
class GoogleWebEngine extends BaseTranslator {
  static async requestTranslate(text) {
    const lang = 'en';
    return await httpGetText('https://www.google.com/search', {
      searchParams: { q: `meaning:${text}`, hl: lang, lr: `lang_${lang}` },
    });
  }
  static async wrapResponse(html, text) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const dictAll = doc.querySelector('.eQJLDd');
    const targetText = dictAll?.firstElementChild
      ?.querySelector("[data-dobid='dfn']")?.textContent || '';
    if (!targetText) return null;
    return { targetText, detectedLang: await detectLangLocal(text), transliteration: '' };
  }
}

// ---- Google Web Image (google image search) — mirrors googleWebImage.js ----
// "Translates" a word into its first image search hit, shown in the tooltip.
class GoogleWebImageEngine extends BaseTranslator {
  static async requestTranslate(text) {
    return await httpGetText('https://www.google.com/search', {
      searchParams: { q: text, tbm: 'isch' },
    });
  }
  static async wrapResponse(html, text) {
    const m = html.match(/google\.ldi=(\{[^{]+\});/);
    if (!m) return null;
    const urlJSON = JSON.parse(m[1]);
    const imageUrl = urlJSON[Object.keys(urlJSON)[0]];
    if (!imageUrl) return null;
    const base64Url = await getBase64(imageUrl);
    return {
      targetText: 'image',
      detectedLang: await detectLangLocal(text),
      transliteration: '',
      imageUrl: base64Url,
    };
  }
}

// ---- Google V2 (batchexecute MkEWBc) — mirrors upstream googleV2.js ----
let _googleV2Token = null;
const GOOGLE_V2_TOKEN_TTL = 60 * 60 * 1000; // 1 hour
async function getGoogleV2Token() {
  if (_googleV2Token && _googleV2Token.time + GOOGLE_V2_TOKEN_TTL > Date.now()) {
    return _googleV2Token;
  }
  const res = await httpGetText('https://translate.google.com');
  const sid = res.match(/"FdrFJe":"(.*?)"/)[1];
  const bl = res.match(/"cfb2h":"(.*?)"/)[1];
  const at = res.match(/"SNlM0e":"(.*?)"/)?.[1] || '';
  _googleV2Token = { sid, bl, at, time: Date.now() };
  return _googleV2Token;
}

class GoogleV2Engine extends BaseTranslator {
  static async requestTranslate(text, src, tgt) {
    const { sid, bl, at } = await getGoogleV2Token();
    const req = JSON.stringify([
      [
        [
          'MkEWBc',
          JSON.stringify([[text, src, tgt, true], [null]]),
          null,
          'generic',
        ],
      ],
    ]);
    const res = await http('POST', 'https://translate.google.com/_/TranslateWebserverUi/data/batchexecute', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      searchParams: {
        rpcids: 'MkEWBc',
        'source-path': '/',
        'f.sid': sid,
        bl,
        hl: 'ko',
        'soc-app': 1,
        'soc-platform': 1,
        'soc-device': 1,
        _reqid: Math.floor(10000 + 10000 * Math.random()),
        rt: 'c',
      },
      body: new URLSearchParams({ 'f.req': req, at }),
    });
    return res.text;
  }
  static async wrapResponse(res) {
    const json = JSON.parse(JSON.parse(/\[.*\]/.exec(res))[0][2]);
    // Each chunk already carries its own trailing space (same as the gtx
    // endpoint's sentences[].trans), so join with '' — ' ' doubles the space
    // between sentences (upstream fix, 0.1.246).
    const targetText = json[1][0][0][5]
      .map((t) => t?.[0])
      .filter(Boolean)
      .join('');
    return {
      targetText,
      detectedLang: json[0][2],
      transliteration: json[1][0][0][1],
    };
  }
}

// ---- Integrated LLM engine (mirrors upstream localLlm.js, 0.1.246) ----
// One OpenAI-compatible engine covering hosted providers and local servers;
// the provider preset only fills in the endpoint URL.
const LLM_PROVIDER_ENDPOINTS = {
  custom: '',
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  grok: 'https://api.x.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  githubModels: 'https://models.inference.ai.azure.com',
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
};
const LLM_PROVIDER_LABELS = {
  custom: 'Custom',
  openai: 'OpenAI (ChatGPT)',
  claude: 'Claude (Anthropic)',
  gemini: 'Gemini (Google, free tier available)',
  grok: 'Grok (xAI)',
  groq: 'Groq (free, fast Llama)',
  openrouter: 'OpenRouter (free models with :free suffix)',
  githubModels: 'GitHub Models (free with GitHub token)',
  ollama: 'Ollama (local)',
  lmstudio: 'LM Studio (local)',
};

function llmLangName(code) {
  return COMMON_LANGS[code] || code;
}

// last config we already warned about — only warn again when it changes
let _llmLastWarnConfigKey = null;

class LocalLlmEngine extends BaseTranslator {
  static async translate(text, src, tgt, settings) {
    const endpoint = settings?.llmApiEndpoint || '';
    const model = settings?.llmModel || '';
    if (!endpoint || !model) {
      const key = `${endpoint}|${model}`;
      if (_llmLastWarnConfigKey !== key) {
        console.warn('[mtt] localLlm: API endpoint or model not configured');
        _llmLastWarnConfigKey = key;
      }
      return null;
    }
    return super.translate(text, src, tgt, settings);
  }

  static async requestTranslate(text, src, tgt, settings) {
    const endpoint = (settings?.llmApiEndpoint || '').replace(/\/$/, '');
    const apiKey = settings?.llmApiKey || '';
    const model = settings?.llmModel || '';
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const target = llmLangName(tgt);
    const instruction = src && src !== 'auto'
      ? `Translate from ${llmLangName(src)} to ${target}.`
      : `Translate to ${target}.`;

    return await httpJson('POST', `${endpoint}/chat/completions`, {
      headers,
      body: {
        model,
        messages: [
          {
            role: 'system',
            content: 'Reply only: source ISO 639-1 code, a tab, then the translation.',
          },
          { role: 'user', content: `${instruction}\n<text>\n${text}\n</text>` },
        ],
        temperature: 0.1,
      },
    });
  }

  static async wrapResponse(res) {
    const raw = res?.choices?.[0]?.message?.content?.trim() || '';
    // expected "<iso code>\t<translation>"; parse tolerantly — if it doesn't
    // match (model ignored the format), treat the whole reply as the translation
    // so nothing regresses. detectedLang lets same-language skip work.
    let detectedLang = '';
    let targetText = raw;
    const match = raw.match(/^([a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?)[\t\n]+([\s\S]+)$/);
    if (match) {
      detectedLang = match[1].toLowerCase();
      targetText = match[2].trim();
    }
    if (!targetText) return null;
    return { targetText, detectedLang, transliteration: '' };
  }

  // Accepts OpenAI ({data:[{id}]}) and Ollama ({models:[{name}]}) shapes;
  // other gateways may use {model:"..."} which we also try.
  static async getModels(endpoint, apiKey) {
    if (!endpoint) throw new Error('LLM API endpoint is not set');
    const headers = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await httpJson('GET', `${endpoint.replace(/\/$/, '')}/models`, { headers });
    return (res.data || res.models || [])
      .map((m) => m.id || m.name || m.model)
      .filter(Boolean);
  }
}

// ---- Engine registry — order and labels mirror the reference dropdown ----
const ENGINE_CLASSES = {
  google: GoogleEngine,
  bing: BingEngine,
  localLlm: LocalLlmEngine,
  deepl: DeepLEngine,
  yandex: YandexEngine,
  baidu: BaiduEngine,
  papago: PapagoEngine,
  browserAPI: BrowserAPIEngine,
  googleWebImage: GoogleWebImageEngine,
  googleGTX: GoogleGTXEngine,
  googleWeb: GoogleWebEngine,
  googleV2: GoogleV2Engine,
};

const ENGINE_LABELS = {
  google: 'google',
  bing: 'bing',
  localLlm: 'LLM - OpenAI / Claude / Gemini / Local (Experimental)',
  deepl: 'deepl (Experimental)',
  yandex: 'yandex (Experimental)',
  baidu: 'baidu (Experimental)',
  papago: 'papago (Experimental)',
  browserAPI: 'browser API (Experimental)',
  googleWebImage: 'googleWebImage (Experimental)',
  googleGTX: 'googleGTX (Experimental)',
  googleWeb: 'googleWeb (Experimental)',
  googleV2: 'googleV2 (Experimental)',
};

// ---- Engine fallback (mirrors upstream translateCaller.js, 0.1.246) ----
// When the selected engine fails, bench it (1 h × crash count) and retry with
// the least-recently-benched of google/bing/baidu.
const FALLBACK_ACT_LIST = ['google', 'bing', 'baidu', 'papago', 'deepl', 'yandex'];
const FALLBACK_SWAP_LIST = ['google', 'bing', 'baidu'];
const FALLBACK_WAIT_TIME = 1000 * 60 * 60; // 1 hour
const FALLBACK_CRASH_TIME_INIT = { google: 1, bing: 2, baidu: 3 };
let fallbackCrashTime = { ...FALLBACK_CRASH_TIME_INIT };
let fallbackCrashCount = {};

async function translateWithFallback(text, src, tgt, engine, settings, retry = 0) {
  // Reset crash times if all engines are in cooldown
  if (retry === 0 && Object.values(fallbackCrashTime).every((t) => Date.now() < t)) {
    fallbackCrashTime = { ...FALLBACK_CRASH_TIME_INIT };
    fallbackCrashCount = {};
  }
  if (retry > FALLBACK_SWAP_LIST.length) return null;

  fallbackCrashCount[engine] ??= 0;
  fallbackCrashTime[engine] ??= 0;

  const cls = ENGINE_CLASSES[engine] || ENGINE_CLASSES.google;
  const isFallbackEnabled = settings?.fallbackTranslatorEngine !== false
    && FALLBACK_ACT_LIST.includes(engine);
  const swapEngine = Object.keys(fallbackCrashTime)
    .filter((e) => FALLBACK_SWAP_LIST.includes(e) && e !== engine)
    .sort((a, b) => fallbackCrashTime[a] - fallbackCrashTime[b])[0];

  let result = (fallbackCrashTime[engine] < Date.now() || !isFallbackEnabled)
    ? await cls.translate(text, src, tgt, settings)
    : null;

  if (isFallbackEnabled && !result) {
    fallbackCrashCount[engine]++;
    fallbackCrashTime[engine] = Date.now() + FALLBACK_WAIT_TIME * fallbackCrashCount[engine];
    result = await translateWithFallback(text, src, tgt, swapEngine, settings, retry + 1);
  }
  return result;
}

const ENGINES = Object.fromEntries(
  Object.keys(ENGINE_CLASSES).map((k) => [
    k,
    {
      label: ENGINE_LABELS[k] || k,
      translate: (text, src, tgt, settings) => translateWithFallback(text, src, tgt, k, settings),
    },
  ])
);

function isWordChar(c) {
  return !!c && /[\p{L}\p{N}'\-_]/u.test(c);
}

function isSentenceBoundary(c) {
  return /[.!?。！？\n\r]/.test(c);
}

function caretRange(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (!p) return null;
    const r = document.createRange();
    r.setStart(p.offsetNode, p.offset);
    r.setEnd(p.offsetNode, p.offset);
    return r;
  }
  return null;
}

function extractAtPoint(x, y, mode) {
  const range = caretRange(x, y);
  if (!range) return null;
  const node = range.startContainer;
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent;
  if (!text) return null;
  const off = range.startOffset;

  let start = off, end = off;
  if (mode === 'sentence') {
    while (start > 0 && !isSentenceBoundary(text[start - 1])) start--;
    while (end < text.length && !isSentenceBoundary(text[end])) end++;
  } else {
    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;
  }
  const slice = text.slice(start, end).trim();
  if (!slice) return null;

  const wordRange = document.createRange();
  wordRange.setStart(node, start);
  wordRange.setEnd(node, end);
  const rect = wordRange.getBoundingClientRect();
  // make sure the cursor is actually inside the rect (caretRangeFromPoint can snap)
  if (x < rect.left - 4 || x > rect.right + 4 || y < rect.top - 4 || y > rect.bottom + 4) return null;
  return { text: slice, rect };
}

// Persists translation history to translation-log.json in the plugin folder.
// Each entry records the source/target text, languages, and view count.
// Writes are debounced to 2 s to avoid hammering the filesystem on every hover.
class TranslationLog {
  constructor(app, pluginDir) {
    this.app = app;
    this.filePath = `${pluginDir}/translation-log.json`;
    this.entries = {};
    this.saveTimer = null;
  }

  async load() {
    try {
      if (await this.app.vault.adapter.exists(this.filePath)) {
        const raw = await this.app.vault.adapter.read(this.filePath);
        const data = JSON.parse(raw);
        if (data && typeof data.entries === 'object') this.entries = data.entries;
      }
    } catch (e) {
      console.warn('[mtt] translation-log load failed:', e);
      this.entries = {};
    }
  }

  record(key, result, sourceText) {
    const now = Date.now();
    const hasDict = Array.isArray(result.dict) && result.dict.length > 0;
    if (this.entries[key]) {
      this.entries[key].count++;
      this.entries[key].lastSeen = now;
      // Backfill pos/type if the first hit lacked dict data but this one has it.
      if (hasDict && this.entries[key].pos.length === 0) {
        this.entries[key].pos = result.dict;
        this.entries[key].type = 'word';
      }
    } else {
      this.entries[key] = {
        sourceText,
        targetText: result.targetText,
        sourceLang: result.sourceLang,
        targetLang: result.targetLang,
        pos: hasDict ? result.dict : [],
        type: hasDict ? 'word' : 'sentence',
        count: 1,
        firstSeen: now,
        lastSeen: now,
      };
    }
    this._scheduleSave();
  }

  _scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this._flush(), 2000);
  }

  async _flush() {
    this.saveTimer = null;
    try {
      await this.app.vault.adapter.write(
        this.filePath,
        JSON.stringify({ version: 1, entries: this.entries }, null, 2)
      );
    } catch (e) {
      console.warn('[mtt] translation-log save failed:', e);
    }
  }

  async destroy() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      await this._flush();
    }
  }
}

class TooltipManager {
  constructor(plugin, log) {
    this.plugin = plugin;
    this.log = log;
    this.el = null;
    this.token = 0;
    this.lastText = '';
    this.lastResult = null;
    this.cache = new Map();
    this.maxCache = 1000;
  }
  ensure() {
    if (this.el) return this.el;
    const el = document.createElement('div');
    el.className = 'mtt-tooltip';
    el.style.display = 'none';
    document.body.appendChild(el);
    this.el = el;
    return el;
  }
  hide() {
    this.lastText = '';
    this.lastResult = null;
    this.token++;
    if (this.el) this.el.style.display = 'none';
  }
  // Show plain text (no translation API call) — used when hovering over a
  // page-translated paragraph to display the pre-translation original.
  showPlain(text, rect) {
    if (!text) { this.hide(); return; }
    if (text === this.lastText && this.el && this.el.style.display !== 'none') {
      this.position(rect);
      return;
    }
    this.lastText = text;
    this.token++;
    const el = this.ensure();
    el.empty ? el.empty() : (el.textContent = '');
    const label = document.createElement('div');
    label.className = 'mtt-orig-label';
    label.textContent = i18n().origLabel;
    el.appendChild(label);
    const sep = document.createElement('div');
    sep.className = 'mtt-orig-sep';
    el.appendChild(sep);
    const main = document.createElement('div');
    main.className = 'mtt-target mtt-orig-preview';
    main.textContent = text;
    el.appendChild(main);
    el.style.display = 'block';
    this.position(rect);
  }
  isOwn(target) {
    return !!(this.el && target instanceof Node && this.el.contains(target));
  }
  cacheGet(key) { return this.cache.get(key); }
  cacheSet(key, val, sourceText) {
    if (this.cache.size >= this.maxCache) {
      const k = this.cache.keys().next().value;
      this.cache.delete(k);
    }
    this.cache.set(key, val);
    if (this.log) this.log.record(key, val, sourceText);
    if (this.plugin) {
      this.plugin.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE)
        .forEach(l => { if (l.view && l.view.refresh) l.view.refresh(); });
    }
  }
  async show(text, rect, engineKey) {
    if (!text) return;
    const { sourceLang, targetLang } = this.plugin.settings;
    const engine = engineKey || 'google';
    if (text === this.lastText && this.el && this.el.style.display !== 'none') {
      this.position(rect);
      return;
    }

    // Short-circuit when source/target are explicitly the same — no API call needed.
    if (sourceLang !== 'auto' && sourceLang === targetLang) {
      this.hide();
      return;
    }

    const key = `v2|${engine}|${sourceLang}|${targetLang}|${text}`;
    const cached = this.plugin.settings.disableCache ? null : this.cacheGet(key);
    // Sync no-op check on cache hit — avoids flashing the "…" loading state.
    if (cached && isNoopTranslation(cached, text, this.plugin.settings)) {
      this.hide();
      return;
    }

    this.lastText = text;
    const my = ++this.token;

    const el = this.ensure();
    el.style.display = 'none';
    this.position(rect);

    let result = cached;
    if (!result) {
      try {
        const eng = ENGINES[engine] || ENGINES.google;
        result = await eng.translate(text, sourceLang, targetLang, this.plugin.settings);
      } catch (e) {
        if (my === this.token) {
          el.textContent = `⚠ ${e.message || e}`;
          el.style.display = 'block';
          this.position(rect);
        }
        return;
      }
      if (result && result.targetText) this.cacheSet(key, result, text);
    }
    if (my !== this.token) return;
    if (!result || !result.targetText) {
      el.textContent = i18n().noTranslation;
      el.style.display = 'block';
      this.position(rect);
      return;
    }
    if (isNoopTranslation(result, text, this.plugin.settings)) {
      this.hide();
      return;
    }
    this.lastResult = result;
    this._notifyTransView(text, result);
    el.empty ? el.empty() : (el.textContent = '');

    const showDict = this.plugin.settings.showDictionary
      && Array.isArray(result.dict) && result.dict.length > 0;

    if (result.imageUrl) {
      // googleWebImage engine: the "translation" is an image (data: URL).
      const img = document.createElement('img');
      img.className = 'mtt-image';
      img.src = result.imageUrl;
      el.appendChild(img);
    } else if (showDict) {
      const dictWrap = document.createElement('div');
      dictWrap.className = 'mtt-dict';
      for (const { pos, terms } of result.dict) {
        const row = document.createElement('div');
        row.className = 'mtt-dict-row';
        if (pos) {
          const posEl = document.createElement('b');
          posEl.className = 'mtt-pos';
          posEl.textContent = pos;
          row.appendChild(posEl);
          row.appendChild(document.createTextNode(': '));
        }
        const termsEl = document.createElement('span');
        termsEl.className = 'mtt-terms';
        termsEl.textContent = (terms || []).join(', ');
        row.appendChild(termsEl);
        dictWrap.appendChild(row);
      }
      el.appendChild(dictWrap);
    } else {
      const main = document.createElement('div');
      main.className = 'mtt-target';
      main.textContent = result.targetText;
      el.appendChild(main);
    }

    if (this.plugin.settings.showTransliteration && result.transliteration) {
      const translit = document.createElement('div');
      translit.className = 'mtt-translit';
      translit.textContent = result.transliteration;
      el.appendChild(translit);
    }
    if (this.plugin.settings.showSourceText) {
      const src = document.createElement('div');
      src.className = 'mtt-source';
      src.textContent = text;
      el.appendChild(src);
    }
    if (this.plugin.settings.showDetectedLang && result.sourceLang) {
      const meta = document.createElement('div');
      meta.className = 'mtt-meta';
      // Localized language names instead of raw codes (upstream, 0.1.246).
      meta.textContent = `${langLabel(result.sourceLang)} → ${langLabel(result.targetLang)}`;
      el.appendChild(meta);
    }
    el.style.display = 'block';
    this.position(rect);
  }
  position(rect) {
    if (!this.el || !rect) return;
    const pad = 8;
    const w = this.el.offsetWidth || 200;
    const h = this.el.offsetHeight || 30;
    let x = rect.left;
    let y;
    if (Platform.isMobile) {
      // Upper half → show above finger; lower half → show below finger
      if (rect.top < window.innerHeight / 2) {
        y = rect.top - h - pad;
      } else {
        y = rect.bottom + pad;
      }
    } else if (this.plugin?.settings?.tooltipPlacement === 'top') {
      // 'top' opens above the text like the reference extension; flips below
      // when it would leave the window (tooltipPlacement, upstream 0.1.244).
      y = rect.top - h - pad;
      if (y < 0) y = rect.bottom + pad;
    } else {
      y = rect.bottom + pad;
      if (y + h > window.innerHeight) y = rect.top - h - pad;
    }
    if (y < 0) y = pad;
    if (y + h > window.innerHeight) y = window.innerHeight - h - pad;
    if (x + w > window.innerWidth) x = window.innerWidth - w - pad;
    if (x < 0) x = pad;
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }
  _notifyTransView(text, result) {
    if (!this.plugin) return;
    this.plugin.app.workspace.getLeavesOfType(TRANS_VIEW_TYPE)
      .forEach(l => { if (l.view?.update) l.view.update(text, result); });
  }
  async destroy() {
    this.hide();
    if (this.el) { this.el.remove(); this.el = null; }
    this.cache.clear();
    if (this.log) await this.log.destroy();
  }
}

const VOCAB_VIEW_TYPE = 'mtt-vocab-view';

class VocabView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this._sort = 'count-desc';
    this._filter = 'word';
    this._listEl = null;
  }

  getViewType() { return VOCAB_VIEW_TYPE; }
  getDisplayText() { return i18n().vocabTitle; }
  getIcon() { return 'book-open'; }

  async onOpen() { this.render(); }

  render() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass('mtt-vocab-root');

    const header = root.createEl('div', { cls: 'mtt-vocab-header' });
    const s = i18n();
    header.createEl('span', { cls: 'mtt-vocab-title', text: s.vocabTitle });
    const reload = header.createEl('button', { cls: 'mtt-vocab-reload', title: s.vocabReload });
    reload.textContent = '↻';
    reload.addEventListener('click', () => this.refresh());

    const controls = root.createEl('div', { cls: 'mtt-vocab-controls' });

    const sortSelect = controls.createEl('select', { cls: 'mtt-vocab-sort' });
    for (const [value, label] of [
      ['count-desc', s.sortByCount],
      ['last-desc', s.sortByRecent],
      ['alpha', s.sortAlpha],
    ]) {
      const opt = sortSelect.createEl('option', { text: label });
      opt.value = value;
      if (value === this._sort) opt.selected = true;
    }
    sortSelect.addEventListener('change', () => { this._sort = sortSelect.value; this.refresh(); });

    const filterWrap = controls.createEl('div', { cls: 'mtt-vocab-filter-wrap' });
    for (const [value, label] of [['all', s.filterAll], ['word', s.filterWord], ['sentence', s.filterSentence]]) {
      const btn = filterWrap.createEl('button', { cls: 'mtt-vocab-filter-btn', text: label });
      btn.dataset.filter = value;
      if (value === this._filter) btn.addClass('is-active');
      btn.addEventListener('click', () => {
        this._filter = value;
        filterWrap.querySelectorAll('.mtt-vocab-filter-btn').forEach(b =>
          b.classList.toggle('is-active', b.dataset.filter === value)
        );
        this.refresh();
      });
    }

    this._listEl = root.createEl('div', { cls: 'mtt-vocab-list' });
    this._renderList();
  }

  refresh() {
    if (this._listEl) this._renderList();
  }

  _renderList() {
    const container = this._listEl;
    container.empty();
    const entries = Object.values(this.plugin.log.entries);

    let filtered = entries;
    if (this._filter === 'word') filtered = entries.filter(e => e.type === 'word');
    else if (this._filter === 'sentence') filtered = entries.filter(e => e.type === 'sentence');

    const sorted = [...filtered];
    if (this._sort === 'count-desc') sorted.sort((a, b) => b.count - a.count);
    else if (this._sort === 'last-desc') sorted.sort((a, b) => b.lastSeen - a.lastSeen);
    else sorted.sort((a, b) => a.sourceText.localeCompare(b.sourceText));

    if (sorted.length === 0) {
      container.createEl('div', { cls: 'mtt-vocab-empty', text: i18n().vocabEmpty });
      return;
    }

    for (const entry of sorted) {
      const card = container.createEl('div', { cls: 'mtt-vocab-card' });
      const main = card.createEl('div', { cls: 'mtt-vocab-main' });
      main.createEl('span', { cls: 'mtt-vocab-source', text: entry.sourceText });
      main.createEl('span', { cls: 'mtt-vocab-sep', text: ' → ' });
      main.createEl('span', { cls: 'mtt-vocab-target', text: entry.targetText });
      main.createEl('span', { cls: 'mtt-vocab-count', text: `×${entry.count}` });
      const copyBtn = main.createEl('button', { cls: 'mtt-vocab-copy', text: i18n().vocabCopy });
      copyBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(`${entry.sourceText} → ${entry.targetText}`);
        copyBtn.textContent = i18n().vocabCopied;
        setTimeout(() => { copyBtn.textContent = i18n().vocabCopy; }, 1500);
      });

      if (Array.isArray(entry.pos) && entry.pos.length > 0) {
        const posWrap = card.createEl('div', { cls: 'mtt-vocab-pos-wrap' });
        for (const { pos, terms } of entry.pos) {
          const row = posWrap.createEl('span', { cls: 'mtt-vocab-pos-entry' });
          if (pos) row.createEl('span', { cls: 'mtt-vocab-pos-label', text: pos + ': ' });
          row.appendText((terms || []).join(' / '));
        }
      }
    }
  }
}

// ── Translation Panel ─────────────────────────────────────────────────────────
const TRANS_VIEW_TYPE = 'mtt-trans-view';

class TranslationView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this._srcLang = plugin.settings.sourceLang;
    this._tgtLang = plugin.settings.targetLang;
    this._result = null;
    this._debounceTimer = null;
    this._inputEl = null;
    this._resultEl = null;
    this._metaEl = null;
    this._copyBtn = null;
    this._srcSelect = null;
    this._tgtSelect = null;
  }

  getViewType() { return TRANS_VIEW_TYPE; }
  getDisplayText() { return i18n().transPanelTitle; }
  getIcon() { return 'message-square'; }

  async onOpen() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass('mtt-trans-root');
    this._build(root);
  }

  _build(root) {
    const s = i18n();

    // ── Language selector bar ────────────────────────────────────
    const langBar = root.createEl('div', { cls: 'mtt-trans-lang-bar' });

    this._srcSelect = langBar.createEl('select', { cls: 'mtt-trans-lang-select' });
    for (const [code, label] of localizedLangEntries(true)) {
      const opt = this._srcSelect.createEl('option', { text: label });
      opt.value = code;
      if (code === this._srcLang) opt.selected = true;
    }
    this._srcSelect.addEventListener('change', () => {
      this._srcLang = this._srcSelect.value;
      this._scheduleTranslate();
    });

    const swapBtn = langBar.createEl('button', { cls: 'mtt-trans-swap', title: s.transPanelSwap });
    swapBtn.textContent = '⇄';
    swapBtn.addEventListener('click', () => this._swapLangs());

    this._tgtSelect = langBar.createEl('select', { cls: 'mtt-trans-lang-select' });
    for (const [code, label] of localizedLangEntries(false)) {
      const opt = this._tgtSelect.createEl('option', { text: label });
      opt.value = code;
      if (code === this._tgtLang) opt.selected = true;
    }
    this._tgtSelect.addEventListener('change', () => {
      this._tgtLang = this._tgtSelect.value;
      this._scheduleTranslate();
    });

    // ── Source textarea ──────────────────────────────────────────
    const inputWrap = root.createEl('div', { cls: 'mtt-trans-input-wrap' });
    this._inputEl = inputWrap.createEl('textarea', {
      cls: 'mtt-trans-input',
      attr: { placeholder: s.transPanelPlaceholder },
    });
    this._inputEl.addEventListener('input', () => this._scheduleTranslate());

    const clearBtn = inputWrap.createEl('button', {
      cls: 'mtt-trans-clear-btn',
      title: s.transPanelClear,
      text: '✕',
    });
    clearBtn.addEventListener('click', () => {
      this._inputEl.value = '';
      this._result = null;
      this._renderResult();
    });

    // ── Result area ──────────────────────────────────────────────
    this._resultEl = root.createEl('div', { cls: 'mtt-trans-result' });

    // ── Footer ───────────────────────────────────────────────────
    const footer = root.createEl('div', { cls: 'mtt-trans-footer' });
    this._metaEl = footer.createEl('span', { cls: 'mtt-trans-meta' });
    this._copyBtn = footer.createEl('button', { cls: 'mtt-trans-copy', text: s.transPanelCopy });
    this._copyBtn.style.visibility = 'hidden';
    this._copyBtn.addEventListener('click', async () => {
      if (!this._result?.targetText) return;
      await navigator.clipboard.writeText(this._result.targetText);
      this._copyBtn.textContent = s.transPanelCopied;
      setTimeout(() => { this._copyBtn.textContent = s.transPanelCopy; }, 1500);
    });
  }

  _swapLangs() {
    const prevSrc = this._srcLang;
    const prevTgt = this._tgtLang;
    const newSrc = prevSrc === 'auto' ? (this._result?.sourceLang || prevTgt) : prevTgt;
    const newTgt = prevSrc === 'auto' ? prevTgt : prevSrc;
    this._srcLang = newSrc;
    this._tgtLang = newTgt;
    if (this._srcSelect) this._srcSelect.value = newSrc;
    if (this._tgtSelect) this._tgtSelect.value = newTgt;
    if (this._inputEl && this._result?.targetText) {
      this._inputEl.value = this._result.targetText;
    }
    this._scheduleTranslate();
  }

  _scheduleTranslate() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._doTranslate(), 600);
  }

  async _doTranslate() {
    this._debounceTimer = null;
    const text = this._inputEl?.value.trim();
    if (!text) {
      this._result = null;
      this._renderResult();
      return;
    }
    if (this._resultEl) {
      this._resultEl.empty ? this._resultEl.empty() : (this._resultEl.textContent = '');
      this._resultEl.createEl('span', { cls: 'mtt-trans-loading', text: '…' });
    }
    try {
      const engineKey = this.plugin.settings.mouseoverEngine || 'google';
      const eng = ENGINES[engineKey] || ENGINES.google;
      this._result = await eng.translate(text, this._srcLang, this._tgtLang, this.plugin.settings);
    } catch (e) {
      this._result = { _error: e.message || String(e) };
    }
    this._renderResult();
  }

  _renderResult() {
    const el = this._resultEl;
    if (!el) return;
    el.empty ? el.empty() : (el.textContent = '');
    const s = i18n();

    if (!this._result) {
      this._metaEl.textContent = '';
      this._copyBtn.style.visibility = 'hidden';
      return;
    }
    if (this._result._error) {
      el.createEl('div', { cls: 'mtt-trans-error', text: `⚠ ${this._result._error}` });
      this._metaEl.textContent = '';
      this._copyBtn.style.visibility = 'hidden';
      return;
    }
    if (!this._result.targetText) {
      el.createEl('div', { cls: 'mtt-trans-empty', text: s.noTranslation });
      this._metaEl.textContent = '';
      this._copyBtn.style.visibility = 'hidden';
      return;
    }

    const { targetText, sourceLang, targetLang, dict, transliteration, imageUrl } = this._result;
    const showDict = Array.isArray(dict) && dict.length > 0;

    if (imageUrl) {
      const img = el.createEl('img', { cls: 'mtt-image' });
      img.src = imageUrl;
    } else if (showDict) {
      const dictWrap = el.createEl('div', { cls: 'mtt-trans-dict' });
      for (const { pos, terms } of dict) {
        const row = dictWrap.createEl('div', { cls: 'mtt-trans-dict-row' });
        if (pos) row.createEl('span', { cls: 'mtt-trans-pos', text: pos + ': ' });
        row.createEl('span', { cls: 'mtt-trans-terms', text: (terms || []).join(' / ') });
      }
    } else {
      el.createEl('div', { cls: 'mtt-trans-target-text', text: targetText });
    }

    if (transliteration) {
      el.createEl('div', { cls: 'mtt-trans-translit', text: transliteration });
    }

    this._metaEl.textContent = sourceLang && targetLang
      ? `${langLabel(sourceLang)} → ${langLabel(targetLang)}`
      : '';
    this._copyBtn.style.visibility = '';
  }

  // Called by TooltipManager on hover translation — fills input only when empty.
  update(text, result) {
    if (!this._inputEl || this._inputEl.value.trim()) return;
    this._inputEl.value = text || '';
    this._result = result;
    this._renderResult();
  }
}

// ── Page Translator ───────────────────────────────────────────────────────────
class PageTranslator {
  constructor(plugin) {
    this.plugin = plugin;
    this._cancelled = false;
    this._running = false;
    this._progressEl = null;
  }

  _getViewContainer(view) {
    if (!view) return null;
    if (view.getMode?.() !== 'preview') return null;
    const previewEl = view.previewMode?.containerEl;
    if (!previewEl) return null;
    return previewEl.querySelector('.markdown-rendered') ?? previewEl;
  }

  // Returns the .markdown-rendered container for the active reading-view leaf,
  // or null when not in reading mode.
  _getContainer() {
    return this._getViewContainer(this.plugin.app.workspace.activeLeaf?.view);
  }

  // Reflects the current translation state on the header button of a given view.
  _syncButton(view) {
    const btn = view?.containerEl?.querySelector('.mtt-page-btn');
    if (!btn) return;
    const active = !!(this._getViewContainer(view)?.querySelector('[data-mtt-orig]'));
    btn.classList.toggle('is-active', active);
  }

  // Returns leaf-level translatable block elements (headings, paragraphs, list
  // items, table cells, etc.) that haven't been translated yet.
  _getBlocks(container) {
    const SEL = 'h1,h2,h3,h4,h5,h6,p,li,td,th,figcaption';
    return Array.from(container.querySelectorAll(SEL)).filter(el => {
      // Skip content inside code/math/frontmatter
      if (el.closest('pre,.math,.math-block,.frontmatter-container,.katex')) return false;
      // Skip already translated
      if (el.hasAttribute('data-mtt-orig')) return false;
      // Only translate leaf-level elements — skip if nested blocks exist inside
      // (prevents double-translating a li > p hierarchy).
      if (el.querySelector('h1,h2,h3,h4,h5,h6,p,li,td,th')) return false;
      return el.textContent.trim().length >= 2;
    });
  }

  _showProgress(current, total) {
    if (!this._progressEl) {
      const el = document.createElement('div');
      el.className = 'mtt-page-progress';
      el.innerHTML = `<span class="mtt-page-progress-label"></span>` +
        `<div class="mtt-page-progress-bar-wrap"><div class="mtt-page-progress-bar"></div></div>` +
        `<button class="mtt-page-progress-cancel" aria-label="${i18n().pageCancel}">✕</button>`;
      el.querySelector('.mtt-page-progress-cancel').onclick = () => this.cancel();
      document.body.appendChild(el);
      this._progressEl = el;
      this._repositionProgress();
    }
    const pct = total > 0 ? Math.round(current / total * 100) : 0;
    this._progressEl.querySelector('.mtt-page-progress-label').textContent =
      i18n().pageTranslating(current, total);
    this._progressEl.querySelector('.mtt-page-progress-bar').style.width = `${pct}%`;
  }

  _repositionProgress() {
    if (!this._progressEl) return;
    const view = this.plugin.app.workspace.activeLeaf?.view;
    const headerEl = view?.containerEl?.querySelector('.view-header');
    if (headerEl) {
      const rect = headerEl.getBoundingClientRect();
      Object.assign(this._progressEl.style, {
        top: `${rect.bottom - 26}px`,
        left: `${rect.left + 8}px`,
        bottom: 'auto',
        transform: 'none',
      });
    }
  }

  _hideProgress() {
    if (this._progressEl) { this._progressEl.remove(); this._progressEl = null; }
  }

  cancel() {
    this._cancelled = true;
    this._running = false;
    this._hideProgress();
    // Revert any blocks that were translated before cancellation
    const container = this._getContainer();
    if (container) {
      container.querySelectorAll('[data-mtt-orig]').forEach(el => {
        el.innerHTML = el.getAttribute('data-mtt-orig');
        el.removeAttribute('data-mtt-orig');
        el.classList.remove('mtt-page-translated');
      });
    }
    this._syncButton(this.plugin.app.workspace.activeLeaf?.view);
  }

  hasTranslation() {
    const container = this._getContainer();
    return !!(container && container.querySelector('[data-mtt-orig]'));
  }

  async translatePage() {
    if (this._running) {
      new Notice(i18n().pageAlreadyRunning);
      return;
    }
    const container = this._getContainer();
    if (!container) {
      new Notice(i18n().pageNeedReadingView);
      return;
    }
    const blocks = this._getBlocks(container);
    if (blocks.length === 0) {
      new Notice(i18n().pageNoText);
      return;
    }

    this._running = true;
    this._cancelled = false;

    const { pageEngine, sourceLang, targetLang, disableCache } = this.plugin.settings;
    const engine = pageEngine || 'google';
    const eng = ENGINES[engine] || ENGINES.google;
    const tooltip = this.plugin.tooltip;

    this._showProgress(0, blocks.length);
    let done = 0;

    for (const el of blocks) {
      if (this._cancelled) break;
      const originalText = el.textContent.trim();
      if (!originalText) { done++; continue; }

      try {
        const key = `v2|${engine}|${sourceLang}|${targetLang}|${originalText}`;
        const cached = disableCache ? null : tooltip?.cacheGet(key);
        const result = cached ?? await eng.translate(originalText, sourceLang, targetLang, this.plugin.settings);
        if (!cached && result?.targetText) tooltip?.cacheSet(key, result, originalText);
        if (this._cancelled) break;
        if (result?.targetText && !isNoopTranslation(result, originalText, this.plugin.settings)) {
          el.setAttribute('data-mtt-orig', el.innerHTML);
          el.textContent = result.targetText;
          el.classList.add('mtt-page-translated');
        }
      } catch (e) {
        console.warn('[mtt] page translation error:', e);
      }

      done++;
      this._showProgress(done, blocks.length);
      // Yield every 3 blocks to keep the UI responsive and avoid rate-limiting.
      if (done % 3 === 0) await new Promise(r => setTimeout(r, 50));
    }

    this._hideProgress();
    this._running = false;

    const activeView = this.plugin.app.workspace.activeLeaf?.view;
    this._syncButton(activeView);

    if (!this._cancelled) {
      new Notice(i18n().pageDone(done, blocks.length));
    }
  }

  restorePage() {
    const container = this._getContainer();
    if (!container) {
      new Notice(i18n().pageRestoreReadingOnly);
      return;
    }
    const translated = container.querySelectorAll('[data-mtt-orig]');
    if (translated.length === 0) {
      new Notice(i18n().pageNoTranslated);
      return;
    }
    translated.forEach(el => {
      el.innerHTML = el.getAttribute('data-mtt-orig');
      el.removeAttribute('data-mtt-orig');
      el.classList.remove('mtt-page-translated');
    });
    this._syncButton(this.plugin.app.workspace.activeLeaf?.view);
    new Notice(i18n().pageRestored(translated.length));
  }
}

module.exports = class MouseTooltipPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.log = new TranslationLog(this.app, this.manifest.dir);
    await this.log.load();
    this.tooltip = new TooltipManager(this, this.log);
    this.pageTranslator = new PageTranslator(this);
    this.pendingTimer = null;
    this.lastTriggerKey = '';
    // Selection-priority lock: while a non-empty selection exists, mouseover follow is paused
    // and the tooltip stays pinned to the selection translation.
    this.selectionActive = false;

    this.addSettingTab(new MouseTooltipSettingTab(this.app, this));

    this.registerView(VOCAB_VIEW_TYPE, (leaf) => new VocabView(leaf, this));
    this.registerView(TRANS_VIEW_TYPE, (leaf) => new TranslationView(leaf, this));

    this.addRibbonIcon('message-square', i18n().ribbonTrans, () => this.openTransView());
    this.addRibbonIcon('book-open', i18n().ribbonVocab, () => this.openVocabView());
    this.ribbonPageEl = this.addRibbonIcon('languages', i18n().ribbonPage, () => {
      if (this.pageTranslator._running) {
        this.pageTranslator.cancel();
      } else if (this.pageTranslator.hasTranslation()) {
        this.pageTranslator.restorePage();
      } else {
        this.pageTranslator.translatePage();
      }
    });
    if (!(Platform.isMobile ? this.settings.enablePageMobile : this.settings.enablePage)) this.ribbonPageEl.style.display = 'none';

    this.addCommand({
      id: 'mtt-open-trans-panel',
      name: 'Open translation panel',
      callback: () => this.openTransView(),
    });
    this.addCommand({
      id: 'mtt-open-vocab',
      name: 'Open vocabulary list',
      callback: () => this.openVocabView(),
    });
    this.addCommand({
      id: 'mtt-hide-tooltip',
      name: 'Hide tooltip',
      callback: () => this.tooltip.hide(),
    });
    this.addCommand({
      id: 'mtt-toggle-enabled',
      name: 'Toggle translator on/off',
      callback: async () => {
        this.settings.enabled = !this.settings.enabled;
        await this.saveSettings();
        new Notice(i18n().pluginToggle(this.settings.enabled));
        if (!this.settings.enabled) this.tooltip.hide();
      },
    });
    this.addCommand({
      id: 'mtt-translate-selection',
      name: 'Translate current selection',
      callback: () => this.translateSelection(),
    });
    this.addCommand({
      id: 'mtt-translate-page',
      name: 'Translate current page',
      callback: () => this.pageTranslator.translatePage(),
    });
    this.addCommand({
      id: 'mtt-restore-page',
      name: 'Restore original text (page translation)',
      callback: () => this.pageTranslator.restorePage(),
    });
    this.addCommand({
      id: 'mtt-copy-translation',
      name: 'Copy translation to clipboard',
      callback: async () => {
        const result = this.tooltip.lastResult;
        const s = i18n();
        if (!result || !result.targetText) {
          new Notice(s.copyTranslationNone);
          return;
        }
        await navigator.clipboard.writeText(result.targetText);
        new Notice(s.copyTranslationNotice(result.targetText));
      },
    });

    // Add translate button to all current and future markdown view headers.
    const addButtons = () => {
      this.app.workspace.getLeavesOfType('markdown').forEach(leaf => {
        this._addPageTranslateButton(leaf.view);
      });
    };
    addButtons();
    this.registerEvent(this.app.workspace.on('layout-change', addButtons));

    this.registerDomEvent(document, 'keydown', (e) => {
      if (e.key === 'Escape') {
        this.tooltip.hide();
        // ESC also releases the selection lock so mouseover can resume
        this.selectionActive = false;
      }
    });
    this.registerDomEvent(document, 'scroll', () => {
      if (this.selectionActive) return;
      this.tooltip.hide();
    }, true);
    this.registerDomEvent(document, 'selectionchange', () => this.onSelectionChange());

    if (Platform.isMobile) {
      this.registerDomEvent(document, 'touchstart', (e) => {
        if (!this.tooltip.isOwn(e.target)) this.tooltip.hide();
      });
      this.registerDomEvent(document, 'touchend', (e) => this.onTouchEnd(e));
    } else {
      this.registerDomEvent(document, 'mousemove', (e) => this.onMouseMove(e));
      this.registerDomEvent(document, 'mouseleave', () => {
        // keep tooltip while a selection is locking it
        if (this.selectionActive) return;
        this.tooltip.hide();
      });
      this.registerDomEvent(document, 'mousedown', (e) => {
        if (this.tooltip.isOwn(e.target)) return;
        // A click dismisses the tooltip AND cancels a pending hover request, so
        // the tooltip can't pop up under a stationary cursor right after the
        // click; it reappears on the next mouse move. Selection translation
        // still shows via the mouseup path. (upstream #114, 0.1.246)
        if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }
        this.tooltip.hide();
      });
      this.registerDomEvent(document, 'mouseup', (e) => this.onMouseUp(e));
    }

    console.log('[mouse-tooltip-translator] loaded');
  }

  async onunload() {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    if (this.pageTranslator?._running) this.pageTranslator.cancel();
    if (this.tooltip) await this.tooltip.destroy();
    this.app.workspace.detachLeavesOfType(VOCAB_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(TRANS_VIEW_TYPE);
  }

  _addPageTranslateButton(view) {
    if (!(Platform.isMobile ? this.settings.enablePageMobile : this.settings.enablePage)) return;
    if (!view || typeof view.addAction !== 'function') return;
    if (view.containerEl?.querySelector('.mtt-page-btn')) return;
    const btn = view.addAction('languages', i18n().ribbonPage, () => {
      if (this.pageTranslator._running) {
        this.pageTranslator.cancel();
      } else if (this.pageTranslator.hasTranslation()) {
        this.pageTranslator.restorePage();
      } else {
        this.pageTranslator.translatePage();
      }
    });
    btn.classList.add('mtt-page-btn');
    this.pageTranslator._syncButton(view);
  }

  async openTransView() {
    const existing = this.app.workspace.getLeavesOfType(TRANS_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: TRANS_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async openVocabView() {
    const existing = this.app.workspace.getLeavesOfType(VOCAB_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VOCAB_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  _noteContentSelector() {
    switch (this.settings.activeMode) {
      case 'edit':    return '.cm-content, .markdown-rendered';
      case 'reading': return '.markdown-preview-view, .markdown-rendered';
      default:        return NOTE_CONTENT_SELECTOR;
    }
  }

  onMouseMove(e) {
    if (!this.settings.enabled) return;
    if (this.tooltip.isOwn(e.target)) return;
    if (this.settings.restrictToNoteContent && !isInNoteContent(e.target, this._noteContentSelector())) {
      if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }
      if (!this.selectionActive) this.tooltip.hide();
      return;
    }
    if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }

    if (!this.settings.enableHover) return;
    // While a selection is active, freeze the tooltip on the selection translation.
    if (this.selectionActive) return;

    const x = e.clientX, y = e.clientY;

    // Page-translation hover mode: show pre-translation original of the hovered paragraph.
    if (this.settings.pageTranslationHoverOriginal && this.pageTranslator.hasTranslation()) {
      this.pendingTimer = window.setTimeout(() => {
        this.pendingTimer = null;
        if (this.selectionActive) return;
        const target = document.elementFromPoint(x, y);
        const block = target?.closest('[data-mtt-orig]');
        if (block) {
          const origText = getOriginalText(block);
          if (origText) {
            this.tooltip.showPlain(origText, block.getBoundingClientRect());
            return;
          }
        }
        this.tooltip.hide();
      }, Math.max(0, this.settings.delayMs | 0));
      return;
    }

    this.pendingTimer = window.setTimeout(() => {
      this.pendingTimer = null;
      // Re-check: a drag-selection may have started during the hover delay.
      if (this.selectionActive) return;
      const hit = extractAtPoint(x, y, this.settings.textType);
      if (!hit) { this.tooltip.hide(); return; }
      this.tooltip.show(hit.text, hit.rect, this.settings.mouseoverEngine);
    }, Math.max(0, this.settings.delayMs | 0));
  }

  onMouseUp(_e) {
    if (!this.settings.enabled) return;
    // While page-translation hover mode is active, suppress selection-based translation
    // (selected text would be translated text, not original).
    if (this.settings.pageTranslationHoverOriginal && this.pageTranslator.hasTranslation()) return;
    if (!this.settings.enableSelection) return;
    // Scope is judged from the selection itself (anchorNode), not from where the mouse
    // was released — a fast drag can land the cursor outside note content even when
    // the selection is entirely inside it.
    setTimeout(() => {
      if (this.settings.restrictToNoteContent) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        const _sel = this._noteContentSelector();
        if (!isInNoteContent(sel.anchorNode, _sel) && !isInNoteContent(sel.focusNode, _sel)) return;
      }
      this.translateSelection();
    }, 0);
  }

  onSelectionChange() {
    if (!this.settings.enabled) return;
    if (this.settings.pageTranslationHoverOriginal && this.pageTranslator.hasTranslation()) return;
    if (!this.settings.enableSelection) return;
    const sel = window.getSelection();
    const hasSelection = !!(sel && !sel.isCollapsed && sel.toString().trim());
    if (hasSelection) {
      if (this.settings.restrictToNoteContent) {
        const _sel = this._noteContentSelector();
        if (!isInNoteContent(sel.anchorNode, _sel) && !isInNoteContent(sel.focusNode, _sel)) return;
      }
      // Lock onto the selection — mousemove follow is suspended.
      this.selectionActive = true;
    } else if (this.selectionActive) {
      // Selection cleared — release lock and let mouseover resume.
      this.selectionActive = false;
      this.tooltip.hide();
    }
  }

  translateSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    // A sentence dragged across multiple lines (CM6 renders each visual line as
    // its own DOM block, so getSelection() inserts a newline at every boundary)
    // was sent to the translator split by newlines and came back as fragments.
    // Collapse whitespace runs (incl. newlines) to a single space so a wrapped
    // sentence is translated as one flowing sentence (upstream fix, 0.1.246).
    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (!text) return;
    let rect;
    try {
      rect = sel.getRangeAt(0).getBoundingClientRect();
    } catch { rect = null; }
    if (!rect) return;
    this.tooltip.show(text, rect, this.settings.selectionEngine);
  }

  onTouchEnd(e) {
    if (!this.settings.enabled) return;
    if (this.tooltip.isOwn(e.target)) return;

    // Page-translation tap mode: show pre-translation original of the tapped paragraph.
    if (this.settings.pageTranslationHoverOriginal && this.pageTranslator.hasTranslation()) {
      const touch = e.changedTouches[0];
      if (!touch) return;
      const x = touch.clientX, y = touch.clientY;
      setTimeout(() => {
        const target = document.elementFromPoint(x, y);
        const block = target?.closest('[data-mtt-orig]');
        if (block) {
          const origText = getOriginalText(block);
          if (origText) {
            this.tooltip.showPlain(origText, block.getBoundingClientRect());
            return;
          }
        }
        this.tooltip.hide();
      }, 100);
      return;
    }

    // Delay to let the browser finalize selection state after touch
    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) {
        if (!this.settings.enableSelectionMobile) return;
        if (this.settings.restrictToNoteContent) {
          const _sel = this._noteContentSelector();
          if (!isInNoteContent(sel.anchorNode, _sel) && !isInNoteContent(sel.focusNode, _sel)) return;
        }
        this.translateSelection();
        return;
      }
      // No selection: try word at touch point
      if (!this.settings.enableHoverMobile) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const x = touch.clientX, y = touch.clientY;
      if (this.settings.restrictToNoteContent) {
        const el = document.elementFromPoint(x, y);
        if (el && !isInNoteContent(el, this._noteContentSelector())) return;
      }
      const hit = extractAtPoint(x, y, 'word');
      if (hit) {
        this.tooltip.show(hit.text, hit.rect, this.settings.selectionEngine);
      }
    }, 100);
  }

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    _mttSettings = this.settings;
    // Migrate old single 'engine' setting to per-context engines
    if (loaded?.engine) {
      if (!loaded.mouseoverEngine) this.settings.mouseoverEngine = loaded.engine;
      if (!loaded.selectionEngine) this.settings.selectionEngine = loaded.engine;
      if (!loaded.pageEngine) this.settings.pageEngine = loaded.engine;
    }
    // Migrate the pre-integrated LLM engines (openaiCompat / ollama / lmstudio)
    // to the single localLlm engine (reference 0.1.246): engine selections
    // become 'localLlm', old per-engine URL/key/model seed llmProviderSettings,
    // and the first migrated engine decides the active provider. Runs once —
    // after the first save, llmProviderSettings exists in the stored data.
    if (loaded && !loaded.llmProviderSettings) {
      const toV1 = (u, dflt) => `${String(u || dflt).replace(/\/+$/, '')}/v1`;
      const openaiUrl = loaded.openaiCompatApiUrl || 'https://api.openai.com';
      const legacyProviders = {
        openaiCompat: /(^|\/\/)api\.openai\.com/.test(openaiUrl) ? 'openai' : 'custom',
        ollama: 'ollama',
        lmstudio: 'lmstudio',
      };
      const seeds = {};
      if (loaded.openaiCompatModel || loaded.openaiCompatApiKey) {
        seeds[legacyProviders.openaiCompat] = {
          apiEndpoint: toV1(openaiUrl, 'https://api.openai.com'),
          apiKey: loaded.openaiCompatApiKey || '',
          model: loaded.openaiCompatModel || '',
        };
      }
      if (loaded.ollamaModel) {
        seeds.ollama = {
          apiEndpoint: toV1(loaded.ollamaApiUrl, 'http://localhost:11434'),
          apiKey: '',
          model: loaded.ollamaModel,
        };
      }
      if (loaded.lmstudioModel) {
        seeds.lmstudio = {
          apiEndpoint: toV1(loaded.lmstudioApiUrl, 'http://localhost:1234'),
          apiKey: '',
          model: loaded.lmstudioModel,
        };
      }
      let migratedProvider = null;
      for (const key of ['mouseoverEngine', 'selectionEngine', 'pageEngine']) {
        const prov = legacyProviders[this.settings[key]];
        if (!prov) continue;
        this.settings[key] = 'localLlm';
        migratedProvider = migratedProvider || prov;
      }
      if (Object.keys(seeds).length) this.settings.llmProviderSettings = seeds;
      if (migratedProvider) {
        this.settings.llmProvider = migratedProvider;
        const cfg = seeds[migratedProvider];
        this.settings.llmApiEndpoint = cfg ? cfg.apiEndpoint
          : (migratedProvider === 'custom' ? '' : LLM_PROVIDER_ENDPOINTS[migratedProvider] || '');
        this.settings.llmApiKey = cfg ? cfg.apiKey : '';
        this.settings.llmModel = cfg ? cfg.model : '';
      }
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
    _mttSettings = this.settings;
  }
};

class MouseTooltipSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this._llmModels = [];
    this._llmModelDatalist = null;
  }

  // Switching provider saves the previous provider's endpoint/key/model and
  // restores the new one's (or prefills its preset endpoint). Mirrors the
  // reference's applyLlmProviderPreset.
  _applyLlmProviderPreset(provider) {
    const st = this.plugin.settings;
    const prev = st.llmProvider || 'custom';
    if (provider === prev) return;
    const saved = { ...(st.llmProviderSettings || {}) };
    saved[prev] = {
      apiEndpoint: st.llmApiEndpoint || '',
      apiKey: st.llmApiKey || '',
      model: st.llmModel || '',
    };
    st.llmProviderSettings = saved;
    const restored = saved[provider];
    if (restored) {
      st.llmApiEndpoint = restored.apiEndpoint || '';
      st.llmApiKey = restored.apiKey || '';
      st.llmModel = restored.model || '';
    } else {
      st.llmApiEndpoint = provider === 'custom' ? '' : (LLM_PROVIDER_ENDPOINTS[provider] || '');
      st.llmApiKey = '';
      st.llmModel = '';
    }
    st.llmProvider = provider;
    this._llmModels = [];
  }

  async _fetchLlmModels() {
    const s = i18n();
    const endpoint = this.plugin.settings.llmApiEndpoint;
    if (!endpoint) {
      new Notice(s.llmFetchFailed(s.llmFetchNoEndpoint));
      return;
    }
    try {
      const models = await LocalLlmEngine.getModels(endpoint, this.plugin.settings.llmApiKey);
      if (!models.length) {
        new Notice(s.llmFetchFailed(s.llmFetchNoModels));
        return;
      }
      this._llmModels = models;
      this._fillLlmModelDatalist();
      new Notice(s.llmFetchOk(models.length));
    } catch (e) {
      console.error('[mtt] Failed to fetch LLM models:', e);
      new Notice(s.llmFetchFailed(e?.message || String(e)));
    }
  }

  _fillLlmModelDatalist() {
    const dl = this._llmModelDatalist;
    if (!dl) return;
    dl.textContent = '';
    for (const m of this._llmModels || []) {
      const opt = document.createElement('option');
      opt.value = m;
      dl.appendChild(opt);
    }
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = i18n();
    containerEl.createEl('h2', { text: s.settingsTitle });

    // ---- UI Language ----
    new Setting(containerEl)
      .setName(s.uiLang)
      .setDesc(s.uiLangDesc)
      .addDropdown((d) => d
        .addOption('system', s.uiLangSystem)
        .addOption('ja', '日本語')
        .addOption('en', 'English')
        .setValue(this.plugin.settings.uiLang)
        .onChange(async (v) => {
          this.plugin.settings.uiLang = v;
          await this.plugin.saveSettings();
          this.display();
        }));

    // ---- Master Toggle ----
    new Setting(containerEl)
      .setName(s.masterEnabled)
      .setDesc(s.masterEnabledDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.enabled)
        .onChange(async (v) => { this.plugin.settings.enabled = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(s.masterRestrict)
      .setDesc(s.masterRestrictDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.restrictToNoteContent)
        .onChange(async (v) => {
          this.plugin.settings.restrictToNoteContent = v;
          await this.plugin.saveSettings();
          this.plugin.tooltip.hide();
          this.display();
        }));

    // ---- Features ----
    containerEl.createEl('h3', { text: s.secFeatures });

    containerEl.createEl('h4', { text: s.secDesktop });

    new Setting(containerEl)
      .setName(s.featHover)
      .setDesc(s.featHoverDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.enableHover)
        .onChange(async (v) => { this.plugin.settings.enableHover = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(s.featSelection)
      .setDesc(s.featSelectionDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.enableSelection)
        .onChange(async (v) => { this.plugin.settings.enableSelection = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(s.featPage)
      .setDesc(s.featPageDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.enablePage)
        .onChange(async (v) => {
          this.plugin.settings.enablePage = v;
          await this.plugin.saveSettings();
          if (!Platform.isMobile) {
            if (this.plugin.ribbonPageEl) this.plugin.ribbonPageEl.style.display = v ? '' : 'none';
            if (v) {
              this.plugin.app.workspace.getLeavesOfType('markdown').forEach(leaf => this.plugin._addPageTranslateButton(leaf.view));
            } else {
              document.querySelectorAll('.mtt-page-btn').forEach(el => el.remove());
            }
          }
        }));

    containerEl.createEl('h4', { text: s.secMobile });

    new Setting(containerEl)
      .setName(s.featHoverMobile)
      .setDesc(s.featHoverMobileDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.enableHoverMobile)
        .onChange(async (v) => { this.plugin.settings.enableHoverMobile = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(s.featSelectionMobile)
      .setDesc(s.featSelectionMobileDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.enableSelectionMobile)
        .onChange(async (v) => { this.plugin.settings.enableSelectionMobile = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(s.featPageMobile)
      .setDesc(s.featPageMobileDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.enablePageMobile)
        .onChange(async (v) => {
          this.plugin.settings.enablePageMobile = v;
          await this.plugin.saveSettings();
          if (Platform.isMobile) {
            if (this.plugin.ribbonPageEl) this.plugin.ribbonPageEl.style.display = v ? '' : 'none';
            if (v) {
              this.plugin.app.workspace.getLeavesOfType('markdown').forEach(leaf => this.plugin._addPageTranslateButton(leaf.view));
            } else {
              document.querySelectorAll('.mtt-page-btn').forEach(el => el.remove());
            }
          }
        }));

    // ---- Translation ----
    containerEl.createEl('h3', { text: s.secTranslation });

    new Setting(containerEl)
      .setName(s.translateFrom)
      .addDropdown((d) => {
        for (const [k, v] of localizedLangEntries(true)) d.addOption(k, v);
        d.setValue(this.plugin.settings.sourceLang)
          .onChange(async (v) => { this.plugin.settings.sourceLang = v; await this.plugin.saveSettings(); });
      });

    new Setting(containerEl)
      .setName(s.translateTo)
      .addDropdown((d) => {
        for (const [k, v] of localizedLangEntries(false)) d.addOption(k, v);
        d.setValue(this.plugin.settings.targetLang)
          .onChange(async (v) => { this.plugin.settings.targetLang = v; await this.plugin.saveSettings(); });
      });

    new Setting(containerEl)
      .setName(s.skipSame)
      .setDesc(s.skipSameDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.skipSameLanguage)
        .onChange(async (v) => {
          this.plugin.settings.skipSameLanguage = v;
          await this.plugin.saveSettings();
          this.plugin.tooltip.hide();
        }));

    new Setting(containerEl)
      .setName(s.skipIdentical)
      .setDesc(s.skipIdenticalDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.skipIdenticalText)
        .onChange(async (v) => {
          this.plugin.settings.skipIdenticalText = v;
          await this.plugin.saveSettings();
          this.plugin.tooltip.hide();
        }));

    // ---- Engine Settings ----
    containerEl.createEl('h3', { text: s.secEngines });

    const engineConfigs = [
      { key: 'mouseoverEngine', name: s.engineHover,     desc: s.engineHoverDesc },
      { key: 'selectionEngine', name: s.engineSelection, desc: s.engineSelectionDesc },
      { key: 'pageEngine',      name: s.enginePage,      desc: s.enginePageDesc },
    ];
    for (const { key, name, desc } of engineConfigs) {
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addDropdown((d) => {
          for (const [k, v] of Object.entries(ENGINES)) d.addOption(k, v.label);
          d.setValue(this.plugin.settings[key] || 'google')
            .onChange(async (v) => {
              this.plugin.settings[key] = v;
              await this.plugin.saveSettings();
              this.display();
            });
        });
    }

    new Setting(containerEl)
      .setName(s.fallbackEngine)
      .setDesc(s.fallbackEngineDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.fallbackTranslatorEngine !== false)
        .onChange(async (v) => { this.plugin.settings.fallbackTranslatorEngine = v; await this.plugin.saveSettings(); }));

    // Integrated LLM settings — shown while any context uses the LLM engine
    // (mirrors the reference's visibleWhen: translatorVendor === "localLlm").
    const usesLlm = [
      this.plugin.settings.mouseoverEngine,
      this.plugin.settings.selectionEngine,
      this.plugin.settings.pageEngine,
    ].includes('localLlm');
    if (usesLlm) {
      containerEl.createEl('h4', { text: s.llmSection });

      new Setting(containerEl)
        .setName(s.llmProvider)
        .setDesc(s.llmProviderDesc)
        .addDropdown((d) => {
          for (const [k, label] of Object.entries(LLM_PROVIDER_LABELS)) d.addOption(k, label);
          d.setValue(this.plugin.settings.llmProvider || 'custom')
            .onChange(async (v) => {
              this._applyLlmProviderPreset(v);
              await this.plugin.saveSettings();
              this.display();
            });
        });

      new Setting(containerEl)
        .setName(s.llmApiUrl)
        .setDesc(s.llmApiUrlDesc)
        .addText((t) => {
          t.setPlaceholder('http://localhost:11434/v1')
            .setValue(this.plugin.settings.llmApiEndpoint || '')
            .onChange(async (v) => { this.plugin.settings.llmApiEndpoint = v.trim(); await this.plugin.saveSettings(); });
          // Preset endpoints are fixed; only Custom is editable (mirrors the
          // reference's readonlyWhen on llmApiEndpoint).
          if ((this.plugin.settings.llmProvider || 'custom') !== 'custom') t.setDisabled(true);
        });

      new Setting(containerEl)
        .setName(s.llmApiKey)
        .addText((t) => {
          t.setPlaceholder('sk-...')
            .setValue(this.plugin.settings.llmApiKey || '')
            .onChange(async (v) => { this.plugin.settings.llmApiKey = v.trim(); await this.plugin.saveSettings(); });
          t.inputEl.type = 'password';
        });

      new Setting(containerEl)
        .setName(s.llmModel)
        .setDesc(s.llmModelDesc)
        .addText((t) => {
          t.setPlaceholder('e.g. gpt-4o-mini, llama3')
            .setValue(this.plugin.settings.llmModel || '')
            .onChange(async (v) => { this.plugin.settings.llmModel = v.trim(); await this.plugin.saveSettings(); });
          // Native combobox: fetched models fill a datalist attached to the input.
          const dl = document.createElement('datalist');
          dl.id = 'mtt-llm-models';
          t.inputEl.setAttribute('list', dl.id);
          t.inputEl.parentElement.appendChild(dl);
          this._llmModelDatalist = dl;
          this._fillLlmModelDatalist();
        })
        .addExtraButton((b) => b
          .setIcon('refresh-cw')
          .setTooltip(s.llmFetchModels)
          .onClick(() => this._fetchLlmModels()));
    }

    // ---- Per-feature Settings ----
    containerEl.createEl('h3', { text: s.secPerFeature });

    containerEl.createEl('h4', { text: s.secHoverSelection });

    if (this.plugin.settings.restrictToNoteContent) {
      new Setting(containerEl)
        .setName(s.activeMode)
        .setDesc(s.activeModeDesc)
        .addDropdown((d) => d
          .addOption('both', s.modeBoth)
          .addOption('edit', s.modeEdit)
          .addOption('reading', s.modeReading)
          .setValue(this.plugin.settings.activeMode || 'both')
          .onChange(async (v) => {
            this.plugin.settings.activeMode = v;
            await this.plugin.saveSettings();
            this.plugin.tooltip.hide();
          }));
    }

    new Setting(containerEl)
      .setName(s.mouseUnit)
      .setDesc(s.mouseUnitDesc)
      .addDropdown((d) => d
        .addOption('word', s.unitWord)
        .addOption('sentence', s.unitSentence)
        .setValue(this.plugin.settings.textType)
        .onChange(async (v) => { this.plugin.settings.textType = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(s.hoverDelay)
      .setDesc(s.hoverDelayDesc)
      .addText((t) => t
        .setPlaceholder('500')
        .setValue(String(this.plugin.settings.delayMs))
        .onChange(async (v) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) return;
          this.plugin.settings.delayMs = n;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h4', { text: s.secPage });

    new Setting(containerEl)
      .setName(s.pageHoverOrig)
      .setDesc(s.pageHoverOrigDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.pageTranslationHoverOriginal)
        .onChange(async (v) => {
          this.plugin.settings.pageTranslationHoverOriginal = v;
          await this.plugin.saveSettings();
          this.plugin.tooltip.hide();
        }));

    // ---- Tooltip ----
    containerEl.createEl('h3', { text: s.secTooltip });

    new Setting(containerEl)
      .setName(s.tooltipPlacement)
      .setDesc(s.tooltipPlacementDesc)
      .addDropdown((d) => d
        .addOption('top', s.placementAbove)
        .addOption('bottom', s.placementBelow)
        .setValue(this.plugin.settings.tooltipPlacement || 'bottom')
        .onChange(async (v) => {
          this.plugin.settings.tooltipPlacement = v;
          await this.plugin.saveSettings();
          this.plugin.tooltip.hide();
        }));

    new Setting(containerEl)
      .setName(s.showDict)
      .setDesc(s.showDictDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.showDictionary)
        .onChange(async (v) => { this.plugin.settings.showDictionary = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(s.showTranslit)
      .setDesc(s.showTranslitDesc)
      .addToggle((t) => t
        .setValue(this.plugin.settings.showTransliteration)
        .onChange(async (v) => { this.plugin.settings.showTransliteration = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(s.showSource)
      .addToggle((t) => t
        .setValue(this.plugin.settings.showSourceText)
        .onChange(async (v) => { this.plugin.settings.showSourceText = v; await this.plugin.saveSettings(); }));

    new Setting(containerEl)
      .setName(s.showDetected)
      .addToggle((t) => t
        .setValue(this.plugin.settings.showDetectedLang)
        .onChange(async (v) => { this.plugin.settings.showDetectedLang = v; await this.plugin.saveSettings(); }));
  }
}
