const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { rateLimit } = require('express-rate-limit');
const config = require('./config');
require('./services/characterService').initializeRegistry();

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
app.get('/styles/app.css',(req,res)=>res.sendFile(path.join(__dirname,'..','styles','app.css')));
app.get('/app-icon.svg',(req,res)=>res.sendFile(path.join(__dirname,'..','app-icon.svg')));

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
  res.json({advertising:require('./services/advertisingService').publicConfig(),gaMeasurementId: require('./services/operationsService').setting('ga_measurement_id') ?? config.gaMeasurementId});
});
app.use('/api/auth', authRoutes);
app.use('/api/legal',require('./routes/legal'));
app.use('/api/account', require('./routes/account'));
app.use('/api/wellbeing', requestLimit(60), require('./routes/wellbeing'));
app.use('/api/notifications', requestLimit(60), require('./routes/notifications'));
app.use('/api/match', matchRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/advertising',requestLimit(60),require('./routes/advertising'));
app.use('/api/identity',requestLimit(20),require('./routes/identity'));
const stopCommerce=require('./services/paymentService').startWorker();
const stopAdvertising=require('./services/advertisingService').start();

// Health Check Endpoint (Essential for OCI Load Balancer / Health Checks)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'azitchat-backend',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

// Obfuscated 2-depth admin entry route
const adminEntryRoute = (config.adminEntryPath || '/ops-manage-2026/admin').replace(/\/+$/, '');
app.get(adminEntryRoute + '.html', (req, res) => res.redirect(301, adminEntryRoute + (req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '')));
app.get(adminEntryRoute, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.sendFile(path.join(__dirname, '..', 'admin.html'));
});

// Explicitly block legacy /admin routes with 404
app.all(['/admin', '/admin.html'], (req, res) => {
  res.status(404).set('X-Robots-Tag', 'noindex').type('html').send('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>페이지를 찾을 수 없습니다 · 아지트챗</title><h1>페이지를 찾을 수 없습니다</h1><p>주소를 확인하거나 <a href="/">아지트챗 홈</a>으로 이동해주세요.</p></html>');
});

for (const [route,file] of [['/support','support.html'],['/privacy','privacy.html'],['/terms','terms.html'],['/refund','refund.html'],['/products','products.html'],['/about','about.html'],['/brand','brand.html'],['/verification','verification.html'],['/billing','billing.html'],['/payment/complete','billing.html'],['/verification/complete','billing.html'],['/privacy-20261018-initial','privacy-20261018-initial.html'],['/safety','safety.html'],['/policies','policies.html'],['/terms-20261019-v1','terms-20261019-v1.html'],['/privacy-20261019-v1','privacy-20261019-v1.html'],['/privacy-20261019-v2','privacy-20261019-v2.html'],['/refund-20261019-v1','refund-20261019-v1.html'],['/terms-20261019-v2','terms-20261019-v2.html'],['/refund-20261019-v2','refund-20261019-v2.html']]) {
  app.get(route+'.html',(req,res)=>res.redirect(301,route+(req.originalUrl.includes('?')?req.originalUrl.slice(req.originalUrl.indexOf('?')):'')));
  app.get(route,(req,res)=>{if(file==='billing.html')res.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');res.set('Cache-Control','no-store');res.set('Content-Security-Policy',file==='billing.html'?"default-src 'self'; script-src 'self' https://cdn.iamport.kr https://cdn.portone.io https://www.googletagmanager.com https://connect.facebook.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.iamport.kr https://*.portone.io https://www.google-analytics.com https://*.google.com https://*.googleadservices.com https://*.doubleclick.net https://www.facebook.com; frame-src https:; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https:":"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");res.sendFile(path.join(__dirname,'..',file));});
}
app.get('/index.html',(req,res)=>res.redirect(301,'/'+(req.originalUrl.includes('?')?req.originalUrl.slice(req.originalUrl.indexOf('?')):'')));
app.get('/',(req,res)=>{res.set('Cache-Control','no-store');res.sendFile(path.join(__dirname,'..','index.html'));});
// Public static assets
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.sendFile(path.join(__dirname, '..', 'robots.txt'));
});
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.sendFile(path.join(__dirname, '..', 'sitemap.xml'));
});
for (const file of [
  'branding.css', 'notification-badge.png', 'brand.css', 'roomList.js', 'messageDelivery.js', 'wellbeing.js', 'wellbeing.css', 'legal.js', 'commerce.js', 'advertising.js', 'apiClient.js', 'chatTiming.js', 'analytics.js',
  'notifications.js', 'notification-worker.js', 'manifest.webmanifest', 'admin.js',
  'adminCharacters.js', 'adminFunnel.js', 'support.js', 'billing.css', 'operations.css', 'policy.css', 'custom_avatars_manifest.json',
  'logo.png', 'logo-horizontal.png', 'app-icon.png', 'app-icon-192.png', 'app-icon-512.png',
  'apple-touch-icon.png', 'favicon.png', 'favicon-64.png', 'favicon.ico',
  'robots.txt', 'sitemap.xml'
]) {
  app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, '..', file)));
}

// Never serve server source, credentials, or the persistent database.
app.use(['/server', '/.git', '/.env'], (req, res) => res.sendStatus(404));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.status(404).set('X-Robots-Tag','noindex').type('html').send('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>페이지를 찾을 수 없습니다 · 아지트챗</title><h1>페이지를 찾을 수 없습니다</h1><p>주소를 확인하거나 <a href="/">아지트챗 홈</a>으로 이동해주세요.</p></html>');
});

// 404 Handler for API
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: '존재하지 않는 API 엔드포인트입니다.' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[UNHANDLED SERVER ERROR]', err);
  res.status(err.status===503?503:500).json({
    success: false,
    error: '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    details: config.nodeEnv === 'development' ? err.message : undefined
  });
});

require('./services/roomLifecycle').repair();
const stopHeartExpiry = require('./services/dbService').startHeartExpiryWorker();
const stopProactive = require('./services/proactiveService').start();
const server = app.listen(config.port, config.host, () => {
  console.log(`=======================================================`);
  console.log(`🚀 AzitChat Backend Running on Port ${config.port}`);
  console.log(`🌐 Health check: http://localhost:${config.port}/api/health`);
  console.log(`🛡️ Environment: ${config.nodeEnv}`);
  console.log(`☁️ Ready for OCI (Oracle Cloud Infrastructure) Deployment`);
  console.log(`=======================================================`);
});

server.on('close', stopHeartExpiry);
server.on('close', stopProactive);
server.on('close', stopCommerce);
server.on('close',stopAdvertising);
module.exports = { app, server };
