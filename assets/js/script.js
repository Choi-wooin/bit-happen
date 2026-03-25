const header = document.querySelector('.header');
const menuToggle = document.querySelector('.menu-toggle');
const megaHost = document.getElementById('mega-host');
const megaTrigger = document.getElementById('mega-trigger');
const planGrid = document.getElementById('plan-grid');

const segments = document.querySelectorAll('.segment');
let activeGroup = 'all';
let mediaLibraryCache = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveMediaPath(src) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith('/')) return value;
  if (value.startsWith('../assets/')) return value.slice(3);
  if (value.startsWith('./assets/')) return value.slice(2);
  if (value.startsWith('./') || value.startsWith('../')) return value;
  if (value.startsWith('assets/')) return value;
  return value;
}

function getSupabaseConfig() {
  const cfg = window.BitHappenSupabaseConfig || {};
  const url = String(cfg.url || '').trim().replace(/\/$/, '');
  const anonKey = String(cfg.anonKey || '').trim();
  const mediaStateKey = String(cfg.mediaStateKey || 'mediaLibrary').trim() || 'mediaLibrary';
  return {
    enabled: Boolean(url && anonKey),
    url,
    anonKey,
    mediaStateKey,
  };
}

async function fetchMediaLibraryFromSupabase() {
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) return null;

  try {
    const endpoint = `${cfg.url}/rest/v1/site_state?key=eq.${encodeURIComponent(cfg.mediaStateKey)}&select=value&limit=1`;
    const response = await fetch(endpoint, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
      },
    });

    if (!response.ok) return null;
    const rows = await response.json();
    const value = rows?.[0]?.value;
    return Array.isArray(value) ? value : null;
  } catch (_error) {
    return null;
  }
}

async function getMediaLibraryItems() {
  if (Array.isArray(mediaLibraryCache)) {
    return mediaLibraryCache;
  }

  const remote = await fetchMediaLibraryFromSupabase();
  if (Array.isArray(remote)) {
    mediaLibraryCache = remote;
    return mediaLibraryCache;
  }

  const sourceItems = window.BitHappenMediaLibrary?.items;
  mediaLibraryCache = Array.isArray(sourceItems) ? sourceItems : [];
  return mediaLibraryCache;
}

function getRepresentativeThumbByCardId(mediaItems, cardId) {
  if (!Array.isArray(mediaItems) || !cardId) return '';

  const imageItems = mediaItems.filter((item) => item && item.cardId === cardId && item.type === 'image' && item.src);
  if (!imageItems.length) return '';

  const representative = imageItems.find((item) => item.isRepresentative === true) || null;
  const selected = representative || imageItems[0];
  return resolveMediaPath(selected.src || '');
}

async function renderPlanCards(group = 'all') {
  activeGroup = group;
  if (!planGrid || !window.BitHappenCardStore) {
    return;
  }

  const cards = window.BitHappenCardStore.getCards();
  const mediaItems = await getMediaLibraryItems();
  const visibleCards = cards.filter(
    (card) => card.enabled !== false && (group === 'all' || card.group === group || card.group === 'all')
  );

  planGrid.innerHTML = '';

  visibleCards.forEach((card) => {
    const article = document.createElement('article');
    const span = Math.max(1, Math.min(4, Number(card.span) || 1));

    article.className = `plan-card span-${span}`;
    if (card.span >= 2) {
      article.classList.add('wide');
    }
    article.classList.add('plan-card-clickable');
    article.dataset.group = card.group;

    const features = (Array.isArray(card.features) ? card.features : [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');

    const tags = (Array.isArray(card.tags) ? card.tags : [])
      .map((tag) => `<span>${escapeHtml(tag)}</span>`)
      .join('');

    const ctaStyle = card.ctaStyle === 'ghost' ? 'ghost' : 'primary';
    const ctaLabel = '상세보기';
    const detailHref = `pages/solution-detail.html?id=${encodeURIComponent(card.id)}`;
    const representativeThumb = span >= 2 ? getRepresentativeThumbByCardId(mediaItems, card.id) : '';
    if (representativeThumb) {
      article.classList.add('has-lead-thumb');
    }

    const thumbMarkup = representativeThumb
      ? `<a class="plan-lead-thumb" href="${detailHref}" aria-label="${escapeHtml(
          card.title || '상세보기'
        )} 대표 이미지"><img src="${escapeHtml(representativeThumb)}" alt="${escapeHtml(card.title || '대표 이미지')}" loading="lazy" decoding="async" /></a>`
      : '';

    article.innerHTML = `
      <div class="plan-layout">
        ${thumbMarkup}
        <div class="plan-content">
          <p class="plan-badge">${escapeHtml(card.badge || 'Package')}</p>
          <h3><a class="plan-title-link" href="${detailHref}">${escapeHtml(card.title || '제목 없음')}</a></h3>
          <p class="plan-copy">${escapeHtml(card.copy || '')}</p>
          <ul>${features}</ul>
          <div class="plan-meta">
            <p><strong>적용 산업:</strong> ${escapeHtml(card.industry || '-')}</p>
            <p><strong>구축 기간:</strong> ${escapeHtml(card.period || '-')}</p>
            <p><strong>연동 범위:</strong> ${escapeHtml(card.integration || '-')}</p>
            <div class="plan-tags">${tags}</div>
          </div>
        </div>
      </div>
      <a href="${detailHref}" class="btn ${ctaStyle} plan-cta">${escapeHtml(ctaLabel)}</a>
    `;

    // 키오스크 UX처럼 카드 본문 어디를 눌러도 상세보기로 이동합니다.
    article.setAttribute('role', 'link');
    article.setAttribute('tabindex', '0');

    const openDetail = () => {
      window.location.href = detailHref;
    };

    article.addEventListener('click', (event) => {
      if (event.target.closest('a, button, input, select, textarea, label, summary, details')) {
        return;
      }
      openDetail();
    });

    article.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      if (event.target.closest('a, button, input, select, textarea, label, summary, details')) {
        return;
      }
      event.preventDefault();
      openDetail();
    });

    planGrid.appendChild(article);
  });
}

function openMega() {
  megaHost.classList.add('open');
  megaTrigger.setAttribute('aria-expanded', 'true');
}

function closeMega() {
  megaHost.classList.remove('open');
  megaTrigger.setAttribute('aria-expanded', 'false');
}

megaTrigger.addEventListener('click', () => {
  if (megaHost.classList.contains('open')) {
    closeMega();
  } else {
    openMega();
  }
});

megaHost.addEventListener('mouseenter', () => {
  if (window.matchMedia('(min-width: 781px)').matches) {
    openMega();
  }
});

megaHost.addEventListener('mouseleave', () => {
  if (window.matchMedia('(min-width: 781px)').matches) {
    closeMega();
  }
});

document.addEventListener('click', (event) => {
  if (!megaHost.contains(event.target)) {
    closeMega();
  }
});

menuToggle.addEventListener('click', () => {
  const isOpen = header.classList.toggle('nav-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.nav a[href^="#"]').forEach((link) => {
  link.addEventListener('click', () => {
    header.classList.remove('nav-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    closeMega();
  });
});

segments.forEach((segment) => {
  segment.addEventListener('click', () => {
    segments.forEach((s) => {
      s.classList.remove('active');
      s.setAttribute('aria-selected', 'false');
    });

    segment.classList.add('active');
    segment.setAttribute('aria-selected', 'true');

    renderPlanCards(segment.dataset.group);
  });
});

window.addEventListener('bitHappenCardsUpdated', () => {
  mediaLibraryCache = null;
  renderPlanCards(activeGroup);
});

const revealElements = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('show');
      }
    });
  },
  { threshold: 0.15 }
);

revealElements.forEach((el) => observer.observe(el));

renderPlanCards('all');
