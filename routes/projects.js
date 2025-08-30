const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const asyncHandler = require('express-async-handler');

// Import models and middleware
const Project = require('../models/Project');
const { protect, authorize, optionalAuth, checkProjectAccess } = require('../middleware/auth');
const { uploadToCloudinary } = require('../utils/upload');
const logger = require('../utils/logger');

// @desc    Get all projects
// @route   GET /api/v1/projects
// @access  Public
router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;

  // Build query
  let query = Project.find({ isPublic: true, isActive: true });

  // Filter by category
  if (req.query.category) {
    query = query.where('category', req.query.category);
  }

  // Filter by subcategory
  if (req.query.subcategory) {
    query = query.where('subcategory', req.query.subcategory);
  }

  // Filter by featured
  if (req.query.featured === 'true') {
    query = query.where('isFeatured', true);
  }

  // Filter by status
  if (req.query.status) {
    query = query.where('status', req.query.status);
  }

  // Filter by client
  if (req.query.client) {
    query = query.where('client.name', { $regex: req.query.client, $options: 'i' });
  }

  // Search functionality
  if (req.query.search) {
    query = Project.search(req.query.search);
  }

  // Sort
  const sortField = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
  query = query.sort({ [sortField]: sortOrder });

  // Pagination
  query = query.skip(startIndex).limit(limit);

  // Populate team members
  query = query.populate('team.user', 'name avatar');

  const projects = await query;
  const total = await Project.countDocuments({ isPublic: true, isActive: true });

  // Pagination result
  const pagination = {};

  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit
    };
  }

  res.status(200).json({
    success: true,
    count: projects.length,
    pagination,
    total,
    data: projects
  });
}));

// @desc    Get featured projects
// @route   GET /api/v1/projects/featured
// @access  Public
router.get('/featured', asyncHandler(async (req, res) => {
  const projects = await Project.findFeatured().limit(6);

  res.status(200).json({
    success: true,
    count: projects.length,
    data: projects
  });
}));

// @desc    Get projects by category
// @route   GET /api/v1/projects/category/:category
// @access  Public
router.get('/category/:category', asyncHandler(async (req, res) => {
  const projects = await Project.findByCategory(req.params.category);

  res.status(200).json({
    success: true,
    count: projects.length,
    data: projects
  });
}));

// @desc    Get single project
// @route   GET /api/v1/projects/:id
// @access  Public
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id)
    .populate('team.user', 'name avatar email')
    .populate('notes.author', 'name email');

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  // Check if user can access this project
  if (!project.isPublic) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required to view this project'
      });
    }

    const isTeamMember = project.team.some(member => 
      member.user._id.toString() === req.user._id.toString()
    );
    const isAdmin = req.user.role === 'admin';

    if (!isTeamMember && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this project'
      });
    }
  }

  // Increment view count
  project.metrics.views += 1;
  await project.save();

  res.status(200).json({
    success: true,
    data: project
  });
}));

// @desc    Create new project
// @route   POST /api/v1/projects
// @access  Private/Admin
router.post('/', protect, authorize('admin'), [
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 20, max: 2000 })
    .withMessage('Description must be between 20 and 2000 characters'),
  body('category')
    .isIn(['web-development', 'mobile-app', 'ui-ux-design', 'digital-marketing', 'branding', 'e-commerce', 'saas-platform', 'ai-ml', 'blockchain', 'game-development', 'animation', 'video-production', 'seo', 'social-media', 'content-creation', 'consulting', 'other'])
    .withMessage('Invalid category'),
  body('client.name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Client name must be between 2 and 100 characters')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const project = await Project.create({
    ...req.body,
    user: req.user.id
  });

  res.status(201).json({
    success: true,
    message: 'Project created successfully',
    data: project
  });
}));

// @desc    Update project
// @route   PUT /api/v1/projects/:id
// @access  Private/Admin
router.put('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  const updatedProject = await Project.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true
    }
  );

  res.status(200).json({
    success: true,
    message: 'Project updated successfully',
    data: updatedProject
  });
}));

// @desc    Delete project
// @route   DELETE /api/v1/projects/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  await project.remove();

  res.status(200).json({
    success: true,
    message: 'Project deleted successfully'
  });
}));

// @desc    Upload project images
// @route   POST /api/v1/projects/:id/images
// @access  Private/Admin
router.post('/:id/images', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  if (!req.files || !req.files.images) {
    return res.status(400).json({
      success: false,
      error: 'Please upload images'
    });
  }

  const files = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
  const uploadedImages = [];

  for (const file of files) {
    try {
      const result = await uploadToCloudinary(file, 'projects');
      
      uploadedImages.push({
        public_id: result.public_id,
        url: result.secure_url,
        alt: req.body.alt || file.name,
        caption: req.body.caption || ''
      });
    } catch (error) {
      logger.error('Image upload failed:', error);
    }
  }

  project.images.push(...uploadedImages);
  await project.save();

  res.status(200).json({
    success: true,
    message: 'Images uploaded successfully',
    data: uploadedImages
  });
}));

// @desc    Add team member to project
// @route   POST /api/v1/projects/:id/team
// @access  Private/Admin
router.post('/:id/team', protect, authorize('admin'), [
  body('userId')
    .isMongoId()
    .withMessage('Invalid user ID'),
  body('role')
    .isIn(['project-manager', 'developer', 'designer', 'qa', 'devops', 'analyst'])
    .withMessage('Invalid role')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  await project.addTeamMember(req.body.userId, req.body.role);

  res.status(200).json({
    success: true,
    message: 'Team member added successfully',
    data: project
  });
}));

// @desc    Remove team member from project
// @route   DELETE /api/v1/projects/:id/team/:userId
// @access  Private/Admin
router.delete('/:id/team/:userId', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  await project.removeTeamMember(req.params.userId);

  res.status(200).json({
    success: true,
    message: 'Team member removed successfully',
    data: project
  });
}));

// @desc    Add milestone to project
// @route   POST /api/v1/projects/:id/milestones
// @access  Private/Admin
router.post('/:id/milestones', protect, authorize('admin'), [
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be between 10 and 500 characters'),
  body('dueDate')
    .isISO8601()
    .withMessage('Invalid due date')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  const milestoneData = {
    title: req.body.title,
    description: req.body.description,
    dueDate: new Date(req.body.dueDate)
  };

  await project.addMilestone(milestoneData);

  res.status(200).json({
    success: true,
    message: 'Milestone added successfully',
    data: project
  });
}));

// @desc    Update milestone status
// @route   PUT /api/v1/projects/:id/milestones/:milestoneId
// @access  Private/Admin
router.put('/:id/milestones/:milestoneId', protect, authorize('admin'), [
  body('status')
    .isIn(['pending', 'in-progress', 'completed', 'overdue'])
    .withMessage('Invalid status')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  await project.updateMilestoneStatus(req.params.milestoneId, req.body.status);

  res.status(200).json({
    success: true,
    message: 'Milestone status updated successfully',
    data: project
  });
}));

// @desc    Add note to project
// @route   POST /api/v1/projects/:id/notes
// @access  Private
router.post('/:id/notes', protect, checkProjectAccess, [
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Note content must be between 1 and 1000 characters')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const noteData = {
    content: req.body.content,
    author: req.user.id,
    isPrivate: req.body.isPrivate || false
  };

  req.project.notes.push(noteData);
  await req.project.save();

  res.status(200).json({
    success: true,
    message: 'Note added successfully',
    data: req.project
  });
}));

// @desc    Update project completion percentage
// @route   PUT /api/v1/projects/:id/completion
// @access  Private/Admin
router.put('/:id/completion', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  await project.updateCompletionPercentage();

  res.status(200).json({
    success: true,
    message: 'Completion percentage updated successfully',
    data: project
  });
}));

// @desc    Get project statistics
// @route   GET /api/v1/projects/stats/overview
// @access  Private/Admin
router.get('/stats/overview', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const totalProjects = await Project.countDocuments();
  const activeProjects = await Project.countDocuments({ status: 'in-progress' });
  const completedProjects = await Project.countDocuments({ status: 'completed' });
  const featuredProjects = await Project.countDocuments({ isFeatured: true });

  // Get projects by category
  const categoryStats = await Project.aggregate([
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 }
      }
    }
  ]);

  // Get projects by status
  const statusStats = await Project.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // Get recent projects (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentProjects = await Project.countDocuments({
    createdAt: { $gte: thirtyDaysAgo }
  });

  res.status(200).json({
    success: true,
    data: {
      total: totalProjects,
      active: activeProjects,
      completed: completedProjects,
      featured: featuredProjects,
      recent: recentProjects,
      byCategory: categoryStats,
      byStatus: statusStats
    }
  });
}));

// @desc    Search projects
// @route   GET /api/v1/projects/search/:query
// @access  Public
router.get('/search/:query', asyncHandler(async (req, res) => {
  const projects = await Project.search(req.params.query);

  res.status(200).json({
    success: true,
    count: projects.length,
    data: projects
  });
}));

module.exports = router; 