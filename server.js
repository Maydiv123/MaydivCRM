const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const hpp = require('hpp');
const session = require('express-session');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Import database connection
const { initializeDatabase, getDatabase } = require('./config/database');

// Create Express app
const app = express();

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW_MS) / 1000 / 60)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp());

// Compression middleware
app.use(compression());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'maydiv-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'MayDiv API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Backend is working with SQLite!',
    database: 'SQLite',
    timestamp: new Date().toISOString()
  });
});

// Import admin routes
const adminRoutes = require('./routes/admin');

// Admin routes
app.use('/api/v1/admin', adminRoutes);

// SEO CRUD Routes
app.get('/api/v1/seo', async (req, res) => {
  try {
    const db = getDatabase();
    const seoData = db.prepare('SELECT * FROM seo ORDER BY createdAt DESC').all();
    
    res.status(200).json({
      success: true,
      seoData: seoData
    });
  } catch (error) {
    console.error('Error fetching SEO data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/v1/seo/page/:pagePath', async (req, res) => {
  try {
    const { pagePath } = req.params;
    const db = getDatabase();
    
    const seoData = db.prepare('SELECT * FROM seo WHERE pagePath = ? AND isPublished = 1').get(pagePath);
    
    if (seoData) {
      res.status(200).json({
        success: true,
        seoData: seoData
      });
    } else {
      // Fallback data if not found in database
      res.status(200).json({
        success: true,
        seoData: {
          pagePath,
          metaTitle: `MayDiv - ${pagePath}`,
          metaDescription: 'Digital Agency Services',
          keywords: 'digital agency, web design, development',
          canonicalUrl: `https://maydiv.com${pagePath}`,
          ogTitle: `MayDiv - ${pagePath}`,
          ogDescription: 'Digital Agency Services',
          ogImage: 'https://maydiv.com/og-image.jpg',
          twitterCard: 'summary_large_image',
          robots: 'index, follow',
          seoScore: 85,
          isPublished: true
        }
      });
    }
  } catch (error) {
    console.error('Error fetching SEO data for page:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/v1/seo', async (req, res) => {
  try {
    const {
      pagePath,
      pageTitle,
      metaTitle,
      metaDescription,
      content,
      keywords,
      canonicalUrl,
      ogTitle,
      ogDescription,
      ogImage,
      twitterTitle,
      twitterDescription,
      twitterImage,
      robots,
      seoScore
    } = req.body;

    const db = getDatabase();
    
    const result = db.prepare(`
      INSERT INTO seo (
        pagePath, pageTitle, metaTitle, metaDescription, content, keywords, 
        canonicalUrl, ogTitle, ogDescription, ogImage, 
        twitterTitle, twitterDescription, twitterImage, robots, seoScore,
        isPublished, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      pagePath, pageTitle, metaTitle, metaDescription, content, keywords,
      canonicalUrl, ogTitle, ogDescription, ogImage,
      twitterTitle, twitterDescription, twitterImage, robots, seoScore || 0
    );

    // Get the created record
    const createdRecord = db.prepare('SELECT * FROM seo WHERE id = ?').get(result.lastInsertRowid);

    res.status(201).json({
      success: true,
      message: 'SEO data created successfully',
      seoData: createdRecord
    });
  } catch (error) {
    console.error('Error creating SEO data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put('/api/v1/seo/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      pagePath,
      pageTitle,
      metaTitle,
      metaDescription,
      content,
      keywords,
      canonicalUrl,
      ogTitle,
      ogDescription,
      ogImage,
      twitterTitle,
      twitterDescription,
      twitterImage,
      robots,
      seoScore
    } = req.body;

    const db = getDatabase();
    
    const result = db.prepare(`
      UPDATE seo SET 
        pagePath = ?, pageTitle = ?, metaTitle = ?, metaDescription = ?, 
        content = ?, keywords = ?, canonicalUrl = ?, ogTitle = ?, 
        ogDescription = ?, ogImage = ?, twitterTitle = ?, 
        twitterDescription = ?, twitterImage = ?, robots = ?, seoScore = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      pagePath, pageTitle, metaTitle, metaDescription, content, keywords,
      canonicalUrl, ogTitle, ogDescription, ogImage,
      twitterTitle, twitterDescription, twitterImage, robots, seoScore || 0,
      id
    );

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'SEO data not found'
      });
    }

    // Get the updated record
    const updatedRecord = db.prepare('SELECT * FROM seo WHERE id = ?').get(id);

    res.status(200).json({
      success: true,
      message: 'SEO data updated successfully',
      seoData: updatedRecord
    });
  } catch (error) {
    console.error('Error updating SEO data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete('/api/v1/seo/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    
    const result = db.prepare('DELETE FROM seo WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'SEO data not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'SEO data deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting SEO data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve complete dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'complete-dashboard.html'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
    
    // Start server
    const PORT = process.env.PORT || 3001;
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 MayDiv API server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api/v1`);
      console.log(`✅ Database: SQLite (local)`);
      console.log(`🗄️  SEO endpoints: http://localhost:${PORT}/api/v1/seo`);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err, promise) => {
      console.error(`Unhandled Rejection: ${err.message}`);
      server.close(() => {
        process.exit(1);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (err) => {
      console.error(`Uncaught Exception: ${err.message}`);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        console.log('Process terminated');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app; 