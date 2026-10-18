const jwt = require('jsonwebtoken');
const config = require('../config');
const dbService = require('../services/dbService');

function generateToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '30d' });
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '인증 토큰이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = dbService.getUser(decoded.userId);
    if (!user) {
      return res.status(401).json({ success: false, error: '존재하지 않는 사용자 계정입니다.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: '유효하지 않거나 만료된 세션 토큰입니다.' });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = dbService.getUser(decoded.userId);
    if (user) {
      req.user = user;
    }
  } catch (err) {
    // Ignore invalid token in optional mode
  }
  next();
}

module.exports = {
  generateToken,
  requireAuth,
  optionalAuth
};
