const __session = window.BitHappenAdminAuth?.requireAuth?.();
if (!__session) {
  throw new Error('not authenticated');
}

const STORAGE_KEY = 'bitHappenMediaLibrary_v1';
const LIBRARY_FILE_NAME = 'media-library.js';
const MEDIA_BASE_PATH = 'assets/media/';
const DEFAULT_MEDIA_STATE_KEY = 'mediaLibrary';
const MEDIA_DIR_DB_NAME = 'bitHappenMediaDirectory';
const MEDIA_DIR_STORE_NAME = 'handles';
const MEDIA_DIR_HANDLE_KEY = 'assets-media';

const form = document.getElementById('upload-form');
const cardSelect = document.getElementById('card-id');
const fileInput = document.getElementById('files');
const representativeInput = document.getElementById('representative-thumb');
const titleInput = document.getElementById('title');
const urlTypeSelect = document.getElementById('url-type');
const mediaUrlInput = document.getElementById('media-url');
const localImageFilesInput = document.getElementById('local-image-files');
const posterUrlInput = document.getElementById('poster-url');
const connectMediaDirectoryButton = document.getElementById('connect-media-directory');
const previewMediaUrlButton = document.getElementById('preview-media-url');
const addMediaUrlButton = document.getElementById('add-media-url');
const resetButton = document.getElementById('reset-library');
const filterSelect = document.getElementById('filter-card');
const copyJsonButton = document.getElementById('copy-json');
const copyLibraryFileButton = document.getElementById('copy-library-file');
const libraryRoot = document.getElementById('library');
const selectedPreviewRoot = document.getElementById('selected-preview');
const mediaDirectoryStatus = document.getElementById('media-directory-status');
const localImageStatus = document.getElementById('local-image-status');
const urlPreviewRoot = document.getElementById('url-preview');
let selectedPreviewUrls = [];
let urlPreviewObjectUrls = [];
let libraryCache = [];
let mediaDirectoryHandle = null;

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

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeAssetImagePathToWebp(src) {
  const value = String(src || '').trim();
  if (!value) return '';
  return value.replace(/((?:\.\.\/|\.\/)?assets\/media\/[^?#]+)\.(png|jpg|jpeg)(?=([?#].*)?$)/i, '$1.webp');
}

function resolveMediaPath(src) {
  const value = normalizeAssetImagePathToWebp(src);
  if (!value) return '';

  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  if (value.startsWith('/')) return value;
  if (value.startsWith('../assets/')) return value;
  if (value.startsWith('../') || value.startsWith('./')) return value;
  if (value.startsWith('assets/')) return `../${value}`;
  return value;
}

function normalizeStoredAssetPath(src) {
  const value = normalizeAssetImagePathToWebp(src);
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

function updateMediaDirectoryStatus(message, state = 'default') {
  if (!mediaDirectoryStatus) return;
  mediaDirectoryStatus.textContent = message;
  mediaDirectoryStatus.dataset.state = state;
}

function updateLocalImageStatus() {
  if (!localImageStatus || !localImageFilesInput) return;

  const files = Array.from(localImageFilesInput.files || []);
  if (!files.length) {
    localImageStatus.textContent = '선택된 로컬 이미지가 없습니다.';
    return;
  }

  const previewNames = files.slice(0, 3).map((file) => file.name).join(', ');
  const suffix = files.length > 3 ? ` 외 ${files.length - 3}개` : '';
  localImageStatus.textContent = `선택됨: ${previewNames}${suffix}`;
}

function clearUrlPreviewObjectUrls() {
  urlPreviewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  urlPreviewObjectUrls = [];
}

function openMediaDirectoryDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('브라우저가 IndexedDB를 지원하지 않습니다.'));
      return;
    }

    const request = window.indexedDB.open(MEDIA_DIR_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_DIR_STORE_NAME)) {
        db.createObjectStore(MEDIA_DIR_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('미디어 디렉터리 저장소를 열지 못했습니다.'));
  });
}

async function saveMediaDirectoryHandle(handle) {
  const db = await openMediaDirectoryDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_DIR_STORE_NAME, 'readwrite');
    tx.objectStore(MEDIA_DIR_STORE_NAME).put(handle, MEDIA_DIR_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('미디어 폴더 핸들을 저장하지 못했습니다.'));
  });
  db.close();
}

async function loadStoredMediaDirectoryHandle() {
  const db = await openMediaDirectoryDatabase();
  const handle = await new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_DIR_STORE_NAME, 'readonly');
    const request = tx.objectStore(MEDIA_DIR_STORE_NAME).get(MEDIA_DIR_HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('저장된 미디어 폴더 핸들을 읽지 못했습니다.'));
  });
  db.close();
  return handle;
}

async function restoreMediaDirectoryHandle() {
  if (!window.showDirectoryPicker || !window.indexedDB) return null;

  try {
    const storedHandle = await loadStoredMediaDirectoryHandle();
    if (!storedHandle) return null;

    mediaDirectoryHandle = storedHandle;
    const permission = await storedHandle.queryPermission?.({ mode: 'readwrite' });
    if (permission === 'granted') {
      updateMediaDirectoryStatus('연결 복원됨: assets/media 폴더', 'connected');
      return storedHandle;
    }

    updateMediaDirectoryStatus('저장된 assets/media 폴더를 찾았습니다. 버튼을 눌러 권한을 다시 허용하세요.', 'warning');
    return storedHandle;
  } catch (_error) {
    updateMediaDirectoryStatus('저장된 media 폴더 연결을 복원하지 못했습니다.', 'warning');
    return null;
  }
}

async function verifyMediaDirectoryPermission(handle) {
  if (!handle) return false;
  const options = { mode: 'readwrite' };
  if ((await handle.queryPermission?.(options)) === 'granted') return true;
  return (await handle.requestPermission?.(options)) === 'granted';
}

async function ensureMediaDirectoryHandle() {
  if (!window.showDirectoryPicker) {
    throw new Error('이 기능은 Chrome 기반 브라우저에서 Live Server처럼 보안 컨텍스트로 실행될 때만 지원됩니다.');
  }

  if (mediaDirectoryHandle && (await verifyMediaDirectoryPermission(mediaDirectoryHandle))) {
    updateMediaDirectoryStatus(`연결됨: ${mediaDirectoryHandle.name}`, 'connected');
    return mediaDirectoryHandle;
  }

  const pickedHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'bit-happen-media-dir' });
  if (!pickedHandle) {
    throw new Error('assets/media 폴더 선택이 취소되었습니다.');
  }

  if (pickedHandle.name !== 'media') {
    const shouldContinue = window.confirm('선택한 폴더 이름이 media 가 아닙니다. 그래도 계속하시겠습니까?');
    if (!shouldContinue) {
      throw new Error('assets/media 폴더를 다시 선택해 주세요.');
    }
    updateMediaDirectoryStatus(`주의: ${pickedHandle.name} 폴더가 연결되었습니다.`, 'warning');
  }

  const granted = await verifyMediaDirectoryPermission(pickedHandle);
  if (!granted) {
    throw new Error('assets/media 폴더에 대한 읽기/쓰기 권한이 필요합니다.');
  }

  mediaDirectoryHandle = pickedHandle;
  await saveMediaDirectoryHandle(pickedHandle);
  if (pickedHandle.name === 'media') {
    updateMediaDirectoryStatus('연결됨: assets/media 폴더', 'connected');
  }
  return pickedHandle;
}

function replaceExtensionWithWebp(fileName) {
  const name = String(fileName || '').trim();
  if (!name) return `image-${Date.now()}.webp`;
  return /\.[^.]+$/.test(name) ? name.replace(/\.[^.]+$/, '.webp') : `${name}.webp`;
}

function buildCustomWebpFileName(baseName, index = 0, total = 1) {
  const rawBase = String(baseName || '').trim();
  const sanitizedBase = rawBase.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  const fallbackBase = sanitizedBase || `image-${Date.now()}`;
  if (total <= 1) {
    return replaceExtensionWithWebp(fallbackBase);
  }
  return replaceExtensionWithWebp(`${fallbackBase}-${index + 1}`);
}

function buildUploadedMediaFileName(baseName, originalName, index = 0, total = 1) {
  const rawBase = String(baseName || '').trim();
  const original = String(originalName || '').trim();
  const originalExtMatch = original.match(/\.[^.]+$/);
  const originalExtension = originalExtMatch ? originalExtMatch[0] : '';
  const sanitizedBase = rawBase.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  const fallbackBase = stripFileExtension(original) || `media-${Date.now()}`;
  const resolvedBase = stripFileExtension(sanitizedBase) || fallbackBase;
  const baseWithIndex = total > 1 ? `${resolvedBase}-${index + 1}` : resolvedBase;
  return `${baseWithIndex}${originalExtension}`;
}

function stripFileExtension(fileName) {
  return String(fileName || '').replace(/\.[^.]+$/, '').trim();
}

async function convertLocalImageFileToWebp(file, preferredFileName = '') {
  if (!(file instanceof File) || detectMediaType(file) !== 'image') {
    throw new Error('PNG, JPG, WebP 이미지 파일만 선택할 수 있습니다.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const width = bitmap.width || 0;
    const height = bitmap.height || 0;
    const targetFileName = replaceExtensionWithWebp(preferredFileName || file.name);

    if (String(file.type || '').toLowerCase() === 'image/webp' || /\.webp$/i.test(file.name)) {
      return {
        blob: file,
        fileName: targetFileName,
        width,
        height,
      };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('이미지 변환용 캔버스 컨텍스트를 생성하지 못했습니다.');
    }

    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
          return;
        }
        reject(new Error('WebP 변환에 실패했습니다.'));
      }, 'image/webp', 0.9);
    });

    return {
      blob,
      fileName: targetFileName,
      width,
      height,
    };
  } finally {
    bitmap.close?.();
  }
}

async function writeBlobToMediaDirectory(fileName, blob) {
  const directoryHandle = await ensureMediaDirectoryHandle();
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();

  try {
    if (blob instanceof Blob) {
      await writable.write(await blob.arrayBuffer());
    } else {
      await writable.write(blob);
    }
  } finally {
    await writable.close();
  }

  const writtenFile = await fileHandle.getFile();
  if (!writtenFile || writtenFile.size <= 0) {
    throw new Error(`assets/media/${fileName} 파일 저장을 확인하지 못했습니다.`);
  }

  return writtenFile;
}

function extractManagedAssetFileName(src) {
  const normalized = normalizeStoredAssetPath(src);
  if (!normalized || !normalized.startsWith(MEDIA_BASE_PATH)) return '';

  const relativeName = normalized.slice(MEDIA_BASE_PATH.length).split('#')[0].split('?')[0].trim();
  if (!relativeName || relativeName.includes('/') || relativeName.includes('\\')) return '';
  return relativeName;
}

async function deleteMediaFileFromDirectory(fileName) {
  if (!fileName) return false;

  const directoryHandle = await ensureMediaDirectoryHandle();
  try {
    await directoryHandle.removeEntry(fileName);
    return true;
  } catch (error) {
    if (error && error.name === 'NotFoundError') {
      return false;
    }
    throw error;
  }
}

async function cleanupManagedFilesForItem(item, remainingItems) {
  const candidateFiles = [extractManagedAssetFileName(item?.src), extractManagedAssetFileName(item?.poster)].filter(Boolean);
  if (!candidateFiles.length) return [];

  const keptFiles = new Set(
    (Array.isArray(remainingItems) ? remainingItems : [])
      .flatMap((entry) => [extractManagedAssetFileName(entry?.src), extractManagedAssetFileName(entry?.poster)])
      .filter(Boolean)
  );

  const deletedFiles = [];
  for (const fileName of [...new Set(candidateFiles)]) {
    if (keptFiles.has(fileName)) continue;
    const removed = await deleteMediaFileFromDirectory(fileName);
    if (removed) {
      deletedFiles.push(fileName);
    }
  }

  return deletedFiles;
}

function createLibraryItem({
  cardId,
  mediaType,
  title,
  fileName,
  src,
  poster = '',
  width = 0,
  height = 0,
  isRepresentative = false,
  sourceMode = 'url',
}) {
  return {
    id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    cardId,
    type: mediaType,
    title,
    fileName,
    src,
    poster,
    sourceMode,
    width,
    height,
    isRepresentative,
    createdAt: Date.now(),
  };
}

function resetUrlEntryState() {
  mediaUrlInput.value = '';
  posterUrlInput.value = '';
  if (localImageFilesInput) {
    localImageFilesInput.value = '';
  }
  updateLocalImageStatus();
  urlPreviewRoot.innerHTML = '<p class="empty">미리보기할 URL을 입력해 주세요.</p>';
}

function syncMediaFileNameWithLocalSelection() {
  const localFiles = Array.from(localImageFilesInput?.files || []).filter((file) => detectMediaType(file) === 'image');
  const currentValue = String(mediaUrlInput.value || '').trim();

  if (!localFiles.length) {
    return;
  }

  if (localFiles.length === 1 && !currentValue) {
    mediaUrlInput.value = replaceExtensionWithWebp(localFiles[0].name);
    return;
  }

  if (localFiles.length > 1 && currentValue && currentValue === replaceExtensionWithWebp(localFiles[0].name)) {
    mediaUrlInput.value = '';
  }
}

function syncMediaFileNameWithSelectedFiles(files) {
  const selectedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const currentValue = String(mediaUrlInput.value || '').trim();
  if (!selectedFiles.length) {
    return;
  }

  if (selectedFiles.length === 1) {
    const file = selectedFiles[0];
    const mediaType = detectMediaType(file);
    if (mediaType === 'image') {
      if (currentValue) {
        return;
      }
      mediaUrlInput.value = replaceExtensionWithWebp(file.name);
      return;
    }
    if (mediaType === 'video') {
      mediaUrlInput.value = String(file.name || '').trim();
      if (localImageFilesInput) {
        localImageFilesInput.value = '';
      }
      updateLocalImageStatus();
    }
  }
}

function syncTitleWithSelectedFiles(files) {
  const selectedFiles = Array.isArray(files) ? files : [];
  const currentTitle = String(titleInput.value || '').trim();
  if (!selectedFiles.length || currentTitle) {
    return;
  }

  titleInput.value = stripFileExtension(selectedFiles[0].name || '');
}

async function addLocalImagesAsWebpAssets() {
  const files = Array.from(localImageFilesInput?.files || []);
  if (!files.length) return false;

  const cardId = cardSelect.value;
  const title = String(titleInput.value || '').trim();
  const customFileName = String(mediaUrlInput.value || '').trim();
  const wantsRepresentative = representativeInput?.checked === true;
  if (!cardId) {
    throw new Error('카드를 먼저 선택해 주세요.');
  }

  if (customFileName && normalizeMediaFileName(customFileName) === null) {
    throw new Error('미디어 파일명에는 경로 구분자(/, \\)를 사용할 수 없습니다. 파일명만 입력해 주세요.');
  }

  if (customFileName && files.length > 1) {
    throw new Error('로컬 이미지를 여러 개 선택한 경우에는 미디어 파일명을 비워 두세요. 한 개 선택했을 때만 직접 파일명을 지정할 수 있습니다.');
  }

  await ensureMediaDirectoryHandle();

  const current = loadLibrary();
  let uploadedCount = 0;
  let representativeAssigned = false;

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (detectMediaType(file) !== 'image') continue;

    const preferredFileName = customFileName
      ? buildCustomWebpFileName(customFileName, index, files.length)
      : replaceExtensionWithWebp(file.name);
    const converted = await convertLocalImageFileToWebp(file, preferredFileName);
    await writeBlobToMediaDirectory(converted.fileName, converted.blob);

    const isRepresentative = wantsRepresentative && representativeAssigned === false;
    if (isRepresentative) {
      representativeAssigned = true;
    }

    current.push(
      createLibraryItem({
        cardId,
        mediaType: 'image',
        title: files.length === 1 && title ? title : stripFileExtension(converted.fileName),
        fileName: converted.fileName,
        src: toMediaAssetUrl(converted.fileName),
        width: converted.width,
        height: converted.height,
        isRepresentative,
        sourceMode: 'url',
      })
    );
    uploadedCount += 1;
  }

  if (uploadedCount === 0) {
    throw new Error('변환 가능한 로컬 이미지가 없습니다. PNG, JPG, WebP 파일을 선택해 주세요.');
  }

  let next = current;
  if (representativeAssigned) {
    const representativeItem = current
      .slice()
      .reverse()
      .find((item) => item.cardId === cardId && item.isRepresentative === true);
    if (representativeItem) {
      next = normalizeRepresentativeByCard(current, cardId, representativeItem.id);
    }
  }

  const result = await persistLibrary(next);
  resetUrlEntryState();
  renderLibrary();

  if (result.remote === false) {
    alert('WebP 파일은 assets/media와 로컬 라이브러리에 저장되었지만 Supabase 동기화에는 실패했습니다.');
    return true;
  }

  alert(`${uploadedCount}개 이미지를 WebP로 변환해 assets/media에 저장하고 라이브러리에 추가했습니다.`);
  return true;
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
  const mimeType = String(file?.type || '').toLowerCase();
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';

  const fileName = String(file?.name || '').toLowerCase();
  if (/\.(mp4|webm|ogg|mov)$/.test(fileName)) return 'video';
  if (/\.(png|jpg|jpeg|webp|gif|bmp|svg)$/.test(fileName)) return 'image';
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
    .map((card) => `<option value="${card.id}">${card.title} (${getGroupLabel(card.group)})</option>`)
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

      const current = loadLibrary();
      const target = current.find((item) => item.id === id);
      if (!target) return;

      if (!confirm(`선택한 미디어를 삭제할까요?\n파일명: ${getDisplayFileName(target)}`)) {
        return;
      }

      const next = current.filter((item) => item.id !== id);
      const result = await persistLibrary(next);
      let deletedFiles = [];

      try {
        deletedFiles = await cleanupManagedFilesForItem(target, next);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'assets/media 파일 정리 중 오류가 발생했습니다.');
      }

      renderLibrary();
      if (result.remote === false) {
        alert('원격(Supabase) 동기화에 실패했습니다. 연결 상태를 확인해 주세요.');
        return;
      }

      if (deletedFiles.length) {
        alert(`미디어를 삭제했습니다. 정리된 파일: ${deletedFiles.join(', ')}`);
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
  clearUrlPreviewObjectUrls();

  const inputValue = String(mediaUrlInput.value || '').trim();
  const poster = String(posterUrlInput.value || '').trim();
  const selectedType = String(urlTypeSelect.value || 'auto');
  const localFiles = Array.from(localImageFilesInput?.files || []).filter((file) => detectMediaType(file) === 'image');

  if (!inputValue && localFiles.length > 0) {
    urlPreviewRoot.innerHTML = localFiles
      .map((file) => {
        const objectUrl = URL.createObjectURL(file);
        urlPreviewObjectUrls.push(objectUrl);
        return `
          <article class="media-item">
            <div class="media-frame">
              <span class="media-type">IMAGE</span>
              <img src="${esc(objectUrl)}" alt="${esc(file.name)}" loading="lazy" />
            </div>
            <div class="meta">
              <strong>${esc(file.name)}</strong>
              <p>로컬 이미지 / ${formatBytes(file.size)}</p>
              <p>URL로 미디어 추가 시 WebP로 변환되어 assets/media에 저장됩니다.</p>
            </div>
          </article>
        `;
      })
      .join('');

    Array.from(urlPreviewRoot.querySelectorAll('.media-frame')).forEach((frame) => attachRatioForPreview(frame));
    return;
  }

  if (inputValue && localFiles.length > 0) {
    const normalizedFileName = normalizeMediaFileName(inputValue);
    if (normalizedFileName === null) {
      urlPreviewRoot.innerHTML = '<p class="empty">파일명만 입력해 주세요. 경로 구분자(/, \\)는 사용할 수 없습니다.</p>';
      return;
    }

    if (localFiles.length > 1) {
      urlPreviewRoot.innerHTML = '<p class="empty">로컬 이미지를 여러 개 선택한 경우 미디어 파일명은 비워 두세요.</p>';
      return;
    }

    const file = localFiles[0];
    const objectUrl = URL.createObjectURL(file);
    urlPreviewObjectUrls.push(objectUrl);
    const targetFileName = buildCustomWebpFileName(normalizedFileName, 0, 1);
    urlPreviewRoot.innerHTML = `
      <article class="media-item">
        <div class="media-frame">
          <span class="media-type">IMAGE</span>
          <img src="${esc(objectUrl)}" alt="${esc(file.name)}" loading="lazy" />
        </div>
        <div class="meta">
          <strong>${esc(file.name)}</strong>
          <p>저장 예정 파일명: ${esc(targetFileName)}</p>
          <p>URL로 미디어 추가 시 WebP로 변환되어 assets/media에 저장됩니다.</p>
        </div>
      </article>
    `;

    const frame = urlPreviewRoot.querySelector('.media-frame');
    if (frame) attachRatioForPreview(frame);
    return;
  }

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
  const customFileName = String(mediaUrlInput.value || '').trim();
  const wantsRepresentative = representativeInput?.checked === true;

  const current = loadLibrary();
  let uploadedCount = 0;
  let representativeAssigned = false;

  try {
    if (!cardId) {
      throw new Error('카드를 먼저 선택해 주세요.');
    }

    if (customFileName && normalizeMediaFileName(customFileName) === null) {
      throw new Error('미디어 파일명에는 경로 구분자(/, \\)를 사용할 수 없습니다. 파일명만 입력해 주세요.');
    }

    if (customFileName && files.length > 1) {
      throw new Error('동영상을 여러 개 선택한 경우에는 미디어 파일명을 비워 두세요. 한 개 선택했을 때만 직접 파일명을 지정할 수 있습니다.');
    }

    await ensureMediaDirectoryHandle();

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const mediaType = detectMediaType(file);
      if (!mediaType) continue;

      if (mediaType !== 'video') {
        throw new Error('위 업로드 버튼은 동영상 전용입니다. 이미지는 아래 URL 등록 섹션의 로컬 이미지 선택을 사용해 주세요.');
      }

      const isRepresentative =
        wantsRepresentative && mediaType === 'image' && representativeAssigned === false;
      if (isRepresentative) {
        representativeAssigned = true;
      }

      const targetFileName = customFileName
        ? buildUploadedMediaFileName(customFileName, file.name, index, files.length)
        : file.name;
      const writtenFile = await writeBlobToMediaDirectory(targetFileName, file);
      if (writtenFile.name !== targetFileName) {
        throw new Error(`assets/media/${targetFileName} 파일 저장 이름이 예상과 다릅니다.`);
      }
      if (writtenFile.size !== file.size) {
        throw new Error(`assets/media/${targetFileName} 파일 저장 크기 검증에 실패했습니다.`);
      }

      const previewUrl = URL.createObjectURL(file);
      let size = { width: 0, height: 0 };
      try {
        size = await getMediaInfo(mediaType, previewUrl);
      } finally {
        URL.revokeObjectURL(previewUrl);
      }

      current.push(
        createLibraryItem({
          cardId,
          mediaType,
          title: files.length === 1 && title ? title : stripFileExtension(targetFileName),
          fileName: targetFileName,
          src: toMediaAssetUrl(targetFileName),
          poster: '',
          width: size.width,
          height: size.height,
          isRepresentative,
          sourceMode: 'url',
        })
      );
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
      alert('업로드 가능한 동영상 파일이 없습니다.');
      return;
    }

    const result = await persistLibrary(nextItems);
    form.reset();
    clearSelectedPreview();
    resetUrlEntryState();
    updateLocalImageStatus();
    makeCardOptions();
    renderLibrary();
    if (result.remote === false) {
      alert('동영상 파일은 assets/media와 로컬 라이브러리에 저장되었지만 Supabase 동기화에는 실패했습니다.');
      return;
    }
    const savedNames = current
      .slice(-uploadedCount)
      .map((item) => item.fileName)
      .filter(Boolean)
      .join(', ');
    alert(`${uploadedCount}개 동영상 파일을 assets/media에 저장하고 라이브러리에 등록했습니다. 저장 파일명: ${savedNames}`);
  } catch (error) {
    alert(error instanceof Error ? error.message : '업로드 저장 중 오류가 발생했습니다.');
  }
});

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files || []);
  syncTitleWithSelectedFiles(files);
  syncMediaFileNameWithSelectedFiles(files);
  renderSelectedPreview(files);
});

addMediaUrlButton.addEventListener('click', async (event) => {
  event.preventDefault();
  event.stopPropagation();

  try {
    if (await addLocalImagesAsWebpAssets()) {
      return;
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : '로컬 이미지 저장 중 오류가 발생했습니다.');
    return;
  }

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
    resetUrlEntryState();
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

connectMediaDirectoryButton.addEventListener('click', async (event) => {
  event.preventDefault();
  event.stopPropagation();

  try {
    await ensureMediaDirectoryHandle();
  } catch (error) {
    alert(error instanceof Error ? error.message : 'assets/media 폴더 연결 중 오류가 발생했습니다.');
  }
});

previewMediaUrlButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  renderUrlPreview();
});
mediaUrlInput.addEventListener('input', renderUrlPreview);
localImageFilesInput.addEventListener('change', () => {
  const files = Array.from(localImageFilesInput.files || []).filter((file) => detectMediaType(file) === 'image');
  updateLocalImageStatus();
  syncTitleWithSelectedFiles(files);
  syncMediaFileNameWithSelectedFiles(files);
  syncMediaFileNameWithLocalSelection();
  renderUrlPreview();
});
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
  updateLocalImageStatus();
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
updateMediaDirectoryStatus('연결된 assets/media 폴더가 없습니다.');
updateLocalImageStatus();
renderUrlPreview();
initializeLibrary();
restoreMediaDirectoryHandle();
