/**
 * Seollem AI Lounge - Universal API Client Adapter
 * Seamlessly switches between OCI Production Backend API and Local Offline Simulation.
 */
(function (window) {
  const isServerHosted = window.location.protocol.startsWith('http') && (
    window.location.port === '4000' ||
    window.location.pathname.startsWith('/api') ||
    !window.location.port // standard 80/443 on OCI domain
  );

  const API_BASE = isServerHosted
    ? `${window.location.origin}/api`
    : 'http://localhost:4000/api';

  let authToken = localStorage.getItem('seollem_auth_token') || '';
  let isBackendConnected = false;

  const ApiClient = {
    async checkBackendHealth() {
      try {
        const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          isBackendConnected = true;
          console.log('[ApiClient] 🟢 OCI Backend Server Connected:', API_BASE);
          return true;
        }
      } catch (e) {
        isBackendConnected = false;
        console.log('[ApiClient] 🟡 Running in local standalone mode (Backend offline at ' + API_BASE + ')');
      }
      return false;
    },

    isConnected() {
      return isBackendConnected;
    },

    getHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      return headers;
    },

    setToken(token) {
      authToken = token || '';
      if (token) localStorage.setItem('seollem_auth_token', token);
      else localStorage.removeItem('seollem_auth_token');
    },

    // 1. Auth: Guest Session
    async initGuest(guestId) {
      if (!isBackendConnected) return null;
      try {
        const res = await fetch(`${API_BASE}/auth/guest`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ guestId })
        });
        const data = await res.json();
        if (data.success && data.token) {
          this.setToken(data.token);
          return data.user;
        }
      } catch (err) {
        console.warn('[ApiClient] initGuest error:', err);
      }
      return null;
    },

    // 2. Auth: Phone SMS OTP
    async sendOtp(phone) {
      if (!isBackendConnected) return { success: true, localOnly: true };
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ phone })
      });
      return await res.json();
    },

    async verifyOtp(phone, code, guestId) {
      if (!isBackendConnected) return { success: true, localOnly: true };
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ phone, code, guestId })
      });
      const data = await res.json();
      if (data.success && data.token) {
        this.setToken(data.token);
      }
      return data;
    },

    // 3. Match: Request new candidate with filters
    async requestMatch(filters) {
      if (!isBackendConnected) return null;
      try {
        const res = await fetch(`${API_BASE}/match/request`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({ filters })
        });
        const data = await res.json();
        return data.success ? data.character : null;
      } catch (err) {
        console.warn('[ApiClient] requestMatch error:', err);
        return null;
      }
    },

    // 4. Chat: Send user message & deduct hearts on server
    async sendMessage(characterId, message, chatHistory, affection) {
      if (!isBackendConnected) return null;
      const res = await fetch(`${API_BASE}/chat/send`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ characterId, message, chatHistory, affection })
      });
      return await res.json();
    },

    // 5. Gift: Send gift & deduct hearts on server
    async sendGift(characterId, giftKey, giftCost) {
      if (!isBackendConnected) return null;
      const res = await fetch(`${API_BASE}/chat/gift`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ characterId, giftKey, giftCost })
      });
      return await res.json();
    },

    // 6. Media: Unlock secret photos
    async unlockMedia(mediaId, cost, mediaUrl) {
      if (!isBackendConnected) return null;
      const res = await fetch(`${API_BASE}/media/unlock`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ mediaId, cost, mediaUrl })
      });
      return await res.json();
    },

    // 7. Developer/Testing Toggles
    async toggleVip() {
      if (!isBackendConnected) return null;
      const res = await fetch(`${API_BASE}/auth/toggle-vip`, {
        method: 'POST',
        headers: this.getHeaders()
      });
      return await res.json();
    },

    async resetData() {
      if (!isBackendConnected) return null;
      const res = await fetch(`${API_BASE}/auth/reset`, {
        method: 'POST',
        headers: this.getHeaders()
      });
      return await res.json();
    }
  };

  window.ApiClient = ApiClient;
})(window);
