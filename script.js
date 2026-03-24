const header = document.querySelector('.header');
const menuToggle = document.querySelector('.menu-toggle');
const megaHost = document.getElementById('mega-host');
const megaTrigger = document.getElementById('mega-trigger');
const planGrid = document.getElementById('plan-grid');

const segments = document.querySelectorAll('.segment');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPlanCards(group = 'all') {
  if (!planGrid || !window.BitHappenCardStore) {
    return;
  }

  const cards = window.BitHappenCardStore.getCards();
  const visibleCards = cards.filter((card) => group === 'all' || card.group === group || card.group === 'all');

  planGrid.innerHTML = '';

  visibleCards.forEach((card) => {
    const article = document.createElement('article');
    const span = Math.max(1, Math.min(4, Number(card.span) || 1));

    article.className = `plan-card span-${span}`;
    if (card.span >= 2) {
      article.classList.add('wide');
    }
    article.dataset.group = card.group;

    const features = (Array.isArray(card.features) ? card.features : [])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');

    const tags = (Array.isArray(card.tags) ? card.tags : [])
      .map((tag) => `<span>${escapeHtml(tag)}</span>`)
      .join('');

    const ctaStyle = card.ctaStyle === 'ghost' ? 'ghost' : 'primary';
    const ctaLabel = '상세보기';
    // TODO: 상세 페이지가 준비되면 각 카드별 URL로 교체
    const detailHref = '#';

    article.innerHTML = `
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
      <a href="${detailHref}" class="btn ${ctaStyle} plan-cta">${escapeHtml(ctaLabel)}</a>
    `;

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
