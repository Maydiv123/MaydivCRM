const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('express-async-handler');

// Import models and utilities
const Contact = require('../models/Contact');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const logger = require('../utils/logger');

// Rate limiting for contact form
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 contact submissions per windowMs
  message: {
    success: false,
    error: 'Too many contact form submissions, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// @desc    Submit contact form
// @route   POST /api/v1/contact
// @access  Public
router.post('/', contactLimiter, [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('subject')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Subject must be between 5 and 200 characters'),
  body('message')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be between 10 and 2000 characters'),
  body('phone')
    .optional()
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Please provide a valid phone number'),
  body('inquiryType')
    .optional()
    .isIn(['general', 'project-inquiry', 'service-inquiry', 'partnership', 'career', 'support', 'feedback', 'quote-request', 'consultation', 'other'])
    .withMessage('Invalid inquiry type'),
  body('services')
    .optional()
    .isArray()
    .withMessage('Services must be an array'),
  body('budget.range')
    .optional()
    .isIn(['under-5k', '5k-10k', '10k-25k', '25k-50k', '50k-100k', '100k+', 'not-sure'])
    .withMessage('Invalid budget range'),
  body('timeline')
    .optional()
    .isIn(['asap', '1-month', '2-3-months', '3-6-months', '6-months+', 'flexible'])
    .withMessage('Invalid timeline')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  // Extract data from request
  const {
    name,
    email,
    phone,
    company,
    subject,
    message,
    inquiryType,
    services,
    budget,
    timeline,
    projectDetails,
    source,
    utmData
  } = req.body;

  // Create contact record
  const contact = await Contact.create({
    name,
    email,
    phone,
    company,
    subject,
    message,
    inquiryType,
    services,
    budget,
    timeline,
    projectDetails,
    source,
    utmData,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Calculate spam score
  await contact.calculateSpamScore();

  // Send notification emails
  try {
    // Send auto-reply to user
    await sendEmail({
      email: contact.email,
      subject: 'Thank you for contacting MayDiv',
      template: 'contactAutoReply',
      data: {
        name: contact.name,
        subject: contact.subject,
        inquiryType: contact.inquiryType
      }
    });

    // Send notification to admin
    await sendEmail({
      email: process.env.ADMIN_EMAIL || 'admin@maydiv.com',
      subject: `New Contact Form Submission: ${contact.subject}`,
      template: 'contactNotification',
      data: {
        contact: contact.toObject(),
        adminUrl: `${req.protocol}://${req.get('host')}/admin/contacts/${contact._id}`
      }
    });

    logger.info(`Contact form submitted by ${contact.email}`);
  } catch (error) {
    logger.error('Failed to send contact notification emails:', error);
  }

  res.status(201).json({
    success: true,
    message: 'Thank you for your message. We will get back to you soon!',
    contactId: contact._id
  });
}));

// @desc    Get all contacts (admin only)
// @route   GET /api/v1/contact
// @access  Private/Admin
router.get('/', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Contact.countDocuments();

  // Build query
  let query = Contact.find();

  // Filter by status
  if (req.query.status) {
    query = query.where('status', req.query.status);
  }

  // Filter by priority
  if (req.query.priority) {
    query = query.where('priority', req.query.priority);
  }

  // Filter by inquiry type
  if (req.query.inquiryType) {
    query = query.where('inquiryType', req.query.inquiryType);
  }

  // Filter by assigned user
  if (req.query.assignedTo) {
    query = query.where('assignedTo', req.query.assignedTo);
  }

  // Filter by date range
  if (req.query.startDate && req.query.endDate) {
    query = query.where('createdAt', {
      $gte: new Date(req.query.startDate),
      $lte: new Date(req.query.endDate)
    });
  }

  // Search functionality
  if (req.query.search) {
    query = query.or([
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
      { subject: { $regex: req.query.search, $options: 'i' } },
      { message: { $regex: req.query.search, $options: 'i' } }
    ]);
  }

  // Sort
  const sortField = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
  query = query.sort({ [sortField]: sortOrder });

  // Pagination
  query = query.skip(startIndex).limit(limit);

  // Populate assigned user
  query = query.populate('assignedTo', 'name email');

  const contacts = await query;

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
    count: contacts.length,
    pagination,
    total,
    data: contacts
  });
}));

// @desc    Get single contact
// @route   GET /api/v1/contact/:id
// @access  Private/Admin
router.get('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id)
    .populate('assignedTo', 'name email avatar')
    .populate('notes.author', 'name email');

  if (!contact) {
    return res.status(404).json({
      success: false,
      error: 'Contact not found'
    });
  }

  // Mark as read if not already read
  if (!contact.isRead) {
    contact.markAsRead();
  }

  res.status(200).json({
    success: true,
    data: contact
  });
}));

// @desc    Update contact status
// @route   PUT /api/v1/contact/:id/status
// @access  Private/Admin
router.put('/:id/status', protect, authorize('admin'), [
  body('status')
    .isIn(['new', 'in-progress', 'contacted', 'qualified', 'proposal-sent', 'negotiating', 'won', 'lost', 'closed'])
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

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return res.status(404).json({
      success: false,
      error: 'Contact not found'
    });
  }

  contact.status = req.body.status;
  await contact.save();

  res.status(200).json({
    success: true,
    message: 'Contact status updated successfully',
    data: contact
  });
}));

// @desc    Assign contact to user
// @route   PUT /api/v1/contact/:id/assign
// @access  Private/Admin
router.put('/:id/assign', protect, authorize('admin'), [
  body('assignedTo')
    .isMongoId()
    .withMessage('Invalid user ID')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return res.status(404).json({
      success: false,
      error: 'Contact not found'
    });
  }

  contact.assignedTo = req.body.assignedTo;
  await contact.save();

  res.status(200).json({
    success: true,
    message: 'Contact assigned successfully',
    data: contact
  });
}));

// @desc    Add note to contact
// @route   POST /api/v1/contact/:id/notes
// @access  Private/Admin
router.post('/:id/notes', protect, authorize('admin'), [
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

  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return res.status(404).json({
      success: false,
      error: 'Contact not found'
    });
  }

  const noteData = {
    content: req.body.content,
    author: req.user.id,
    isPrivate: req.body.isPrivate || false
  };

  await contact.addNote(noteData);

  res.status(200).json({
    success: true,
    message: 'Note added successfully',
    data: contact
  });
}));

// @desc    Mark contact as replied
// @route   PUT /api/v1/contact/:id/reply
// @access  Private/Admin
router.put('/:id/reply', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return res.status(404).json({
      success: false,
      error: 'Contact not found'
    });
  }

  await contact.markAsReplied();

  res.status(200).json({
    success: true,
    message: 'Contact marked as replied',
    data: contact
  });
}));

// @desc    Get contact statistics
// @route   GET /api/v1/contact/stats/overview
// @access  Private/Admin
router.get('/stats/overview', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const totalContacts = await Contact.countDocuments();
  const unreadContacts = await Contact.countDocuments({ isRead: false });
  const unrepliedContacts = await Contact.countDocuments({ isReplied: false });
  const newContacts = await Contact.countDocuments({ status: 'new' });
  const inProgressContacts = await Contact.countDocuments({ status: 'in-progress' });
  const wonContacts = await Contact.countDocuments({ status: 'won' });
  const lostContacts = await Contact.countDocuments({ status: 'lost' });

  // Get contacts by inquiry type
  const inquiryTypeStats = await Contact.aggregate([
    {
      $group: {
        _id: '$inquiryType',
        count: { $sum: 1 }
      }
    }
  ]);

  // Get contacts by source
  const sourceStats = await Contact.aggregate([
    {
      $group: {
        _id: '$source',
        count: { $sum: 1 }
      }
    }
  ]);

  // Get recent contacts (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentContacts = await Contact.countDocuments({
    createdAt: { $gte: sevenDaysAgo }
  });

  res.status(200).json({
    success: true,
    data: {
      total: totalContacts,
      unread: unreadContacts,
      unreplied: unrepliedContacts,
      new: newContacts,
      inProgress: inProgressContacts,
      won: wonContacts,
      lost: lostContacts,
      recent: recentContacts,
      byInquiryType: inquiryTypeStats,
      bySource: sourceStats
    }
  });
}));

// @desc    Export contacts
// @route   GET /api/v1/contact/export
// @access  Private/Admin
router.get('/export', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const format = req.query.format || 'json';
  
  let query = Contact.find();

  // Apply filters if provided
  if (req.query.status) {
    query = query.where('status', req.query.status);
  }
  if (req.query.startDate && req.query.endDate) {
    query = query.where('createdAt', {
      $gte: new Date(req.query.startDate),
      $lte: new Date(req.query.endDate)
    });
  }

  const contacts = await query.populate('assignedTo', 'name email');

  if (format === 'csv') {
    // Convert to CSV format
    const csvData = contacts.map(contact => ({
      Name: contact.name,
      Email: contact.email,
      Phone: contact.phone || '',
      Company: contact.company?.name || '',
      Subject: contact.subject,
      Message: contact.message,
      InquiryType: contact.inquiryType,
      Status: contact.status,
      Priority: contact.priority,
      CreatedAt: contact.createdAt,
      AssignedTo: contact.assignedTo?.name || ''
    }));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    
    // Convert to CSV string
    const csvString = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).map(value => `"${value}"`).join(','))
    ].join('\n');

    res.send(csvString);
  } else {
    res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts
    });
  }
}));

// @desc    Delete contact
// @route   DELETE /api/v1/contact/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const contact = await Contact.findById(req.params.id);

  if (!contact) {
    return res.status(404).json({
      success: false,
      error: 'Contact not found'
    });
  }

  await contact.remove();

  res.status(200).json({
    success: true,
    message: 'Contact deleted successfully'
  });
}));

module.exports = router; 