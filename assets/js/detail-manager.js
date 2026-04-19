const __session = window.BitHappenAdminAuth?.requireAuth?.() || null;

const form = document.getElementById('detail-form');
const cardSelect = document.getElementById('detail-card-id');
const clearButton = document.getElementById('detail-clear');
const saveButton = document.getElementById('detail-save');
const message = document.getElementById('detail-message');
const videoUploadInput = document.getElementById('detail-video-upload');

const DETAIL_STATE_KEY_DEFAULT = 'detailOverrides';
const DETAIL_MEDIA_HOST = 'media.bithappen.kr:4443';
const IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_SIZE_BYTES = 100 * 1024 * 1024;
const IMAGE_ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);
const VIDEO_ALLOWED_EXTENSIONS = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv']);
const SECTION_DEFINITIONS = [
  { key: 'intentHtml', editorId: 'editor-intent', sourceId: 'detail-intent-html', previewId: 'preview-intent' },
  { key: 'architectureHtml', editorId: 'editor-architecture', sourceId: 'detail-architecture-html', previewId: 'preview-architecture' },
  { key: 'referenceHtml', editorId: 'editor-reference', sourceId: 'detail-reference-html', previewId: 'preview-reference' },
];

let overrideState = {};
const editorBindings = new Map();
const mediaSizingCache = new Map();
let pendingVideoUploadSectionKey = '';

function setEditorHostStatus(text) {
  const messageHtml = `<div class="editor-init-error">${escapeHtml(text)}</div>`;
  SECTION_DEFINITIONS.forEach((section) => {
    const editorRoot = document.getElementById(section.editorId);
    if (!editorRoot) return;
    editorRoot.innerHTML = messageHtml;
  });
}

function resolveCkeditorConstructor() {
  return window.CKEDITOR?.ClassicEditor || window.ClassicEditor || null;
}

function getPreferredMediaProtocol() {
  return 'https:';
}

function getDetailMediaBaseUrl() {
  return `${getPreferredMediaProtocol()}//${DETAIL_MEDIA_HOST}`;
}

function getDetailMediaUploadUrl(type) {
  const folder = type === 'video' ? 'videos' : 'images';
  return `${getDetailMediaBaseUrl()}/upload/${folder}`;
}

const GROUP_LABELS = {
  kiosk: 'Kiosk',
  ai: 'AI',
  airport: 'Airport',
  'device-interface': 'Device interface',
  product: 'Product',
  all: 'All/Enterprise',
};

function getGroupLabel(group) {
  return GROUP_LABELS[group] || String(group || '').trim() || 'Unknown';
}

function getSupabaseConfig() {
  const cfg = window.BitHappenSupabaseConfig || {};
  const url = String(cfg.url || '').trim().replace(/\/$/, '');
  const anonKey = String(cfg.anonKey || '').trim();
  const detailStateKey = String(cfg.detailStateKey || DETAIL_STATE_KEY_DEFAULT).trim() || DETAIL_STATE_KEY_DEFAULT;
  return {
    enabled: Boolean(url && anonKey),
    url,
    anonKey,
    detailStateKey,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripFileExtension(name) {
  return String(name || '').replace(/\.[^.]+$/, '').trim();
}

function getFileExtension(name) {
  const match = String(name || '').trim().match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function getMimeSubtype(type) {
  const match = String(type || '').trim().toLowerCase().match(/^[^/]+\/(.+)$/);
  if (!match) return '';
  return match[1].replace('svg+xml', 'svg');
}

function buildUploadFileName(file, type) {
  const originalName = String(file?.name || '').trim();
  if (originalName) return originalName;

  const fallbackExtension = getMimeSubtype(file?.type) || (type === 'video' ? 'mp4' : 'png');
  return `${type}-${Date.now()}.${fallbackExtension}`;
}

function isImageBlob(blob) {
  return /^image\//i.test(String(blob?.type || ''));
}

function isVideoBlob(blob) {
  return /^video\//i.test(String(blob?.type || ''));
}

function normalizeUploadedMediaUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  if (/^https?:\/\/media\.bithappen\.kr(:\d+)?\//i.test(raw)) {
    return raw.replace(/^http:/i, 'https:');
  }

  if (/^\/\//.test(raw)) {
    return `${getPreferredMediaProtocol()}${raw}`;
  }

  if (/^\//.test(raw)) {
    return `${getDetailMediaBaseUrl()}${raw}`;
  }

  return raw;
}

function buildUploadedMediaUrlFromParts(folder, fileName) {
  const cleanFolder = String(folder || '').trim().replace(/^\/+|\/+$/g, '');
  const cleanFileName = String(fileName || '').trim().replace(/^\/+/, '');
  if (!cleanFolder || !cleanFileName) return '';
  return `${getDetailMediaBaseUrl()}/${cleanFolder}/${cleanFileName}`;
}

function stripEditorMediaMeta(url) {
  return String(url || '')
    .trim()
    .replace(/[?&]bh-media=[^#&]*/i, '')
    .replace(/[?&]$/, '')
    .replace(/#bh-media=[^#]*$/i, '');
}

function buildEditorMediaUrl(sourceElement, url) {
  const cleanUrl = stripEditorMediaMeta(url);
  const meta = encodeEditorMediaMeta(sourceElement);
  return meta ? `${cleanUrl}${meta}` : cleanUrl;
}

function encodeEditorMediaMeta(sourceElement) {
  if (!(sourceElement instanceof Element)) return '';

  const pc = String(sourceElement.style.getPropertyValue('--detail-media-height-pc') || '').trim();
  const tablet = String(sourceElement.style.getPropertyValue('--detail-media-tablet-ratio') || '').trim();
  const phone = String(sourceElement.style.getPropertyValue('--detail-media-phone-ratio') || '').trim();
  const parts = [];
  if (pc) parts.push(`pc_${pc}`);
  if (tablet) parts.push(`tb_${tablet}`);
  if (phone) parts.push(`ph_${phone}`);
  return parts.length ? `?bh-media=${encodeURIComponent(parts.join('.'))}` : '';
}

function parseEditorMediaMeta(url) {
  const raw = String(url || '').trim();
  let match = raw.match(/[?&]bh-media=([^#&]*)/i);
  if (!match) match = raw.match(/#bh-media=([^#]*)$/i);
  const cleanUrl = stripEditorMediaMeta(raw);
  const result = {
    cleanUrl,
    pcHeight: '',
    tabletRatio: '',
    phoneRatio: '',
  };
  if (!match) return result;

  const decoded = decodeURIComponent(match[1] || '');
  decoded.split(/[.|]/).forEach((part) => {
    const separatorIndex = part.indexOf('_') >= 0 ? part.indexOf('_') : part.indexOf(':');
    if (separatorIndex < 0) return;
    const key = part.slice(0, separatorIndex);
    const value = part.slice(separatorIndex + 1);
    if (!key || !value) return;
    if (key === 'pc') result.pcHeight = value;
    if (key === 'tb') result.tabletRatio = value;
    if (key === 'ph') result.phoneRatio = value;
  });
  return result;
}

function buildEditorMediaStyleFromMeta(meta) {
  const parts = [];
  if (meta.pcHeight) parts.push(`--detail-media-height-pc: ${meta.pcHeight}`);
  if (meta.tabletRatio) parts.push(`--detail-media-tablet-ratio: ${meta.tabletRatio}`);
  if (meta.phoneRatio) parts.push(`--detail-media-phone-ratio: ${meta.phoneRatio}`);
  return parts.join('; ');
}

function computeMetaPixelHeight(meta) {
  const pcHeight = parseInt(meta.pcHeight) || 360;
  return Math.max(120, pcHeight);
}

function validateUploadFile(file, type) {
  const extension = getFileExtension(file?.name) || getMimeSubtype(file?.type);
  const allowedExtensions = type === 'video' ? VIDEO_ALLOWED_EXTENSIONS : IMAGE_ALLOWED_EXTENSIONS;
  const maxSize = type === 'video' ? VIDEO_MAX_SIZE_BYTES : IMAGE_MAX_SIZE_BYTES;
  const typeLabel = type === 'video' ? '동영상' : '이미지';

  if (!allowedExtensions.has(extension)) {
    throw new Error(`${typeLabel} 확장자를 확인해 주세요. 허용 형식: ${[...allowedExtensions].join(', ')}`);
  }

  if (Number(file?.size || 0) > maxSize) {
    const maxSizeMb = type === 'video' ? 100 : 10;
    throw new Error(`${typeLabel} 최대 업로드 용량은 ${maxSizeMb}MB입니다.`);
  }
}

function extractUploadedMediaUrl(result, type) {
  if (!result || typeof result !== 'object') {
    throw new Error('업로드 응답 형식이 올바르지 않습니다.');
  }

  const candidate = type === 'video'
    ? result.videoUrl || result.imageUrl || result.mediaUrl || result.url || result.fileUrl || buildUploadedMediaUrlFromParts(result.folder, result.fileName)
    : result.imageUrl || result.mediaUrl || result.url || result.fileUrl || buildUploadedMediaUrlFromParts(result.folder, result.fileName);

  const url = normalizeUploadedMediaUrl(candidate);
  if (!url) {
    throw new Error('업로드 응답에 파일 URL이 없습니다.');
  }

  return url;
}

async function uploadEditorMedia(blob, type) {
  const uploadUrl = getDetailMediaUploadUrl(type);
  const uploadFileName = buildUploadFileName(blob, type);
  validateUploadFile(blob, type);
  const formData = new FormData();
  formData.append('file', blob, uploadFileName);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`${type === 'video' ? '동영상' : '이미지'} 업로드 실패: ${response.status}`);
  }

  const result = await response.json();
  return extractUploadedMediaUrl(result, type);
}

function setMessage(text, isError = true) {
  message.style.color = isError ? '#b61d3a' : '#1f7a35';
  message.textContent = text;
}

function buildCardOptions() {
  const cards = window.BitHappenCardStore.getCards().filter((card) => card.enabled !== false);
  cardSelect.innerHTML = cards
    .map((card) => `<option value="${card.id}">${card.title} (${getGroupLabel(card.group)})</option>`)
    .join('');
}

function getDefaultOverrideByCardId(cardId) {
  const defaults = window.BitHappenDetailDefaultOverrides;
  if (!defaults || typeof defaults !== 'object') return null;
  return defaults[cardId] || null;
}

function createListBlockHtml(title, items) {
  if (!Array.isArray(items) || !items.length) return '';
  return `<section><h3>${escapeHtml(title)}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;
}

function createTechSpecHtml(techSpecs) {
  if (!Array.isArray(techSpecs) || !techSpecs.length) return '';
  return `
    <section>
      <h3>기술 스펙</h3>
      <div class="rich-grid-2">
        ${techSpecs
          .map(
            (spec) => `
              <article class="rich-card">
                <h4>${escapeHtml(spec?.title || '')}</h4>
                <ul>${(Array.isArray(spec?.items) ? spec.items : []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
              </article>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function createKpiHtml(kpis) {
  if (!Array.isArray(kpis) || !kpis.length) return '';
  return `
    <section>
      <h3>KPI</h3>
      <div class="rich-grid-3">
        ${kpis
          .map(
            (kpi) => `
              <article class="rich-card">
                <p class="rich-kpi">${escapeHtml(kpi?.value || '')}</p>
                <h4>${escapeHtml(kpi?.title || '')}</h4>
                <p>${escapeHtml(kpi?.desc || '')}</p>
              </article>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function hasMeaningfulHtml(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;

  if (/(<img|<video|<audio|<iframe|<table|<figure|<ul|<ol|<li|<blockquote|<pre|<code|<h[1-6]|<hr)/i.test(raw)) {
    return true;
  }

  const normalized = raw
    .replace(/<p><br><\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();

  return Boolean(normalized);
}

function normalizeRichHtml(value) {
  const raw = String(value || '').trim();
  return hasMeaningfulHtml(raw) ? raw : '';
}

function normalizeAttributeValue(value) {
  return String(value || '').replace(/^['"]|['"]$/g, '').trim();
}

function mergeStyleAttributeValues(values) {
  const declarations = new Map();
  values.forEach((value) => {
    normalizeAttributeValue(value)
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((declaration) => {
        const separatorIndex = declaration.indexOf(':');
        if (separatorIndex < 0) return;
        const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
        const propertyValue = declaration.slice(separatorIndex + 1).trim();
        if (!property || !propertyValue) return;
        declarations.set(property, propertyValue);
      });
  });

  return Array.from(declarations.entries())
    .map(([property, propertyValue]) => `${property}: ${propertyValue}`)
    .join('; ');
}

function normalizeOpeningTagAttributes(tagText) {
  if (!/^<[a-z][^>]*>$/i.test(tagText)) return tagText;

  const tagMatch = tagText.match(/^<([a-z0-9-]+)([^>]*?)(\/)?>$/i);
  if (!tagMatch) return tagText;

  const [, tagName, rawAttributes = '', selfClosingMarker = ''] = tagMatch;
  const attributePattern = /([:\w-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  const attributes = new Map();
  let match;

  while ((match = attributePattern.exec(rawAttributes))) {
    const attributeName = String(match[1] || '').toLowerCase();
    const attributeValue = match[2] ?? '';
    if (!attributeName) continue;

    if (!attributes.has(attributeName)) {
      attributes.set(attributeName, []);
    }
    attributes.get(attributeName).push(attributeValue);
  }

  const normalizedAttributes = [];
  attributes.forEach((values, attributeName) => {
    if (attributeName === 'class') {
      const classNames = Array.from(
        new Set(
          values
            .flatMap((value) => normalizeAttributeValue(value).split(/\s+/))
            .map((value) => value.trim())
            .filter(Boolean)
        )
      );
      if (classNames.length) {
        normalizedAttributes.push(`class="${classNames.join(' ')}"`);
      }
      return;
    }

    if (attributeName === 'style') {
      const styleValue = mergeStyleAttributeValues(values);
      if (styleValue) {
        normalizedAttributes.push(`style="${styleValue}"`);
      }
      return;
    }

    const lastValue = values[values.length - 1];
    if (lastValue === '') {
      normalizedAttributes.push(attributeName);
      return;
    }

    normalizedAttributes.push(`${attributeName}="${normalizeAttributeValue(lastValue).replace(/"/g, '&quot;')}"`);
  });

  const attributeText = normalizedAttributes.length ? ` ${normalizedAttributes.join(' ')}` : '';
  const selfClosingText = selfClosingMarker ? ' /' : '';
  return `<${tagName}${attributeText}${selfClosingText}>`;
}

function normalizeMediaMarkup(value) {
  const raw = normalizeRichHtml(value);
  if (!raw) return '';

  const normalizedTags = raw.replace(/<[^!/?][^>]*>/g, (tagText) => normalizeOpeningTagAttributes(tagText));
  const wrapper = document.createElement('div');
  wrapper.innerHTML = normalizedTags;

  Array.from(wrapper.querySelectorAll('img')).forEach((image) => {
    image.classList.add('detail-image-size');
    image.classList.add('detail-media-size');

    const sourceUrl = normalizeUploadedMediaUrl(image.getAttribute('src') || '');
    if (sourceUrl) {
      image.setAttribute('src', sourceUrl);
    }
  });

  Array.from(wrapper.querySelectorAll('.detail-editor-video, figure.media')).forEach((block) => {
    if (block.matches('.detail-editor-video')) {
      block.classList.add('detail-editor-video');
      block.classList.add('detail-media-size');
      block.classList.remove('detail-image-size');
    }

    const video = block.querySelector('video');
    const source = block.querySelector('source');
    const sourceUrl = normalizeUploadedMediaUrl(
      block.getAttribute('data-oembed-url') ||
      video?.getAttribute('src') ||
      source?.getAttribute('src') ||
      ''
    );

    if (sourceUrl) {
      if (block.matches('.detail-editor-video')) {
        block.setAttribute('data-oembed-url', sourceUrl);
      }
      if (video) {
        video.setAttribute('src', sourceUrl);
        video.classList.add('detail-media-size');
      }
      if (source) {
        source.setAttribute('src', sourceUrl);
      }
      if (block.matches('figure.media')) {
        const oembed = block.querySelector('oembed');
        if (oembed) {
          oembed.setAttribute('url', sourceUrl);
        }
      }
    }
  });

  return wrapper.innerHTML.trim();
}

function formatHtmlForSource(value) {
  const raw = normalizeMediaMarkup(value);
  if (!raw) return '';

  const compact = raw.replace(/>\s+</g, '><').trim();
  const lines = compact
    .replace(/</g, '\n<')
    .replace(/^\n/, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const selfClosingPattern = /^<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b/i;
  const formatted = [];
  let depth = 0;

  for (const line of lines) {
    const isClosing = /^<\//.test(line);
    const selfContained = /^<([a-z0-9-]+)(\s[^>]*)?>.*<\/\1>$/i.test(line) || /\/>$/.test(line) || selfClosingPattern.test(line);
    const isOpening = /^<([a-z0-9-]+)\b/i.test(line) && !isClosing && !selfContained && !/^<!/.test(line);

    if (isClosing) {
      depth = Math.max(depth - 1, 0);
    }

    formatted.push(`${'  '.repeat(depth)}${line}`);

    if (isOpening) {
      depth += 1;
    }
  }

  return formatted.join('\n').trim();
}

function convertLegacyOverrideToSections(value) {
  if (!value || typeof value !== 'object') {
    return { intentHtml: '', architectureHtml: '', referenceHtml: '' };
  }

  return {
    intentHtml: [createListBlockHtml('문제 정의', value.pains), createListBlockHtml('핵심 기능', value.features)]
      .filter(Boolean)
      .join(''),
    architectureHtml: [
      createListBlockHtml('해결 방식', value.how),
      createListBlockHtml('기술 연동', value.integration),
      createTechSpecHtml(value.techSpecs),
    ]
      .filter(Boolean)
      .join(''),
    referenceHtml: [createListBlockHtml('적용 시나리오', value.scenarios), createKpiHtml(value.kpis)]
      .filter(Boolean)
      .join(''),
  };
}

function hasOwnSectionKey(source, key) {
  return Boolean(source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, key));
}

function hasDirectSectionOverride(source) {
  return SECTION_DEFINITIONS.some((section) => hasOwnSectionKey(source, section.key));
}

function getCurrentSectionContent(source) {
  if (!source || typeof source !== 'object') {
    return { intentHtml: '', architectureHtml: '', referenceHtml: '' };
  }

  const direct = {
    intentHtml: normalizeRichHtml(source.intentHtml),
    architectureHtml: normalizeRichHtml(source.architectureHtml),
    referenceHtml: normalizeRichHtml(source.referenceHtml),
  };

  if (hasDirectSectionOverride(source)) {
    return direct;
  }

  return convertLegacyOverrideToSections(source);
}

function readCurrentCardOverride() {
  const id = cardSelect.value;
  if (!id) return null;
  return overrideState[id] || getDefaultOverrideByCardId(id) || null;
}

function getEditorBinding(sectionKey) {
  return editorBindings.get(sectionKey) || null;
}

function getEditorHtml(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return '';
  if (typeof binding.editor.getData === 'function') {
    return String(binding.editor.getData() || '').trim();
  }
  if (typeof binding.editor.getHTML === 'function') {
    return String(binding.editor.getHTML() || '').trim();
  }
  return String(binding.sourceInput.value || '').trim();
}

function getSectionSourceHtml(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return '';
  return String(binding.sourceInput.value || '').trim();
}

function getSelectableMediaElements(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('img, .detail-editor-video, figure.media')).filter((element) => {
    if (element.matches('img')) return true;
    if (element.matches('.detail-editor-video')) return true;
    return element.matches('figure.media');
  });
}

function resolveSelectedMediaElement(target) {
  if (!(target instanceof Element)) return null;
  return target.closest('.detail-editor-video, figure.media, img') || null;
}

function rememberSelectedMedia(sectionKey, target, editorRoot) {
  const binding = getEditorBinding(sectionKey);
  if (!binding || !editorRoot) return;

  const mediaElement = resolveSelectedMediaElement(target);
  if (!mediaElement || !editorRoot.contains(mediaElement)) return;

  const mediaElements = getSelectableMediaElements(editorRoot);
  const mediaIndex = mediaElements.indexOf(mediaElement);
  if (mediaIndex < 0) return;

  binding.selectedMediaIndex = mediaIndex;
}

function resolveSelectedTableFigure(target) {
  if (!(target instanceof Element)) return null;
  const figure = target.closest('figure.table');
  if (figure) return figure;
  const table = target.closest('table');
  if (table) {
    const parent = table.closest('figure.table');
    return parent || table;
  }
  return null;
}

function rememberSelectedTable(sectionKey, target, editorRoot) {
  const binding = getEditorBinding(sectionKey);
  if (!binding || !editorRoot) return;

  const tableElement = resolveSelectedTableFigure(target);
  if (!tableElement || !editorRoot.contains(tableElement)) return;

  const allTables = Array.from(editorRoot.querySelectorAll('figure.table, table'));
  const tableIndex = allTables.indexOf(tableElement);
  if (tableIndex < 0) return;

  binding.selectedTableIndex = tableIndex;

  const cell = target instanceof Element ? target.closest('td, th') : null;
  binding.selectedColIndex = cell ? cell.cellIndex : undefined;
}

function applySelectedTableWidth(sectionKey, widthPx) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return false;

  if (!Number.isFinite(Number(widthPx)) || Number(widthPx) <= 0) {
    setMessage('유효한 너비(px)를 입력해 주세요.');
    return false;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = getSectionSourceHtml(sectionKey) || getEditorHtml(sectionKey);
  const allTables = Array.from(wrapper.querySelectorAll('figure.table, table'));
  const tableIndex = Number(binding.selectedTableIndex);
  const target = Number.isInteger(tableIndex) ? allTables[tableIndex] : null;

  if (!target) {
    setMessage('너비를 바꿀 표를 먼저 클릭해 주세요.');
    return false;
  }

  const normalizedWidth = `${Math.max(100, Number(widthPx))}px`;
  target.style.setProperty('width', normalizedWidth);

  setEditorHtml(sectionKey, wrapper.innerHTML);
  setMessage(`선택한 표 너비를 ${normalizedWidth}로 변경했습니다.`, false);
  return true;
}

function getSelectedTableCurrentWidth(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return '';
  const tableIndex = Number(binding.selectedTableIndex);
  if (!Number.isInteger(tableIndex)) return '';

  // 1) 소스 HTML에서 읽기
  const wrapper = document.createElement('div');
  wrapper.innerHTML = getSectionSourceHtml(sectionKey) || getEditorHtml(sectionKey);
  const allTables = Array.from(wrapper.querySelectorAll('figure.table, table'));
  const target = allTables[tableIndex];
  if (target) {
    const w = target.style.getPropertyValue('width') || target.getAttribute('width');
    if (w) { const n = parseInt(w, 10); if (n > 0) return n; }
  }

  // 2) 렌더링된 에디터 DOM에서 읽기
  const editableRoot = binding.editableRoot;
  if (editableRoot) {
    const liveTables = Array.from(editableRoot.querySelectorAll('figure.table, table'));
    const liveTarget = liveTables[tableIndex];
    if (liveTarget) {
      const w = liveTarget.style.getPropertyValue('width') || liveTarget.getAttribute('width');
      if (w) { const n = parseInt(w, 10); if (n > 0) return n; }
      const computed = liveTarget.getBoundingClientRect().width;
      if (computed > 0) return Math.round(computed);
    }
  }

  return '';
}

function promptAndApplyTableWidth(sectionKey) {
  const currentWidth = getSelectedTableCurrentWidth(sectionKey);
  const defaultVal = currentWidth || '600';
  const input = window.prompt(`표 너비(px)를 입력해 주세요.${currentWidth ? ' (현재: ' + currentWidth + 'px)' : ''}`, String(defaultVal));
  if (input === null) return;

  const widthPx = Number(String(input).trim());
  applySelectedTableWidth(sectionKey, widthPx);
}

function findTableElementInWrapper(wrapper, tableIndex) {
  const allTables = Array.from(wrapper.querySelectorAll('figure.table, table'));
  return Number.isInteger(tableIndex) ? allTables[tableIndex] : null;
}

function getActualTable(target) {
  if (target.tagName === 'TABLE') return target;
  return target.querySelector('table');
}

function applySelectedColWidth(sectionKey, widthPx) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return false;

  const colIndex = binding.selectedColIndex;
  if (!Number.isInteger(colIndex) || colIndex < 0) {
    setMessage('너비를 바꿀 컬럼(셀)을 먼저 클릭해 주세요.');
    return false;
  }
  if (!Number.isFinite(Number(widthPx)) || Number(widthPx) <= 0) {
    setMessage('유효한 너비(px)를 입력해 주세요.');
    return false;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = getSectionSourceHtml(sectionKey) || getEditorHtml(sectionKey);
  const tableIndex = Number(binding.selectedTableIndex);
  const figureOrTable = findTableElementInWrapper(wrapper, tableIndex);
  if (!figureOrTable) {
    setMessage('너비를 바꿀 표를 먼저 클릭해 주세요.');
    return false;
  }

  const table = getActualTable(figureOrTable);
  if (!table) {
    setMessage('표를 찾을 수 없습니다.');
    return false;
  }

  const normalizedWidth = `${Math.max(20, Number(widthPx))}px`;

  Array.from(table.rows).forEach((row) => {
    const cell = row.cells[colIndex];
    if (cell) cell.style.setProperty('width', normalizedWidth);
  });

  setEditorHtml(sectionKey, wrapper.innerHTML);
  setMessage(`${colIndex + 1}번째 컬럼 너비를 ${normalizedWidth}로 변경했습니다.`, false);
  return true;
}

function getSelectedColCurrentWidth(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return '';
  const tableIndex = Number(binding.selectedTableIndex);
  const colIndex = binding.selectedColIndex;
  if (!Number.isInteger(tableIndex) || !Number.isInteger(colIndex)) return '';

  // 1) 소스 HTML의 셀 style에서 읽기
  const wrapper = document.createElement('div');
  wrapper.innerHTML = getSectionSourceHtml(sectionKey) || getEditorHtml(sectionKey);
  const figureOrTable = findTableElementInWrapper(wrapper, tableIndex);
  if (figureOrTable) {
    const table = getActualTable(figureOrTable);
    if (table) {
      const firstRow = table.rows[0];
      const cell = firstRow?.cells[colIndex];
      if (cell) {
        const w = cell.style.getPropertyValue('width') || cell.getAttribute('width');
        if (w) { const n = parseInt(w, 10); if (n > 0) return n; }
      }
    }
  }

  // 2) 렌더링된 에디터 DOM에서 읽기
  const editableRoot = binding.editableRoot;
  if (editableRoot) {
    const liveTables = Array.from(editableRoot.querySelectorAll('figure.table, table'));
    const liveTarget = liveTables[tableIndex];
    if (liveTarget) {
      const liveTable = liveTarget.tagName === 'TABLE' ? liveTarget : liveTarget.querySelector('table');
      if (liveTable) {
        const liveCell = liveTable.rows[0]?.cells[colIndex];
        if (liveCell) {
          const w = liveCell.style.getPropertyValue('width') || liveCell.getAttribute('width');
          if (w) { const n = parseInt(w, 10); if (n > 0) return n; }
          const computed = liveCell.getBoundingClientRect().width;
          if (computed > 0) return Math.round(computed);
        }
      }
    }
  }

  return '';
}

function promptAndApplyColWidth(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding || !Number.isInteger(binding.selectedColIndex)) {
    setMessage('너비를 바꿀 컬럼(셀)을 먼저 클릭해 주세요.');
    return;
  }
  const colNum = binding.selectedColIndex + 1;
  const currentWidth = getSelectedColCurrentWidth(sectionKey);
  const defaultVal = currentWidth || '200';
  const input = window.prompt(`${colNum}번째 컬럼 너비(px)를 입력해 주세요.${currentWidth ? ' (현재: ' + currentWidth + 'px)' : ''}`, String(defaultVal));
  if (input === null) return;

  const widthPx = Number(String(input).trim());
  applySelectedColWidth(sectionKey, widthPx);
}

function convertFigureMediaToVideoBlock(figure) {
  const videoUrl = normalizeUploadedMediaUrl(figure.querySelector('oembed')?.getAttribute('url') || '');
  if (!videoUrl) return figure;

  const wrapper = document.createElement('div');
  wrapper.className = 'detail-editor-video detail-media-size';
  wrapper.style.setProperty('--detail-media-height-pc', '360px');

  const video = document.createElement('video');
  video.setAttribute('controls', 'controls');
  video.setAttribute('playsinline', 'playsinline');
  video.setAttribute('preload', 'metadata');
  video.setAttribute('src', videoUrl);

  const source = document.createElement('source');
  source.setAttribute('src', videoUrl);
  video.appendChild(source);
  wrapper.appendChild(video);

  figure.replaceWith(wrapper);
  return wrapper;
}

function applyMediaHeightToElement(element, heightPx) {
  if (!element) return;

  const normalizedHeight = `${Math.max(120, Number(heightPx || 0))}px`;
  if (element.matches('img')) {
    element.classList.add('detail-image-size', 'detail-media-size');
    element.style.setProperty('--detail-media-height-pc', normalizedHeight);
    return;
  }

  const target = element.matches('figure.media') ? convertFigureMediaToVideoBlock(element) : element;
  if (!(target instanceof Element)) return;
  target.classList.add('detail-media-size');
  if (target.matches('.detail-editor-video')) {
    target.style.setProperty('--detail-media-height-pc', normalizedHeight);
  }
}

function applySelectedMediaSize(sectionKey, heightPx) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return false;

  if (!Number.isFinite(Number(heightPx)) || Number(heightPx) <= 0) {
    setMessage('유효한 높이(px)를 입력해 주세요.');
    return false;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = getSectionSourceHtml(sectionKey) || getEditorHtml(sectionKey);
  const mediaElements = getSelectableMediaElements(wrapper);
  const mediaIndex = Number(binding.selectedMediaIndex);
  const target = Number.isInteger(mediaIndex) ? mediaElements[mediaIndex] : null;

  if (!target) {
    setMessage('크기를 바꿀 이미지나 동영상을 먼저 클릭해 주세요.');
    return false;
  }

  applyMediaHeightToElement(target, heightPx);
  setEditorHtml(sectionKey, wrapper.innerHTML);
  setMessage(`선택한 미디어 높이를 ${Math.max(120, Number(heightPx || 0))}px로 변경했습니다.`, false);
  return true;
}

function getSelectedMediaCurrentHeight(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return '';
  const mediaIndex = Number(binding.selectedMediaIndex);
  if (!Number.isInteger(mediaIndex) || mediaIndex < 0) return '';

  const wrapper = document.createElement('div');
  wrapper.innerHTML = getSectionSourceHtml(sectionKey) || getEditorHtml(sectionKey);
  const mediaElements = getSelectableMediaElements(wrapper);
  const target = mediaElements[mediaIndex];
  if (target) {
    const h = target.style.getPropertyValue('--detail-media-height-pc');
    if (h) { const n = parseInt(h, 10); if (n > 0) return n; }
  }

  const editableRoot = binding.editableRoot;
  if (editableRoot) {
    const liveMedia = getSelectableMediaElements(editableRoot);
    const liveTarget = liveMedia[mediaIndex];
    if (liveTarget) {
      const h = liveTarget.style.getPropertyValue('--detail-media-height-pc');
      if (h) { const n = parseInt(h, 10); if (n > 0) return n; }
      const computed = liveTarget.getBoundingClientRect().height;
      if (computed > 0) return Math.round(computed);
    }
  }
  return '';
}

function promptAndApplyMediaSize(sectionKey) {
  const currentHeight = getSelectedMediaCurrentHeight(sectionKey);
  const defaultVal = currentHeight || '600';
  const input = window.prompt(`PC 높이(px)를 입력해 주세요.${currentHeight ? ' (현재: ' + currentHeight + 'px)' : ''}`, String(defaultVal));
  if (input === null) return;

  const heightPx = Number(String(input).trim());
  applySelectedMediaSize(sectionKey, heightPx);
}

function selectSourceRange(sectionKey, start, end) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return false;

  const value = String(binding.sourceInput.value || '');
  const safeStart = Math.max(0, Math.min(Number(start || 0), value.length));
  const safeEnd = Math.max(safeStart, Math.min(Number(end || safeStart), value.length));
  binding.sourceInput.focus();
  binding.sourceInput.setSelectionRange(safeStart, safeEnd);

  const linesBefore = value.substring(0, safeStart).split('\n').length;
  const totalLines = value.split('\n').length;
  const scrollRatio = totalLines > 1 ? (linesBefore - 1) / totalLines : 0;
  binding.sourceInput.scrollTop = Math.max(0, binding.sourceInput.scrollHeight * scrollRatio - binding.sourceInput.clientHeight / 3);
  return true;
}

function buildMediaSearchCandidates(element) {
  if (!(element instanceof Element)) return [];

  if (element.matches('img')) {
    const src = String(element.getAttribute('src') || '').trim();
    return src ? [`src="${src}"`, src] : [];
  }

  if (element.matches('.detail-editor-video')) {
    const video = element.querySelector('video');
    const src = String(video?.getAttribute('src') || video?.querySelector('source')?.getAttribute('src') || '').trim();
    const cleanSrc = stripEditorMediaMeta(src);
    const candidates = src ? [`src="${src}"`, src, '<div class="detail-editor-video'] : ['<div class="detail-editor-video'];
    if (cleanSrc && cleanSrc !== src) {
      candidates.push(`src="${cleanSrc}"`, cleanSrc);
    }
    return candidates;
  }

  if (element.matches('figure.media')) {
    const url = String(element.querySelector('oembed')?.getAttribute('url') || '').trim();
    const cleanUrl = stripEditorMediaMeta(url);
    const candidates = url ? [`url="${url}"`, url, '<figure class="media">'] : ['<figure class="media">'];
    if (cleanUrl && cleanUrl !== url) {
      candidates.push(`url="${cleanUrl}"`, cleanUrl);
    }
    return candidates;
  }

  return [];
}

function selectMatchingSourceForElement(sectionKey, element) {
  const binding = getEditorBinding(sectionKey);
  if (!binding || !(element instanceof Element)) return false;

  const source = String(binding.sourceInput.value || '');
  const candidates = buildMediaSearchCandidates(element);
  for (const candidate of candidates) {
    const start = source.indexOf(candidate);
    if (start >= 0) {
      return selectSourceRange(sectionKey, start, start + candidate.length);
    }
  }

  return false;
}

function syncSourceSelectionToEditor(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return false;

  const editableRoot = binding.editableRoot || binding.editorRoot;
  if (!editableRoot) return false;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;

  const range = selection.getRangeAt(0);
  const commonNode = range.commonAncestorContainer;
  const commonElement = commonNode.nodeType === Node.ELEMENT_NODE ? commonNode : commonNode.parentElement;
  if (!commonElement || !editableRoot.contains(commonElement)) return false;

  const selectedMedia = resolveSelectedMediaElement(commonElement);
  if (selectedMedia) {
    rememberSelectedMedia(sectionKey, selectedMedia, binding.editorRoot);
    return selectMatchingSourceForElement(sectionKey, selectedMedia);
  }

  const selectedText = String(selection.toString() || '').trim();
  if (!selectedText) return false;

  const source = String(binding.sourceInput.value || '');
  const start = source.indexOf(selectedText);
  if (start < 0) return false;
  return selectSourceRange(sectionKey, start, start + selectedText.length);
}

function revealEditorSelectionInSource(sectionKey) {
  syncSourceFromEditor(sectionKey);

  const binding = getEditorBinding(sectionKey);
  if (binding?.sourcePanel) {
    binding.sourcePanel.style.display = '';
  }

  const found = syncSourceSelectionToEditor(sectionKey);
  if (!found) {
    setMessage('에디터에서 선택한 내용과 일치하는 HTML 소스를 찾지 못했습니다. 이미지/동영상 또는 고유한 텍스트를 선택해 주세요.');
    return false;
  }

  if (binding?.sourceInput) {
    binding.sourceInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  setMessage('선택한 위치에 해당하는 HTML 소스를 표시했습니다.', false);
  return true;
}

function appendHtmlToEditor(sectionKey, html) {
  const currentHtml = getSectionSourceHtml(sectionKey) || getEditorHtml(sectionKey);
  const nextHtml = currentHtml ? `${currentHtml}\n${html}` : html;
  setEditorHtml(sectionKey, nextHtml);
}

function updatePreview(sectionKey, html) {
  const binding = getEditorBinding(sectionKey);
  if (!binding?.previewRoot) return;

  const nextHtml = String(html || '').trim();
  binding.previewRoot.innerHTML = nextHtml || '<p class="hint">미리보기 내용이 없습니다.</p>';
}

function getMediaSourceUrl(element) {
  if (!(element instanceof Element)) return '';

  if (element.matches('img')) {
    return normalizeUploadedMediaUrl(stripEditorMediaMeta(element.getAttribute('src') || ''));
  }

  if (element.matches('.detail-editor-video')) {
    return normalizeUploadedMediaUrl(
      stripEditorMediaMeta(
        element.getAttribute('data-oembed-url') ||
        element.querySelector('video')?.getAttribute('src') ||
        element.querySelector('source')?.getAttribute('src') ||
        element.querySelector('iframe')?.getAttribute('src') ||
        ''
      )
    );
  }

  if (element.matches('figure.media')) {
    return normalizeUploadedMediaUrl(
      stripEditorMediaMeta(
        element.getAttribute('data-oembed-url') ||
        element.querySelector('oembed')?.getAttribute('url') ||
        element.querySelector('video')?.getAttribute('src') ||
        element.querySelector('source')?.getAttribute('src') ||
        element.querySelector('iframe')?.getAttribute('src') ||
        ''
      )
    );
  }

  if (element.matches('.ck-media__wrapper') || element.matches('[data-oembed-url]')) {
    return normalizeUploadedMediaUrl(
      stripEditorMediaMeta(
        element.getAttribute('data-oembed-url') ||
        element.querySelector('video')?.getAttribute('src') ||
        element.querySelector('source')?.getAttribute('src') ||
        element.querySelector('iframe')?.getAttribute('src') ||
        ''
      )
    );
  }

  return '';
}

function copyMediaSizingStyle(sourceElement, targetElement) {
  if (!(sourceElement instanceof Element) || !(targetElement instanceof HTMLElement)) return;

  const properties = [
    '--detail-media-height-pc',
    '--detail-media-height-tablet',
    '--detail-media-height-phone',
    '--detail-media-tablet-ratio',
    '--detail-media-phone-ratio',
    '--detail-image-height',
    '--detail-image-height-pc',
    '--detail-image-height-tablet',
    '--detail-image-height-phone',
  ];

  properties.forEach((property) => {
    targetElement.style.removeProperty(property);
    const value = sourceElement.style.getPropertyValue(property).trim();
    if (value) {
      targetElement.style.setProperty(property, value);
    }
  });
}

function extractMediaSizing(sourceElement) {
  if (!(sourceElement instanceof Element)) {
    return {
      pcHeight: 360,
      tabletRatio: 0.8,
      phoneRatio: 0.62,
    };
  }

  const parsePx = (value, fallback) => {
    const match = String(value || '').trim().match(/^([0-9]+(?:\.[0-9]+)?)px$/i);
    return match ? Number(match[1]) : fallback;
  };
  const parseNumber = (value, fallback) => {
    const parsed = Number(String(value || '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    pcHeight: parsePx(sourceElement.style.getPropertyValue('--detail-media-height-pc'), 360),
    tabletRatio: parseNumber(sourceElement.style.getPropertyValue('--detail-media-tablet-ratio'), 0.8),
    phoneRatio: parseNumber(sourceElement.style.getPropertyValue('--detail-media-phone-ratio'), 0.62),
  };
}

function getResponsiveMediaHeight(sizing) {
  const width = window.innerWidth || 1280;
  if (width <= 599) {
    return `${Math.max(120, Math.round(sizing.pcHeight * sizing.phoneRatio))}px`;
  }
  if (width <= 1023) {
    return `${Math.max(120, Math.round(sizing.pcHeight * sizing.tabletRatio))}px`;
  }
  return `${Math.max(120, Math.round(sizing.pcHeight))}px`;
}

function applyRenderedMediaSizing(sourceElement, targetElement) {
  if (!(sourceElement instanceof Element) || !(targetElement instanceof Element)) return;

  const sizing = extractMediaSizing(sourceElement);
  const computedHeight = getResponsiveMediaHeight(sizing);

  if (targetElement instanceof HTMLElement) {
    copyMediaSizingStyle(sourceElement, targetElement);
  }

  if (targetElement.matches('img') && targetElement instanceof HTMLElement) {
    targetElement.style.height = computedHeight;
    targetElement.style.maxHeight = 'none';
    targetElement.style.width = 'auto';
    targetElement.style.maxWidth = '100%';
    return;
  }

  const renderedMedia = targetElement.matches('video, iframe')
    ? targetElement
    : targetElement.querySelector('video, iframe');

  if (targetElement.matches('.detail-editor-video') && targetElement instanceof HTMLElement) {
    targetElement.style.height = 'auto';
    targetElement.style.maxWidth = '100%';
  }

  if (renderedMedia instanceof HTMLElement) {
    renderedMedia.style.setProperty('height', computedHeight, 'important');
    renderedMedia.style.setProperty('max-height', 'none', 'important');
    renderedMedia.style.setProperty('width', 'auto', 'important');
    renderedMedia.style.setProperty('max-width', '100%', 'important');
  }

  const ckWrapper = targetElement.closest('.ck-media__wrapper') || targetElement.querySelector('.ck-media__wrapper');
  if (ckWrapper instanceof HTMLElement) {
    ckWrapper.style.setProperty('max-height', 'none', 'important');
    ckWrapper.style.setProperty('overflow', 'visible', 'important');
  }
}

function addSizingClasses(sourceElement, targetElement) {
  if (!(sourceElement instanceof Element) || !(targetElement instanceof Element)) return;

  ['detail-image-size', 'detail-media-size', 'detail-editor-video'].forEach((className) => {
    if (sourceElement.classList.contains(className)) {
      targetElement.classList.add(className);
    }
  });
}

function syncRenderedMediaAttributesFromSource(sectionKey, sourceHtml) {
  const binding = getEditorBinding(sectionKey);
  const editableRoot = binding?.editableRoot;
  if (!binding || !editableRoot) return;

  const sourceWrapper = document.createElement('div');
  sourceWrapper.innerHTML = normalizeMediaMarkup(sourceHtml);

  const sourceImages = Array.from(sourceWrapper.querySelectorAll('img'));
  const renderedImages = Array.from(editableRoot.querySelectorAll('img'));
  sourceImages.forEach((sourceImage) => {
    const sourceUrl = getMediaSourceUrl(sourceImage);
    const renderedImage = renderedImages.find((candidate) => getMediaSourceUrl(candidate) === sourceUrl) || null;
    if (!renderedImage) return;

    addSizingClasses(sourceImage, renderedImage);
    applyRenderedMediaSizing(sourceImage, renderedImage);
  });

  const sourceVideoBlocks = Array.from(sourceWrapper.querySelectorAll('.detail-editor-video, figure.media'));
  const renderedVideoBlocks = Array.from(editableRoot.querySelectorAll('.detail-editor-video, figure.media, .ck-media__wrapper'));
  sourceVideoBlocks.forEach((sourceBlock) => {
    const sourceUrl = getMediaSourceUrl(sourceBlock);
    const renderedBlock = renderedVideoBlocks.find((candidate) => {
      const candidateUrl = getMediaSourceUrl(candidate);
      if (candidateUrl === sourceUrl) return true;
      const innerBlock = candidate.querySelector('.detail-editor-video, figure.media');
      return innerBlock ? getMediaSourceUrl(innerBlock) === sourceUrl : false;
    }) || null;
    if (!renderedBlock) return;

    addSizingClasses(sourceBlock, renderedBlock);
    applyRenderedMediaSizing(sourceBlock, renderedBlock);

    const innerVideoBlock = renderedBlock.querySelector('.detail-editor-video');
    if (innerVideoBlock) {
      addSizingClasses(sourceBlock, innerVideoBlock);
      applyRenderedMediaSizing(sourceBlock, innerVideoBlock);
    }

    const renderedVideo = renderedBlock.querySelector('video');
    if (renderedVideo instanceof HTMLElement) {
      applyRenderedMediaSizing(sourceBlock, renderedVideo);
    }

    const renderedIframe = renderedBlock.querySelector('iframe');
    if (renderedIframe instanceof HTMLElement) {
      applyRenderedMediaSizing(sourceBlock, renderedIframe);
    }
  });

  const sourceTables = Array.from(sourceWrapper.querySelectorAll('table'));
  const renderedTables = Array.from(editableRoot.querySelectorAll('table'));
  sourceTables.forEach((sourceTable, index) => {
    const renderedTable = renderedTables[index];
    if (!renderedTable) return;
    Array.from(sourceTable.classList).forEach((cls) => {
      renderedTable.classList.add(cls);
    });
    const sourceColgroup = sourceTable.querySelector('colgroup');
    if (sourceColgroup && !renderedTable.querySelector('colgroup')) {
      renderedTable.insertBefore(sourceColgroup.cloneNode(true), renderedTable.firstChild);
    } else if (sourceColgroup && renderedTable.querySelector('colgroup')) {
      renderedTable.querySelector('colgroup').replaceWith(sourceColgroup.cloneNode(true));
    }
    Array.from(sourceTable.rows).forEach((sourceRow, rowIndex) => {
      const renderedRow = renderedTable.rows[rowIndex];
      if (!renderedRow) return;
      Array.from(sourceRow.cells).forEach((sourceCell, cellIndex) => {
        const renderedCell = renderedRow.cells[cellIndex];
        if (!renderedCell) return;
        const w = sourceCell.style.getPropertyValue('width');
        if (w) renderedCell.style.setProperty('width', w);
      });
    });
  });

  const sourceTableFigures = Array.from(sourceWrapper.querySelectorAll('figure.table'));
  const renderedTableFigures = Array.from(editableRoot.querySelectorAll('figure.table'));
  sourceTableFigures.forEach((sourceFigure, index) => {
    const renderedFigure = renderedTableFigures[index];
    if (!(renderedFigure instanceof HTMLElement)) return;
    const width = sourceFigure.style.getPropertyValue('width').trim();
    const marginLeft = sourceFigure.style.getPropertyValue('margin-left').trim();
    const marginRight = sourceFigure.style.getPropertyValue('margin-right').trim();
    if (width) renderedFigure.style.setProperty('width', width);
    if (marginLeft) renderedFigure.style.setProperty('margin-left', marginLeft);
    if (marginRight) renderedFigure.style.setProperty('margin-right', marginRight);
  });
}

function scheduleRenderedMediaSync(sectionKey, sourceHtml, attempt = 0) {
  syncRenderedMediaAttributesFromSource(sectionKey, sourceHtml);
  if (attempt >= 8) return;
  window.setTimeout(() => {
    scheduleRenderedMediaSync(sectionKey, sourceHtml, attempt + 1);
  }, 80 * (attempt + 1));
}

function observeRenderedMediaSync(sectionKey, sourceHtml) {
  const binding = getEditorBinding(sectionKey);
  const editableRoot = binding?.editableRoot;
  if (!binding || !editableRoot || typeof MutationObserver === 'undefined') return;

  if (binding.mediaSyncObserver) {
    binding.mediaSyncObserver.disconnect();
    binding.mediaSyncObserver = null;
  }

  let pendingTimer = 0;
  const schedule = () => {
    if (pendingTimer) return;
    pendingTimer = window.setTimeout(() => {
      pendingTimer = 0;
      syncRenderedMediaAttributesFromSource(sectionKey, sourceHtml);
    }, 60);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(editableRoot, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'src', 'data-oembed-url'],
  });

  binding.mediaSyncObserver = observer;
  window.setTimeout(() => {
    observer.disconnect();
    if (binding.mediaSyncObserver === observer) {
      binding.mediaSyncObserver = null;
    }
  }, 2200);
}

const SIZING_PROPERTIES = [
  '--detail-media-height-pc',
  '--detail-media-height-tablet',
  '--detail-media-height-phone',
  '--detail-media-tablet-ratio',
  '--detail-media-phone-ratio',
  '--detail-image-height',
  '--detail-image-height-pc',
  '--detail-image-height-tablet',
  '--detail-image-height-phone',
];

function captureElementSizing(element) {
  if (!(element instanceof Element)) return null;
  const sizing = {};
  let hasValue = false;
  SIZING_PROPERTIES.forEach((prop) => {
    const value = element.style.getPropertyValue(prop).trim();
    if (value) {
      sizing[prop] = value;
      hasValue = true;
    }
  });
  const classes = [];
  ['detail-image-size', 'detail-media-size', 'detail-editor-video'].forEach((cls) => {
    if (element.classList.contains(cls)) classes.push(cls);
  });
  return hasValue || classes.length ? { sizing, classes } : null;
}

function applyCachedSizing(element, cached) {
  if (!(element instanceof HTMLElement) || !cached) return;
  SIZING_PROPERTIES.forEach((prop) => {
    element.style.removeProperty(prop);
    if (cached.sizing[prop]) {
      element.style.setProperty(prop, cached.sizing[prop]);
    }
  });
  (cached.classes || []).forEach((cls) => element.classList.add(cls));
}

function cacheMediaSizingFromHtml(html) {
  if (!html) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;

  Array.from(wrapper.querySelectorAll('img')).forEach((img) => {
    const url = getMediaSourceUrl(img);
    const data = captureElementSizing(img);
    if (url && data) mediaSizingCache.set(url, data);
  });

  Array.from(wrapper.querySelectorAll('.detail-editor-video, figure.media')).forEach((block) => {
    const url = getMediaSourceUrl(block);
    const data = captureElementSizing(block);
    if (url && data) mediaSizingCache.set(url, data);
  });

  Array.from(wrapper.querySelectorAll('table')).forEach((table, index) => {
    const classList = Array.from(table.classList).filter(Boolean);
    const colgroup = table.querySelector('colgroup');
    const colgroupHtml = colgroup ? colgroup.outerHTML : '';
    if (classList.length || colgroupHtml) {
      mediaSizingCache.set(`__table_${index}`, { sizing: {}, classes: classList, colgroupHtml });
    }
  });

  Array.from(wrapper.querySelectorAll('figure.table')).forEach((figure, index) => {
    const width = figure.style.getPropertyValue('width').trim();
    const marginLeft = figure.style.getPropertyValue('margin-left').trim();
    const marginRight = figure.style.getPropertyValue('margin-right').trim();
    if (width || marginLeft || marginRight) {
      mediaSizingCache.set(`__table_figure_${index}`, { width, marginLeft, marginRight });
    }
  });
}

function restoreMediaSizingToHtml(html) {
  if (!html) return html || '';
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;

  Array.from(wrapper.querySelectorAll('img')).forEach((img) => {
    const url = getMediaSourceUrl(img);
    if (!url) return;
    const existing = captureElementSizing(img);
    if (existing && Object.keys(existing.sizing).length) return;
    const cached = mediaSizingCache.get(url);
    if (cached) applyCachedSizing(img, cached);
  });

  Array.from(wrapper.querySelectorAll('.detail-editor-video, figure.media')).forEach((block) => {
    const url = getMediaSourceUrl(block);
    if (!url) return;
    const existing = captureElementSizing(block);
    if (existing && Object.keys(existing.sizing).length) return;
    const cached = mediaSizingCache.get(url);
    if (cached) applyCachedSizing(block, cached);
  });

  Array.from(wrapper.querySelectorAll('table')).forEach((table, index) => {
    if (table.classList.length) return;
    const cached = mediaSizingCache.get(`__table_${index}`);
    if (cached && cached.classes) {
      cached.classes.forEach((cls) => table.classList.add(cls));
    }
    if (cached && cached.colgroupHtml && !table.querySelector('colgroup')) {
      const temp = document.createElement('table');
      temp.innerHTML = cached.colgroupHtml;
      const restoredColgroup = temp.querySelector('colgroup');
      if (restoredColgroup) table.insertBefore(restoredColgroup, table.firstChild);
    }
  });

  Array.from(wrapper.querySelectorAll('figure.table')).forEach((figure, index) => {
    const cached = mediaSizingCache.get(`__table_figure_${index}`);
    if (!cached) return;
    if (cached.width && !figure.style.getPropertyValue('width')) figure.style.setProperty('width', cached.width);
    if (cached.marginLeft && !figure.style.getPropertyValue('margin-left')) figure.style.setProperty('margin-left', cached.marginLeft);
    if (cached.marginRight && !figure.style.getPropertyValue('margin-right')) figure.style.setProperty('margin-right', cached.marginRight);
  });

  return wrapper.innerHTML;
}

function convertOembedToIframes(html) {
  const raw = String(html || '').trim();
  if (!raw) return raw;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = raw;

  // Handle <oembed url="..."> (CKEditor non-preview output)
  const oembeds = Array.from(wrapper.querySelectorAll('oembed[url]'));
  oembeds.forEach((oembed) => {
    const url = String(oembed.getAttribute('url') || '').trim();
    if (!url) return;

    const embedSrc = extractEmbedSrc(url);
    if (!embedSrc) return;

    const parentFigure = oembed.closest('figure.media');
    const iframe = buildIframeFromFigure(embedSrc, parentFigure);

    if (parentFigure) {
      parentFigure.replaceWith(iframe);
    } else {
      oembed.replaceWith(iframe);
    }
  });

  // Handle CKEditor previewsInData output: <figure class="media"><div data-oembed-url="...">...</div></figure>
  const oembedDivs = Array.from(wrapper.querySelectorAll('figure.media > div[data-oembed-url]'));
  oembedDivs.forEach((div) => {
    const url = String(div.getAttribute('data-oembed-url') || '').trim();
    if (!url) return;

    const embedSrc = extractEmbedSrc(url);
    if (!embedSrc) return;

    const parentFigure = div.closest('figure.media');
    const iframe = buildIframeFromFigure(embedSrc, parentFigure);

    if (parentFigure) {
      parentFigure.replaceWith(iframe);
    } else {
      div.replaceWith(iframe);
    }
  });

  return wrapper.innerHTML;
}

function extractEmbedSrc(url) {
  const ytWatch = url.match(/youtube\.com\/watch\?v=([^&#]+)/i) || url.match(/youtu\.be\/([^?&#]+)/i);
  if (ytWatch) return 'https://www.youtube.com/embed/' + ytWatch[1];

  const ytEmbed = url.match(/youtube\.com\/embed\/([^?&#]+)/i);
  if (ytEmbed) return 'https://www.youtube.com/embed/' + ytEmbed[1];

  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/i);
  if (vimeoMatch) return 'https://player.vimeo.com/video/' + vimeoMatch[1];

  return '';
}

function buildIframeFromFigure(embedSrc, parentFigure) {
  const figureStyle = parentFigure ? parentFigure.getAttribute('style') || '' : '';
  const pcHeightMatch = figureStyle.match(/--detail-media-height-pc:\s*(\d+)px/);
  const pcWidthMatch = figureStyle.match(/--detail-iframe-width:\s*(\d+)px/);
  const height = pcHeightMatch ? pcHeightMatch[1] : '450';
  const width = pcWidthMatch ? pcWidthMatch[1] : null;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('width', width || '100%');
  iframe.setAttribute('height', height);
  iframe.setAttribute('src', embedSrc);
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  iframe.setAttribute('allowfullscreen', '');
  return iframe;
}

function syncSourceFromEditor(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return;
  cacheMediaSizingFromHtml(binding.sourceInput.value);
  const editorOutput = getEditorHtml(sectionKey);
  const restored = restoreMediaSizingToHtml(editorOutput);
  const withIframes = convertOembedToIframes(restored);
  binding.sourceInput.value = formatHtmlForSource(withIframes);
  updatePreview(sectionKey, binding.sourceInput.value);
}

function setEditorHtml(sectionKey, html) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return;

  const nextHtml = normalizeMediaMarkup(html);
  cacheMediaSizingFromHtml(nextHtml);
  const editorHtml = convertVideosToEditorEmbeds(nextHtml);
  if (typeof binding.editor.setData === 'function') {
    binding.editor.setData(editorHtml || '<p></p>');
  } else if (typeof binding.editor.setHTML === 'function') {
    binding.editor.setHTML(editorHtml || '<p></p>');
  }
  binding.sourceInput.value = formatHtmlForSource(nextHtml);
  updatePreview(sectionKey, binding.sourceInput.value);
  scheduleRenderedMediaSync(sectionKey, nextHtml);
  observeRenderedMediaSync(sectionKey, nextHtml);
}

function applyDefaultImageSizingToEditor(sectionKey, imageUrl) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return false;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = getSectionSourceHtml(sectionKey) || getEditorHtml(sectionKey);

  const normalizedTargetUrl = normalizeUploadedMediaUrl(imageUrl);
  const images = Array.from(wrapper.querySelectorAll('img'));
  const reversedImages = images.slice().reverse();
  const targetImage =
    reversedImages.find((img) => normalizeUploadedMediaUrl(img.getAttribute('src')) === normalizedTargetUrl) ||
    reversedImages[0] ||
    null;

  if (!targetImage) return false;

  targetImage.classList.add('detail-image-size');
  targetImage.classList.add('detail-media-size');
  targetImage.removeAttribute('width');
  targetImage.removeAttribute('height');
  targetImage.style.removeProperty('width');
  targetImage.style.removeProperty('height');
  targetImage.style.removeProperty('--detail-image-height');
  targetImage.style.removeProperty('--detail-image-height-pc');
  targetImage.style.removeProperty('--detail-image-height-tablet');
  targetImage.style.removeProperty('--detail-image-height-phone');
  targetImage.style.setProperty('--detail-media-height-pc', '360px');

  setEditorHtml(sectionKey, wrapper.innerHTML);
  return true;
}

function scheduleDefaultImageSizing(sectionKey, imageUrl, attempt = 0) {
  const applied = applyDefaultImageSizingToEditor(sectionKey, imageUrl);
  syncSourceFromEditor(sectionKey);

  if (applied || attempt >= 10) return;

  window.setTimeout(() => {
    scheduleDefaultImageSizing(sectionKey, imageUrl, attempt + 1);
  }, 120);
}

function fillFormByCard() {
  const current = getCurrentSectionContent(readCurrentCardOverride());
  SECTION_DEFINITIONS.forEach((section) => {
    setEditorHtml(section.key, current[section.key] || '');
  });
}

async function fetchOverrideState() {
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) {
    throw new Error('Supabase 설정이 비어 있습니다.');
  }

  const endpoint = `${cfg.url}/rest/v1/site_state?key=eq.${encodeURIComponent(cfg.detailStateKey)}&select=value&limit=1`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`상세 상태 조회 실패: ${response.status}`);
  }

  const rows = await response.json();
  const value = rows?.[0]?.value;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function saveOverrideState(state) {
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) {
    throw new Error('Supabase 설정이 비어 있습니다.');
  }

  const endpoint = `${cfg.url}/rest/v1/site_state?on_conflict=key`;
  const payload = [{ key: cfg.detailStateKey, value: state }];

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`상세 상태 저장 실패: ${response.status}`);
  }
}

function buildOverridePayload() {
  const payload = {};
  SECTION_DEFINITIONS.forEach((section) => {
    const html = normalizeRichHtml(getSectionSourceHtml(section.key) || getEditorHtml(section.key));
    payload[section.key] = html;
  });
  return payload;
}

function buildImageSnippet() {
  return [
    '<figure>',
    `  <img src="${getDetailMediaBaseUrl()}/images/sample.webp" alt="이미지 설명" class="detail-image-size detail-media-size" style="--detail-media-height-pc: 360px;" />`,
    '  <figcaption>이미지 설명을 입력하세요.</figcaption>',
    '</figure>',
  ].join('\n');
}

function buildVideoSnippet() {
  return [
    `<div class="detail-editor-video detail-media-size" style="--detail-media-height-pc: 360px;">`,
    `  <video controls playsinline preload="metadata" src="${getDetailMediaBaseUrl()}/videos/sample.mp4">`,
    `    <source src="${getDetailMediaBaseUrl()}/videos/sample.mp4" type="video/mp4" />`,
    '  </video>',
    '</div>',
    '<p>동영상 설명을 입력하세요.</p>',
  ].join('\n');
}

function buildTableSnippet() {
  return [
    '<table>',
    '  <thead>',
    '    <tr><th>항목</th><th>내용</th></tr>',
    '  </thead>',
    '  <tbody>',
    '    <tr><td>예시 1</td><td>설명을 입력하세요.</td></tr>',
    '    <tr><td>예시 2</td><td>설명을 입력하세요.</td></tr>',
    '  </tbody>',
    '</table>',
  ].join('\n');
}

function buildUploadedVideoHtml(videoUrl, file) {
  const caption = escapeHtml(stripFileExtension(file?.name) || '동영상 설명');
  const mimeType = escapeHtml(String(file?.type || 'video/mp4').trim() || 'video/mp4');

  return [
    `<div class="detail-editor-video detail-media-size" style="--detail-media-height-pc: 360px;">`,
    `  <video controls playsinline preload="metadata" src="${escapeHtml(videoUrl)}">`,
    `    <source src="${escapeHtml(videoUrl)}" type="${mimeType}" />`,
    '  </video>',
    '</div>',
    `<p>${caption}</p>`,
  ].join('\n');
}

function convertVideosToEditorEmbeds(html) {
  const raw = String(html || '').trim();
  if (!raw) return raw;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = raw;

  const explicitVideoBlocks = Array.from(wrapper.querySelectorAll('.detail-editor-video'));
  explicitVideoBlocks.forEach((block) => {
    const videoUrl = normalizeUploadedMediaUrl(
      block.getAttribute('data-oembed-url') ||
      block.querySelector('video')?.getAttribute('src') ||
      block.querySelector('source')?.getAttribute('src') ||
      ''
    );
    if (!videoUrl) return;

    const editorUrl = buildEditorMediaUrl(block, videoUrl);

    const embedFigure = document.createElement('figure');
    embedFigure.className = 'media detail-media-size';
    embedFigure.setAttribute('data-oembed-url', editorUrl);
    const style = String(block.getAttribute('style') || '').trim();
    if (style) {
      embedFigure.setAttribute('style', style);
    }

    const embed = document.createElement('oembed');
    embed.setAttribute('url', editorUrl);
    embedFigure.appendChild(embed);
    block.replaceWith(embedFigure);
  });

  const figures = Array.from(wrapper.querySelectorAll('figure'));
  figures.forEach((figure) => {
    if (figure.closest('.detail-editor-video')) return;

    const video = figure.querySelector('video');
    if (!video) return;

    const videoUrl = normalizeUploadedMediaUrl(video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || '');
    if (!videoUrl) return;

    const editorUrl = buildEditorMediaUrl(figure, videoUrl);

    const captionText = String(figure.querySelector('figcaption')?.textContent || '').trim();
    const embedFigure = document.createElement('figure');
    embedFigure.className = 'media';
    const embed = document.createElement('oembed');
    embed.setAttribute('url', editorUrl);
    embedFigure.appendChild(embed);
    figure.replaceWith(embedFigure);

    if (captionText) {
      const caption = document.createElement('p');
      caption.textContent = captionText;
      embedFigure.insertAdjacentElement('afterend', caption);
    }
  });

  const standaloneVideos = Array.from(wrapper.querySelectorAll('video'));
  standaloneVideos.forEach((video) => {
    if (video.closest('.detail-editor-video')) return;

    const videoUrl = normalizeUploadedMediaUrl(video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || '');
    if (!videoUrl) return;

    const editorUrl = buildEditorMediaUrl(video, videoUrl);

    const embedFigure = document.createElement('figure');
    embedFigure.className = 'media';
    const embed = document.createElement('oembed');
    embed.setAttribute('url', editorUrl);
    embedFigure.appendChild(embed);
    video.replaceWith(embedFigure);
  });

  // Convert YouTube/Vimeo iframes to oembed so CKEditor can render them
  const iframes = Array.from(wrapper.querySelectorAll('iframe'));
  iframes.forEach((iframe) => {
    // Skip iframes already inside CKEditor media figures (preview wrappers or oembed)
    if (iframe.closest('figure.media')) return;

    const src = String(iframe.getAttribute('src') || '').trim();
    if (!src) return;

    // Extract the watchable URL from embed URL
    let watchUrl = '';
    const ytMatch = src.match(/youtube\.com\/embed\/([^?&#]+)/i);
    if (ytMatch) {
      watchUrl = 'https://www.youtube.com/watch?v=' + ytMatch[1];
    }
    const vimeoMatch = src.match(/player\.vimeo\.com\/video\/([^?&#]+)/i);
    if (!watchUrl && vimeoMatch) {
      watchUrl = 'https://vimeo.com/' + vimeoMatch[1];
    }
    if (!watchUrl) {
      // For other iframes, keep as-is (GHS will preserve them)
      return;
    }

    const embedFigure = document.createElement('figure');
    embedFigure.className = 'media';
    const height = iframe.getAttribute('height') || iframe.style.height;
    const width = iframe.getAttribute('width') || iframe.style.width;
    const styleParts = [];
    if (height) styleParts.push('--detail-media-height-pc: ' + (String(height).replace(/px$/, '')) + 'px');
    if (width && width !== '100%') styleParts.push('--detail-iframe-width: ' + (String(width).replace(/px$/, '')) + 'px');
    if (styleParts.length) embedFigure.setAttribute('style', styleParts.join('; ') + ';');
    const oembed = document.createElement('oembed');
    oembed.setAttribute('url', watchUrl);
    embedFigure.appendChild(oembed);

    // Replace parent figure if iframe is inside one, otherwise replace iframe directly
    const parentFigure = iframe.closest('figure');
    if (parentFigure) {
      parentFigure.replaceWith(embedFigure);
    } else {
      iframe.replaceWith(embedFigure);
    }
  });

  return wrapper.innerHTML;
}

async function handleEditorImageUpload(blob, callback, sectionKey) {
  try {
    if (!isImageBlob(blob)) {
      throw new Error('이미지 파일만 업로드할 수 있습니다.');
    }

    setMessage('이미지 업로드 중입니다...', false);
    const imageUrl = await uploadEditorMedia(blob, 'image');
    callback(imageUrl, stripFileExtension(blob?.name) || '이미지 설명');
    window.setTimeout(() => {
      scheduleDefaultImageSizing(sectionKey, imageUrl);
    }, 0);
    setMessage('이미지를 업로드했습니다.', false);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '이미지 업로드 중 오류가 발생했습니다.');
  }

  return false;
}

function createImageUploadAdapter(loader, sectionKey) {
  return {
    async upload() {
      const file = await loader.file;
      setMessage('이미지 업로드 중입니다...', false);
      const imageUrl = await uploadEditorMedia(file, 'image');
      window.setTimeout(() => {
        scheduleDefaultImageSizing(sectionKey, imageUrl);
      }, 0);
      setMessage('이미지를 업로드했습니다.', false);
      return { default: imageUrl };
    },
    abort() {},
  };
}

function attachCkeditorUploadAdapter(editor, sectionKey) {
  editor.plugins.get('FileRepository').createUploadAdapter = (loader) => createImageUploadAdapter(loader, sectionKey);
}

async function uploadAndInsertVideo(sectionKey, file) {
  if (!isVideoBlob(file)) {
    throw new Error('동영상 파일만 업로드할 수 있습니다.');
  }

  setMessage('동영상 업로드 중입니다...', false);
  const videoUrl = await uploadEditorMedia(file, 'video');
  appendHtmlToEditor(sectionKey, buildUploadedVideoHtml(videoUrl, file));
  setMessage('동영상을 업로드했습니다.', false);
}

async function handleEditorVideoFiles(sectionKey, files) {
  const videoFiles = Array.from(files || []).filter(isVideoBlob);
  if (!videoFiles.length) return;

  for (const file of videoFiles) {
    await uploadAndInsertVideo(sectionKey, file);
  }
}

function extractVideoFilesFromClipboard(event) {
  const items = Array.from(event?.clipboardData?.items || []);
  return items
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter(isVideoBlob);
}

function registerEditorMediaInteractions(sectionKey, editorRoot) {
  const binding = getEditorBinding(sectionKey);
  const editableRoot = binding?.editableRoot || editorRoot;
  if (!editableRoot) return;

  editableRoot.addEventListener('click', (event) => {
    rememberSelectedMedia(sectionKey, event.target, editableRoot);
    rememberSelectedTable(sectionKey, event.target, editableRoot);
  });

  editableRoot.addEventListener('drop', async (event) => {
    const files = Array.from(event.dataTransfer?.files || []).filter(isVideoBlob);
    if (!files.length) return;

    event.preventDefault();
    event.stopPropagation();

    try {
      await handleEditorVideoFiles(sectionKey, files);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '동영상 업로드 중 오류가 발생했습니다.');
    }
  });

  editableRoot.addEventListener('paste', async (event) => {
    const files = extractVideoFilesFromClipboard(event);
    if (!files.length) return;

    event.preventDefault();
    event.stopPropagation();

    try {
      await handleEditorVideoFiles(sectionKey, files);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '동영상 업로드 중 오류가 발생했습니다.');
    }
  });
}

function openVideoUploadDialog(sectionKey) {
  if (!videoUploadInput) {
    setMessage('동영상 업로드 입력 요소를 찾지 못했습니다.');
    return;
  }

  pendingVideoUploadSectionKey = sectionKey;
  videoUploadInput.value = '';
  videoUploadInput.click();
}

function insertTemplate(sectionKey, template) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return;
  appendHtmlToEditor(sectionKey, template);
}

function toggleSourcePanel(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return;
  syncSourceFromEditor(sectionKey);
  binding.sourceInput.focus();
  binding.sourceInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function applySourceToEditor(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return;
  setEditorHtml(sectionKey, binding.sourceInput.value);
}

async function createEditorBindings() {
  const Editor = resolveCkeditorConstructor();
  if (!Editor) {
    throw new Error('CKEditor 5를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.');
  }

  for (const section of SECTION_DEFINITIONS) {
    const editorRoot = document.getElementById(section.editorId);
    const sourceInput = document.getElementById(section.sourceId);
    const previewRoot = document.getElementById(section.previewId);
    const sourcePanel = sourceInput?.closest('.source-panel');
    if (!editorRoot || !sourceInput || !sourcePanel) continue;

    let editor;
    try {
      editor = await Editor.create(editorRoot, {
        toolbar: {
          items: [
            'heading',
            '|',
            'bold',
            'italic',
            'link',
            'alignment',
            '|',
            'bulletedList',
            'numberedList',
            'outdent',
            'indent',
            '|',
            'insertTable',
            'blockQuote',
            'imageUpload',
            'mediaEmbed',
            '|',
            'undo',
            'redo',
          ],
          shouldNotGroupWhenFull: true,
        },
        link: {
          addTargetToExternalLinks: true,
        },
        alignment: {
          options: ['left', 'center', 'right', 'justify'],
        },
        image: {
          toolbar: ['imageStyle:inline', 'imageStyle:block', 'imageStyle:side', '|', 'toggleImageCaption', 'imageTextAlternative'],
        },
        table: {
          contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'],
        },
        htmlSupport: {
          allow: [
            {
              name: 'table',
              classes: true,
              styles: true,
              attributes: true,
            },
            {
              name: 'figure',
              classes: true,
              styles: true,
              attributes: true,
            },
            {
              name: 'div',
              classes: true,
              styles: true,
              attributes: true,
            },
            {
              name: 'img',
              classes: true,
              styles: true,
              attributes: true,
            },
            {
              name: 'video',
              classes: true,
              styles: true,
              attributes: true,
            },
            {
              name: 'source',
              classes: true,
              styles: true,
              attributes: true,
            },
            {
              name: 'iframe',
              classes: true,
              styles: true,
              attributes: true,
            },
          ],
        },
        mediaEmbed: {
          previewsInData: true,
          extraProviders: [
            {
              name: 'bitHappenVideo',
              url: /^https?:\/\/[^\s]+\.(mp4|webm|avi|mov|mkv)(\?[^#]*)?(#.*)?$/i,
              html: (match) => {
                const meta = parseEditorMediaMeta(match[0]);
                const videoUrl = escapeHtml(meta.cleanUrl);
                const style = buildEditorMediaStyleFromMeta(meta);
                const videoHeight = computeMetaPixelHeight(meta);
                return [
                  '<div class="detail-editor-video detail-media-size" data-oembed-url="' + videoUrl + '"' + (style ? ' style="' + escapeHtml(style) + '"' : ' style="--detail-media-height-pc: 360px;"') + '>',
                  '  <video controls playsinline preload="metadata" src="' + videoUrl + '" style="height: ' + videoHeight + 'px; max-height: none; width: auto; max-width: 100%;">',
                  '    <source src="' + videoUrl + '" />',
                  '  </video>',
                  '</div>',
                ].join('');
              },
            },
          ],
        },
        removePlugins: [
          'RealTimeCollaborativeComments',
          'RealTimeCollaborativeTrackChanges',
          'RealTimeCollaborativeRevisionHistory',
          'Comments',
          'TrackChanges',
          'TrackChangesData',
          'RevisionHistory',
          'PresenceList',
          'Pagination',
          'WProofreader',
          'MathType',
          'SlashCommand',
          'Template',
          'DocumentOutline',
          'FormatPainter',
          'PasteFromOfficeEnhanced',
        ],
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '알 수 없는 초기화 오류';
      throw new Error(`에디터 초기화 실패 (${section.key}): ${detail}`);
    }

    attachCkeditorUploadAdapter(editor, section.key);
    const editableRoot = typeof editor.ui?.getEditableElement === 'function' ? editor.ui.getEditableElement() : editorRoot;
    editor.model.document.on('change:data', () => syncSourceFromEditor(section.key));
    editorBindings.set(section.key, {
      editor,
      sourceInput,
      sourcePanel,
      previewRoot,
      editorRoot,
      editableRoot,
      selectedMediaIndex: -1,
      suppressSourceSync: false,
      mediaSyncObserver: null,
    });
    registerEditorMediaInteractions(section.key, editorRoot);
  }
}

async function handleDetailSave() {
  setMessage('');

  const cardId = cardSelect.value;
  if (!cardId) {
    setMessage('카드를 선택해 주세요.');
    return false;
  }

  try {
    const payload = buildOverridePayload();
    const next = { ...overrideState };
    next[cardId] = payload;

    await saveOverrideState(next);
    overrideState = next;
    setMessage('상세페이지 입력값을 저장했습니다.', false);
    return true;
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    return false;
  }
}

if (saveButton) {
  saveButton.addEventListener('click', () => {
    void handleDetailSave();
  });
}

clearButton.addEventListener('click', () => {
  SECTION_DEFINITIONS.forEach((section) => setEditorHtml(section.key, ''));
  setMessage('현재 카드 입력값을 비웠습니다. 저장 버튼을 누르면 반영됩니다.', false);
});

cardSelect.addEventListener('change', () => {
  fillFormByCard();
  setMessage('');
});

form.addEventListener('click', (event) => {
  const button = event.target.closest('[data-editor-action]');
  if (!button) return;

  const action = button.getAttribute('data-editor-action');
  const sectionKey = button.getAttribute('data-section');
  if (!action || !sectionKey) return;

  if (action === 'toggle-source') {
    toggleSourcePanel(sectionKey);
    return;
  }
  if (action === 'apply-source') {
    applySourceToEditor(sectionKey);
    return;
  }
  if (action === 'insert-image') {
    insertTemplate(sectionKey, buildImageSnippet());
    return;
  }
  if (action === 'upload-video') {
    openVideoUploadDialog(sectionKey);
    return;
  }
  if (action === 'insert-video') {
    insertTemplate(sectionKey, buildVideoSnippet());
    return;
  }
  if (action === 'sync-selection') {
    revealEditorSelectionInSource(sectionKey);
    return;
  }
  if (action === 'media-width-custom') {
    promptAndApplyMediaSize(sectionKey);
    return;
  }
  if (action === 'insert-table') {
    insertTemplate(sectionKey, buildTableSnippet());
    return;
  }
  if (action === 'table-width-custom') {
    promptAndApplyTableWidth(sectionKey);
    return;
  }
  if (action === 'col-width-custom') {
    promptAndApplyColWidth(sectionKey);
  }
});

if (videoUploadInput) {
  videoUploadInput.addEventListener('change', async () => {
    const targetSectionKey = pendingVideoUploadSectionKey;
    const files = Array.from(videoUploadInput.files || []).filter(isVideoBlob);
    pendingVideoUploadSectionKey = '';

    if (!targetSectionKey || !files.length) return;

    try {
      await handleEditorVideoFiles(targetSectionKey, files);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '동영상 업로드 중 오류가 발생했습니다.');
    }
  });
}

(async function init() {
  try {
    if (!window.BitHappenAdminAuth?.requireAuth) {
      throw new Error('관리자 인증 스크립트를 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    }

    if (!__session) {
      throw new Error('로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.');
    }

    buildCardOptions();
    await createEditorBindings();
    overrideState = await fetchOverrideState();
    fillFormByCard();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '초기화 중 오류가 발생했습니다.';
    setEditorHostStatus(errorMessage);
    setMessage(errorMessage);
  }
})();
