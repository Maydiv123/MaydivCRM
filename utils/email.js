const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Load email template
const loadTemplate = async (templateName) => {
  try {
    const templatePath = path.join(__dirname, '..', 'templates', 'emails', `${templateName}.hbs`);
    const templateContent = await fs.readFile(templatePath, 'utf8');
    return handlebars.compile(templateContent);
  } catch (error) {
    logger.error(`Failed to load email template: ${templateName}`, error);
    throw new Error(`Email template not found: ${templateName}`);
  }
};

// Send email function
const sendEmail = async ({ email, subject, template, data, attachments = [] }) => {
  try {
    const transporter = createTransporter();
    
    // Load and compile template
    const compiledTemplate = await loadTemplate(template);
    const html = compiledTemplate(data);
    
    // Email options
    const mailOptions = {
      from: `"MayDiv" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: subject,
      html: html,
      attachments
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    logger.info(`Email sent successfully to ${email}`, {
      messageId: info.messageId,
      template,
      subject
    });

    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error) {
    logger.error(`Failed to send email to ${email}`, error);
    throw error;
  }
};

// Send bulk emails
const sendBulkEmail = async (emails, subject, template, data, attachments = []) => {
  const results = [];
  
  for (const email of emails) {
    try {
      const result = await sendEmail({
        email,
        subject,
        template,
        data,
        attachments
      });
      results.push({ email, success: true, ...result });
    } catch (error) {
      results.push({ email, success: false, error: error.message });
    }
  }
  
  return results;
};

// Send welcome email
const sendWelcomeEmail = async (user) => {
  return sendEmail({
    email: user.email,
    subject: 'Welcome to MayDiv! 🎉',
    template: 'welcome',
    data: {
      name: user.name,
      loginUrl: `${process.env.FRONTEND_URL}/login`,
      supportEmail: process.env.SUPPORT_EMAIL || 'support@maydiv.com'
    }
  });
};

// Send email verification
const sendEmailVerification = async (user, verificationUrl) => {
  return sendEmail({
    email: user.email,
    subject: 'Verify Your Email - MayDiv',
    template: 'emailVerification',
    data: {
      name: user.name,
      verificationUrl,
      supportEmail: process.env.SUPPORT_EMAIL || 'support@maydiv.com'
    }
  });
};

// Send password reset
const sendPasswordReset = async (user, resetUrl) => {
  return sendEmail({
    email: user.email,
    subject: 'Reset Your Password - MayDiv',
    template: 'passwordReset',
    data: {
      name: user.name,
      resetUrl,
      expiryTime: '10 minutes',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@maydiv.com'
    }
  });
};

// Send contact form auto-reply
const sendContactAutoReply = async (contact) => {
  return sendEmail({
    email: contact.email,
    subject: 'Thank you for contacting MayDiv',
    template: 'contactAutoReply',
    data: {
      name: contact.name,
      subject: contact.subject,
      inquiryType: contact.inquiryType,
      responseTime: '24 hours',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@maydiv.com'
    }
  });
};

// Send contact notification to admin
const sendContactNotification = async (contact, adminUrl) => {
  return sendEmail({
    email: process.env.ADMIN_EMAIL || 'admin@maydiv.com',
    subject: `New Contact Form Submission: ${contact.subject}`,
    template: 'contactNotification',
    data: {
      contact: contact.toObject(),
      adminUrl,
      priority: contact.priority,
      inquiryType: contact.inquiryType
    }
  });
};

// Send project update notification
const sendProjectUpdate = async (user, project, updateType) => {
  return sendEmail({
    email: user.email,
    subject: `Project Update: ${project.title}`,
    template: 'projectUpdate',
    data: {
      name: user.name,
      projectTitle: project.title,
      updateType,
      projectUrl: `${process.env.FRONTEND_URL}/projects/${project.slug}`,
      adminUrl: `${process.env.FRONTEND_URL}/admin/projects/${project._id}`
    }
  });
};

// Send invoice
const sendInvoice = async (user, invoice) => {
  return sendEmail({
    email: user.email,
    subject: `Invoice #${invoice.number} - MayDiv`,
    template: 'invoice',
    data: {
      name: user.name,
      invoice: invoice.toObject(),
      paymentUrl: `${process.env.FRONTEND_URL}/payments/${invoice._id}`,
      supportEmail: process.env.SUPPORT_EMAIL || 'support@maydiv.com'
    },
    attachments: [
      {
        filename: `invoice-${invoice.number}.pdf`,
        path: invoice.pdfPath
      }
    ]
  });
};

// Send newsletter
const sendNewsletter = async (subscribers, newsletter) => {
  return sendBulkEmail(
    subscribers,
    newsletter.subject,
    'newsletter',
    {
      newsletter: newsletter.toObject(),
      unsubscribeUrl: `${process.env.FRONTEND_URL}/unsubscribe`,
      supportEmail: process.env.SUPPORT_EMAIL || 'support@maydiv.com'
    }
  );
};

// Send system notification
const sendSystemNotification = async (user, notification) => {
  return sendEmail({
    email: user.email,
    subject: notification.subject,
    template: 'systemNotification',
    data: {
      name: user.name,
      notification: notification.toObject(),
      settingsUrl: `${process.env.FRONTEND_URL}/settings/notifications`
    }
  });
};

// Send quote
const sendQuote = async (contact, quote) => {
  return sendEmail({
    email: contact.email,
    subject: `Quote for ${quote.projectTitle} - MayDiv`,
    template: 'quote',
    data: {
      name: contact.name,
      quote: quote.toObject(),
      acceptUrl: `${process.env.FRONTEND_URL}/quotes/${quote._id}/accept`,
      rejectUrl: `${process.env.FRONTEND_URL}/quotes/${quote._id}/reject`,
      supportEmail: process.env.SUPPORT_EMAIL || 'support@maydiv.com'
    },
    attachments: [
      {
        filename: `quote-${quote.number}.pdf`,
        path: quote.pdfPath
      }
    ]
  });
};

// Send meeting invitation
const sendMeetingInvitation = async (user, meeting) => {
  return sendEmail({
    email: user.email,
    subject: `Meeting Invitation: ${meeting.title}`,
    template: 'meetingInvitation',
    data: {
      name: user.name,
      meeting: meeting.toObject(),
      acceptUrl: `${process.env.FRONTEND_URL}/meetings/${meeting._id}/accept`,
      declineUrl: `${process.env.FRONTEND_URL}/meetings/${meeting._id}/decline`,
      calendarUrl: meeting.calendarUrl
    }
  });
};

// Send feedback request
const sendFeedbackRequest = async (user, project) => {
  return sendEmail({
    email: user.email,
    subject: `We'd love your feedback on ${project.title}`,
    template: 'feedbackRequest',
    data: {
      name: user.name,
      projectTitle: project.title,
      feedbackUrl: `${process.env.FRONTEND_URL}/feedback/${project._id}`,
      supportEmail: process.env.SUPPORT_EMAIL || 'support@maydiv.com'
    }
  });
};

// Send account deletion confirmation
const sendAccountDeletionConfirmation = async (user) => {
  return sendEmail({
    email: user.email,
    subject: 'Account Deletion Confirmation - MayDiv',
    template: 'accountDeletion',
    data: {
      name: user.name,
      supportEmail: process.env.SUPPORT_EMAIL || 'support@maydiv.com'
    }
  });
};

// Send security alert
const sendSecurityAlert = async (user, alert) => {
  return sendEmail({
    email: user.email,
    subject: 'Security Alert - MayDiv',
    template: 'securityAlert',
    data: {
      name: user.name,
      alert: alert.toObject(),
      accountUrl: `${process.env.FRONTEND_URL}/account/security`,
      supportEmail: process.env.SUPPORT_EMAIL || 'support@maydiv.com'
    }
  });
};

// Test email configuration
const testEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    
    logger.info('Email configuration is valid');
    return { success: true, message: 'Email configuration is valid' };
  } catch (error) {
    logger.error('Email configuration test failed', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendEmail,
  sendBulkEmail,
  sendWelcomeEmail,
  sendEmailVerification,
  sendPasswordReset,
  sendContactAutoReply,
  sendContactNotification,
  sendProjectUpdate,
  sendInvoice,
  sendNewsletter,
  sendSystemNotification,
  sendQuote,
  sendMeetingInvitation,
  sendFeedbackRequest,
  sendAccountDeletionConfirmation,
  sendSecurityAlert,
  testEmailConfig
}; 