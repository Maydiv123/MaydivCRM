// MongoDB initialization script
db = db.getSiblingDB('maydiv');

// Create collections
db.createCollection('users');
db.createCollection('projects');
db.createCollection('services');
db.createCollection('contacts');
db.createCollection('seo');

// Create indexes
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "username": 1 }, { unique: true });
db.projects.createIndex({ "slug": 1 }, { unique: true });
db.services.createIndex({ "slug": 1 }, { unique: true });
db.seo.createIndex({ "pagePath": 1 }, { unique: true });

print('MayDiv database initialized successfully!'); 