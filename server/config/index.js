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
  heartsPerMessage: parseFloat(process.env.HEARTS_PER_MESSAGE) || 3.7,
  defaultGuestHearts: parseFloat(process.env.DEFAULT_GUEST_HEARTS) || 50,
  phoneAuthBonusHearts: parseFloat(process.env.PHONE_AUTH_BONUS_HEARTS) || 100,

  // Database
  databaseFile: path.resolve(__dirname, '..', process.env.DATABASE_FILE || './data/seollem.json')
};
