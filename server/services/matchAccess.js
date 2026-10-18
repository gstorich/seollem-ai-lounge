const config = require('../config');
function eligibility(user) {
  const canMatch = Boolean(user.isVipUnlimited || user.hearts >= config.heartsPerMessage);
  return {
    canMatch,
    heartsRemaining: user.hearts,
    requiredHearts: config.heartsPerMessage,
    isVipUnlimited: Boolean(user.isVipUnlimited),
    phoneVerified: Boolean(user.phone),
    phone: user.phone || null,
    phoneBonusHearts: config.phoneAuthBonusHearts
  };
}
module.exports = { eligibility };
