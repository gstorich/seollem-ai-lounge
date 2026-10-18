const express = require('express');
const router = express.Router();
const dbService = require('../services/dbService');
const { requireAuth } = require('../middleware/auth');

// POST /api/media/unlock
router.post('/unlock', requireAuth, (req, res) => {
  const user = req.user;
  const { mediaId, cost = 20, mediaUrl } = req.body;

  if (!mediaId) {
    return res.status(400).json({ success: false, error: '미디어 ID가 누락되었습니다.' });
  }

  // If already unlocked
  if (user.unlockedMedia && user.unlockedMedia[mediaId]) {
    return res.json({
      success: true,
      alreadyUnlocked: true,
      mediaUrl: mediaUrl || user.unlockedMedia[mediaId].url,
      heartsRemaining: user.hearts
    });
  }

  const costNum = parseInt(cost, 10) || 20;
  if (!user.isVipUnlimited && user.hearts < costNum) {
    return res.status(402).json({
      success: false,
      error: 'INSUFFICIENT_HEARTS',
      required: costNum,
      current: user.hearts,
      message: `사진 열람에 필요한 하트가 부족합니다. (필요: ${costNum}개, 보유: ${user.hearts}개)`
    });
  }

  let nextHearts = user.hearts;
  if (!user.isVipUnlimited) {
    nextHearts = Math.max(0, user.hearts - costNum);
  }

  const unlockedMedia = { ...(user.unlockedMedia || {}) };
  unlockedMedia[mediaId] = {
    unlockedAt: Date.now(),
    cost: costNum,
    url: mediaUrl
  };

  dbService.updateUser(user.id, {
    hearts: nextHearts,
    unlockedMedia
  });

  return res.json({
    success: true,
    mediaUrl,
    heartsRemaining: nextHearts,
    costDeducted: user.isVipUnlimited ? 0 : costNum
  });
});

module.exports = router;
