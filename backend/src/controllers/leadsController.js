/**
 * Leads Management Controller
 * 
 * Implements CRUD operations for Leads with:
 * 1. Role-based restrictions (Managers can CRUD, Agents can only view/update status & notes of their leads).
 * 2. Auto-assignment using Least-Loaded Agent Service.
 * 3. Third-party company enrichment using Microlink Service.
 * 4. Activity Logs auditing for changes.
 * 5. Real-time notifications via WebSockets.
 * 6. Listing with search, sorting, filtering, and pagination.
 */

const db = require('../db/db');
const assignmentService = require('../services/assignmentService');
const enrichmentService = require('../services/enrichmentService');

/**
 * Helper: Log an activity to the database
 */
async function logActivity(leadId, userId, actionType, description) {
  try {
    const sql = `
      INSERT INTO activity_logs (lead_id, user_id, action_type, description)
      VALUES ($1, $2, $3, $4)
    `;
    await db.query(sql, [leadId, userId, actionType, description]);
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

/**
 * 1. Create Lead
 * POST /api/leads
 */
async function createLead(req, res) {
  // Only Admin or Manager can create a lead
  // This is enforced by authorization middleware, but we check here as well to be safe
  if (req.user.role === 'Agent') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Agents cannot create leads.'
    });
  }

  const { name, email, phone, source, notes } = req.body;

  if (!name || !email || !phone || !source) {
    return res.status(400).json({
      success: false,
      message: 'Please provide name, email, phone, and source.'
    });
  }

  try {
    // A. Perform Third-Party Company Enrichment
    // We try to enrich the lead info based on email domain
    const companyEnrichment = await enrichmentService.enrichCompanyInfo(email);

    // B. Auto-Assign the lead using Least-Loaded Agent Strategy
    const assignedAgentId = await assignmentService.getLeastLoadedAgent();

    // C. Save Lead to database
    const sql = `
      INSERT INTO leads (name, email, phone, source, status, assigned_to, notes, company_name, company_logo, company_description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;
    const params = [
      name,
      email,
      phone,
      source,
      'New', // Default status
      assignedAgentId,
      notes || '',
      companyEnrichment.company_name,
      companyEnrichment.company_logo,
      companyEnrichment.company_description
    ];

    await db.run(sql, params);

    // D. Fetch the newly created lead details to return and broadcast
    const newLeads = await db.query(`
      SELECT l.*, u.name AS agent_name 
      FROM leads l 
      LEFT JOIN users u ON l.assigned_to = u.id 
      WHERE l.email = $1 AND l.name = $2 
      ORDER BY l.created_at DESC LIMIT 1
    `, [email, name]);

    const lead = newLeads[0];

    // E. Log activities
    await logActivity(lead.id, req.user.id, 'Lead Created', `Lead was created by ${req.user.name}.`);
    
    if (assignedAgentId) {
      await logActivity(
        lead.id, 
        req.user.id, 
        'Lead Assigned', 
        `Lead was automatically assigned to agent ${lead.agent_name}.`
      );
    }

    // F. Real-time updates via WebSockets
    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({
        type: 'LEAD_CREATED',
        data: lead
      });
    }

    res.status(201).json({
      success: true,
      message: 'Lead created and assigned successfully.',
      lead
    });

  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating lead.'
    });
  }
}

/**
 * 2. List Leads (with pagination, filtering, searching, and sorting)
 * GET /api/leads
 */
async function listLeads(req, res) {
  try {
    // Read query parameters with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const search = req.query.search || '';
    const status = req.query.status || '';
    const source = req.query.source || '';
    const assigned_to = req.query.assigned_to || '';
    const sortBy = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Verify sort field to prevent SQL injection
    const allowedSortFields = ['id', 'name', 'email', 'phone', 'source', 'status', 'created_at'];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';

    // Build the query dynamically
    let queryStr = `
      SELECT l.*, u.name AS agent_name 
      FROM leads l 
      LEFT JOIN users u ON l.assigned_to = u.id 
      WHERE 1=1
    `;
    let countQueryStr = `
      SELECT COUNT(*) AS total 
      FROM leads l 
      WHERE 1=1
    `;

    const params = [];
    const countParams = [];

    // Enforce role-based access: Agents can ONLY see leads assigned to them!
    if (req.user.role === 'Agent') {
      const idx = params.length + 1;
      queryStr += ` AND l.assigned_to = $${idx}`;
      countQueryStr += ` AND l.assigned_to = $${idx}`;
      params.push(req.user.id);
      countParams.push(req.user.id);
    }

    // Apply Filter: Status
    if (status) {
      const idx = params.length + 1;
      queryStr += ` AND l.status = $${idx}`;
      countQueryStr += ` AND l.status = $${idx}`;
      params.push(status);
      countParams.push(status);
    }

    // Apply Filter: Source
    if (source) {
      const idx = params.length + 1;
      queryStr += ` AND l.source = $${idx}`;
      countQueryStr += ` AND l.source = $${idx}`;
      params.push(source);
      countParams.push(source);
    }

    // Apply Filter: Assigned To (for Admin/Managers only)
    if (assigned_to && req.user.role !== 'Agent') {
      const idx = params.length + 1;
      queryStr += ` AND l.assigned_to = $${idx}`;
      countQueryStr += ` AND l.assigned_to = $${idx}`;
      params.push(parseInt(assigned_to));
      countParams.push(parseInt(assigned_to));
    }

    // Apply Search (Search across name, email, phone, notes)
    if (search) {
      const idx = params.length + 1;
      const searchPattern = `%${search}%`;
      queryStr += ` AND (l.name LIKE $${idx} OR l.email LIKE $${idx} OR l.phone LIKE $${idx} OR l.notes LIKE $${idx})`;
      countQueryStr += ` AND (l.name LIKE $${idx} OR l.email LIKE $${idx} OR l.phone LIKE $${idx} OR l.notes LIKE $${idx})`;
      params.push(searchPattern);
      countParams.push(searchPattern);
    }

    // Get total count for pagination math
    const countResults = await db.query(countQueryStr, countParams);
    
    // In PostgreSQL count returns a string/bigint, in SQLite it's a number
    // We parse it to integer
    const totalLeads = parseInt(countResults[0].total || countResults[0].COUNT || 0);

    // Apply Sorting
    queryStr += ` ORDER BY l.${validSortBy} ${sortOrder}`;

    // Apply Pagination (LIMIT and OFFSET)
    // We add the values directly in parameters to avoid SQL injection
    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    queryStr += ` LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    params.push(limit, offset);

    // Execute main query
    const leads = await db.query(queryStr, params);

    res.status(200).json({
      success: true,
      page,
      limit,
      totalLeads,
      totalPages: Math.ceil(totalLeads / limit),
      leads
    });
  } catch (error) {
    console.error('Error listing leads:', error);
    res.status(500).json({
      success: false,
      message: 'Server error listing leads.'
    });
  }
}

/**
 * 3. Get Lead by ID (with activity logs timeline)
 * GET /api/leads/:id
 */
async function getLeadById(req, res) {
  const { id } = req.params;

  try {
    // Fetch lead details
    const leads = await db.query(`
      SELECT l.*, u.name AS agent_name, u.email AS agent_email
      FROM leads l
      LEFT JOIN users u ON l.assigned_to = u.id
      WHERE l.id = $1
    `, [id]);

    if (leads.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found.'
      });
    }

    const lead = leads[0];

    // Enforce role-based access: Agent can only view their own leads
    if (req.user.role === 'Agent' && lead.assigned_to !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You do not have permission to view this lead.'
      });
    }

    // Fetch activity logs for this lead
    const logs = await db.query(`
      SELECT al.*, u.name AS user_name, u.role AS user_role
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.lead_id = $1
      ORDER BY al.created_at DESC
    `, [id]);

    res.status(200).json({
      success: true,
      lead,
      activityLogs: logs
    });
  } catch (error) {
    console.error('Error fetching lead details:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving lead details.'
    });
  }
}

/**
 * 4. Update Lead
 * PUT /api/leads/:id
 */
async function updateLead(req, res) {
  const { id } = req.params;
  const { name, email, phone, source, status, assigned_to, notes } = req.body;

  try {
    // Check if lead exists
    const leads = await db.query('SELECT * FROM leads WHERE id = $1', [id]);
    if (leads.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found.'
      });
    }

    const lead = leads[0];

    // Enforce role-based access: Agent can only update status & notes of their assigned leads
    if (req.user.role === 'Agent') {
      if (lead.assigned_to !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You can only update leads assigned to you.'
        });
      }

      // Check if Agent tried to modify fields other than status and notes
      // To keep it simple, we check if they are changing. If name, email, phone, source, or assigned_to is supplied, 
      // they must match the current values in the DB.
      if (
        (name !== undefined && name !== lead.name) ||
        (email !== undefined && email !== lead.email) ||
        (phone !== undefined && phone !== lead.phone) ||
        (source !== undefined && source !== lead.source) ||
        (assigned_to !== undefined && parseInt(assigned_to) !== lead.assigned_to)
      ) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Agents are only authorized to update Lead Status and Notes.'
        });
      }
    }

    // Track what changed to write precise activity logs
    const activitiesToLog = [];

    // Collect current values
    let updatedName = name !== undefined ? name : lead.name;
    let updatedEmail = email !== undefined ? email : lead.email;
    let updatedPhone = phone !== undefined ? phone : lead.phone;
    let updatedSource = source !== undefined ? source : lead.source;
    let updatedStatus = status !== undefined ? status : lead.status;
    let updatedAssignedTo = assigned_to !== undefined ? (assigned_to === '' ? null : parseInt(assigned_to)) : lead.assigned_to;
    let updatedNotes = notes !== undefined ? notes : lead.notes;

    // Check Status Change
    if (status !== undefined && status !== lead.status) {
      activitiesToLog.push({
        type: 'Status Changed',
        desc: `Status updated from "${lead.status}" to "${status}" by ${req.user.name}.`
      });
    }

    // Check Assignment Change
    if (assigned_to !== undefined && parseInt(assigned_to) !== lead.assigned_to) {
      if (updatedAssignedTo === null) {
        activitiesToLog.push({
          type: 'Lead Assigned',
          desc: `Lead unassigned by ${req.user.name}.`
        });
      } else {
        const users = await db.query('SELECT name FROM users WHERE id = $1', [updatedAssignedTo]);
        const agentName = users[0] ? users[0].name : 'Unknown';
        activitiesToLog.push({
          type: 'Lead Assigned',
          desc: `Lead assigned to agent "${agentName}" by ${req.user.name}.`
        });
      }
    }

    // If changes occurred but no status/assignment change was caught, record generic update
    if (activitiesToLog.length === 0) {
      activitiesToLog.push({
        type: 'Lead Updated',
        desc: `Lead details updated by ${req.user.name}.`
      });
    }

    // Check if email domain changed, trigger re-enrichment (optional details)
    let companyName = lead.company_name;
    let companyLogo = lead.company_logo;
    let companyDescription = lead.company_description;

    if (email !== undefined && email !== lead.email) {
      const enrichment = await enrichmentService.enrichCompanyInfo(email);
      companyName = enrichment.company_name;
      companyLogo = enrichment.company_logo;
      companyDescription = enrichment.company_description;
    }

    // Execute UPDATE query
    const sql = `
      UPDATE leads 
      SET name = $1, email = $2, phone = $3, source = $4, status = $5, assigned_to = $6, notes = $7,
          company_name = $8, company_logo = $9, company_description = $10
      WHERE id = $11
    `;
    await db.query(sql, [
      updatedName,
      updatedEmail,
      updatedPhone,
      updatedSource,
      updatedStatus,
      updatedAssignedTo,
      updatedNotes,
      companyName,
      companyLogo,
      companyDescription,
      id
    ]);

    // Save all log activities
    for (const act of activitiesToLog) {
      await logActivity(id, req.user.id, act.type, act.desc);
    }

    // Fetch updated lead details
    const updatedLeads = await db.query(`
      SELECT l.*, u.name AS agent_name 
      FROM leads l 
      LEFT JOIN users u ON l.assigned_to = u.id 
      WHERE l.id = $1
    `, [id]);
    
    const updatedLead = updatedLeads[0];

    // Real-time broadcast update
    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({
        type: 'LEAD_UPDATED',
        data: updatedLead
      });
    }

    res.status(200).json({
      success: true,
      message: 'Lead updated successfully.',
      lead: updatedLead
    });

  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating lead.'
    });
  }
}

/**
 * 5. Delete Lead
 * DELETE /api/leads/:id
 */
async function deleteLead(req, res) {
  const { id } = req.params;

  // Only Admin or Manager can delete a lead
  if (req.user.role === 'Agent') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Agents cannot delete leads.'
    });
  }

  try {
    const leads = await db.query('SELECT name FROM leads WHERE id = $1', [id]);
    if (leads.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found.'
      });
    }

    // Delete lead (cascades automatically delete activity logs in SQLite and Postgres)
    await db.query('DELETE FROM leads WHERE id = $1', [id]);

    // Real-time broadcast deletion
    if (req.app.locals.broadcast) {
      req.app.locals.broadcast({
        type: 'LEAD_DELETED',
        id: parseInt(id)
      });
    }

    res.status(200).json({
      success: true,
      message: `Lead "${leads[0].name}" deleted successfully.`
    });

  } catch (error) {
    console.error('Error deleting lead:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting lead.'
    });
  }
}

/**
 * 6. Get Activity Logs for Dashboard (recent activities list)
 * GET /api/activity-logs
 */
async function listActivityLogs(req, res) {
  try {
    let sql = `
      SELECT al.*, u.name AS user_name, u.role AS user_role, l.name AS lead_name
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN leads l ON al.lead_id = l.id
    `;
    const params = [];

    // Enforce role-based access: Agents can ONLY see activity logs for leads assigned to them!
    if (req.user.role === 'Agent') {
      sql += ` WHERE l.assigned_to = $1`;
      params.push(req.user.id);
    }

    sql += ` ORDER BY al.created_at DESC LIMIT 20`;

    const logs = await db.query(sql, params);

    res.status(200).json({
      success: true,
      activityLogs: logs
    });
  } catch (error) {
    console.error('Error listing activity logs:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving activity logs.'
    });
  }
}

/**
 * 7. Get Dashboard Stats
 * GET /api/dashboard/stats
 */
async function getDashboardStats(req, res) {
  try {
    let leadCountSql = `SELECT COUNT(*) AS total FROM leads`;
    let statusBreakdownSql = `SELECT status, COUNT(*) AS count FROM leads GROUP BY status`;
    let sourceBreakdownSql = `SELECT source, COUNT(*) AS count FROM leads GROUP BY source`;
    const params = [];

    // If role is Agent, only show stats for their assigned leads
    if (req.user.role === 'Agent') {
      leadCountSql += ` WHERE assigned_to = $1`;
      statusBreakdownSql = `SELECT status, COUNT(*) AS count FROM leads WHERE assigned_to = $1 GROUP BY status`;
      sourceBreakdownSql = `SELECT source, COUNT(*) AS count FROM leads WHERE assigned_to = $1 GROUP BY source`;
      params.push(req.user.id);
    }

    const leadCountResult = await db.query(leadCountSql, params);
    const totalLeads = parseInt(leadCountResult[0].total || leadCountResult[0].COUNT || 0);

    const statusBreakdown = await db.query(statusBreakdownSql, params);
    const sourceBreakdown = await db.query(sourceBreakdownSql, params);

    // Get agent performance (number of leads per agent) - Only for Managers/Admins
    let agentStats = [];
    if (req.user.role !== 'Agent') {
      agentStats = await db.query(`
        SELECT u.id, u.name, COUNT(l.id) AS count
        FROM users u
        LEFT JOIN leads l ON u.id = l.assigned_to
        WHERE u.role = 'Agent'
        GROUP BY u.id, u.name
        ORDER BY count DESC
      `);
    }

    res.status(200).json({
      success: true,
      stats: {
        totalLeads,
        statusBreakdown,
        sourceBreakdown,
        agentStats
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving dashboard stats.'
    });
  }
}

module.exports = {
  createLead,
  listLeads,
  getLeadById,
  updateLead,
  deleteLead,
  listActivityLogs,
  getDashboardStats
};
