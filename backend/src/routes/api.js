/**
 * API Router Config
 * 
 * Maps request endpoints (URLs) to their respective controller functions.
 * Protects routes using the auth middleware (protect) and enforces roles (authorize) where needed.
 * 
 * Simple and clean route mappings.
 */

const express = require('express');
const router = express.Router();

// Import controllers
const authController = require('../controllers/authController');
const leadsController = require('../controllers/leadsController');

// Import authentication middleware
const { protect, authorize } = require('../middleware/auth');

// ==========================================
// Authentication Routes
// ==========================================
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', protect, authController.getMe);
router.get('/auth/agents', protect, authController.getAgents); // Get list of agents

// ==========================================
// Leads Management Routes
// ==========================================
// List all leads (filtered by role internally) & Create lead (Manager/Admin only)
router.route('/leads')
  .get(protect, leadsController.listLeads)
  .post(protect, authorize('Admin', 'Manager'), leadsController.createLead);

// CRUD by ID (role filters applied inside controller)
router.route('/leads/:id')
  .get(protect, leadsController.getLeadById)
  .put(protect, leadsController.updateLead)
  .delete(protect, authorize('Admin', 'Manager'), leadsController.deleteLead);

// ==========================================
// Monitoring & Observability Routes
// ==========================================
router.get('/activity-logs', protect, leadsController.listActivityLogs);
router.get('/dashboard/stats', protect, leadsController.getDashboardStats);

module.exports = router;
