const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');
const heroSlidesRouter = require('./routes/heroSlides');
const authRouter = require('./routes/auth');
const categoriesRouter = require('./routes/categories');
const productsRouter = require('./routes/products');
const eventsRouter = require('./routes/events');
const reviewsRouter = require('./routes/reviews');
const ordersRouter = require('./routes/orders');
const enquiriesRouter = require('./routes/enquiries');
const settingsRouter = require('./routes/settings');

const app = express();

// Color helper for logs
console.cyan = (msg = '') => console.log(`\x1b[36m${msg}\x1b[0m`);

connectDB();

app.use(cors({
  origin: (origin, callback) => {
    // Allow same-origin/proxied requests and the configured client origin
    if (!origin || process.env.CLIENT_URL?.split(',').includes(origin)) {
      return callback(null, true);
    }
    callback(null, true); // permissive for dev; tighten for production if needed
  },
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API routes
app.use('/api/hero-slides', heroSlidesRouter);
app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/enquiries', enquiriesRouter);
app.use('/api/settings', settingsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'NAVEEN PRODUCTIONS API is running', time: new Date().toISOString() });
});

// Serve the built frontend (SPA) so card clicks & deep links never 404.
// The frontend must be built first (frontend/dist); if missing, the API-only
// fallthrough below applies.
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));

  // SPA fallback: return index.html for every non-API GET route so client-side
  // routes like /rentals/:slug, /cart, /booking work when opened directly.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Server error',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.cyan(`NAVEEN PRODUCTIONS API running on port ${PORT}`);
  console.cyan(`Health check: http://localhost:${PORT}/api/health`);
});