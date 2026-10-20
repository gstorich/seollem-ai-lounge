const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const dbService = require('../services/dbService');
const { generateToken, requireAuth, optionalAuth } = require('../middleware/auth');
const config = require('../config');
const browserSession = require('../services/browserSession');
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});

// POST /api/auth/guest - Issue or restore guest session
router.post('/guest', optionalAuth, (req, res) => {
  let user = req.user || browserSession.restore(req);
  const cookie = req.headers.cookie || '';
  const adminCookieName = config.nodeEnv === 'production' ? '__Host-azit_admin' : 'azit_admin';
  const isTester = Boolean(
    req.headers['x-azit-tester'] === '1' ||
    req.body?.isTester === true ||
    /(?:^|;\s*)azit_tester=1/.test(cookie) ||
    cookie.includes(adminCookieName)
  );

  const rawDeviceId = req.headers['x-device-id'] || req.body?.deviceId;
  const deviceId = (typeof rawDeviceId === 'string' && /^dev_[a-zA-Z0-9_-]{8,64}$/.test(rawDeviceId.trim()))
    ? rawDeviceId.trim()
    : null;

  let restoredByDevice = false;

  // If no active session from token or cookie, attempt to restore guest by device
  if (!user && deviceId) {
    const profile = dbService.getDeviceProfile(deviceId);
    if (profile) {
      const existingUser = dbService.getUser(profile.current_user_id);
      if (existingUser && !existingUser.phone) {
        user = existingUser;
        restoredByDevice = true;
      }
    }
  }

  const restored = Boolean(user);

  const ua = req.headers['user-agent'] || '';
  const isBot = /(?:googlebot|bingbot|baiduspider|yeti|daumoa|slurp|facebookexternalhit|meta-externalads|mediapartners-google|adsbot-google|twitterbot)/i.test(ua);
  if (!user && isBot) {
    return res.json({
      success: true,
      token: generateToken({ userId: 'guest_bot_crawler' }),
      restoredByDevice: false,
      user: {
        id: 'guest_bot_crawler',
        phone: null,
        hearts: 0,
        isVipUnlimited: false,
        phoneBonusClaimed: false,
        isAdult: false,
        isTester: true
      }
    });
  }

  if (!user) {
    const newId = `guest_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    let welcomeHearts = config.defaultGuestHearts;
    if (deviceId) {
      const profile = dbService.getDeviceProfile(deviceId);
      if (profile && profile.welcome_granted) {
        welcomeHearts = 0; // Prevent farming 50 welcome hearts on same device
      }
    }

    user = dbService.createUser({
      id: newId,
      hearts: welcomeHearts,
      isTester,
      deviceId: deviceId || undefined
    });

    if (deviceId) {
      dbService.bindDeviceProfile(deviceId, user.id, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        welcomeGranted: welcomeHearts > 0 ? 1 : 0
      });
    }
  } else {
    if (isTester && !user.isTester) {
      user = dbService.updateUser(user.id, { isTester: true });
    }
    if (deviceId) {
      dbService.bindDeviceProfile(deviceId, user.id, {
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    }
  }

  browserSession.save(res,user);
  user = dbService.updateUser(user.id,{lastSeenAt:Date.now()});
  const incomingAcq = req.body?.acquisition;
  if (incomingAcq && typeof incomingAcq === 'object') {
    dbService.saveAcquisition(user.id, incomingAcq, {
      deviceId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
  } else if (!restored && !dbService.getAcquisition(user.id)) {
    const ref = req.headers['referer'] || req.headers['referrer'] || null;
    dbService.saveAcquisition(user.id, {
      source: 'direct',
      medium: 'none',
      referrer: ref
    }, {
      deviceId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
  }
  if(!restored && !user.isTester)require('../services/operationsService').track('guest_created',user.id);
  const token = generateToken({ userId: user.id });
  return res.json({
    success: true,
    token,
    restoredByDevice,
    user: {
      id: user.id,
      phone: user.phone,
      hearts: user.hearts,
      isVipUnlimited: user.isVipUnlimited,
      phoneBonusClaimed: user.phoneBonusClaimed,
      isAdult: require('../services/contentAccess').verifiedAdult(user),
      isTester: Boolean(user.isTester)
    }
  });
});

const smsService = require('../services/smsService');
const { rateLimit } = require('express-rate-limit');
const otpLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: '문자 요청이 많습니다. 잠시 후 다시 시도해주세요.' } });
const verifyLimit = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: '인증 시도가 많습니다. 잠시 후 다시 시도해주세요.' } });
function normalizePhone(value) {
  if (typeof value !== 'string') return '';
  const phone = value.replace(/[-\s]/g, '');
  return /^010\d{8}$/.test(phone) ? phone : '';
}
function otpDigest(id, phone, code) {
  return crypto.createHmac('sha256', config.jwtSecret).update(`${id}:${phone}:${code}`).digest('hex');
}
function publicUser(user) {
  return { id: user.id, phone: user.phone, hearts: user.hearts, isVipUnlimited: user.isVipUnlimited,
    phoneBonusClaimed: user.phoneBonusClaimed, isAdult: require('../services/contentAccess').verifiedAdult(user) };
}
function requireLoggedOutForOtp(req, res, next) {
  if (req.user.phone) return res.status(409).json({
    success: false, error: 'ALREADY_AUTHENTICATED',
    message: '이미 인증된 계정으로 로그인되어 있습니다. 재인증할 수 없으며, 다른 번호를 사용하려면 먼저 로그아웃해주세요.'
  });
  next();
}
router.post('/send-otp', requireAuth, requireLoggedOutForOtp, otpLimit, async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ success: false, error: '010으로 시작하는 휴대폰 번호 11자리를 입력해주세요.' });
  if (!smsService.configured()) return res.status(503).json({ success: false, error: '문자 인증 서비스를 준비 중입니다.' });
  const id = crypto.randomUUID();
  const code = crypto.randomInt(100000, 1000000).toString();
  const status = dbService.reserveOtp({ id, phone, sessionId: req.user.id, ip: req.ip, digest: otpDigest(id, phone, code) });
  if (status !== 'ok') return res.status(429).json({ success: false,
    error: status === 'cooldown' ? '인증번호는 60초 후 다시 받을 수 있습니다.' : '오늘 인증번호 발송 한도를 초과했습니다.' });
  try {
    const providerId = await smsService.sendOtp(phone, code);
    dbService.markOtp(id, 'sent', providerId);
    return res.json({ success: true, challengeId: id, expiresIn: 300, retryAfter: 60,
      message: '인증번호를 발송했습니다. 5분 안에 입력해주세요.' });
  } catch (error) {
    dbService.markOtp(id, 'failed');
    console.warn('[SMS] Sending failed:', error.name === 'TimeoutError' ? 'timeout' : 'provider_failure');
    return res.status(502).json({ success: false, error: '문자를 발송하지 못했습니다. 잠시 후 다시 시도해주세요.' });
  }
});
router.post('/verify-otp', requireAuth, requireLoggedOutForOtp, verifyLimit, (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const { code, challengeId } = req.body;
  if (!phone || typeof code !== 'string' || !/^\d{6}$/.test(code) || typeof challengeId !== 'string' || challengeId.length > 64) {
    return res.status(400).json({ success: false, error: '휴대폰 번호와 인증번호 6자리를 확인해주세요.' });
  }
  const result = dbService.verifyOtp(challengeId, phone, req.user.id, otpDigest(challengeId, phone, code));
  if (!result) return res.status(400).json({ success: false, error: '인증번호가 틀렸거나 만료되었습니다. 5회 틀리면 새로 받아주세요.' });
  require('../services/operationsService').track(result.bonusAwarded ? 'phone_verified' : 'phone_login', result.user.id);

  browserSession.save(res,result.user);
  const token = generateToken({ userId: result.user.id });
  return res.json({ success: true, token, bonusAwarded: result.bonusAwarded, user: publicUser(result.user) });
});

// GET /api/auth/me - Get current user profile
router.get('/me', requireAuth, (req, res) => {
  const user = req.user;
  return res.json({
    success: true,
    user: {
      id: user.id,
      phone: user.phone,
      hearts: user.hearts,
      isVipUnlimited: user.isVipUnlimited,
      phoneBonusClaimed: user.phoneBonusClaimed,
      savedRoomsCount: Object.keys(user.savedRooms || {}).length
    }
  });
});

// POST /api/auth/toggle-vip - Developer / Test toggle
router.post('/toggle-vip', requireAuth, (req, res) => {
  const user = req.user;
  const nextVip = !user.isVipUnlimited;
  const updates = { isVipUnlimited: nextVip };
  if (!nextVip && user.hearts <= 0) {
    updates.hearts = 50;
  }
  const updated = dbService.updateUser(user.id, updates);
  return res.json({ success: true, isVipUnlimited: updated.isVipUnlimited, hearts: updated.hearts });
});

// POST /api/auth/reset - Reset user data
router.post('/reset', requireAuth, (req, res) => {
  const user = req.user;
  const resetUser = dbService.updateUser(user.id, {
    hearts: config.defaultGuestHearts,
    isVipUnlimited: false,
    savedRooms: {},
    unlockedMedia: {},
    metCharIds: []
  });
  return res.json({ success: true, message: '데이터가 초기화되었습니다.', user: resetUser });
});

module.exports = router;
