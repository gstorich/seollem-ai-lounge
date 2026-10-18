const config = require('../config');
function eligibility(user) {
  const db = require('./dbService');
  const heartExpiry = db.getHeartSummary(user.id);
  user = db.getUser(user.id);
  const canMatch = Boolean(user.isVipUnlimited || user.hearts >= config.heartsPerMessage);
  return {
    canMatch,
    heartExpiry,
    heartsRemaining: user.hearts,
    requiredHearts: config.heartsPerMessage,
    isVipUnlimited: Boolean(user.isVipUnlimited),
    phoneVerified: Boolean(user.phone),
    phone: user.phone || null,
    phoneBonusHearts: config.phoneAuthBonusHearts
  };
}
module.exports = { eligibility };
