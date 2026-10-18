const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const dbService = require('../services/dbService');
const { requireAuth } = require('../middleware/auth');

const PACKAGES = {
  starter: { id: 'starter', name: '설렘 스타터 패키지', hearts: 2500, price: 19900 },
  popular: { id: 'popular', name: '단골 인연 베스트 패키지', hearts: 8000, price: 49000 },
  mania: { id: 'mania', name: '설렘 마니아 메가 패키지', hearts: 20000, price: 89000 },
  master: { id: 'master', name: 'VVIP 로열 하트 패키지', hearts: 50000, price: 149000 }
};

// GET /api/payment/packages
router.get('/packages', (req, res) => {
  return res.json({ success: true, packages: PACKAGES });
});

// POST /api/payment/prepare
router.post('/prepare', requireAuth, (req, res) => {
  const user = req.user;
  const { pkgKey, payMethod = 'kakaopay' } = req.body;
  const pkg = PACKAGES[pkgKey];

  if (!pkg) {
    return res.status(400).json({ success: false, error: '유효하지 않은 패키지입니다.' });
  }

  const orderId = `ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const order = dbService.createOrder({
    id: orderId,
    userId: user.id,
    pkgKey,
    hearts: pkg.hearts,
    price: pkg.price,
    payMethod
  });

  return res.json({
    success: true,
    orderId: order.id,
    amount: order.price,
    pkgName: pkg.name
  });
});

// POST /api/payment/verify
router.post('/verify', requireAuth, (req, res) => {
  const user = req.user;
  const { orderId } = req.body;

  const order = dbService.getOrder(orderId);
  if (!order) {
    return res.status(404).json({ success: false, error: '주문 정보를 찾을 수 없습니다.' });
  }

  if (order.userId !== user.id) {
    return res.status(403).json({ success: false, error: '본인의 주문만 결제 승인할 수 있습니다.' });
  }

  if (order.status === 'completed') {
    return res.json({
      success: true,
      alreadyProcessed: true,
      hearts: user.hearts
    });
  }

  // Complete order and credit hearts
  dbService.updateOrder(orderId, { status: 'completed', completedAt: Date.now() });
  const nextHearts = user.hearts + order.hearts;
  dbService.updateUser(user.id, { hearts: nextHearts });

  return res.json({
    success: true,
    message: `${order.hearts.toLocaleString()} 하트 충전이 완료되었습니다!`,
    heartsAdded: order.hearts,
    currentHearts: nextHearts
  });
});

module.exports = router;
