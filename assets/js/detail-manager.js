const __session = window.BitHappenAdminAuth?.requireAuth?.();
if (!__session) {
  throw new Error('not authenticated');
}

const form = document.getElementById('detail-form');
const cardSelect = document.getElementById('detail-card-id');
const clearButton = document.getElementById('detail-clear');
const message = document.getElementById('detail-message');

const DETAIL_STATE_KEY_DEFAULT = 'detailOverrides';
const SECTION_DEFINITIONS = [
  { key: 'intentHtml', editorId: 'editor-intent', sourceId: 'detail-intent-html' },
  { key: 'architectureHtml', editorId: 'editor-architecture', sourceId: 'detail-architecture-html' },
  { key: 'referenceHtml', editorId: 'editor-reference', sourceId: 'detail-reference-html' },
];

let overrideState = {};
const editorBindings = new Map();

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

function getCurrentSectionContent(source) {
  if (!source || typeof source !== 'object') {
    return { intentHtml: '', architectureHtml: '', referenceHtml: '' };
  }

  const direct = {
    intentHtml: normalizeRichHtml(source.intentHtml),
    architectureHtml: normalizeRichHtml(source.architectureHtml),
    referenceHtml: normalizeRichHtml(source.referenceHtml),
  };

  if (direct.intentHtml || direct.architectureHtml || direct.referenceHtml) {
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
  return typeof binding.editor.getHTML === 'function' ? String(binding.editor.getHTML() || '').trim() : String(binding.sourceInput.value || '').trim();
}

function syncSourceFromEditor(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return;
  binding.sourceInput.value = getEditorHtml(sectionKey);
}

function setEditorHtml(sectionKey, html) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return;

  const nextHtml = String(html || '').trim();
  if (typeof binding.editor.setHTML === 'function') {
    binding.editor.setHTML(nextHtml || '<p></p>');
  }
  binding.sourceInput.value = nextHtml;
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
    const html = normalizeRichHtml(getEditorHtml(section.key));
    if (html) {
      payload[section.key] = html;
    }
  });
  return payload;
}

function buildImageSnippet() {
  return [
    '<figure>',
    '  <img src="assets/media/sample.webp" alt="이미지 설명" />',
    '  <figcaption>이미지 설명을 입력하세요.</figcaption>',
    '</figure>',
  ].join('\n');
}

function buildVideoSnippet() {
  return [
    '<figure>',
    '  <video controls playsinline preload="metadata" poster="assets/media/sample-poster.webp">',
    '    <source src="assets/media/sample.mp4" type="video/mp4" />',
    '  </video>',
    '  <figcaption>동영상 설명을 입력하세요.</figcaption>',
    '</figure>',
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

function insertTemplate(sectionKey, template) {
  const binding = getEditorBinding(sectionKey);
  if (!binding || typeof binding.editor.insertText !== 'function') return;
  binding.editor.insertText(`\n${template}\n`);
  syncSourceFromEditor(sectionKey);
}

function toggleSourcePanel(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return;
  if (binding.sourcePanel.hasAttribute('hidden')) {
    syncSourceFromEditor(sectionKey);
    binding.sourcePanel.removeAttribute('hidden');
    return;
  }
  binding.sourcePanel.setAttribute('hidden', 'hidden');
}

function applySourceToEditor(sectionKey) {
  const binding = getEditorBinding(sectionKey);
  if (!binding) return;
  setEditorHtml(sectionKey, binding.sourceInput.value);
}

function createEditorBindings() {
  const Editor = window.toastui?.Editor;
  if (!Editor) {
    throw new Error('TOAST UI Editor를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.');
  }

  SECTION_DEFINITIONS.forEach((section) => {
    const editorRoot = document.getElementById(section.editorId);
    const sourceInput = document.getElementById(section.sourceId);
    const sourcePanel = sourceInput?.closest('.source-panel');
    if (!editorRoot || !sourceInput || !sourcePanel) return;

    const editor = new Editor({
      el: editorRoot,
      height: '420px',
      initialEditType: 'wysiwyg',
      previewStyle: 'vertical',
      usageStatistics: false,
      hideModeSwitch: false,
      toolbarItems: [
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task', 'indent', 'outdent'],
        ['table', 'image', 'link'],
        ['code', 'codeblock'],
      ],
    });

    editor.on('change', () => syncSourceFromEditor(section.key));
    editorBindings.set(section.key, { editor, sourceInput, sourcePanel });
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');

  const cardId = cardSelect.value;
  if (!cardId) {
    setMessage('카드를 선택해 주세요.');
    return;
  }

  try {
    const payload = buildOverridePayload();
    const next = { ...overrideState };

    if (Object.keys(payload).length === 0) {
      delete next[cardId];
    } else {
      next[cardId] = payload;
    }

    await saveOverrideState(next);
    overrideState = next;
    setMessage('상세페이지 입력값을 저장했습니다.', false);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
  }
});

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
  if (action === 'insert-video') {
    insertTemplate(sectionKey, buildVideoSnippet());
    return;
  }
  if (action === 'insert-table') {
    insertTemplate(sectionKey, buildTableSnippet());
  }
});

(async function init() {
  try {
    buildCardOptions();
    createEditorBindings();
    overrideState = await fetchOverrideState();
    fillFormByCard();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '초기화 중 오류가 발생했습니다.');
  }
})();
