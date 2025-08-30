const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./logger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for local storage
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'uploads', file.fieldname);
    fs.mkdir(uploadPath, { recursive: true })
      .then(() => cb(null, uploadPath))
      .catch(err => cb(err));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

// Configure multer
const upload = multer({
  storage: localStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 10 // Maximum 10 files
  }
});

// Upload to Cloudinary
const uploadToCloudinary = async (file, folder = 'general') => {
  try {
    // Optimize image if it's an image file
    let optimizedBuffer = file.data;
    
    if (file.mimetype.startsWith('image/')) {
      optimizedBuffer = await sharp(file.data)
        .resize(1920, 1080, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `maydiv/${folder}`,
          resource_type: 'auto',
          transformation: [
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(optimizedBuffer);
    });

    logger.info(`File uploaded to Cloudinary: ${result.public_id}`);
    
    return {
      public_id: result.public_id,
      url: result.secure_url,
      width: result.width,
      height: result.height,
      format: result.format,
      size: result.bytes
    };
  } catch (error) {
    logger.error('Cloudinary upload failed:', error);
    throw new Error('File upload failed');
  }
};

// Upload multiple files to Cloudinary
const uploadMultipleToCloudinary = async (files, folder = 'general') => {
  const uploadPromises = files.map(file => uploadToCloudinary(file, folder));
  return Promise.all(uploadPromises);
};

// Delete file from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info(`File deleted from Cloudinary: ${publicId}`);
    return result;
  } catch (error) {
    logger.error('Cloudinary deletion failed:', error);
    throw new Error('File deletion failed');
  }
};

// Generate Cloudinary URL with transformations
const generateCloudinaryUrl = (publicId, transformations = {}) => {
  const defaultTransformations = {
    quality: 'auto:good',
    fetch_format: 'auto'
  };

  const finalTransformations = { ...defaultTransformations, ...transformations };
  
  return cloudinary.url(publicId, {
    transformation: finalTransformations
  });
};

// Upload profile image with specific transformations
const uploadProfileImage = async (file) => {
  try {
    // Optimize for profile image
    const optimizedBuffer = await sharp(file.data)
      .resize(400, 400, { 
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 })
      .toBuffer();

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'maydiv/profiles',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(optimizedBuffer);
    });

    return {
      public_id: result.public_id,
      url: result.secure_url,
      width: result.width,
      height: result.height
    };
  } catch (error) {
    logger.error('Profile image upload failed:', error);
    throw new Error('Profile image upload failed');
  }
};

// Upload project images with specific transformations
const uploadProjectImages = async (files) => {
  try {
    const results = [];
    
    for (const file of files) {
      // Optimize for project display
      const optimizedBuffer = await sharp(file.data)
        .resize(1200, 800, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'maydiv/projects',
            transformation: [
              { width: 1200, height: 800, crop: 'limit' },
              { quality: 'auto:good' },
              { fetch_format: 'auto' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );

        uploadStream.end(optimizedBuffer);
      });

      results.push({
        public_id: result.public_id,
        url: result.secure_url,
        width: result.width,
        height: result.height
      });
    }

    return results;
  } catch (error) {
    logger.error('Project images upload failed:', error);
    throw new Error('Project images upload failed');
  }
};

// Upload document files
const uploadDocument = async (file) => {
  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'maydiv/documents',
          resource_type: 'raw'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(file.data);
    });

    return {
      public_id: result.public_id,
      url: result.secure_url,
      format: result.format,
      size: result.bytes
    };
  } catch (error) {
    logger.error('Document upload failed:', error);
    throw new Error('Document upload failed');
  }
};

// Generate thumbnail from video
const generateVideoThumbnail = async (videoPublicId) => {
  try {
    const result = await cloudinary.video(videoPublicId, {
      transformation: [
        { width: 300, height: 200, crop: 'fill' },
        { quality: 'auto:good' }
      ]
    });

    return result.secure_url;
  } catch (error) {
    logger.error('Video thumbnail generation failed:', error);
    throw new Error('Video thumbnail generation failed');
  }
};

// Optimize image for web
const optimizeImageForWeb = async (buffer, options = {}) => {
  const {
    width = 1920,
    height = 1080,
    quality = 80,
    format = 'jpeg'
  } = options;

  try {
    let sharpInstance = sharp(buffer);

    // Resize if dimensions provided
    if (width && height) {
      sharpInstance = sharpInstance.resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    // Apply format-specific optimizations
    switch (format.toLowerCase()) {
      case 'jpeg':
      case 'jpg':
        sharpInstance = sharpInstance.jpeg({ quality });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ quality });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality });
        break;
      default:
        sharpInstance = sharpInstance.jpeg({ quality });
    }

    return await sharpInstance.toBuffer();
  } catch (error) {
    logger.error('Image optimization failed:', error);
    throw new Error('Image optimization failed');
  }
};

// Get file info
const getFileInfo = async (file) => {
  try {
    const stats = await fs.stat(file.path);
    const ext = path.extname(file.originalname).toLowerCase();
    
    return {
      name: file.originalname,
      size: stats.size,
      type: file.mimetype,
      extension: ext,
      path: file.path
    };
  } catch (error) {
    logger.error('File info retrieval failed:', error);
    throw new Error('File info retrieval failed');
  }
};

// Clean up temporary files
const cleanupTempFiles = async (files) => {
  try {
    const deletePromises = files.map(file => 
      fs.unlink(file.path).catch(err => 
        logger.warn(`Failed to delete temp file: ${file.path}`, err)
      )
    );
    
    await Promise.all(deletePromises);
    logger.info(`Cleaned up ${files.length} temporary files`);
  } catch (error) {
    logger.error('Temp file cleanup failed:', error);
  }
};

// Validate file size
const validateFileSize = (file, maxSize = 10 * 1024 * 1024) => {
  if (file.size > maxSize) {
    throw new Error(`File size ${file.size} exceeds maximum allowed size ${maxSize}`);
  }
  return true;
};

// Validate image dimensions
const validateImageDimensions = async (file, maxWidth = 4000, maxHeight = 4000) => {
  try {
    const metadata = await sharp(file.data).metadata();
    
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      throw new Error(`Image dimensions ${metadata.width}x${metadata.height} exceed maximum allowed ${maxWidth}x${maxHeight}`);
    }
    
    return true;
  } catch (error) {
    logger.error('Image dimension validation failed:', error);
    throw new Error('Image dimension validation failed');
  }
};

module.exports = {
  upload,
  uploadToCloudinary,
  uploadMultipleToCloudinary,
  deleteFromCloudinary,
  generateCloudinaryUrl,
  uploadProfileImage,
  uploadProjectImages,
  uploadDocument,
  generateVideoThumbnail,
  optimizeImageForWeb,
  getFileInfo,
  cleanupTempFiles,
  validateFileSize,
  validateImageDimensions,
  fileFilter
}; 