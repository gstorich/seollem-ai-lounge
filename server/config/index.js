const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'seollem_default_dev_secret_key_change_in_prod',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  // LLM Config
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  defaultLlmProvider: process.env.DEFAULT_LLM_PROVIDER || 'gemini',

  // Economy rules
  heartsPerMessage: parseInt(process.env.HEARTS_PER_MESSAGE, 10) || 10,
  defaultGuestHearts: parseInt(process.env.DEFAULT_GUEST_HEARTS, 10) || 50,
  phoneAuthBonusHearts: parseInt(process.env.PHONE_AUTH_BONUS_HEARTS, 10) || 100,

  // Database
  databaseFile: path.resolve(__dirname, '..', process.env.DATABASE_FILE || './data/seollem.json')
};
