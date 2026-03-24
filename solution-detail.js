function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function mediaTypeLabel(type) {
  return type === 'video' ? 'VIDEO' : 'IMAGE';
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
        src,
        title: String(item?.title || '').trim(),
        poster: String(item?.poster || '').trim(),
      };
    })
    .filter(Boolean);
}

function getLibraryMediaItemsByCardId(cardId) {
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
        <strong id="media-modal-title"></strong>
        <button type="button" class="media-modal-close" id="media-modal-close">닫기</button>
      </div>
      <div class="media-modal-body" id="media-modal-body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const modalTitle = modal.querySelector('#media-modal-title');
  const modalBody = modal.querySelector('#media-modal-body');
  const modalClose = modal.querySelector('#media-modal-close');

  const openModal = (index) => {
    const media = mediaItems[index];
    if (!media) return;

    modal.classList.add('open');
    modalTitle.textContent = media.title || `${mediaTypeLabel(media.type)} ${index + 1}`;
    if (media.type === 'video') {
      modalBody.innerHTML = `<video controls autoplay playsinline ${
        media.poster ? `poster="${esc(media.poster)}"` : ''
      }><source src="${esc(media.src)}" /></video>`;
    } else {
      modalBody.innerHTML = `<img src="${esc(media.src)}" alt="${esc(media.title || `media-${index + 1}`)}" />`;
    }
  };

  const closeModal = () => {
    modal.classList.remove('open');
    modalBody.innerHTML = '';
  };

  frames.forEach((frame) => {
    frame.addEventListener('click', () => {
      const idx = Number(frame.getAttribute('data-media-index'));
      openModal(idx);
    });
  });

  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
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
  all: {
    pains: ['제품군 확장 시 운영 복잡도 증가', '시스템 간 연동 단절', '운영 기준 불일치'],
    how: ['표준 데이터/권한 모델', '공통 운영 정책', '단계별 확장 로드맵'],
    scenarios: ['다사업 통합 운영', '전사 모니터링', '서비스 표준화'],
    integration: ['SSO', '권한 체계', '통합 모니터링', 'API Gateway'],
  },
};

const detailOverridesById = {
  'ai-udt-tennis': {
    pains: [
      '동호인 스윙 교정이 코치 주관과 현장 제약에 크게 의존',
      '촬영 영상은 있어도 기술적 분석 지표가 부족해 개선 포인트 도출이 어려움',
      '코칭 피드백이 전문 용어 중심으로 제공되어 일반 사용자가 이해하기 어려움',
    ],
    how: [
      '스마트폰 영상 업로드 후 비동기 파이프라인으로 자동 분석',
      'MediaPipe 포즈 추정과 EfficientDet 라켓 감지를 결합한 이중 AI 분석',
      'LLM 기반 자연어 코칭으로 교정 포인트/연습 방법을 이해하기 쉽게 전달',
    ],
    scenarios: [
      '개인 동호인 스윙 교정 및 셀프 트레이닝',
      '테니스 아카데미 레슨 전/후 성과 비교 리포트',
      '온라인 코칭 서비스의 비대면 분석 모듈',
    ],
    integration: [
      'Backend: Python FastAPI + WebSocket',
      'Frontend: HTML5, CSS3, Canvas API, Vanilla JS SPA',
      'Database: MariaDB',
      'Admin: ASP.NET Core MVC + Entity Framework',
      'LLM: LM Studio / Claude API 연동',
    ],
    features: [
      '영상 업로드 & 트림: 드래그 앤 드롭, 듀얼 핸들 타임라인(최대 3분)',
      '실시간 스켈레톤 오버레이: 33개 관절 추적 및 각도 시각화',
      '6대 키 모먼트 자동 감지: 최대 외회전/손목 최고 속도/임팩트 등',
      '레이더 차트 & 등급 평가: S~D 등급 및 종합 스윙 퀄리티 시각화',
      'AI 자연어 코칭: 분석 데이터 기반 교정 포인트/훈련 방법 제공',
      '관리자 CMS: 회원/분석/코칭 데이터 관리, 키 모먼트 편집',
      '8단계 스윙 페이즈 자동 분류: Ready~Recovery',
      '9개 핵심 메트릭 스코어링: 0~100점',
    ],
    techSpecs: [
      {
        title: 'AI/ML',
        items: ['MediaPipe PoseLandmarker', 'EfficientDet-Lite0 (라켓 감지)'],
      },
      {
        title: 'Backend',
        items: ['Python FastAPI', 'WebSocket', '비동기 영상 분석 파이프라인'],
      },
      {
        title: 'Frontend',
        items: ['HTML5', 'CSS3', 'Canvas API', 'Vanilla JS SPA', '다크 테마'],
      },
      {
        title: 'Data & Admin',
        items: ['MariaDB', 'ASP.NET Core MVC', 'Entity Framework'],
      },
    ],
    kpis: [
      { value: '33', title: '관절 포인트 분석', desc: '스윙 전 구간의 관절 움직임 정밀 추적' },
      { value: '9', title: '핵심 메트릭', desc: '스윙 품질을 정량화하는 핵심 지표 스코어링' },
      { value: '8', title: '스윙 페이즈', desc: 'Ready부터 Recovery까지 자동 분류' },
    ],
  },
};

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function render() {
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
  const override = detailOverridesById[card.id] || null;

  const featureItems = override?.features || card.features || [];
  const painItems = override?.pains || groupText.pains;
  const howItems = override?.how || groupText.how;
  const scenarioItems = override?.scenarios || groupText.scenarios;
  const integrationItems = override?.integration || groupText.integration;
  const overrideMedia = normalizeMediaItems(override?.media || []);
  const cardMedia = normalizeMediaItems(card.media || []);
  const libraryMedia = getLibraryMediaItemsByCardId(card.id);
  const mediaItems = libraryMedia.length ? libraryMedia : overrideMedia.length ? overrideMedia : cardMedia;

  const features = featureItems.map((item) => `<li>${esc(item)}</li>`).join('');
  const pains = painItems.map((item) => `<li>${esc(item)}</li>`).join('');
  const how = howItems.map((item) => `<li>${esc(item)}</li>`).join('');
  const scenarios = scenarioItems.map((item) => `<li>${esc(item)}</li>`).join('');
  const integrations = integrationItems.map((item) => `<li>${esc(item)}</li>`).join('');

  const techSpecSection = override?.techSpecs
    ? `<section class="section">
        <h2>기술 스펙</h2>
        <div class="grid-2">
          ${override.techSpecs
            .map(
              (spec) => `<article class="card"><h3>${esc(spec.title)}</h3><ul>${(spec.items || [])
                .map((item) => `<li>${esc(item)}</li>`)
                .join('')}</ul></article>`
            )
            .join('')}
        </div>
      </section>`
    : '';

  const kpiData =
    override?.kpis || [
      { value: '+32%', title: '운영 효율 개선', desc: '자동화된 처리 흐름으로 운영 효율 향상' },
      { value: '-27%', title: '대기시간 단축', desc: '핵심 동선 개선과 자동 안내로 지연 최소화' },
      { value: '99.9%', title: '안정적 운영', desc: '표준 운영 정책 기반의 고가용성 서비스' },
    ];

  const related = cards
    .filter((item) => item.enabled !== false && item.group === card.group && item.id !== card.id)
    .slice(0, 3)
    .map(
      (item) =>
        `<div class="related-item"><span>${esc(item.title)}</span><a href="solution-detail.html?id=${encodeURIComponent(item.id)}">상세보기</a></div>`
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
          <a class="btn primary" href="mailto:hello@bithappens.com">도입 문의</a>
          <a class="btn ghost" href="index.html#plans">다른 패키지 보기</a>
        </div>
      </div>
      <aside class="hero-meta">
        <p><strong>적용 산업:</strong> ${esc(card.industry || '-')}</p>
        <p><strong>구축 기간:</strong> ${esc(card.period || '-')}</p>
        <p><strong>연동 범위:</strong> ${esc(card.integration || '-')}</p>
        <p><strong>사업 영역:</strong> ${esc((card.group || '').toUpperCase())}</p>
      </aside>
    </section>

    <section class="section">
      <h2>문제 정의</h2>
      <ul>${pains}</ul>
    </section>

    <section class="section grid-2">
      <article class="card">
        <h3>해결 방식</h3>
        <ul>${how}</ul>
      </article>
      <article class="card">
        <h3>핵심 기능</h3>
        <ul>${features}</ul>
      </article>
    </section>

    <section class="section grid-2">
      <article class="card">
        <h3>적용 시나리오</h3>
        <ul>${scenarios}</ul>
      </article>
      <article class="card">
        <h3>기술 연동</h3>
        <ul>${integrations}</ul>
      </article>
    </section>

    ${renderMediaSection(mediaItems)}

    ${techSpecSection}

    <section class="section grid-3">
      ${kpiData
        .map(
          (kpi) => `<article class="card"><p class="kpi">${esc(kpi.value)}</p><h3>${esc(kpi.title)}</h3><p>${esc(
            kpi.desc
          )}</p></article>`
        )
        .join('')}
    </section>

    <section class="section">
      <h2>도입 절차</h2>
      <div class="grid-2">
        <article class="card"><h3>1. 진단</h3><p>운영 환경 및 목표 KPI 정의</p></article>
        <article class="card"><h3>2. 파일럿</h3><p>핵심 기능 검증 및 성능 측정</p></article>
        <article class="card"><h3>3. 확장</h3><p>다지점/대규모 환경 단계적 배포</p></article>
        <article class="card"><h3>4. 안정화</h3><p>관제, 대응, 운영 정책 정착</p></article>
      </div>
    </section>

    <section class="section">
      <h2>관련 솔루션</h2>
      <div class="related-list">${related || '<p>관련 솔루션이 없습니다.</p>'}</div>
    </section>
  `;

  attachMediaInteractions(mediaItems);
}

render();
