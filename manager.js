const form = document.getElementById('card-form');
const listRoot = document.getElementById('card-list');
const resetButton = document.getElementById('reset-cards');
const createNewButton = document.getElementById('create-new');

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
};

function getCards() {
  return window.BitHappenCardStore.getCards();
}

function saveCards(cards) {
  return window.BitHappenCardStore.saveCards(cards);
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
}

function updateCardSpan(id, span) {
  const cards = getCards().map((card) => {
    if (card.id !== id) return card;
    return { ...card, span };
  });
  saveCards(cards);
  renderList();
}

function movePriority(id, direction) {
  const cards = getCards();
  const target = cards.find((card) => card.id === id);
  if (!target) return;

  target.priority = Math.max(1, Number(target.priority) + direction);
  saveCards(cards);
  renderList();
}

function deleteCard(id) {
  const cards = getCards().filter((card) => card.id !== id);
  saveCards(cards);
  if (fields.id.value === id) {
    clearForm();
  }
  renderList();
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
      <p class="item-meta">${card.group.toUpperCase()} | ${card.badge} | ${card.span}칸</p>
      <div class="item-actions">
        <button type="button" data-action="edit">편집</button>
        <button type="button" data-action="up">우선순위 +</button>
        <button type="button" data-action="down">우선순위 -</button>
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
    item.querySelector('[data-action="span1"]').addEventListener('click', () => updateCardSpan(card.id, 1));
    item.querySelector('[data-action="span2"]').addEventListener('click', () => updateCardSpan(card.id, 2));
    item.querySelector('[data-action="span3"]').addEventListener('click', () => updateCardSpan(card.id, 3));
    item.querySelector('[data-action="span4"]').addEventListener('click', () => updateCardSpan(card.id, 4));
    item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteCard(card.id));

    listRoot.appendChild(item);
  });
}

form.addEventListener('submit', (event) => {
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
  };

  let next;
  if (isEdit) {
    next = cards.map((card) => (card.id === payload.id ? payload : card));
  } else {
    next = [...cards, payload];
  }

  saveCards(next);
  clearForm();
  renderList();
});

createNewButton.addEventListener('click', () => clearForm());

resetButton.addEventListener('click', () => {
  window.BitHappenCardStore.resetCards();
  clearForm();
  renderList();
});

clearForm();
renderList();
