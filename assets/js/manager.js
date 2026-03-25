const __session = window.BitHappenAdminAuth?.requireAuth?.();
if (!__session) {
  throw new Error('not authenticated');
}

const form = document.getElementById('card-form');
const listRoot = document.getElementById('card-list');
const resetButton = document.getElementById('reset-cards');
const createNewButton = document.getElementById('create-new');
const exportCardsSourceButton = document.getElementById('export-cards-source');

const fields = {
  id: document.getElementById('card-id'),
  group: document.getElementById('group'),
  badge: document.getElementById('badge'),
  title: document.getElementById('title'),
  copy: document.getElementById('copy'),
  features: document.getElementById('features'),
  industry: document.getElementById('industry'),
  period: document.getElementById('period'),
  integration: document.getElementById('integration'),
  tags: document.getElementById('tags'),
  priority: document.getElementById('priority'),
  span: document.getElementById('span'),
  ctaLabel: document.getElementById('cta-label'),
  ctaStyle: document.getElementById('cta-style'),
  enabled: document.getElementById('enabled'),
};

function getCards() {
  return window.BitHappenCardStore.getCards();
}

function saveCards(cards) {
  return window.BitHappenCardStore.saveCards(cards);
}

async function persistCards(cards) {
  const result = await saveCards(cards);
  if (result && result.remote === false) {
    alert('원격(Supabase) 저장에 실패했습니다. 네트워크/설정을 확인해 주세요.');
  }
  renderList();
}

if (__session.role !== 'super_admin') {
  resetButton.style.display = 'none';
}

function buildDefaultCardsSource(cards) {
  return `const defaultCards = ${JSON.stringify(cards, null, 2)};`;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function clearForm() {
  fields.id.value = '';
  fields.group.value = 'kiosk';
  fields.badge.value = 'Kiosk';
  fields.title.value = '';
  fields.copy.value = '';
  fields.features.value = '';
  fields.industry.value = '';
  fields.period.value = '';
  fields.integration.value = '';
  fields.tags.value = '';
  fields.priority.value = '100';
  fields.span.value = '1';
  fields.ctaLabel.value = '상세보기';
  fields.ctaStyle.value = 'primary';
  fields.enabled.checked = true;
}

function parseLines(value) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function fillForm(card) {
  fields.id.value = card.id;
  fields.group.value = card.group;
  fields.badge.value = card.badge;
  fields.title.value = card.title;
  fields.copy.value = card.copy;
  fields.features.value = card.features.join('\n');
  fields.industry.value = card.industry || '';
  fields.period.value = card.period || '';
  fields.integration.value = card.integration || '';
  fields.tags.value = (card.tags || []).join(', ');
  fields.priority.value = String(card.priority);
  fields.span.value = String(card.span || 1);
  fields.ctaLabel.value = card.ctaLabel || '상세보기';
  fields.ctaStyle.value = card.ctaStyle || 'primary';
  fields.enabled.checked = card.enabled !== false;
}

async function toggleEnabled(id) {
  const cards = getCards().map((card) => {
    if (card.id !== id) return card;
    return { ...card, enabled: card.enabled === false };
  });
  await persistCards(cards);
}

async function updateCardSpan(id, span) {
  const cards = getCards().map((card) => {
    if (card.id !== id) return card;
    return { ...card, span };
  });
  await persistCards(cards);
}

async function movePriority(id, direction) {
  const cards = getCards();
  const target = cards.find((card) => card.id === id);
  if (!target) return;

  target.priority = Math.max(1, Number(target.priority) + direction);
  await persistCards(cards);
}

async function deleteCard(id) {
  const cards = getCards().filter((card) => card.id !== id);
  await persistCards(cards);
  if (fields.id.value === id) {
    clearForm();
  }
}

function renderList() {
  const cards = getCards();
  listRoot.innerHTML = '';

  cards.forEach((card) => {
    const item = document.createElement('article');
    item.className = 'item';
    item.innerHTML = `
      <div class="item-top">
        <h3>${card.title}</h3>
        <strong>P${card.priority}</strong>
      </div>
      <p class="item-meta">${card.group.toUpperCase()} | ${card.badge} | ${card.span}칸 | ${card.enabled === false ? '비노출' : '노출'}</p>
      <div class="item-actions">
        <button type="button" data-action="edit">편집</button>
        <button type="button" data-action="up">우선순위 +</button>
        <button type="button" data-action="down">우선순위 -</button>
        <button type="button" data-action="toggle">노출 전환</button>
        <button type="button" data-action="span2">2칸</button>
        <button type="button" data-action="span3">3칸</button>
        <button type="button" data-action="span4">4칸</button>
        <button type="button" data-action="span1">1칸</button>
        <button type="button" data-action="delete">삭제</button>
      </div>
    `;

    item.querySelector('[data-action="edit"]').addEventListener('click', () => fillForm(card));
    item.querySelector('[data-action="up"]').addEventListener('click', () => movePriority(card.id, -1));
    item.querySelector('[data-action="down"]').addEventListener('click', () => movePriority(card.id, 1));
    item.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleEnabled(card.id));
    item.querySelector('[data-action="span1"]').addEventListener('click', () => updateCardSpan(card.id, 1));
    item.querySelector('[data-action="span2"]').addEventListener('click', () => updateCardSpan(card.id, 2));
    item.querySelector('[data-action="span3"]').addEventListener('click', () => updateCardSpan(card.id, 3));
    item.querySelector('[data-action="span4"]').addEventListener('click', () => updateCardSpan(card.id, 4));
    item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteCard(card.id));

    listRoot.appendChild(item);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const isEdit = Boolean(fields.id.value);
  const cards = getCards();

  const payload = {
    id: isEdit ? fields.id.value : `card-${Date.now()}`,
    group: fields.group.value,
    badge: fields.badge.value.trim(),
    title: fields.title.value.trim(),
    copy: fields.copy.value.trim(),
    features: parseLines(fields.features.value),
    industry: fields.industry.value.trim(),
    period: fields.period.value.trim(),
    integration: fields.integration.value.trim(),
    tags: parseTags(fields.tags.value),
    priority: Number(fields.priority.value),
    span: Number(fields.span.value),
    ctaLabel: fields.ctaLabel.value.trim() || '상세보기',
    ctaStyle: fields.ctaStyle.value,
    enabled: fields.enabled.checked,
  };

  let next;
  if (isEdit) {
    next = cards.map((card) => (card.id === payload.id ? payload : card));
  } else {
    next = [...cards, payload];
  }

  await persistCards(next);
  clearForm();
});

createNewButton.addEventListener('click', () => clearForm());

resetButton.addEventListener('click', async () => {
  if (__session.role !== 'super_admin') {
    alert('super admin만 기본값 초기화를 실행할 수 있습니다.');
    return;
  }

  const first = confirm('경고: 모든 값이 초기화 됩니다. 함부로 누르지 마세요.\n\n정말 계속하시겠습니까?');
  if (!first) return;

  const second = confirm('최종 확인: 현재 카드 설정(우선순위/크기/노출 포함)이 모두 기본값으로 되돌아갑니다.\n\n초기화를 실행할까요?');
  if (!second) return;

  const result = await window.BitHappenCardStore.resetCards();
  if (result && result.remote === false) {
    alert('원격(Supabase) 동기화에 실패했습니다. 로컬 기본값만 적용되었습니다.');
  }
  clearForm();
  renderList();
});

window.addEventListener('bitHappenCardsUpdated', () => {
  renderList();
});

exportCardsSourceButton.addEventListener('click', async () => {
  try {
    const source = buildDefaultCardsSource(getCards());
    await copyText(source);
    alert('현재 카드 상태를 cards-data.js용 코드로 복사했습니다. cards-data.js의 defaultCards 블록에 붙여넣어 저장하세요.');
  } catch (_error) {
    alert('코드 복사에 실패했습니다. 다시 시도해 주세요.');
  }
});

clearForm();
renderList();
