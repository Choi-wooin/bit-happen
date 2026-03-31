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

  function sha256Fallback(data) {
    var K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var l = data.length, bl = l * 8;
    data.push(0x80);
    while (data.length % 64 !== 56) data.push(0);
    data.push(0,0,0,0,(bl>>>24)&0xff,(bl>>>16)&0xff,(bl>>>8)&0xff,bl&0xff);
    for (var i = 0; i < data.length; i += 64) {
      var w = [];
      for (var j = 0; j < 16; j++) w[j] = (data[i+j*4]<<24)|(data[i+j*4+1]<<16)|(data[i+j*4+2]<<8)|data[i+j*4+3];
      for (j = 16; j < 64; j++) {
        var s0 = ((w[j-15]>>>7)|(w[j-15]<<25))^((w[j-15]>>>18)|(w[j-15]<<14))^(w[j-15]>>>3);
        var s1 = ((w[j-2]>>>17)|(w[j-2]<<15))^((w[j-2]>>>19)|(w[j-2]<<13))^(w[j-2]>>>10);
        w[j] = (w[j-16]+s0+w[j-7]+s1)|0;
      }
      var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (j = 0; j < 64; j++) {
        var S1 = ((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
        var ch = (e&f)^((~e)&g);
        var t1 = (h+S1+ch+K[j]+w[j])|0;
        var S0 = ((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
        var maj = (a&b)^(a&c)^(b&c);
        var t2 = (S0+maj)|0;
        h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
      }
      H[0]=(H[0]+a)|0;H[1]=(H[1]+b)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
    }
    return H.map(function(v){return ('00000000'+(v>>>0).toString(16)).slice(-8);}).join('');
  }

  async function hashPassword(password) {
    var encoder = new TextEncoder();
    var data = encoder.encode(String(password || ''));
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      var digest = await crypto.subtle.digest('SHA-256', data);
      var bytes = Array.from(new Uint8Array(digest));
      return bytes.map(function(b){return b.toString(16).padStart(2,'0');}).join('');
    }
    return sha256Fallback(Array.from(data));
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