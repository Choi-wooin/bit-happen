const header = document.querySelector('.header');
const menuToggle = document.querySelector('.menu-toggle');
const megaHost = document.getElementById('mega-host');
const megaTrigger = document.getElementById('mega-trigger');
const planGrid = document.getElementById('plan-grid');
const viewportDebug = document.getElementById('viewport-debug');

const segments = document.querySelectorAll('.segment');
let activeGroup = 'all';
let mediaLibraryCache = null;
const tabletMediaQuery = window.matchMedia('(min-width: 600px) and (max-width: 1023px)');
const inquiryFormUrl = 'https://tally.so/r/oboZNx';
const inquiryEmbedUrl = 'https://tally.so/embed/oboZNx?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1';
let inquiryModalState = null;
const LOCAL_MEDIA_LIBRARY_KEY = 'bitHappenMediaLibrary_v1';

function getViewportBreakpointLabel(width) {
  if (width <= 599) return 'Phone <= 599px';
  if (width <= 1023) return 'Tablet 600-1023px';
  return 'PC >= 1024px';
}

function updateViewportDebug() {
  if (!viewportDebug) return;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  viewportDebug.textContent = `Viewport ${viewportWidth}px | ${getViewportBreakpointLabel(viewportWidth)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function resolveMediaPath(src) {
  const value = String(src || '')
    .trim()
    .replace(/((?:\.\.\/|\.\/)?assets\/media\/[^?#]+)\.(png|jpg|jpeg)(?=([?#].*)?$)/i, '$1.webp');
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

function loadLocalMediaLibraryItems() {
  try {
    const raw = localStorage.getItem(LOCAL_MEDIA_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

async function getMediaLibraryItems() {
  if (Array.isArray(mediaLibraryCache)) {
    return mediaLibraryCache;
  }

  const localItems = loadLocalMediaLibraryItems();
  if (localItems.length) {
    mediaLibraryCache = localItems;
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
  if (!representative) return '';
  return resolveMediaPath(representative.src || '');
}

function getLeadMediaByCardId(mediaItems, cardId) {
  if (!Array.isArray(mediaItems) || !cardId) return null;

  const representativeThumb = getRepresentativeThumbByCardId(mediaItems, cardId);
  if (representativeThumb) {
    return { type: 'image', src: representativeThumb, poster: '' };
  }

  const videoItem = mediaItems.find((item) => item && item.cardId === cardId && item.type === 'video' && item.src);
  if (!videoItem) return null;

  return {
    type: 'video',
    src: resolveMediaPath(videoItem.src || ''),
    poster: resolveMediaPath(videoItem.poster || ''),
  };
}

function resetTabletLeadThumbStyles(thumb, media) {
  thumb.style.maxWidth = '';
  thumb.style.width = '';
  thumb.style.height = '';
  thumb.style.alignSelf = '';
  media.style.maxWidth = '';
  media.style.width = '';
  media.style.height = '';
}

function adjustTabletLeadThumbs() {
  const leadThumbs = document.querySelectorAll('.plan-card.has-lead-thumb .plan-lead-thumb');

  leadThumbs.forEach((thumb) => {
    const media = thumb.querySelector('img, video');
    const card = thumb.closest('.plan-card');
    if (!media || !card) {
      return;
    }

    resetTabletLeadThumbStyles(thumb, media);

    if (!tabletMediaQuery.matches) {
      return;
    }

    const applyLimit = () => {
      resetTabletLeadThumbStyles(thumb, media);

      const cardWidth = card.getBoundingClientRect().width;
      const thumbWidth = thumb.getBoundingClientRect().width;
      const maxAllowedWidth = cardWidth * 0.5;

      if (!cardWidth || thumbWidth <= maxAllowedWidth) {
        return;
      }

      thumb.style.maxWidth = `${maxAllowedWidth}px`;
      thumb.style.width = '100%';
      thumb.style.height = 'auto';
      thumb.style.alignSelf = 'center';
      media.style.maxWidth = '100%';
      media.style.width = '100%';
      media.style.height = 'auto';
    };

    if (media.tagName === 'IMG' && !media.complete) {
      media.addEventListener('load', applyLimit, { once: true });
    }

    if (media.tagName === 'VIDEO' && !media.videoWidth) {
      media.addEventListener('loadedmetadata', applyLimit, { once: true });
    }

    applyLimit();
  });
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
    const leadMedia = span >= 2 ? getLeadMediaByCardId(mediaItems, card.id) : null;
    if (leadMedia?.src) {
      article.classList.add('has-lead-thumb');
    }

    const thumbMarkup = leadMedia?.src
      ? `<a class="plan-lead-thumb" href="${detailHref}" aria-label="${escapeHtml(
          card.title || '상세보기'
        )} 미디어 썸네일">${
          leadMedia.type === 'video'
            ? `<video src="${escapeHtml(leadMedia.src)}" ${leadMedia.poster ? `poster="${escapeHtml(leadMedia.poster)}"` : ''} muted playsinline loop autoplay preload="metadata" aria-hidden="true"></video>`
            : `<img src="${escapeHtml(leadMedia.src)}" alt="${escapeHtml(card.title || '대표 이미지')}" loading="lazy" decoding="async" />`
        }</a>`
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

  adjustTabletLeadThumbs();
}

function openMega() {
  if (!megaHost || !megaTrigger) {
    return;
  }
  megaHost.classList.add('open');
  megaTrigger.setAttribute('aria-expanded', 'true');
}

function closeMega() {
  if (!megaHost || !megaTrigger) {
    return;
  }
  megaHost.classList.remove('open');
  megaTrigger.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', (event) => {
  if (megaHost && !megaHost.contains(event.target)) {
    closeMega();
  }
});

if (megaHost && megaTrigger) {
  megaTrigger.addEventListener('click', () => {
    if (megaHost.classList.contains('open')) {
      closeMega();
    } else {
      openMega();
    }
  });

  megaHost.addEventListener('mouseenter', () => {
    if (window.matchMedia('(min-width: 600px)').matches) {
      openMega();
    }
  });

  megaHost.addEventListener('mouseleave', () => {
    if (window.matchMedia('(min-width: 600px)').matches) {
      closeMega();
    }
  });
}

menuToggle.addEventListener('click', () => {
  const isOpen = header.classList.toggle('nav-open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));

  if (window.matchMedia('(max-width: 599px)').matches) {
    if (isOpen) {
      openMega();
    } else {
      closeMega();
    }
  }
});

function closeNavMenu() {
  header.classList.remove('nav-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  closeMega();
}

function getInquiryModalState() {
  if (inquiryModalState) {
    return inquiryModalState;
  }

  const modal = document.createElement('div');
  modal.className = 'inquiry-modal';
  modal.id = 'inquiry-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="inquiry-modal__backdrop" data-inquiry-close></div>
    <div class="inquiry-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="inquiry-modal-title">
      <button type="button" class="inquiry-modal__close" aria-label="문의 모달 닫기" data-inquiry-close>닫기</button>
      <div class="inquiry-modal__note">
        <p class="inquiry-modal__eyebrow">BIT HAPPENS</p>
        <h2 id="inquiry-modal-title">도입 문의</h2>
        <p>필요한 내용을 남겨주시면 검토 후 빠르게 연락드리겠습니다.</p>
        <span class="inquiry-modal__pin" aria-hidden="true"></span>
      </div>
      <div class="inquiry-modal__frame-wrap">
        <iframe
          class="inquiry-modal__frame"
          src="${inquiryEmbedUrl}"
          title="BIT HAPPENS 도입 문의"
          loading="lazy"
          allow="clipboard-write"
        ></iframe>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('inquiry-modal-open');
  };

  modal.querySelectorAll('[data-inquiry-close]').forEach((element) => {
    element.addEventListener('click', closeModal);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('open')) {
      closeModal();
    }
  });

  inquiryModalState = {
    modal,
    open(trigger) {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('inquiry-modal-open');
      modal.querySelector('.inquiry-modal__close')?.focus();
      this.lastTrigger = trigger || null;
    },
    close() {
      closeModal();
      this.lastTrigger?.focus?.();
    },
    lastTrigger: null,
  };

  modal.querySelectorAll('[data-inquiry-close]').forEach((element) => {
    element.addEventListener('click', () => inquiryModalState.close());
  });

  return inquiryModalState;
}

function bindInquiryTriggers(scope = document) {
  scope.querySelectorAll('[data-inquiry-trigger]').forEach((trigger) => {
    if (trigger.dataset.inquiryBound === 'true') {
      return;
    }

    trigger.dataset.inquiryBound = 'true';
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      closeNavMenu();
      getInquiryModalState().open(trigger);
    });
  });
}

document.querySelectorAll('.nav a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    closeNavMenu();

    if (link.dataset.group) {
      return;
    }

    const targetId = link.getAttribute('href');
    const targetElement = targetId ? document.querySelector(targetId) : null;
    if (!targetElement) {
      return;
    }

    event.preventDefault();
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

document.querySelectorAll('.nav a[data-group]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();

    const targetGroup = link.dataset.group;
    const targetSegment = document.querySelector(`.segment[data-group="${targetGroup}"]`);
    const plansSection = document.getElementById('plans');

    closeNavMenu();

    if (targetSegment) {
      targetSegment.click();
    }

    if (plansSection) {
      plansSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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

window.addEventListener('resize', () => {
  updateViewportDebug();
  adjustTabletLeadThumbs();
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

bindInquiryTriggers();
updateViewportDebug();
renderPlanCards('all');
