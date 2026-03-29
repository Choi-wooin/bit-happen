const __session = window.BitHappenAdminAuth?.requireAuth?.();
if (!__session) {
  throw new Error('not authenticated');
}

const form = document.getElementById('detail-form');
const cardSelect = document.getElementById('detail-card-id');
const painsInput = document.getElementById('detail-pains');
const howInput = document.getElementById('detail-how');
const scenariosInput = document.getElementById('detail-scenarios');
const integrationInput = document.getElementById('detail-integration');
const featuresInput = document.getElementById('detail-features');
const techSpecsInput = document.getElementById('detail-tech-specs');
const kpisInput = document.getElementById('detail-kpis');
const clearButton = document.getElementById('detail-clear');
const message = document.getElementById('detail-message');

const DETAIL_STATE_KEY_DEFAULT = 'detailOverrides';
let overrideState = {};

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

function parseLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function stringifyLines(items) {
  if (!Array.isArray(items)) return '';
  return items.join('\n');
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

function readCurrentCardOverride() {
  const id = cardSelect.value;
  if (!id) return null;
  return overrideState[id] || getDefaultOverrideByCardId(id) || null;
}

function fillFormByCard() {
  const current = readCurrentCardOverride();
  painsInput.value = stringifyLines(current?.pains);
  howInput.value = stringifyLines(current?.how);
  scenariosInput.value = stringifyLines(current?.scenarios);
  integrationInput.value = stringifyLines(current?.integration);
  featuresInput.value = stringifyLines(current?.features);
  techSpecsInput.value = current?.techSpecs ? JSON.stringify(current.techSpecs, null, 2) : '';
  kpisInput.value = current?.kpis ? JSON.stringify(current.kpis, null, 2) : '';
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
  const payload = [
    {
      key: cfg.detailStateKey,
      value: state,
    },
  ];

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

function parseJsonArrayField(value, label) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${label}은(는) JSON 배열이어야 합니다.`);
  }
  return parsed;
}

function buildOverridePayload() {
  const payload = {
    pains: parseLines(painsInput.value),
    how: parseLines(howInput.value),
    scenarios: parseLines(scenariosInput.value),
    integration: parseLines(integrationInput.value),
    features: parseLines(featuresInput.value),
  };

  const cleaned = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (Array.isArray(value) && value.length > 0) {
      cleaned[key] = value;
    }
  });

  const techSpecs = parseJsonArrayField(techSpecsInput.value, '기술 스펙');
  if (techSpecs && techSpecs.length > 0) {
    cleaned.techSpecs = techSpecs;
  }

  const kpis = parseJsonArrayField(kpisInput.value, 'KPI');
  if (kpis && kpis.length > 0) {
    cleaned.kpis = kpis;
  }

  return cleaned;
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
  painsInput.value = '';
  howInput.value = '';
  scenariosInput.value = '';
  integrationInput.value = '';
  featuresInput.value = '';
  techSpecsInput.value = '';
  kpisInput.value = '';
  setMessage('현재 카드 입력값을 비웠습니다. 저장 버튼을 누르면 반영됩니다.', false);
});

cardSelect.addEventListener('change', () => {
  fillFormByCard();
  setMessage('');
});

(async function init() {
  try {
    buildCardOptions();
    overrideState = await fetchOverrideState();
    fillFormByCard();
  } catch (error) {
    setMessage(error instanceof Error ? error.message : '초기화 중 오류가 발생했습니다.');
  }
})();
