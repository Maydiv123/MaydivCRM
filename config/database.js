const Database = require('better-sqlite3');
const path = require('path');

let db;

const initializeDatabase = async () => {
  try {
    // Open database connection
    db = new Database(path.join(__dirname, '../data/maydiv.db'));

    // Check if old table exists with UNIQUE constraint
    try {
      const tableInfo = db.prepare("PRAGMA table_info(seo)").all();
      const hasUniqueConstraint = tableInfo.some(col => col.name === 'pagePath' && col.notnull === 1);
      
      if (hasUniqueConstraint) {
        console.log('Recreating table to remove UNIQUE constraint...');
        // Drop old table and recreate
        db.exec('DROP TABLE IF EXISTS seo');
      }
    } catch (error) {
      // Table doesn't exist, continue
    }

    // Create seo table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS seo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pagePath TEXT NOT NULL,
        pageTitle TEXT NOT NULL,
        metaTitle TEXT NOT NULL,
        metaDescription TEXT NOT NULL,
        content TEXT,
        keywords TEXT,
        canonicalUrl TEXT,
        ogTitle TEXT,
        ogDescription TEXT,
        ogImage TEXT,
        twitterTitle TEXT,
        twitterDescription TEXT,
        twitterImage TEXT,
        robots TEXT DEFAULT 'index, follow',
        seoScore INTEGER DEFAULT 0,
        isPublished BOOLEAN DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add content column if it doesn't exist (for existing databases)
    try {
      db.exec('ALTER TABLE seo ADD COLUMN content TEXT');
    } catch (error) {
      // Column already exists, ignore error
    }

    console.log('Database initialized successfully');
    return db;
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
};

const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
};

module.exports = {
  initializeDatabase,
  getDatabase,
  db: {
    get prepare() {
      return getDatabase().prepare;
    },
    get exec() {
      return getDatabase().exec;
    }
  }
};
