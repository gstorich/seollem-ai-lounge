const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const config = require('./config');

const authRoutes = require('./routes/auth');
const matchRoutes = require('./routes/match');
const chatRoutes = require('./routes/chat');
const mediaRoutes = require('./routes/media');
const paymentRoutes = require('./routes/payment');

const app = express();

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
    return callback(null, true); // Permissive in dev, tighten in production via .env
  },
  credentials: true
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Static Assets (Avatars, Gifts) from project root
app.use('/avatars', express.static(path.join(__dirname, '..', 'avatars')));
app.use('/gifts', express.static(path.join(__dirname, '..', 'gifts')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/payment', paymentRoutes);

// Health Check Endpoint (Essential for OCI Load Balancer / Health Checks)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'seollem-ai-backend',
    environment: config.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

// Serve frontend SPA from root
app.use(express.static(path.join(__dirname, '..')));

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

const server = app.listen(config.port, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Seollem AI Lounge Backend Running on Port ${config.port}`);
  console.log(`🌐 Health check: http://localhost:${config.port}/api/health`);
  console.log(`🛡️ Environment: ${config.nodeEnv}`);
  console.log(`☁️ Ready for OCI (Oracle Cloud Infrastructure) Deployment`);
  console.log(`=======================================================`);
});

module.exports = { app, server };
