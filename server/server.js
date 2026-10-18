const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { rateLimit } = require('express-rate-limit');
const config = require('./config');

const authRoutes = require('./routes/auth');
const matchRoutes = require('./routes/match');
const chatRoutes = require('./routes/chat');
const mediaRoutes = require('./routes/media');
const paymentRoutes = require('./routes/payment');

const app = express();
app.set('trust proxy', 'loopback');

// Security Headers (configured to allow inline images and CDN scripts if needed)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    if (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

const requestLimit = (limit) => rateLimit({
  windowMs: 60 * 1000,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '요청이 많습니다. 잠시 후 다시 시도해주세요.' }
});
app.use('/api/auth/guest', requestLimit(10));
app.use(['/api/chat/send','/api/chat/greeting','/api/chat/gift'], requestLimit(12));

// Static Assets (Avatars, Gifts) from project root
app.use('/avatars', express.static(path.join(__dirname, '..', 'avatars')));
app.use('/gifts', express.static(path.join(__dirname, '..', 'gifts')));

// API Routes
// These prototype handlers do not yet verify SMS, payment, or server prices.
// Keep them unavailable on a public deployment until real providers are wired.
if (config.nodeEnv === 'production') {
  app.post([
    '/api/auth/toggle-vip',
    '/api/auth/reset',
    '/api/media/unlock'
  ], (req, res) => res.status(503).json({
    success: false,
    error: '이 기능은 데모 상태이며 실제 서비스 연동 전에는 사용할 수 없습니다.'
  }));
}

app.use('/api/admin', requestLimit(60), require('./routes/admin'));
app.use('/api/support', require('./routes/support'));
app.get('/api/public-config', (req,res) => {
  res.set('Cache-Control','no-store');
  res.json({gaMeasurementId: require('./services/operationsService').setting('ga_measurement_id') ?? config.gaMeasurementId});
});
app.use('/api/auth', authRoutes);
app.use('/api/account', require('./routes/account'));
app.use('/api/match', matchRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/payment', paymentRoutes);

// Health Check Endpoint (Essential for OCI Load Balancer / Health Checks)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'azitchat-backend',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

for (const [route,file] of [['/admin','admin.html'],['/support','support.html'],['/privacy','privacy.html'],['/terms','terms.html'],['/refund','refund.html'],['/products','products.html'],['/privacy-20261018-initial','privacy-20261018-initial.html']]) {
  app.get([route,route+'.html'],(req,res)=>{res.set('Cache-Control','no-store');res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");res.sendFile(path.join(__dirname,'..',file));});
}
// Serve frontend SPA from root
for (const file of ['index.html', 'apiClient.js', 'chatTiming.js', 'analytics.js', 'admin.js', 'support.js', 'operations.css', 'policy.css', 'custom_avatars_manifest.json']) {
  app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, '..', file)));
}

// Never serve server source, credentials, or the persistent database.
app.use(['/server', '/.git', '/.env'], (req, res) => res.sendStatus(404));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// 404 Handler for API
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: '존재하지 않는 API 엔드포인트입니다.' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[UNHANDLED SERVER ERROR]', err);
  res.status(500).json({
    success: false,
    error: '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    details: config.nodeEnv === 'development' ? err.message : undefined
  });
});

const stopHeartExpiry = require('./services/dbService').startHeartExpiryWorker();
const server = app.listen(config.port, config.host, () => {
  console.log(`=======================================================`);
  console.log(`🚀 AzitChat Backend Running on Port ${config.port}`);
  console.log(`🌐 Health check: http://localhost:${config.port}/api/health`);
  console.log(`🛡️ Environment: ${config.nodeEnv}`);
  console.log(`☁️ Ready for OCI (Oracle Cloud Infrastructure) Deployment`);
  console.log(`=======================================================`);
});

server.on('close', stopHeartExpiry);
module.exports = { app, server };
