const __session = window.BitHappenAdminAuth?.requireAuth?.();
if (!__session) {
  throw new Error('not authenticated');
}

const STORAGE_KEY = 'bitHappenMediaLibrary_v1';
const LIBRARY_FILE_NAME = 'media-library.js';
const MEDIA_BASE_PATH = 'assets/media/';
const DEFAULT_MEDIA_STATE_KEY = 'mediaLibrary';

const form = document.getElementById('upload-form');
const cardSelect = document.getElementById('card-id');
const fileInput = document.getElementById('files');
const representativeInput = document.getElementById('representative-thumb');
const titleInput = document.getElementById('title');
const urlTypeSelect = document.getElementById('url-type');
const mediaUrlInput = document.getElementById('media-url');
const posterUrlInput = document.getElementById('poster-url');
const previewMediaUrlButton = document.getElementById('preview-media-url');
const addMediaUrlButton = document.getElementById('add-media-url');
const resetButton = document.getElementById('reset-library');
const filterSelect = document.getElementById('filter-card');
const copyJsonButton = document.getElementById('copy-json');
const copyLibraryFileButton = document.getElementById('copy-library-file');
const libraryRoot = document.getElementById('library');
const selectedPreviewRoot = document.getElementById('selected-preview');
const urlPreviewRoot = document.getElementById('url-preview');
const MAX_VIDEO_UPLOAD_BYTES = 10 * 1024 * 1024;
let selectedPreviewUrls = [];
let libraryCache = [];

function esc(value) {
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
  if (value.startsWith('../assets/')) return value;
  if (value.startsWith('../') || value.startsWith('./')) return value;
  if (value.startsWith('assets/')) return `../${value}`;
  return value;
}

function normalizeStoredAssetPath(src) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (value.startsWith('../assets/')) return value.slice(3);
  if (value.startsWith('./assets/')) return value.slice(2);
  return value;
}

function normalizeLibraryItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    ...item,
    src: normalizeStoredAssetPath(item?.src),
    poster: normalizeStoredAssetPath(item?.poster),
  }));
}

function getCards() {
  if (!window.BitHappenCardStore) return [];
  return window.BitHappenCardStore.getCards().filter((card) => card.enabled !== false);
}

function loadLibrary() {
  return libraryCache.map((item) => ({ ...item }));
}

function loadLocalOrSourceLibrary() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? normalizeLibraryItems(parsed) : [];
    }

    const sourceItems = window.BitHappenMediaLibrary?.items;
    if (Array.isArray(sourceItems)) {
      return normalizeLibraryItems(sourceItems.map((item) => ({ ...item })));
    }

    return [];
  } catch (_error) {
    const sourceItems = window.BitHappenMediaLibrary?.items;
    return Array.isArray(sourceItems) ? normalizeLibraryItems(sourceItems.map((item) => ({ ...item }))) : [];
  }
}

function saveLibrary(items) {
  const normalizedItems = normalizeLibraryItems(items);
  libraryCache = Array.isArray(normalizedItems) ? normalizedItems.map((item) => ({ ...item })) : [];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedItems));
  } catch (error) {
    if (error && error.name === 'QuotaExceededError') {
      throw new Error('브라우저 저장 공간이 부족합니다. 동영상은 assets 폴더 경로(URL) 방식으로 등록해 주세요.');
    }
    throw error;
  }
}

function getSupabaseConfig() {
  const cfg = window.BitHappenSupabaseConfig || {};
  const url = String(cfg.url || '').trim().replace(/\/$/, '');
  const anonKey = String(cfg.anonKey || '').trim();
  const mediaStateKey = String(cfg.mediaStateKey || DEFAULT_MEDIA_STATE_KEY).trim() || DEFAULT_MEDIA_STATE_KEY;
  const enabled = Boolean(url && anonKey);
  return { enabled, url, anonKey, mediaStateKey };
}

async function fetchLibraryFromSupabase() {
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) return null;

  const endpoint = `${cfg.url}/rest/v1/site_state?key=eq.${encodeURIComponent(cfg.mediaStateKey)}&select=value&limit=1`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase fetch failed: ${response.status}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const value = rows[0]?.value;
  return Array.isArray(value) ? normalizeLibraryItems(value) : null;
}

async function saveLibraryToSupabase(items) {
  const cfg = getSupabaseConfig();
  if (!cfg.enabled) return { remote: false, reason: 'disabled' };

  const endpoint = `${cfg.url}/rest/v1/site_state?on_conflict=key`;
  const payload = [
    {
      key: cfg.mediaStateKey,
      value: normalizeLibraryItems(items),
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
    throw new Error(`Supabase save failed: ${response.status}`);
  }

  return { remote: true };
}

async function persistLibrary(items) {
  saveLibrary(items);
  try {
    const result = await saveLibraryToSupabase(normalizeLibraryItems(items));
    return result;
  } catch (_error) {
    return { remote: false, reason: 'save-failed' };
  }
}

async function initializeLibrary() {
  const localOrSource = loadLocalOrSourceLibrary();
  saveLibrary(localOrSource);
  renderLibrary();

  try {
    const remote = await fetchLibraryFromSupabase();
    if (Array.isArray(remote)) {
      saveLibrary(remote);
      renderLibrary();
      return;
    }

    const cfg = getSupabaseConfig();
    if (cfg.enabled && localOrSource.length > 0) {
      await saveLibraryToSupabase(localOrSource);
    }
  } catch (_error) {
    // Supabase 연결이 없거나 실패하면 로컬/소스 데이터를 유지합니다.
  }
}

function formatLibraryFileContent(items) {
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items,
  };

  return `window.BitHappenMediaLibrary = ${JSON.stringify(payload, null, 2)};`;
}

function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageSize(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = resolveMediaPath(src);
  });
}

function getVideoSize(src) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.playsInline = true;
    const fallback = setTimeout(() => resolve({ width: 0, height: 0 }), 5000);
    video.onloadedmetadata = () => {
      clearTimeout(fallback);
      resolve({ width: video.videoWidth || 0, height: video.videoHeight || 0 });
    };
    video.onerror = () => {
      clearTimeout(fallback);
      resolve({ width: 0, height: 0 });
    };
    video.src = resolveMediaPath(src);
  });
}

async function getMediaInfo(type, src) {
  if (type === 'video') {
    return getVideoSize(src);
  }
  return getImageSize(src);
}

function detectMediaType(file) {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  return null;
}

function detectMediaTypeFromUrl(url) {
  const lower = String(url || '').toLowerCase();
  if (/\.(mp4|webm|ogg|mov)(\?|#|$)/.test(lower)) return 'video';
  if (/\.(png|jpg|jpeg|webp|gif|bmp|svg)(\?|#|$)/.test(lower)) return 'image';
  return null;
}

function normalizeMediaFileName(value) {
  const fileName = String(value || '').trim();
  if (!fileName) return '';

  if (fileName.includes('/') || fileName.includes('\\')) {
    return null;
  }

  return fileName;
}

function toMediaAssetUrl(fileName) {
  return `${MEDIA_BASE_PATH}${fileName}`;
}

function resolveUrlMediaType(url, selectedType) {
  const picked = String(selectedType || 'auto');
  const detectedType = detectMediaTypeFromUrl(url);
  return picked === 'auto' ? detectedType : picked;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** idx;
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function getDisplayFileName(item) {
  const explicit = String(item?.fileName || '').trim();
  if (explicit) return explicit;

  const src = String(item?.src || '').trim();
  if (!src) return '-';
  const clean = src.split('#')[0].split('?')[0];
  const extracted = clean.split('/').pop();
  return extracted || '-';
}

function clearSelectedPreview() {
  selectedPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  selectedPreviewUrls = [];
  selectedPreviewRoot.innerHTML = '<p class="empty">선택된 파일이 없습니다.</p>';
}

function attachRatioForPreview(frame) {
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
    return;
  }

  const video = mediaEl;
  if (video.videoWidth && video.videoHeight) {
    applyRatio(video.videoWidth, video.videoHeight);
  } else {
    video.addEventListener('loadedmetadata', () => applyRatio(video.videoWidth, video.videoHeight), { once: true });
  }
}

function renderSelectedPreview(files) {
  if (!files.length) {
    clearSelectedPreview();
    return;
  }

  clearSelectedPreview();
  const validFiles = files.filter((file) => detectMediaType(file));
  if (!validFiles.length) {
    selectedPreviewRoot.innerHTML = '<p class="empty">미리보기 가능한 파일이 없습니다.</p>';
    return;
  }

  selectedPreviewRoot.innerHTML = validFiles
    .map((file, index) => {
      const type = detectMediaType(file);
      const objectUrl = URL.createObjectURL(file);
      selectedPreviewUrls.push(objectUrl);
      const mediaType = type === 'video' ? 'VIDEO' : 'IMAGE';
      const preview =
        type === 'video'
          ? `<video src="${esc(objectUrl)}" preload="metadata" muted playsinline></video>`
          : `<img src="${esc(objectUrl)}" alt="${esc(file.name)}" loading="lazy" />`;

      return `
        <article class="selected-preview-item">
          <div class="media-frame" data-preview-index="${index}">
            <span class="media-type">${mediaType}</span>
            ${preview}
          </div>
          <div class="meta">
            <strong>${esc(file.name)}</strong>
            <p>${esc(type || 'unknown')} / ${formatBytes(file.size)}</p>
          </div>
        </article>
      `;
    })
    .join('');

  Array.from(selectedPreviewRoot.querySelectorAll('.media-frame')).forEach((frame) => attachRatioForPreview(frame));
}

function makeCardOptions() {
  const cards = getCards();
  const options = cards
    .map((card) => `<option value="${card.id}">${card.title} (${String(card.group || '').toUpperCase()})</option>`)
    .join('');

  cardSelect.innerHTML = options;
  filterSelect.innerHTML = `<option value="all">전체 카드</option>${options}`;
}

function currentCardTitle(cardId) {
  const card = getCards().find((item) => item.id === cardId);
  return card ? card.title : cardId;
}

function normalizeRepresentativeByCard(items, cardId, representativeId) {
  return items.map((item) => {
    if (!item || item.cardId !== cardId) return item;
    return {
      ...item,
      isRepresentative: item.id === representativeId,
    };
  });
}

function renderLibrary() {
  const library = loadLibrary();
  const filterId = filterSelect.value || 'all';
  const list = filterId === 'all' ? library : library.filter((item) => item.cardId === filterId);

  if (list.length === 0) {
    libraryRoot.innerHTML = '<p class="empty">등록된 미디어가 없습니다.</p>';
    return;
  }

  libraryRoot.innerHTML = list
    .map((item) => {
      const ratio = item.width && item.height ? (item.width / item.height).toFixed(4) : '1.778';
      const title = item.title || item.fileName || '제목 없음';
      const mediaType = item.type === 'video' ? 'VIDEO' : 'IMAGE';
      const preview =
        item.type === 'video'
          ? `<video src="${esc(resolveMediaPath(item.src))}" ${item.poster ? `poster="${esc(resolveMediaPath(item.poster))}"` : ''} preload="metadata" muted playsinline></video>`
          : `<img src="${esc(resolveMediaPath(item.src))}" alt="${esc(title)}" loading="lazy" />`;
      const sourceLabel = item.sourceMode === 'url' ? 'URL 등록' : '파일 업로드';
      const representativeLabel = item.isRepresentative ? '<p class="rep-badge">대표 썸네일</p>' : '';
      return `
        <article class="media-item" data-id="${item.id}">
          <div class="media-frame" style="--ratio:${ratio}">
            <span class="media-type">${mediaType}</span>
            ${preview}
          </div>
          <div class="meta">
            <strong>${esc(title)}</strong>
            ${representativeLabel}
            <p>파일명: ${esc(getDisplayFileName(item))}</p>
            <p>카드: ${esc(currentCardTitle(item.cardId))}</p>
            <p>저장 방식: ${esc(sourceLabel)}</p>
            <p>${item.width || '-'} x ${item.height || '-'} / ${new Date(item.createdAt).toLocaleString('ko-KR')}</p>
          </div>
          <div class="item-actions">
            <button type="button" data-action="set-representative" ${item.type !== 'image' ? 'disabled' : ''}>대표 지정</button>
            <button type="button" data-action="delete">삭제</button>
          </div>
        </article>
      `;
    })
    .join('');

  Array.from(libraryRoot.querySelectorAll('[data-action="delete"]')).forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('.media-item');
      const id = card?.getAttribute('data-id');
      if (!id) return;

      const next = loadLibrary().filter((item) => item.id !== id);
      const result = await persistLibrary(next);
      renderLibrary();
      if (result.remote === false) {
        alert('원격(Supabase) 동기화에 실패했습니다. 연결 상태를 확인해 주세요.');
      }
    });
  });

  Array.from(libraryRoot.querySelectorAll('[data-action="set-representative"]')).forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('.media-item');
      const id = card?.getAttribute('data-id');
      if (!id) return;

      const listAll = loadLibrary();
      const target = listAll.find((item) => item.id === id);
      if (!target) return;
      if (target.type !== 'image') {
        alert('대표 썸네일은 이미지만 지정할 수 있습니다.');
        return;
      }

      const next = normalizeRepresentativeByCard(listAll, target.cardId, target.id);
      const result = await persistLibrary(next);
      renderLibrary();
      if (result.remote === false) {
        alert('대표 썸네일은 로컬에 저장되었지만 Supabase 동기화에 실패했습니다.');
        return;
      }
      alert('대표 썸네일로 지정했습니다.');
    });
  });
}

function renderUrlPreview() {
  const inputValue = String(mediaUrlInput.value || '').trim();
  const poster = String(posterUrlInput.value || '').trim();
  const selectedType = String(urlTypeSelect.value || 'auto');

  if (!inputValue) {
    urlPreviewRoot.innerHTML = '<p class="empty">미리보기할 URL을 입력해 주세요.</p>';
    return;
  }

  const fileName = normalizeMediaFileName(inputValue);
  if (fileName === null) {
    urlPreviewRoot.innerHTML = '<p class="empty">파일명만 입력해 주세요. 경로 구분자(/, \\)는 사용할 수 없습니다.</p>';
    return;
  }

  const url = toMediaAssetUrl(fileName);

  const mediaType = resolveUrlMediaType(url, selectedType);
  if (!mediaType) {
    urlPreviewRoot.innerHTML =
      '<p class="empty">URL 타입 자동 판별에 실패했습니다. URL 타입을 직접 선택해 주세요.</p>';
    return;
  }

  const title = String(titleInput.value || '').trim() || fileName || mediaType;
  const preview =
    mediaType === 'video'
      ? `<video src="${esc(resolveMediaPath(url))}" ${poster ? `poster="${esc(resolveMediaPath(poster))}"` : ''} preload="metadata" muted playsinline></video>`
      : `<img src="${esc(resolveMediaPath(url))}" alt="${esc(title)}" loading="lazy" />`;

  urlPreviewRoot.innerHTML = `
    <article class="media-item">
      <div class="media-frame">
        <span class="media-type">${mediaType === 'video' ? 'VIDEO' : 'IMAGE'}</span>
        ${preview}
      </div>
      <div class="meta">
        <strong>${esc(title)}</strong>
        <p>${esc(mediaType)} / URL 미리보기</p>
      </div>
    </article>
  `;

  const frame = urlPreviewRoot.querySelector('.media-frame');
  if (frame) attachRatioForPreview(frame);
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

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const files = Array.from(fileInput.files || []);
  if (!files.length) return;

  const cardId = cardSelect.value;
  const title = titleInput.value.trim();
  const wantsRepresentative = representativeInput?.checked === true;
  const current = loadLibrary();
  let uploadedCount = 0;
  let representativeAssigned = false;

  try {
    for (const file of files) {
      const mediaType = detectMediaType(file);
      if (!mediaType) continue;

      if (mediaType === 'video' && file.size > MAX_VIDEO_UPLOAD_BYTES) {
        throw new Error(
          `동영상 ${file.name} 용량이 너무 큽니다. 현재 브라우저 저장 방식에서는 10MB 이하만 권장됩니다. assets 폴더 경로(URL) 방식 사용을 권장합니다.`
        );
      }

      const src = await toDataUrl(file);
      const size = await getMediaInfo(mediaType, src);
      const id = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const isRepresentative =
        wantsRepresentative && mediaType === 'image' && representativeAssigned === false;
      if (isRepresentative) {
        representativeAssigned = true;
      }

      current.push({
        id,
        cardId,
        type: mediaType,
        title: title || file.name,
        fileName: file.name,
        src,
        poster: '',
        sourceMode: 'dataurl',
        width: size.width,
        height: size.height,
        isRepresentative,
        createdAt: Date.now(),
      });
      uploadedCount += 1;
    }

    let nextItems = current;
    if (representativeAssigned) {
      const representativeItem = current
        .slice()
        .reverse()
        .find((item) => item.cardId === cardId && item.isRepresentative === true);
      if (representativeItem) {
        nextItems = normalizeRepresentativeByCard(current, cardId, representativeItem.id);
      }
    }

    if (uploadedCount === 0) {
      alert('업로드 가능한 파일이 없습니다. 이미지 또는 동영상 파일을 선택해 주세요.');
      return;
    }

    const result = await persistLibrary(nextItems);
    form.reset();
    clearSelectedPreview();
    makeCardOptions();
    renderLibrary();
    if (result.remote === false) {
      alert('파일은 로컬에 저장되었지만 Supabase 동기화에 실패했습니다.');
      return;
    }
    alert(`${uploadedCount}개 파일 업로드를 저장했습니다.`);
  } catch (error) {
    alert(error instanceof Error ? error.message : '업로드 저장 중 오류가 발생했습니다.');
  }
});

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  renderSelectedPreview(files);
});

addMediaUrlButton.addEventListener('click', async () => {
  const cardId = cardSelect.value;
  const inputValue = String(mediaUrlInput.value || '').trim();
  const selectedType = String(urlTypeSelect.value || 'auto');
  const poster = String(posterUrlInput.value || '').trim();
  const title = String(titleInput.value || '').trim();
  const wantsRepresentative = representativeInput?.checked === true;

  if (!cardId) {
    alert('카드를 먼저 선택해 주세요.');
    return;
  }

  if (!inputValue) {
    alert('미디어 파일명을 입력해 주세요.');
    return;
  }

  const fileName = normalizeMediaFileName(inputValue);
  if (fileName === null) {
    alert('파일명만 입력해 주세요. 경로 구분자(/, \\)는 사용할 수 없습니다.');
    return;
  }

  const url = toMediaAssetUrl(fileName);

  const mediaType = resolveUrlMediaType(url, selectedType);
  if (!mediaType) {
    alert('URL 타입을 자동 판별하지 못했습니다. 타입을 이미지/동영상으로 직접 선택해 주세요.');
    return;
  }

  try {
    const size = mediaType === 'video' ? await getVideoSize(url) : await getImageSize(url);
    const current = loadLibrary();
    const id = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const isRepresentative = wantsRepresentative && mediaType === 'image';
    current.push({
      id,
      cardId,
      type: mediaType,
      title: title || fileName || mediaType,
      fileName: fileName || mediaType,
      src: url,
      poster: mediaType === 'video' ? poster : '',
      sourceMode: 'url',
      width: size.width,
      height: size.height,
      isRepresentative,
      createdAt: Date.now(),
    });

    const next = isRepresentative ? normalizeRepresentativeByCard(current, cardId, id) : current;
    const result = await persistLibrary(next);
    mediaUrlInput.value = '';
    posterUrlInput.value = '';
    urlPreviewRoot.innerHTML = '<p class="empty">미리보기할 URL을 입력해 주세요.</p>';
    renderLibrary();
    if (result.remote === false) {
      alert('URL은 로컬에 저장되었지만 Supabase 동기화에 실패했습니다.');
      return;
    }
    alert(`${mediaType === 'video' ? '동영상' : '이미지'} URL을 라이브러리에 추가했습니다.`);
  } catch (_error) {
    alert('미디어 URL 등록 중 오류가 발생했습니다. URL을 확인해 주세요.');
  }
});

previewMediaUrlButton.addEventListener('click', renderUrlPreview);
mediaUrlInput.addEventListener('input', renderUrlPreview);
posterUrlInput.addEventListener('input', renderUrlPreview);
urlTypeSelect.addEventListener('change', renderUrlPreview);

filterSelect.addEventListener('change', renderLibrary);

copyJsonButton.addEventListener('click', async () => {
  const selected = filterSelect.value;
  if (!selected || selected === 'all') {
    alert('특정 카드를 선택한 뒤 JSON을 복사해 주세요.');
    return;
  }

  const media = loadLibrary()
    .filter((item) => item.cardId === selected)
    .map((item) => ({
      type: item.type === 'video' ? 'video' : 'image',
      src: item.src,
      title: item.title,
      ...(item.poster ? { poster: item.poster } : {}),
    }));

  if (!media.length) {
    alert('선택한 카드에 등록된 미디어가 없습니다.');
    return;
  }

  const snippet = `media: ${JSON.stringify(media, null, 2)}`;
  await copyText(snippet);
  alert('media 배열 코드가 복사되었습니다. solution-detail.js override에 붙여넣으세요.');
});

resetButton.addEventListener('click', async () => {
  if (!confirm('현재 미디어 라이브러리를 초기화할까요? (Supabase에도 반영됩니다)')) return;
  const result = await persistLibrary([]);
  localStorage.removeItem(STORAGE_KEY);
  renderLibrary();
  form.reset();
  clearSelectedPreview();
  renderUrlPreview();
  if (result.remote === false) {
    alert('초기화는 로컬에만 반영되었습니다. Supabase 동기화에 실패했습니다.');
  }
});

copyLibraryFileButton.addEventListener('click', async () => {
  const library = loadLibrary();
  const fileContent = formatLibraryFileContent(library);
  await copyText(fileContent);
  alert(`${LIBRARY_FILE_NAME} 반영용 코드가 복사되었습니다. ${LIBRARY_FILE_NAME} 파일 전체 내용을 교체한 뒤 커밋/배포해 주세요.`);
});

makeCardOptions();
clearSelectedPreview();
renderUrlPreview();
initializeLibrary();
