const express = require('express');
const router = express.Router();
const { db } = require('../config/database');

// Get all SEO data
router.get('/seo', (req, res) => {
  try {
    const seoData = db.prepare('SELECT * FROM seo ORDER BY createdAt DESC').all();
    res.json({
      status: 'success',
      data: seoData
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Create new SEO data
router.post('/seo', (req, res) => {
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

    res.json({
      status: 'success',
      message: 'SEO data created successfully',
      id: result.lastInsertRowid
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Update SEO data
router.put('/seo/:id', (req, res) => {
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

    const result = db.prepare(`
      UPDATE seo SET 
        pagePath = ?, pageTitle = ?, metaTitle = ?, metaDescription = ?, content = ?, keywords = ?,
        canonicalUrl = ?, ogTitle = ?, ogDescription = ?, ogImage = ?,
        twitterTitle = ?, twitterDescription = ?, twitterImage = ?, robots = ?, seoScore = ?,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      pagePath, pageTitle, metaTitle, metaDescription, content, keywords,
      canonicalUrl, ogTitle, ogDescription, ogImage,
      twitterTitle, twitterDescription, twitterImage, robots, seoScore || 0,
      id
    );

    if (result.changes > 0) {
      res.json({
        status: 'success',
        message: 'SEO data updated successfully'
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: 'SEO data not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Delete SEO data
router.delete('/seo/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM seo WHERE id = ?').run(id);

    if (result.changes > 0) {
      res.json({
        status: 'success',
        message: 'SEO data deleted successfully'
      });
    } else {
      res.status(404).json({
        status: 'error',
        message: 'SEO data not found'
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Image upload endpoint
router.post('/upload-images', (req, res) => {
  try {
    // For now, return mock success
    // In production, you would handle file upload with multer
    res.json({
      status: 'success',
      message: 'Images uploaded successfully',
      data: [
        {
          id: 1,
          name: 'sample-image.jpg',
          url: 'https://via.placeholder.com/400x300/667eea/ffffff?text=Sample+Image',
          category: req.body.category || 'general',
          altText: req.body.altText || 'Sample image',
          size: 1024000,
          uploadedAt: new Date().toISOString()
        }
      ]
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get all images
router.get('/images', (req, res) => {
  try {
    // Mock image data
    const images = [
      {
        id: 1,
        name: 'hero-image.jpg',
        url: 'https://via.placeholder.com/800x400/667eea/ffffff?text=Hero+Image',
        category: 'hero',
        altText: 'Hero section image',
        size: 2048000,
        uploadedAt: new Date().toISOString()
      },
      {
        id: 2,
        name: 'portfolio-1.jpg',
        url: 'https://via.placeholder.com/400x300/764ba2/ffffff?text=Portfolio+1',
        category: 'portfolio',
        altText: 'Portfolio project 1',
        size: 1536000,
        uploadedAt: new Date().toISOString()
      }
    ];
    
    res.json({
      status: 'success',
      data: images
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Delete image
router.delete('/images/:id', (req, res) => {
  try {
    const { id } = req.params;
    // Mock delete
    res.json({
      status: 'success',
      message: 'Image deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Content management endpoints
router.post('/content', (req, res) => {
  try {
    const { type, title, body, slug, status } = req.body;
    
    // Mock content save
    res.json({
      status: 'success',
      message: 'Content saved successfully',
      id: Date.now()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

router.get('/content', (req, res) => {
  try {
    // Mock content data
    const content = [
      {
        id: 1,
        type: 'page',
        title: 'About Us',
        body: 'We are a leading digital agency...',
        slug: 'about-us',
        status: 'published',
        createdAt: new Date().toISOString()
      }
    ];
    
    res.json({
      status: 'success',
      data: content
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router; 