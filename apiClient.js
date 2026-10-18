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
  const ApiClient = {
    user: null,
    isHosted: () => hosted,
    isConnected: () => connected,
    getHeaders() { return { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) }; },
    setToken(token) { authToken = token || ''; if (authToken) localStorage.setItem('seollem_auth_token', authToken); else localStorage.removeItem('seollem_auth_token'); },
    async request(route, method = 'GET', body, options = {}) {
      const res = await fetch(`${API_BASE}${route}`, { method, headers: this.getHeaders(),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...options });
      const data = await res.json();
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
        const data=await this.request('/auth/guest','POST',{});
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
