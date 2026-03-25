(function () {
  const SESSION_KEY = 'bitHappenAdminSession_v1';
  const ADMIN_STATE_KEY_DEFAULT = 'adminUsers';

  function getSupabaseConfig() {
    const cfg = window.BitHappenSupabaseConfig || {};
    const url = String(cfg.url || '').trim().replace(/\/$/, '');
    const anonKey = String(cfg.anonKey || '').trim();
    const adminStateKey = String(cfg.adminStateKey || ADMIN_STATE_KEY_DEFAULT).trim() || ADMIN_STATE_KEY_DEFAULT;
    return {
      enabled: Boolean(url && anonKey),
      url,
      anonKey,
      adminStateKey,
    };
  }

  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(String(password || ''));
    const digest = await crypto.subtle.digest('SHA-256', data);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function fetchAdminState() {
    const cfg = getSupabaseConfig();
    if (!cfg.enabled) {
      throw new Error('Supabase 설정이 비어 있습니다.');
    }

    const endpoint = `${cfg.url}/rest/v1/site_state?key=eq.${encodeURIComponent(cfg.adminStateKey)}&select=value&limit=1`;
    const response = await fetch(endpoint, {
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`admin state fetch failed: ${response.status}`);
    }

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const value = rows[0]?.value;
    if (!value || !Array.isArray(value.users)) {
      return null;
    }

    return value;
  }

  async function saveAdminState(state) {
    const cfg = getSupabaseConfig();
    if (!cfg.enabled) {
      throw new Error('Supabase 설정이 비어 있습니다.');
    }

    const endpoint = `${cfg.url}/rest/v1/site_state?on_conflict=key`;
    const payload = [
      {
        key: cfg.adminStateKey,
        value: state,
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
      throw new Error(`admin state save failed: ${response.status}`);
    }
  }

  async function ensureBootstrapSuperAdmin() {
    const state = await fetchAdminState();
    if (state && Array.isArray(state.users) && state.users.length > 0) {
      return state;
    }

    const hash = await hashPassword('iloveyou12#$');
    const bootstrap = {
      version: 1,
      updatedAt: new Date().toISOString(),
      users: [
        {
          id: 'admin',
          role: 'super_admin',
          passwordHash: hash,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    await saveAdminState(bootstrap);
    return bootstrap;
  }

  function setSession(user) {
    const payload = {
      id: user.id,
      role: user.role,
      loginAt: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    return payload;
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.id || !parsed.role) return null;
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  function requireAuth() {
    const session = getSession();
    if (!session) {
      window.location.href = 'login.html';
      return null;
    }
    return session;
  }

  async function login(id, password) {
    const state = await ensureBootstrapSuperAdmin();
    const userId = String(id || '').trim();
    const target = (state.users || []).find((user) => user.id === userId);
    if (!target) {
      return { ok: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    }

    const hash = await hashPassword(password);
    if (target.passwordHash !== hash) {
      return { ok: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' };
    }

    const session = setSession(target);
    return { ok: true, session };
  }

  async function changePassword(actorSession, targetId, newPassword) {
    if (!actorSession) {
      return { ok: false, message: '로그인이 필요합니다.' };
    }

    const trimmedTarget = String(targetId || '').trim();
    if (!trimmedTarget) {
      return { ok: false, message: '대상 아이디를 입력해 주세요.' };
    }

    if (actorSession.role !== 'super_admin' && actorSession.id !== trimmedTarget) {
      return { ok: false, message: '비밀번호를 변경할 권한이 없습니다.' };
    }

    const state = await ensureBootstrapSuperAdmin();
    const users = Array.isArray(state.users) ? state.users.slice() : [];
    const idx = users.findIndex((user) => user.id === trimmedTarget);
    if (idx < 0) {
      return { ok: false, message: '사용자를 찾을 수 없습니다.' };
    }

    const hash = await hashPassword(newPassword);
    users[idx] = {
      ...users[idx],
      passwordHash: hash,
      updatedAt: Date.now(),
    };

    const nextState = {
      ...state,
      users,
      updatedAt: new Date().toISOString(),
    };

    await saveAdminState(nextState);
    return { ok: true };
  }

  async function createUser(actorSession, id, password, role) {
    if (!actorSession || actorSession.role !== 'super_admin') {
      return { ok: false, message: 'super admin만 계정을 생성할 수 있습니다.' };
    }

    const userId = String(id || '').trim();
    if (!userId) {
      return { ok: false, message: '아이디를 입력해 주세요.' };
    }

    const state = await ensureBootstrapSuperAdmin();
    const users = Array.isArray(state.users) ? state.users.slice() : [];
    if (users.some((user) => user.id === userId)) {
      return { ok: false, message: '이미 존재하는 아이디입니다.' };
    }

    const hash = await hashPassword(password);
    users.push({
      id: userId,
      role: role === 'super_admin' ? 'super_admin' : 'admin',
      passwordHash: hash,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const nextState = {
      ...state,
      users,
      updatedAt: new Date().toISOString(),
    };

    await saveAdminState(nextState);
    return { ok: true };
  }

  async function listUsers(actorSession) {
    if (!actorSession || actorSession.role !== 'super_admin') {
      return { ok: false, message: '권한이 없습니다.', users: [] };
    }

    const state = await ensureBootstrapSuperAdmin();
    const users = (state.users || []).map((user) => ({
      id: user.id,
      role: user.role,
      createdAt: user.createdAt || 0,
      updatedAt: user.updatedAt || 0,
    }));
    return { ok: true, users };
  }

  window.BitHappenAdminAuth = {
    getSession,
    logout,
    requireAuth,
    login,
    createUser,
    changePassword,
    listUsers,
    ensureBootstrapSuperAdmin,
  };
})();