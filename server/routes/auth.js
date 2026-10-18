const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const dbService = require('../services/dbService');
const { generateToken, requireAuth } = require('../middleware/auth');
const config = require('../config');

// POST /api/auth/guest - Issue or restore guest session
router.post('/guest', (req, res) => {
  const { guestId } = req.body;
  let user = guestId ? dbService.getUser(guestId) : null;

  if (!user) {
    const newId = `guest_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    user = dbService.createUser({
      id: newId,
      hearts: config.defaultGuestHearts
    });
  }

  const token = generateToken({ userId: user.id });
  return res.json({
    success: true,
    token,
    user: {
      id: user.id,
      phone: user.phone,
      hearts: user.hearts,
      isVipUnlimited: user.isVipUnlimited,
      phoneBonusClaimed: user.phoneBonusClaimed
    }
  });
});

// POST /api/auth/send-otp - Request SMS verification code
router.post('/send-otp', (req, res) => {
  const { phone } = req.body;
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');

  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    return res.status(400).json({ success: false, error: '유효한 10~11자리 휴대폰 번호를 입력해주세요.' });
  }

  // Generate 6-digit verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  dbService.setOtp(cleanPhone, code, 300); // 5 min TTL

  // In production OCI, integrate with CoolSMS / Aligo / Twilio here
  console.log(`[SMS AUTH] Sent code ${code} to ${cleanPhone}`);

  return res.json({
    success: true,
    message: '인증번호가 발송되었습니다. (5분 내 입력)',
    debugCode: config.nodeEnv === 'development' ? code : undefined
  });
});

// POST /api/auth/verify-otp - Verify code & link account
router.post('/verify-otp', (req, res) => {
  const { phone, code, guestId } = req.body;
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');

  const validCode = dbService.getOtp(cleanPhone);
  if (!validCode || validCode !== (code || '').trim()) {
    return res.status(400).json({ success: false, error: '인증번호가 일치하지 않거나 만료되었습니다.' });
  }

  dbService.removeOtp(cleanPhone);

  let user = dbService.findUserByPhone(cleanPhone);
  let bonusAwarded = false;

  if (!user) {
    // If guest exists, upgrade guest to phone account
    if (guestId && dbService.getUser(guestId)) {
      user = dbService.updateUser(guestId, { phone: cleanPhone });
    } else {
      user = dbService.createUser({
        id: `user_${cleanPhone}`,
        phone: cleanPhone,
        hearts: config.defaultGuestHearts
      });
    }

    // Award first-time phone auth bonus
    if (!user.phoneBonusClaimed) {
      user = dbService.updateUser(user.id, {
        hearts: user.hearts + config.phoneAuthBonusHearts,
        phoneBonusClaimed: true
      });
      bonusAwarded = true;
    }
  }

  const token = generateToken({ userId: user.id });
  return res.json({
    success: true,
    bonusAwarded,
    token,
    user: {
      id: user.id,
      phone: user.phone,
      hearts: user.hearts,
      isVipUnlimited: user.isVipUnlimited,
      phoneBonusClaimed: user.phoneBonusClaimed
    }
  });
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
