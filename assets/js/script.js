const header = document.querySelector('.header');
const menuToggle = document.querySelector('.menu-toggle');
const megaHost = document.getElementById('mega-host');
const megaTrigger = document.getElementById('mega-trigger');
const planGrid = document.getElementById('plan-grid');
const viewportDebug = document.getElementById('viewport-debug');
const navHashLinks = Array.from(document.querySelectorAll('.nav a[href^="#"]'));
const navGroupLinks = Array.from(document.querySelectorAll('.nav a[data-group]'));
const navLinkByHash = new Map(navHashLinks.map((link) => [link.getAttribute('href'), link]));

const segments = document.querySelectorAll('.segment');
const groupSegments = document.querySelectorAll('.segment[data-group]');
const solutionModeToggle = document.getElementById('solution-mode-toggle');
const toggleLabels = document.querySelectorAll('.toggle-label');
let activeGroup = 'all';
let activeSolutionMode = 'featured';
let mediaLibraryCache = null;
const tabletMediaQuery = window.matchMedia('(min-width: 600px) and (max-width: 1023px)');
const inquiryFormUrl = 'https://tally.so/r/oboZNx';
const inquiryEmbedUrl = 'https://tally.so/embed/oboZNx?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1';
let inquiryModalState = null;
const LOCAL_MEDIA_LIBRARY_KEY = 'bitHappenMediaLibrary_v1';
const GROUP_LABELS = {
  kiosk: 'Kiosk',
  ai: 'AI',
  airport: 'Airport',
  'device-interface': 'Device interface',
  product: 'Product',
  all: 'Enterprise',
};
let megaCloseTimer = null;
const REPRESENTATIVE_LIMIT_PER_GROUP = 2;
let navScrollTicking = false;
let lastScrollY = window.scrollY || 0;
let activeNavSectionId = 'vision';
let copyToastState = null;

const navSectionDefinitions = [
  { sectionIds: ['vision'], control: navLinkByHash.get('#vision') || null },
  { sectionIds: ['business-area'], control: navLinkByHash.get('#business-area') || null },
  { sectionIds: ['capabilities'], control: navLinkByHash.get('#capabilities') || null },
  {
    sectionIds: ['plans', 'tech-stack', 'practical-value', 'differentiation', 'applications'],
    control: megaTrigger,
  },
  { sectionIds: ['contact'], control: navLinkByHash.get('#contact') || null },
].filter((item) => item.control);

const navSectionOrder = navSectionDefinitions.flatMap((item) => item.sectionIds);
const primaryNavControls = navSectionDefinitions.map((item) => item.control);

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

function setControlActiveState(control, isActive) {
  if (!control) return;
  control.classList.toggle('is-active', isActive);
  if (control.tagName === 'A') {
    if (isActive) {
      control.setAttribute('aria-current', 'location');
    } else {
      control.removeAttribute('aria-current');
    }
  }
}

function setActiveNavSection(sectionId, solutionGroup = activeGroup) {
  activeNavSectionId = sectionId;
  const activeDefinition = navSectionDefinitions.find((item) => item.sectionIds.includes(sectionId)) || null;

  primaryNavControls.forEach((control) => {
    setControlActiveState(control, control === activeDefinition?.control);
  });

  navGroupLinks.forEach((link) => {
    const isActive = activeDefinition?.control === megaTrigger && link.dataset.group === solutionGroup;
    setControlActiveState(link, isActive);
  });
}

function getSectionRect(sectionId) {
  const section = document.getElementById(sectionId);
  return section ? section.getBoundingClientRect() : null;
}

function getSectionHeadingRect(sectionId) {
  const section = document.getElementById(sectionId);
  const heading = section?.querySelector('h2');
  return heading ? heading.getBoundingClientRect() : null;
}

function isSectionHeadingVisible(sectionId) {
  const headingRect = getSectionHeadingRect(sectionId);
  if (!headingRect) {
    return false;
  }

  const headerBottom = header?.getBoundingClientRect().bottom || 0;
  return headingRect.bottom > headerBottom && headingRect.top < window.innerHeight;
}

function isContactFullyVisible() {
  const contactRect = getSectionRect('contact');
  if (!contactRect) {
    return false;
  }

  const headerBottom = header?.getBoundingClientRect().bottom || 0;
  return contactRect.top >= headerBottom && contactRect.bottom <= window.innerHeight;
}

function getNavSectionIndex(sectionId = activeNavSectionId) {
  const index = navSectionOrder.indexOf(sectionId);
  return index >= 0 ? index : 0;
}

function getCurrentNavSectionId() {
  if (isContactFullyVisible()) {
    return 'contact';
  }

  const currentIndex = getNavSectionIndex();
  const currentSectionId = navSectionOrder[currentIndex] || 'vision';
  const currentRect = getSectionRect(currentSectionId);
  const currentScrollY = window.scrollY || 0;
  const isScrollingDown = currentScrollY > lastScrollY;
  const thresholdFromTop = window.innerHeight * (2 / 3);

  if (!currentRect) {
    lastScrollY = currentScrollY;
    return navSectionOrder[0] || 'vision';
  }

  let nextIndex = currentIndex;

  if (isScrollingDown) {
    if (isSectionHeadingVisible(currentSectionId)) {
      lastScrollY = currentScrollY;
      return currentSectionId;
    }

    while (nextIndex < navSectionOrder.length - 1) {
      const candidateRect = getSectionRect(navSectionOrder[nextIndex + 1]);
      if (!candidateRect || candidateRect.top > thresholdFromTop) {
        break;
      }
      nextIndex += 1;
    }
  } else if (currentScrollY < lastScrollY) {
    while (nextIndex > 0) {
      const previousSectionId = navSectionOrder[nextIndex - 1];
      if (!isSectionHeadingVisible(previousSectionId)) {
        break;
      }
      nextIndex -= 1;
    }

    while (nextIndex > 0) {
      const activeRect = getSectionRect(navSectionOrder[nextIndex]);
      if (!activeRect || activeRect.top <= thresholdFromTop) {
        break;
      }
      nextIndex -= 1;
    }
  }

  lastScrollY = currentScrollY;
  return navSectionOrder[nextIndex] || currentSectionId;
}

function syncActiveNavToScroll() {
  setActiveNavSection(getCurrentNavSectionId(), activeGroup);
}

function scheduleNavScrollSync() {
  if (navScrollTicking) {
    return;
  }

  navScrollTicking = true;
  window.requestAnimationFrame(() => {
    syncActiveNavToScroll();
    navScrollTicking = false;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getCardGroups(card) {
  return window.BitHappenCardStore?.getCardGroups
    ? window.BitHappenCardStore.getCardGroups(card)
    : [String(card?.group || 'all').trim() || 'all'];
}

function getPrimaryGroup(card) {
  return window.BitHappenCardStore?.getPrimaryGroup
    ? window.BitHappenCardStore.getPrimaryGroup(card)
    : getCardGroups(card)[0] || 'all';
}

function getGroupLabel(group) {
  return GROUP_LABELS[group] || String(group || '').trim() || 'Package';
}

function matchesGroupFilter(card, group) {
  const groups = getCardGroups(card);
  return group === 'all' || groups.includes(group) || groups.includes('all');
}

function getCardsBySolutionMode(cards, mode = activeSolutionMode) {
  if (mode !== 'featured') {
    return cards.slice();
  }

  const explicitFeaturedCards = cards.filter((card) => card.featured === true);
  if (explicitFeaturedCards.length) {
    return explicitFeaturedCards;
  }

  const groupCounts = new Map();

  return cards.filter((card) => {
    const primaryGroup = getPrimaryGroup(card);
    const currentCount = groupCounts.get(primaryGroup) || 0;
    if (currentCount >= REPRESENTATIVE_LIMIT_PER_GROUP) {
      return false;
    }
    groupCounts.set(primaryGroup, currentCount + 1);
    return true;
  });
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

async function renderPlanCards(group = activeGroup, mode = activeSolutionMode) {
  activeGroup = group;
  activeSolutionMode = mode;
  if (!planGrid || !window.BitHappenCardStore) {
    return;
  }

  const cards = window.BitHappenCardStore.getCards();
  const mediaItems = await getMediaLibraryItems();
  const scopedCards = cards.filter((card) => card.enabled !== false && matchesGroupFilter(card, group));
  const visibleCards = getCardsBySolutionMode(scopedCards, mode);

  planGrid.innerHTML = '';

  visibleCards.forEach((card) => {
    const article = document.createElement('article');
    const span = Math.max(1, Math.min(4, Number(card.span) || 1));
    const groups = getCardGroups(card);
    const primaryGroup = getPrimaryGroup(card);

    article.className = `plan-card span-${span}`;
    if (card.span >= 2) {
      article.classList.add('wide');
    }
    article.classList.add('plan-card-clickable');
    article.dataset.group = primaryGroup;
    article.dataset.groups = groups.join(' ');

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

    const badgeMarkup = groups
      .map(
        (groupKey) =>
          `<p class="plan-badge plan-badge--${escapeHtml(groupKey)}">${escapeHtml(getGroupLabel(groupKey))}</p>`
      )
      .join('');

    article.innerHTML = `
      <div class="plan-layout">
        ${thumbMarkup}
        <div class="plan-content">
          <div class="plan-badges">${badgeMarkup}</div>
          <h3><a class="plan-title-link" href="${detailHref}">${escapeHtml(card.title || '제목 없음')}</a></h3>
          <p class="plan-copy">${escapeHtml(card.copy || '')}</p>
          <ul>${features}</ul>
          <div class="plan-meta">
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
  if (megaCloseTimer) {
    window.clearTimeout(megaCloseTimer);
    megaCloseTimer = null;
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

function scheduleCloseMega(delay = 140) {
  if (!megaHost || !megaTrigger) {
    return;
  }
  if (megaCloseTimer) {
    window.clearTimeout(megaCloseTimer);
  }
  megaCloseTimer = window.setTimeout(() => {
    closeMega();
    megaCloseTimer = null;
  }, delay);
}

function activatePlanGroup(group = 'all') {
  const targetSegment = document.querySelector(`.segment[data-group="${group}"]`);
  const plansSection = document.getElementById('plans');

  closeNavMenu();
  setActiveNavSection('plans', group);

  if (targetSegment) {
    targetSegment.click();
  }

  if (plansSection) {
    plansSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

document.addEventListener('click', (event) => {
  if (megaHost && !megaHost.contains(event.target)) {
    closeMega();
  }
});

if (megaHost && megaTrigger) {
  megaTrigger.addEventListener('click', () => {
    if (window.matchMedia('(max-width: 599px)').matches) {
      if (megaHost.classList.contains('open')) {
        closeMega();
      } else {
        openMega();
      }
      return;
    }

    setSolutionMode('featured');
    activatePlanGroup('all');
  });

  megaHost.addEventListener('mouseenter', () => {
    if (window.matchMedia('(min-width: 600px)').matches) {
      openMega();
    }
  });

  megaHost.addEventListener('mouseleave', () => {
    if (window.matchMedia('(min-width: 600px)').matches) {
      scheduleCloseMega();
    }
  });

  megaHost.addEventListener('focusin', () => {
    openMega();
  });

  megaHost.addEventListener('focusout', (event) => {
    if (megaHost.contains(event.relatedTarget)) {
      return;
    }
    scheduleCloseMega(100);
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

function scheduleInquiryModalWarmup() {
  const warmup = () => {
    getInquiryModalState();
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(warmup, { timeout: 2000 });
    return;
  }

  window.setTimeout(warmup, 1200);
}

function getCopyToastState() {
  if (copyToastState) {
    return copyToastState;
  }

  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.setAttribute('aria-live', 'polite');
  toast.setAttribute('aria-atomic', 'true');
  document.body.appendChild(toast);

  let timerId = null;

  copyToastState = {
    show(message) {
      toast.textContent = message;
      toast.classList.add('is-visible');
      if (timerId) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        toast.classList.remove('is-visible');
        timerId = null;
      }, 1800);
    },
  };

  return copyToastState;
}

async function copyTextToClipboard(text, label) {
  const value = String(text || '').trim();
  if (!value) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = value;
      textArea.setAttribute('readonly', 'true');
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }
    getCopyToastState().show(`${label}가(이) 클립보드에 복사되었습니다.`);
  } catch (_error) {
    getCopyToastState().show(`${label} 복사에 실패했습니다.`);
  }
}

function bindFooterInfoActions(scope = document) {
  scope.querySelectorAll('[data-copy-text]').forEach((trigger) => {
    if (trigger.dataset.copyBound === 'true') {
      return;
    }

    trigger.dataset.copyBound = 'true';
    trigger.addEventListener('click', () => {
      copyTextToClipboard(trigger.dataset.copyText, trigger.dataset.copyLabel || '텍스트');
    });
  });
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
          loading="eager"
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
    setActiveNavSection(targetElement.id, activeGroup);
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

document.querySelectorAll('.nav a[data-group]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    setActiveNavSection('plans', link.dataset.group);
    activatePlanGroup(link.dataset.group);
  });
});

function setGroupSegment(group) {
  activeGroup = group;
  groupSegments.forEach((segment) => {
    const isActive = segment.dataset.group === group;
    segment.classList.toggle('active', isActive);
    segment.setAttribute('aria-selected', String(isActive));
  });

  if (getCurrentNavSectionId() === 'plans') {
    setActiveNavSection('plans', group);
  }
}

function setSolutionMode(mode = 'featured') {
  activeSolutionMode = mode === 'all' ? 'all' : 'featured';
  if (solutionModeToggle) {
    solutionModeToggle.checked = activeSolutionMode === 'all';
  }
  toggleLabels.forEach((lbl) => {
    lbl.style.color = lbl.dataset.mode === activeSolutionMode ? '#121212' : '#999';
  });
}

groupSegments.forEach((segment) => {
  segment.addEventListener('click', () => {
    setGroupSegment(segment.dataset.group);
    renderPlanCards(segment.dataset.group, activeSolutionMode);
  });
});

if (solutionModeToggle) {
  solutionModeToggle.addEventListener('change', () => {
    setSolutionMode(solutionModeToggle.checked ? 'all' : 'featured');
    renderPlanCards(activeGroup, activeSolutionMode);
  });
}

window.addEventListener('bitHappenCardsUpdated', () => {
  mediaLibraryCache = null;
  renderPlanCards(activeGroup, activeSolutionMode);
});

window.addEventListener('resize', () => {
  updateViewportDebug();
  adjustTabletLeadThumbs();
  scheduleNavScrollSync();
});

window.addEventListener('scroll', scheduleNavScrollSync, { passive: true });

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
bindFooterInfoActions();
scheduleInquiryModalWarmup();
updateViewportDebug();
setGroupSegment('all');
setSolutionMode('featured');
renderPlanCards('all', 'featured');
syncActiveNavToScroll();
