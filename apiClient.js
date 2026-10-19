(function (window) {
  const hosted = window.location.protocol.startsWith('http');
  const API_BASE = hosted ? `${window.location.origin}/api` : 'http://localhost:4000/api';
  let authToken = localStorage.getItem('seollem_auth_token') || '';
  let connected = false;
  let guestInit = null;
  let pending = null;
  let timer = null;
  let saving = Promise.resolve();
  let paused = false;
  let roomFingerprints = new Map();
  let catalogVersion='';
  let cachedDeviceId = '';
  function getDeviceId() {
    if (cachedDeviceId) return cachedDeviceId;
    try {
      const parts = [];
      const s = window.screen || {};
      parts.push(`${s.width||0}x${s.height||0}x${s.colorDepth||0}@${window.devicePixelRatio||1}`);
      const nav = window.navigator || {};
      parts.push(nav.userAgent || '');
      parts.push(nav.platform || '');
      parts.push(nav.language || '');
      parts.push(nav.languages ? nav.languages.join(',') : '');
      parts.push(String(nav.hardwareConcurrency || 0));
      parts.push(String(nav.deviceMemory || 0));
      try {
        parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
        parts.push(String(new Date().getTimezoneOffset()));
      } catch {}
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 40;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = '#f60';
          ctx.fillRect(10, 5, 80, 20);
          ctx.fillStyle = '#069';
          ctx.font = '14px Arial';
          ctx.fillText('azitchat_dev_fp,987!', 4, 25);
          ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
          ctx.fillText('azitchat_dev_fp,987!', 6, 27);
          parts.push(canvas.toDataURL());
        }
      } catch {}
      try {
        const glCanvas = document.createElement('canvas');
        const gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
        if (gl) {
          const ext = gl.getExtension('WEBGL_debug_renderer_info');
          if (ext) {
            parts.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '');
            parts.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
          }
        }
      } catch {}

      const raw = parts.join('|||');
      let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
      }
      h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
      h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      const hex = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
      cachedDeviceId = `dev_${hex}`;
      return cachedDeviceId;
    } catch {
      return 'dev_unknown';
    }
  }

  const ApiClient = {
    user: null,
    isHosted: () => hosted,
    isConnected: () => connected,
    getDeviceId: () => getDeviceId(),
    getHeaders() {
      const isTester = (typeof localStorage !== 'undefined' && localStorage.getItem('azit_tester') === '1') ||
        (typeof document !== 'undefined' && /(?:^|;\s*)azit_tester=1/.test(document.cookie || ''));
      const devId = getDeviceId();
      return {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(isTester ? { 'X-Azit-Tester': '1' } : {}),
        ...(devId && devId !== 'dev_unknown' ? { 'X-Device-Id': devId } : {})
      };
    },
    setToken(token) { authToken = token || ''; if (authToken) localStorage.setItem('seollem_auth_token', authToken); else localStorage.removeItem('seollem_auth_token'); },
    async request(route, method = 'GET', body, options = {}) {
      const res = await fetch(`${API_BASE}${route}`, { method, headers: this.getHeaders(),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...options });
      const data = await res.json();
      if(data.error==='LEGAL_ACCEPTANCE_REQUIRED'&&!route.startsWith('/legal/')&&window.AzitLegal){await window.AzitLegal.ensure();return this.request(route,method,body,options);}
      if (!res.ok || data.success === false) {
        const error = new Error(data.message || data.error || '서버 요청에 실패했습니다.');
        error.status = res.status;
        error.code = data.error;
        error.data = data;
        throw error;
      }
      if (method === 'POST') {
        const events = { '/chat/send':'chat_message_sent', '/match/request':'match_started', '/chat/gift':'gift_sent', '/support/tickets':'support_created' };
        let event = events[route];
        if (route === '/auth/verify-otp') event = data.bonusAwarded ? 'phone_verified' : 'phone_login';
        if (event) window.dispatchEvent(new CustomEvent('azit-product-event', { detail:event }));
      }
      return data;
    },
    async checkBackendHealth() {
      try {
        const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return false;
        connected = true;
        this.user = await this.initGuest();
        return true;
      } catch { connected = false; return false; }
    },
    async initGuest() {
      if (guestInit) return guestInit;
      const initialize=async()=>{
        // Another tab may have established a session while this tab was starting.
        authToken=localStorage.getItem('seollem_auth_token')||authToken;
        const isTester = (typeof localStorage !== 'undefined' && localStorage.getItem('azit_tester') === '1') ||
          (typeof document !== 'undefined' && /(?:^|;\s*)azit_tester=1/.test(document.cookie || ''));
        const deviceId = getDeviceId();
        const data=await this.request('/auth/guest','POST',{ isTester, deviceId });
        this.setToken(data.token);this.user=data.user;return data.user;
      };
      guestInit=(navigator.locks?navigator.locks.request('azit-session-bootstrap',initialize):initialize());
      try{return await guestInit;}finally{guestInit=null;}
    },
    async getHeartWallet() { return this.request('/account/hearts'); },
    async loadCharacters(){
      const data=await this.request('/match/characters'+(catalogVersion?'?version='+encodeURIComponent(catalogVersion):''));
      if(!data.unchanged){catalogVersion=data.version||'';window.dispatchEvent(new CustomEvent('azit-character-catalog',{detail:data.characters}));}
      return data;
    },
    async loadState() {
      const data = await this.request('/account/state');
      this.user = data.user;
      roomFingerprints = new Map(Object.entries(data.savedRooms || {}).map(([id, room]) => [id, JSON.stringify({ ...room, messages: (room.messages || []).slice(-45) })]));
      return data;
    },
    saveState(payload) {
      if (!connected || paused) return;
      const rooms = {};
      for (const [id, room] of Object.entries(payload.savedRooms || {})) {
        const trimmed = { ...room, messages: (room.messages || []).slice(-45) };
        const serialized = JSON.stringify(trimmed);
        if (roomFingerprints.get(id) !== serialized) rooms[id] = trimmed;
      }
      pending = { savedRooms: { ...(pending?.savedRooms || {}), ...rooms }, metCharIds: payload.metCharIds,
        matchFilter: payload.matchFilter, prevCharId: payload.prevCharId };
      clearTimeout(timer);
      timer = setTimeout(() => this.flushState().catch(() => {}), 350);
    },
    async flushState() {
      clearTimeout(timer);
      if (pending && !paused) {
        const body = pending;
        pending = null;
        const token = authToken;
        const task = saving.catch(() => {}).then(async () => {
          try {
            const data = await this.request('/account/state', 'PUT', body, {
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, keepalive: JSON.stringify(body).length < 50000
            });
            for (const [id, room] of Object.entries(body.savedRooms)) roomFingerprints.set(id, JSON.stringify(room));
            return data;
          } catch (error) {
            if (token === authToken) pending = { ...body, ...pending, savedRooms: { ...body.savedRooms, ...pending?.savedRooms } };
            window.dispatchEvent(new CustomEvent('seollem-sync-error'));
            throw error;
          }
        });
        saving = task;
      }
      return saving;
    },
    pauseSync() { paused = true; clearTimeout(timer); pending = null; },
    resumeSync() { paused = false; },
    async sendOtp(phone) { return this.request('/auth/send-otp', 'POST', { phone }); },
    async verifyOtp(phone, code, challengeId) {
      const data = await this.request('/auth/verify-otp', 'POST', { phone, code, challengeId });
      this.setToken(data.token);
      this.user = data.user;
      return data;
    },
    async sendMessage(characterId, message, chatHistory, affection, messageId) {
      await this.flushState();
      return this.request('/chat/send', 'POST', { characterId, message, chatHistory, affection, messageId });
    },
    async getMatchEligibility() { return this.request('/match/eligibility'); },
    async requestMatch(filters, characterId) { return this.request('/match/request', 'POST', { filters, characterId }); },
    async sendGreeting(characterId, messageId) { await this.flushState(); return this.request('/chat/greeting', 'POST', { characterId, messageId }); },
    async sendGift(characterId, giftKey, customMsg, messageId) { await this.flushState(); return this.request('/chat/gift', 'POST', { characterId, giftKey, customMsg, messageId }); },
    async unlockMedia(mediaId) { return this.request('/media/unlock', 'POST', { mediaId }); },
    async recall(characterId) { return this.request('/match/recall-previous', 'POST', { characterId }); },
    async removeRoom(id) {
      await this.flushState();
      await this.request(`/account/rooms/${encodeURIComponent(id)}`, 'DELETE');
      roomFingerprints.delete(id);
    },
    async logout() {
      await this.flushState();
      if(window.AzitNotifications)await window.AzitNotifications.logout();
      this.pauseSync();
      this.setToken('');
      this.user = null;
      connected = false;
    }
  };
  window.addEventListener('pagehide', () => { ApiClient.flushState().catch(() => {}); });
  window.ApiClient = ApiClient;
})(window);
