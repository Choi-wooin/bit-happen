function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

  const inquiryFormUrl = 'https://tally.so/r/oboZNx';
  const inquiryEmbedUrl = 'https://tally.so/embed/oboZNx?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1';
  let inquiryModalState = null;

function mediaTypeLabel(type) {
  return type === 'video' ? 'VIDEO' : 'IMAGE';
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
  return GROUP_LABELS[group] || String(group || '').trim() || 'Solution';
}

function resolveMediaPath(src) {
  const value = String(src || '')
    .trim()
    .replace(/((?:\.\.\/|\.\/)?assets\/media\/[^?#]+)\.(png|jpg|jpeg)(?=([?#].*)?$)/i, '$1.webp');
  if (!value) return '';

  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith('/')) return value;
  if (value.startsWith('../') || value.startsWith('./')) return value;
  if (value.startsWith('assets/')) return `../${value}`;
  return value;
}

function normalizeMediaItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      const type = item?.type === 'video' ? 'video' : 'image';
      const src = String(item?.src || '').trim();
      if (!src) return null;

      return {
        type,
        src: resolveMediaPath(src),
        title: String(item?.title || '').trim(),
        poster: resolveMediaPath(item?.poster || ''),
      };
    })
    .filter(Boolean);
}

function getLocalDraftMediaItemsByCardId(cardId) {
  if (!cardId) return [];

  try {
    const raw = localStorage.getItem('bitHappenMediaLibrary_v1');
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return normalizeMediaItems(
      parsed
        .filter((item) => item && item.cardId === cardId)
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
        .map((item) => ({
          type: item.type,
          src: item.src,
          title: item.title,
          poster: item.poster,
        }))
    );
  } catch (_error) {
    return [];
  }
}

function getSourceLibraryMediaItemsByCardId(cardId) {
  if (!cardId) return [];

  const sourceItems = window.BitHappenMediaLibrary?.items;
  if (!Array.isArray(sourceItems)) return [];

  return normalizeMediaItems(
    sourceItems
      .filter((item) => item && item.cardId === cardId)
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
      .map((item) => ({
        type: item.type,
        src: item.src,
        title: item.title,
        poster: item.poster,
      }))
  );
}

function getSupabaseConfig() {
  const cfg = window.BitHappenSupabaseConfig || {};
  const url = String(cfg.url || '').trim().replace(/\/$/, '');
  const anonKey = String(cfg.anonKey || '').trim();
  const mediaStateKey = String(cfg.mediaStateKey || 'mediaLibrary').trim() || 'mediaLibrary';
  const detailStateKey = String(cfg.detailStateKey || 'detailOverrides').trim() || 'detailOverrides';
  const enabled = Boolean(url && anonKey);
  return { enabled, url, anonKey, mediaStateKey, detailStateKey };
}

let detailOverrideStateCache = null;

function normalizeDetailOverride(value) {
  if (!value || typeof value !== 'object') return null;

  const normalized = {};
  ['intentHtml', 'architectureHtml', 'referenceHtml'].forEach((key) => {
    const raw = String(value[key] || '').trim();
    if (raw) {
      normalized[key] = raw;
    }
  });

  ['pains', 'how', 'scenarios', 'integration', 'features'].forEach((key) => {
    if (Array.isArray(value[key]) && value[key].length > 0) {
      normalized[key] = value[key].map((item) => String(item || '').trim()).filter(Boolean);
    }
  });

  if (Array.isArray(value.techSpecs) && value.techSpecs.length > 0) {
    normalized.techSpecs = value.techSpecs;
  }

  if (Array.isArray(value.kpis) && value.kpis.length > 0) {
    normalized.kpis = value.kpis;
  }

  return Object.keys(normalized).length ? normalized : null;
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

function createListBlockHtml(title, items) {
  if (!Array.isArray(items) || !items.length) return '';
  return `<section><h3>${esc(title)}</h3><ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></section>`;
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
                <h4>${esc(spec?.title || '')}</h4>
                <ul>${(Array.isArray(spec?.items) ? spec.items : []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
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
                <p class="rich-kpi">${esc(kpi?.value || '')}</p>
                <h4>${esc(kpi?.title || '')}</h4>
                <p>${esc(kpi?.desc || '')}</p>
              </article>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

function buildLegacyDetailSections(source, card, groupText) {
  const current = source && typeof source === 'object' ? source : {};
  const painItems = current.pains || groupText.pains;
  const featureItems = current.features || card.features || [];
  const howItems = current.how || groupText.how;
  const integrationItems = current.integration || groupText.integration;
  const scenarioItems = current.scenarios || groupText.scenarios;

  return {
    intentHtml: [createListBlockHtml('문제 정의', painItems), createListBlockHtml('핵심 기능', featureItems)].filter(Boolean).join(''),
    architectureHtml: [
      createListBlockHtml('해결 방식', howItems),
      createListBlockHtml('기술 연동', integrationItems),
      createTechSpecHtml(current.techSpecs),
    ]
      .filter(Boolean)
      .join(''),
    referenceHtml: [createListBlockHtml('적용 시나리오', scenarioItems), createKpiHtml(current.kpis)].filter(Boolean).join(''),
  };
}

function resolveDetailSections(override, card, groupText) {
  const legacy = buildLegacyDetailSections(override, card, groupText);
  const direct = {
    intentHtml: hasMeaningfulHtml(override?.intentHtml) ? String(override.intentHtml).trim() : '',
    architectureHtml: hasMeaningfulHtml(override?.architectureHtml) ? String(override.architectureHtml).trim() : '',
    referenceHtml: hasMeaningfulHtml(override?.referenceHtml) ? String(override.referenceHtml).trim() : '',
  };

  return {
    intentHtml: direct.intentHtml || legacy.intentHtml,
    architectureHtml: direct.architectureHtml || legacy.architectureHtml,
    referenceHtml: direct.referenceHtml || legacy.referenceHtml,
  };
}

function renderRichDetailSection(title, html) {
  if (!hasMeaningfulHtml(html)) return '';
  return `
    <section class="section rich-section">
      <h2>${esc(title)}</h2>
      <div class="rich-section-body">${html}</div>
    </section>
  `;
}

async function getSupabaseDetailOverrideByCardId(cardId) {
  if (!cardId) return null;

  const cfg = getSupabaseConfig();
  if (!cfg.enabled) return null;

  if (detailOverrideStateCache === null) {
    try {
      const endpoint = `${cfg.url}/rest/v1/site_state?key=eq.${encodeURIComponent(cfg.detailStateKey)}&select=value&limit=1`;
      const response = await fetch(endpoint, {
        headers: {
          apikey: cfg.anonKey,
          Authorization: `Bearer ${cfg.anonKey}`,
        },
      });

      if (!response.ok) {
        detailOverrideStateCache = {};
      } else {
        const rows = await response.json();
        const value = rows?.[0]?.value;
        detailOverrideStateCache = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      }
    } catch (_error) {
      detailOverrideStateCache = {};
    }
  }

  return normalizeDetailOverride(detailOverrideStateCache[cardId]);
}

async function getSupabaseMediaItemsByCardId(cardId) {
  if (!cardId) return [];

  const cfg = getSupabaseConfig();
  if (!cfg.enabled) return [];

  try {
    const endpoint = `${cfg.url}/rest/v1/site_state?key=eq.${encodeURIComponent(cfg.mediaStateKey)}&select=value&limit=1`;
    const response = await fetch(endpoint, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
      },
    });

    if (!response.ok) return [];
    const rows = await response.json();
    const items = rows?.[0]?.value;
    if (!Array.isArray(items)) return [];

    return normalizeMediaItems(
      items
        .filter((item) => item && item.cardId === cardId)
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0))
        .map((item) => ({
          type: item.type,
          src: item.src,
          title: item.title,
          poster: item.poster,
        }))
    );
  } catch (_error) {
    return [];
  }
}

function renderMediaSection(mediaItems) {
  if (!mediaItems.length) {
    return `
      <section class="section">
        <h2>이미지 / 동영상</h2>
        <p class="media-empty">등록된 미디어가 없습니다.</p>
      </section>
    `;
  }

  return `
    <section class="section" id="media-section">
      <div class="media-head">
        <h2>이미지 / 동영상</h2>
        <p class="media-meta">총 ${mediaItems.length}개</p>
      </div>
      <div class="media-scroller" id="media-scroller">
        ${mediaItems
          .map((item, index) => {
            const caption = item.title ? `<p class="media-caption">${esc(item.title)}</p>` : '';
            const tag = `<span class="media-type">${mediaTypeLabel(item.type)}</span>`;

            const body =
              item.type === 'video'
                ? `<video preload="metadata" playsinline ${item.poster ? `poster="${esc(item.poster)}"` : ''}><source src="${esc(
                    item.src
                  )}" /></video><span class="media-video-icon">▶</span>`
                : `<img src="${esc(item.src)}" alt="${esc(item.title || `media-${index + 1}`)}" loading="lazy" decoding="async" />`;

            return `
              <article class="media-card">
                <button type="button" class="media-frame" data-media-index="${index}">
                  ${tag}
                  ${body}
                </button>
                ${caption}
              </article>
            `;
          })
          .join('')}
      </div>
    </section>
  `;
}

function attachMediaInteractions(mediaItems) {
  const frames = Array.from(document.querySelectorAll('.media-frame'));
  if (!frames.length) return;

  frames.forEach((frame) => {
    const mediaEl = frame.querySelector('img, video');
    if (!mediaEl) return;

    const applyRatio = (w, h) => {
      if (!w || !h) return;
      frame.style.setProperty('--ratio', (w / h).toFixed(4));
    };

    if (mediaEl.tagName === 'IMG') {
      const img = mediaEl;
      if (img.complete && img.naturalWidth && img.naturalHeight) {
        applyRatio(img.naturalWidth, img.naturalHeight);
      } else {
        img.addEventListener('load', () => applyRatio(img.naturalWidth, img.naturalHeight), { once: true });
      }
    } else {
      const video = mediaEl;
      if (video.videoWidth && video.videoHeight) {
        applyRatio(video.videoWidth, video.videoHeight);
      } else {
        video.addEventListener('loadedmetadata', () => applyRatio(video.videoWidth, video.videoHeight), { once: true });
      }
    }
  });

  const modal = document.createElement('div');
  modal.className = 'media-modal';
  modal.innerHTML = `
    <div class="media-modal-inner">
      <div class="media-modal-top">
        <div class="media-modal-heading">
          <strong id="media-modal-title"></strong>
          <span class="media-modal-counter" id="media-modal-counter"></span>
        </div>
        <div class="media-modal-actions">
          <p class="media-modal-hint">PC는 좌우 버튼, Tablet/Phone은 스와이프로 이동</p>
          <button type="button" class="media-modal-close" id="media-modal-close">닫기</button>
        </div>
      </div>
      <div class="media-modal-stage">
        <button type="button" class="media-modal-nav media-modal-nav-prev" id="media-modal-prev" aria-label="이전 미디어">이전</button>
        <div class="media-modal-body" id="media-modal-body"></div>
        <button type="button" class="media-modal-nav media-modal-nav-next" id="media-modal-next" aria-label="다음 미디어">다음</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const modalTitle = modal.querySelector('#media-modal-title');
  const modalCounter = modal.querySelector('#media-modal-counter');
  const modalBody = modal.querySelector('#media-modal-body');
  const modalClose = modal.querySelector('#media-modal-close');
  const modalPrev = modal.querySelector('#media-modal-prev');
  const modalNext = modal.querySelector('#media-modal-next');
  let currentIndex = -1;
  let touchStartX = 0;
  let touchDeltaX = 0;

  const canNavigate = mediaItems.length > 1;

  const renderModalMedia = (index) => {
    const media = mediaItems[index];
    if (!media) return;

    currentIndex = index;
    modalTitle.textContent = media.title || `${mediaTypeLabel(media.type)} ${index + 1}`;
    modalCounter.textContent = `${index + 1} / ${mediaItems.length}`;

    if (media.type === 'video') {
      modalBody.innerHTML = `<video controls autoplay playsinline ${
        media.poster ? `poster="${esc(media.poster)}"` : ''
      }><source src="${esc(media.src)}" /></video>`;
    } else {
      modalBody.innerHTML = `<img src="${esc(media.src)}" alt="${esc(media.title || `media-${index + 1}`)}" />`;
    }

    modalPrev.disabled = !canNavigate;
    modalNext.disabled = !canNavigate;
  };

  const moveModal = (direction) => {
    if (!canNavigate || currentIndex < 0) return;
    const nextIndex = (currentIndex + direction + mediaItems.length) % mediaItems.length;
    renderModalMedia(nextIndex);
  };

  const openModal = (index) => {
    modal.classList.add('open');
    document.body.classList.add('media-modal-open');
    renderModalMedia(index);
  };

  const closeModal = () => {
    modal.classList.remove('open');
    document.body.classList.remove('media-modal-open');
    modalBody.innerHTML = '';
    currentIndex = -1;
  };

  frames.forEach((frame) => {
    frame.addEventListener('click', () => {
      const idx = Number(frame.getAttribute('data-media-index'));
      openModal(idx);
    });
  });

  modalClose.addEventListener('click', closeModal);
  modalPrev.addEventListener('click', (event) => {
    event.stopPropagation();
    moveModal(-1);
  });
  modalNext.addEventListener('click', (event) => {
    event.stopPropagation();
    moveModal(1);
  });
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  modalBody.addEventListener('touchstart', (event) => {
    if (!modal.classList.contains('open')) return;
    touchStartX = event.changedTouches[0]?.clientX || 0;
    touchDeltaX = 0;
  }, { passive: true });
  modalBody.addEventListener('touchmove', (event) => {
    if (!modal.classList.contains('open')) return;
    const currentX = event.changedTouches[0]?.clientX || 0;
    touchDeltaX = currentX - touchStartX;
  }, { passive: true });
  modalBody.addEventListener('touchend', () => {
    if (!modal.classList.contains('open') || !canNavigate) return;
    if (Math.abs(touchDeltaX) < 50) return;
    moveModal(touchDeltaX < 0 ? 1 : -1);
    touchStartX = 0;
    touchDeltaX = 0;
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
    if (!modal.classList.contains('open')) return;
    if (event.key === 'ArrowLeft') moveModal(-1);
    if (event.key === 'ArrowRight') moveModal(1);
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
        <p>프로젝트 상황과 필요한 내용을 남겨주시면 검토 후 빠르게 연락드리겠습니다.</p>
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

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('open')) {
      inquiryModalState.close();
    }
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
      getInquiryModalState().open(trigger);
    });
  });
}

const detailTextByGroup = {
  kiosk: {
    pains: ['현장 대기시간 증가', '운영 인력 부담 증가', '분산 단말 관리 복잡성'],
    how: ['현장 단말 통합 제어', '사용자 동선 중심 UI', '운영 대시보드 실시간 모니터링'],
    scenarios: ['리테일 매장 안내', '공공 민원 무인 처리', '외식 주문/결제 자동화'],
    integration: ['POS', 'CMS', '결제 모듈', '관제 시스템'],
  },
  ai: {
    pains: ['반복 작업 수동 처리', '판단 품질 편차', '데이터 활용 지연'],
    how: ['모델 파이프라인 자동화', '실시간 추론 처리', '운영 환경 맞춤 튜닝'],
    scenarios: ['영상/음성 분석', '인증/보안', '리서치/업무 자동화'],
    integration: ['Inference API', 'Data Pipeline', 'Dashboard', 'Edge Runtime'],
  },
  airport: {
    pains: ['승객 혼잡 증가', '보안 절차 지연', '수하물 운영 비효율'],
    how: ['생체 인증 기반 여정 단축', '게이트/단말 연계', '수하물 처리 통합 관제'],
    scenarios: ['체크인/탑승 간소화', '환승 프로세스 최적화', '수하물 위탁 자동화'],
    integration: ['게이트 장비', '인증 단말', 'BHS', '운영 관제 시스템'],
  },
  'device-interface': {
    pains: ['현장 디바이스 조작 복잡도 증가', '단말별 UX 일관성 부족', '임베디드 제어 연동 부담'],
    how: ['디바이스 중심 화면 설계', '하드웨어 입력/출력 인터페이스 표준화', '온디바이스 제어 로직 최적화'],
    scenarios: ['산업용 제어 패널', '현장 운영 단말', '임베디드 터치 인터페이스'],
    integration: ['센서/컨트롤러', '시리얼 통신', '로컬 런타임', '장비 상태 모니터링'],
  },
  product: {
    pains: ['반복 구축 비용 증가', '고객사별 기능 편차 확대', '운영 체계 표준화 부족'],
    how: ['공통 기능 모듈화', '제품 중심 릴리스 관리', '운영 데이터 기반 개선 사이클 구축'],
    scenarios: ['SaaS 제품 운영', 'B2B 솔루션 패키지', '화이트라벨 제품 확장'],
    integration: ['구독/결제', '운영 어드민', '로그/모니터링', '고객 지원 시스템'],
  },
  all: {
    pains: ['제품군 확장 시 운영 복잡도 증가', '시스템 간 연동 단절', '운영 기준 불일치'],
    how: ['표준 데이터/권한 모델', '공통 운영 정책', '단계별 확장 로드맵'],
    scenarios: ['다사업 통합 운영', '전사 모니터링', '서비스 표준화'],
    integration: ['SSO', '권한 체계', '통합 모니터링', 'API Gateway'],
  },
};

const detailOverridesById = window.BitHappenDetailDefaultOverrides || {};

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

async function render() {
  if (!window.BitHappenCardStore) return;
  const root = document.getElementById('detail-root');
  const cards = window.BitHappenCardStore.getCards();
  const id = getQueryId();

  let card = cards.find((item) => item.id === id && item.enabled !== false);
  if (!card) {
    card = cards.find((item) => item.enabled !== false) || cards[0];
  }
  if (!card) {
    root.innerHTML = '<section class="section"><h2>데이터가 없습니다.</h2></section>';
    return;
  }

  const groupText = detailTextByGroup[card.group] || detailTextByGroup.all;
  const remoteOverride = await getSupabaseDetailOverrideByCardId(card.id);
  const localOverride = detailOverridesById[card.id] || null;
  const override = remoteOverride || localOverride;

  const detailSections = resolveDetailSections(override, card, groupText);
  const overrideMedia = normalizeMediaItems(override?.media || []);
  const cardMedia = normalizeMediaItems(card.media || []);
  const supabaseMedia = await getSupabaseMediaItemsByCardId(card.id);
  const sourceLibraryMedia = getSourceLibraryMediaItemsByCardId(card.id);
  const localDraftMedia = getLocalDraftMediaItemsByCardId(card.id);
  const mediaItems = localDraftMedia.length
    ? localDraftMedia
    : supabaseMedia.length
    ? supabaseMedia
    : sourceLibraryMedia.length
    ? sourceLibraryMedia
    : overrideMedia.length
    ? overrideMedia
    : cardMedia;

  const related = cards
    .filter((item) => item.enabled !== false && item.group === card.group && item.id !== card.id)
    .slice(0, 3)
    .map(
      (item) =>
        `<div class="related-item"><span>${esc(item.title)}</span><a href="../pages/solution-detail.html?id=${encodeURIComponent(
          item.id
        )}">상세보기</a></div>`
    )
    .join('');

  document.title = `BIT HAPPENS | ${card.title}`;

  root.innerHTML = `
    <section class="hero">
      <div>
        <p class="badge">${esc(card.badge || card.group || 'Solution')}</p>
        <h1>${esc(card.title)}</h1>
        <p>${esc(card.copy || '')}</p>
        <div class="hero-actions">
          <a class="btn primary" href="${inquiryFormUrl}" data-inquiry-trigger aria-haspopup="dialog" aria-controls="inquiry-modal">도입 문의</a>
        </div>
      </div>
      <aside class="hero-meta">
        <p><strong>적용 산업:</strong> ${esc(card.industry || '-')}</p>
        <p><strong>구축 기간:</strong> ${esc(card.period || '-')}</p>
        <p><strong>연동 범위:</strong> ${esc(card.integration || '-')}</p>
        <p><strong>사업 영역:</strong> ${esc(getGroupLabel(card.group))}</p>
      </aside>
    </section>

    ${renderRichDetailSection('개발의도 / 필요성 / 개념', detailSections.intentHtml)}

    ${renderRichDetailSection('아키텍처 / 시스템구성 / 동작원리', detailSections.architectureHtml)}

    ${renderRichDetailSection('레퍼런스 / 관련자료', detailSections.referenceHtml)}

    ${renderMediaSection(mediaItems)}

    <div class="section-cta">
      <a class="btn primary" href="${inquiryFormUrl}" data-inquiry-trigger aria-haspopup="dialog" aria-controls="inquiry-modal">도입 문의</a>
    </div>

    <section class="section">
      <h2>관련 솔루션</h2>
      <div class="related-list">${related || '<p>관련 솔루션이 없습니다.</p>'}</div>
    </section>
  `;

  attachMediaInteractions(mediaItems);
  bindInquiryTriggers(root);
}

render();
window.addEventListener('bitHappenCardsUpdated', render);
