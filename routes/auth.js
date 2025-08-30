const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('express-async-handler');

// Import models and utilities
const User = require('../models/User');
const { protect, authorize, authRateLimit } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const logger = require('../utils/logger');

// Rate limiting for auth routes
const authLimiter = rateLimit(authRateLimit);

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
router.post('/register', authLimiter, [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('phone')
    .optional()
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Please provide a valid phone number')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { name, email, password, phone, company } = req.body;

  // Check if user already exists
  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: 'User with this email already exists'
    });
  }

  // Create user
  const user = await User.create({
    name,
    email,
    password,
    phone,
    company
  });

  // Generate verification token
  const verificationToken = user.getEmailVerificationToken();
  await user.save();

  // Send verification email
  try {
    const verificationUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/verify-email/${verificationToken}`;
    
    await sendEmail({
      email: user.email,
      subject: 'Email Verification - MayDiv',
      template: 'emailVerification',
      data: {
        name: user.name,
        verificationUrl
      }
    });

    logger.info(`Verification email sent to ${user.email}`);
  } catch (error) {
    logger.error('Failed to send verification email:', error);
  }

  // Generate token
  const token = user.getSignedJwtToken();

  // Set cookie
  const options = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  };

  res.status(201).cookie('token', token, options).json({
    success: true,
    message: 'User registered successfully. Please check your email for verification.',
    token,
    user: user.getPublicProfile()
  });
}));

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
router.post('/login', authLimiter, [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  // Check if user exists
  const user = await User.findByEmail(email).select('+password');
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  // Check if user is locked
  if (user.isLocked) {
    return res.status(401).json({
      success: false,
      error: 'Account is temporarily locked due to multiple failed login attempts'
    });
  }

  // Check if password matches
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    // Increment login attempts
    await user.incLoginAttempts();
    
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }

  // Reset login attempts on successful login
  await user.resetLoginAttempts();

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate token
  const token = user.getSignedJwtToken();

  // Set cookie
  const options = {
    expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  };

  res.status(200).cookie('token', token, options).json({
    success: true,
    message: 'Login successful',
    token,
    user: user.getPublicProfile()
  });
}));

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
router.post('/logout', protect, asyncHandler(async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
}));

// @desc    Get current user
// @route   GET /api/v1/auth/me
// @access  Private
router.get('/me', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  res.status(200).json({
    success: true,
    user: user.getPublicProfile()
  });
}));

// @desc    Update user profile
// @route   PUT /api/v1/auth/update-profile
// @access  Private
router.put('/update-profile', protect, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .matches(/^[\+]?[1-9][\d]{0,15}$/)
    .withMessage('Please provide a valid phone number')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const fieldsToUpdate = {
    name: req.body.name,
    phone: req.body.phone,
    company: req.body.company,
    address: req.body.address,
    socialMedia: req.body.socialMedia,
    preferences: req.body.preferences
  };

  // Remove undefined fields
  Object.keys(fieldsToUpdate).forEach(key => 
    fieldsToUpdate[key] === undefined && delete fieldsToUpdate[key]
  );

  const user = await User.findByIdAndUpdate(
    req.user.id,
    fieldsToUpdate,
    {
      new: true,
      runValidators: true
    }
  );

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    user: user.getPublicProfile()
  });
}));

// @desc    Change password
// @route   PUT /api/v1/auth/change-password
// @access  Private
router.put('/change-password', protect, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');

  // Check current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      error: 'Current password is incorrect'
    });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password changed successfully'
  });
}));

// @desc    Forgot password
// @route   POST /api/v1/auth/forgot-password
// @access  Public
router.post('/forgot-password', authLimiter, [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const user = await User.findByEmail(req.body.email);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'No user found with that email'
    });
  }

  // Generate reset token
  const resetToken = user.getResetPasswordToken();
  await user.save();

  // Create reset url
  const resetUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/reset-password/${resetToken}`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Password Reset - MayDiv',
      template: 'passwordReset',
      data: {
        name: user.name,
        resetUrl
      }
    });

    res.status(200).json({
      success: true,
      message: 'Password reset email sent'
    });
  } catch (error) {
    logger.error('Failed to send password reset email:', error);
    
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return res.status(500).json({
      success: false,
      error: 'Email could not be sent'
    });
  }
}));

// @desc    Reset password
// @route   PUT /api/v1/auth/reset-password/:resetToken
// @access  Public
router.put('/reset-password/:resetToken', [
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resetToken)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or expired reset token'
    });
  }

  // Set new password
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  // Generate token
  const token = user.getSignedJwtToken();

  res.status(200).json({
    success: true,
    message: 'Password reset successful',
    token
  });
}));

// @desc    Verify email
// @route   GET /api/v1/auth/verify-email/:token
// @access  Public
router.get('/verify-email/:token', asyncHandler(async (req, res) => {
  // Get hashed token
  const emailVerificationToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    emailVerificationToken,
    emailVerificationExpire: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      error: 'Invalid or expired verification token'
    });
  }

  // Mark email as verified
  user.isVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpire = undefined;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Email verified successfully'
  });
}));

// @desc    Resend verification email
// @route   POST /api/v1/auth/resend-verification
// @access  Private
router.post('/resend-verification', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (user.isVerified) {
    return res.status(400).json({
      success: false,
      error: 'Email is already verified'
    });
  }

  // Generate new verification token
  const verificationToken = user.getEmailVerificationToken();
  await user.save();

  try {
    const verificationUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/verify-email/${verificationToken}`;
    
    await sendEmail({
      email: user.email,
      subject: 'Email Verification - MayDiv',
      template: 'emailVerification',
      data: {
        name: user.name,
        verificationUrl
      }
    });

    res.status(200).json({
      success: true,
      message: 'Verification email sent'
    });
  } catch (error) {
    logger.error('Failed to send verification email:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Email could not be sent'
    });
  }
}));

// @desc    Delete account
// @route   DELETE /api/v1/auth/delete-account
// @access  Private
router.delete('/delete-account', protect, [
  body('password')
    .notEmpty()
    .withMessage('Password is required for account deletion')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const user = await User.findById(req.user.id).select('+password');

  // Verify password
  const isMatch = await user.comparePassword(req.body.password);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      error: 'Password is incorrect'
    });
  }

  // Delete user
  await user.remove();

  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully'
  });
}));

module.exports = router; 