/**
 * Frontend Client-Side Application Logic (app.js)
 * 
 * Handles SPA navigation, local state, authentication, API communication,
 * form validations, dynamic DOM rendering, and real-time WebSockets integration.
 * 
 * Written in standard clean vanilla JavaScript with extensive beginner comments.
 */

// ==========================================
// 1. App Configuration & State
// ==========================================
// Automatically detect if we are running the app locally as a file or via the Express server
const isFileProtocol = window.location.protocol === 'file:';
const API_BASE = isFileProtocol ? 'http://localhost:5000/api' : `${window.location.origin}/api`;
const WS_BASE = isFileProtocol ? 'ws://localhost:5000' : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

// Local State
let state = {
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user')) || null,
  currentView: 'dashboard',
  leads: [],
  agents: [],
  pagination: {
    page: 1,
    limit: 10,
    totalPages: 1,
    totalLeads: 0
  },
  filters: {
    search: '',
    status: '',
    source: '',
    assigned_to: ''
  },
  sorting: {
    sortBy: 'created_at',
    sortOrder: 'desc'
  }
};

let ws = null; // WebSocket connection reference
let searchDebounceTimer = null; // Timer for search debouncing

// ==========================================
// 2. App Startup / Authentication Check
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

/**
 * Checks if a token is saved. If so, fetches the latest user profile
 * to verify the token is still active and valid.
 */
async function checkAuth() {
  if (state.token) {
    try {
      const response = await fetchWithAuth('/auth/me');
      if (response.success) {
        state.user = response.user;
        localStorage.setItem('user', JSON.stringify(response.user));
        
        setupUIForAuthenticatedUser();
        switchView('dashboard');
        connectWebSocket();
      } else {
        // Token is invalid/expired
        logout();
      }
    } catch (err) {
      console.error('Auth check failed, likely network issue or server offline.', err);
      // If server is offline, fallback to login state
      setupUIForGuest();
    }
  } else {
    setupUIForGuest();
  }
}

function setupUIForAuthenticatedUser() {
  document.getElementById('screen-auth').classList.remove('active');
  document.getElementById('main-header').style.display = 'block';
  
  // Show/Hide Role-based elements
  const isAgent = state.user.role === 'Agent';
  
  // Agents cannot create leads
  const managerActions = document.getElementById('manager-actions');
  const leadsActions = document.getElementById('leads-view-actions');
  if (isAgent) {
    if (managerActions) managerActions.style.display = 'none';
    if (leadsActions) leadsActions.style.display = 'none';
    document.getElementById('filter-agent').style.display = 'none';
    document.getElementById('form-agent-group').style.display = 'none';
  } else {
    if (managerActions) managerActions.style.display = 'block';
    if (leadsActions) leadsActions.style.display = 'block';
    document.getElementById('filter-agent').style.display = 'inline-block';
    document.getElementById('form-agent-group').style.display = 'block';
    fetchAgentsList(); // Pre-load agents for assignment dropdowns
  }

  // Update navbar user profile details
  document.getElementById('user-name-display').innerText = state.user.name;
  document.getElementById('user-role-display').innerText = state.user.role;
  document.getElementById('user-avatar').innerText = state.user.name.charAt(0).toUpperCase();
}

function setupUIForGuest() {
  document.getElementById('main-header').style.display = 'none';
  // Hide all screens and show auth screen
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-auth').classList.add('active');
  
  if (ws) {
    ws.close();
    ws = null;
  }
}

// ==========================================
// 3. User Authentication Handlers
// ==========================================
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.success) {
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      showAlert('success', 'Logged in successfully!');
      setupUIForAuthenticatedUser();
      switchView('dashboard');
      connectWebSocket();
      
      // Clear login form
      document.getElementById('login-form').reset();
    } else {
      showAlert('danger', data.message || 'Login failed.');
    }
  } catch (err) {
    showAlert('danger', 'Connection error. Is the server running?');
    console.error('Login error:', err);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });

    const data = await res.json();

    if (data.success) {
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      showAlert('success', 'Account registered successfully!');
      setupUIForAuthenticatedUser();
      switchView('dashboard');
      connectWebSocket();
      
      // Clear register form
      document.getElementById('register-form').reset();
    } else {
      showAlert('danger', data.message || 'Registration failed.');
    }
  } catch (err) {
    showAlert('danger', 'Connection error during registration.');
    console.error('Register error:', err);
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  
  showAlert('success', 'Logged out successfully.');
  setupUIForGuest();
}

function toggleAuthForms(showRegister) {
  if (showRegister) {
    document.getElementById('login-card').style.display = 'none';
    document.getElementById('register-card').style.display = 'block';
  } else {
    document.getElementById('login-card').style.display = 'block';
    document.getElementById('register-card').style.display = 'none';
  }
}

// ==========================================
// 4. View Switching (SPA Router Simulation)
// ==========================================
function switchView(viewName) {
  if (!state.token) return;
  
  state.currentView = viewName;
  
  // Toggle Nav classes
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const activeNavItem = document.getElementById(`nav-${viewName}`);
  if (activeNavItem) activeNavItem.classList.add('active');
  
  // Toggle Screen display
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
  const activeScreen = document.getElementById(`screen-${viewName}`);
  if (activeScreen) activeScreen.classList.add('active');

  // Trigger data fetching based on view
  if (viewName === 'dashboard') {
    fetchDashboardStats();
    fetchActivityLogs();
  } else if (viewName === 'leads') {
    state.pagination.page = 1;
    fetchLeadsList();
  }
}

// ==========================================
// 5. Dashboard Data Fetching & Rendering
// ==========================================
async function fetchDashboardStats() {
  try {
    const res = await fetchWithAuth('/dashboard/stats');
    if (res.success) {
      const stats = res.stats;
      
      // 1. Render Count Values
      document.getElementById('stat-total').innerText = stats.totalLeads;
      
      // Map counters based on statuses
      let newCount = 0;
      let inProgressCount = 0;
      let closedCount = 0;
      
      stats.statusBreakdown.forEach(item => {
        if (item.status === 'New') newCount = item.count;
        if (item.status === 'In Progress') inProgressCount = item.count;
        if (item.status === 'Closed Won') closedCount = item.count;
      });
      
      document.getElementById('stat-new').innerText = newCount;
      document.getElementById('stat-inprogress').innerText = inProgressCount;
      document.getElementById('stat-closed').innerText = closedCount;

      // 2. Render Lead Performance status bars (Custom SVG-like visual styling)
      const barsContainer = document.getElementById('stat-bars');
      barsContainer.innerHTML = '';
      
      if (stats.totalLeads === 0) {
        barsContainer.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 1rem 0;">No leads available to analyze.</div>';
        return;
      }
      
      const statuses = ['New', 'Contacted', 'In Progress', 'Closed Won', 'Lost'];
      const statusCounts = { 'New': 0, 'Contacted': 0, 'In Progress': 0, 'Closed Won': 0, 'Lost': 0 };
      
      stats.statusBreakdown.forEach(item => {
        statusCounts[item.status] = item.count;
      });
      
      statuses.forEach(status => {
        const count = statusCounts[status];
        const percentage = stats.totalLeads > 0 ? Math.round((count / stats.totalLeads) * 100) : 0;
        
        let colorClass = 'new';
        if (status === 'Contacted') colorClass = 'contacted';
        if (status === 'In Progress') colorClass = 'inprogress';
        if (status === 'Closed Won') colorClass = 'closed';
        if (status === 'Lost') colorClass = 'lost';
        
        barsContainer.innerHTML += `
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
              <span>${status}</span>
              <span style="font-weight: 600;">${count} (${percentage}%)</span>
            </div>
            <div style="width: 100%; height: 8px; background-color: var(--bg-input); border-radius: 4px; overflow: hidden;">
              <div style="width: ${percentage}%; height: 100%; background-color: var(--status-${colorClass}-text); border-radius: 4px; transition: width 0.5s ease-in-out;"></div>
            </div>
          </div>
        `;
      });
    }
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
  }
}

async function fetchActivityLogs() {
  try {
    const res = await fetchWithAuth('/activity-logs');
    if (res.success) {
      const feed = document.getElementById('dashboard-activity-feed');
      feed.innerHTML = '';
      
      if (res.activityLogs.length === 0) {
        feed.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 2rem 0;">No activities logged yet.</div>';
        return;
      }
      
      res.activityLogs.forEach(log => {
        const time = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = new Date(log.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
        
        feed.innerHTML += `
          <div class="recent-log-card">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.15rem;">
              <span style="font-weight: 600; color: #a5b4fc;">${log.action_type}</span>
              <span class="recent-log-time">${date} @ ${time}</span>
            </div>
            <p style="color: var(--text-primary); line-height: 1.3;">${log.description}</p>
            ${log.lead_name ? `<p style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 0.15rem;"><i class="fa-solid fa-user-tag"></i> Lead: ${log.lead_name}</p>` : ''}
          </div>
        `;
      });
    }
  } catch (err) {
    console.error('Error fetching activity logs:', err);
  }
}

// ==========================================
// 6. Leads Repositories Fetching & Rendering
// ==========================================
async function fetchLeadsList() {
  const tableBody = document.getElementById('leads-table-body');
  
  try {
    // 1. Construct query params URL
    const { page, limit } = state.pagination;
    const { search, status, source, assigned_to } = state.filters;
    const { sortBy, sortOrder } = state.sorting;
    
    let queryParams = `?page=${page}&limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}`;
    
    if (search) queryParams += `&search=${encodeURIComponent(search)}`;
    if (status) queryParams += `&status=${status}`;
    if (source) queryParams += `&source=${source}`;
    if (assigned_to) queryParams += `&assigned_to=${assigned_to}`;
    
    const res = await fetchWithAuth(`/leads${queryParams}`);
    
    if (res.success) {
      state.leads = res.leads;
      state.pagination.totalPages = res.totalPages;
      state.pagination.totalLeads = res.totalLeads;
      
      // 2. Render pagination details
      const start = res.totalLeads === 0 ? 0 : (page - 1) * limit + 1;
      const end = Math.min(page * limit, res.totalLeads);
      document.getElementById('pagination-text').innerText = `Showing ${start} - ${end} of ${res.totalLeads} Leads`;
      
      document.getElementById('prev-page-btn').disabled = page === 1;
      document.getElementById('next-page-btn').disabled = page >= res.totalPages;
      
      // 3. Render table body rows
      tableBody.innerHTML = '';
      
      if (res.leads.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem 0;">
              <i class="fa-solid fa-circle-info" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i><br>No matching leads found in system.
            </td>
          </tr>
        `;
        return;
      }
      
      res.leads.forEach(lead => {
        const dateStr = new Date(lead.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
        const badgeClass = getStatusBadgeClass(lead.status);
        const agentDisplay = lead.agent_name ? lead.agent_name : '<span style="color: var(--text-muted); font-style: italic;">Unassigned</span>';
        
        tableBody.innerHTML += `
          <tr>
            <td style="font-weight: 600; cursor: pointer; color: var(--accent-color);" onclick="openLeadDetails(${lead.id})">
              ${lead.name}
            </td>
            <td>${lead.email}</td>
            <td>${lead.phone}</td>
            <td>${lead.source}</td>
            <td><span class="badge ${badgeClass}">${lead.status}</span></td>
            <td>${agentDisplay}</td>
            <td>${dateStr}</td>
            <td style="text-align: right;">
              <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                <button class="btn btn-secondary btn-sm" onclick="openLeadDetails(${lead.id})" title="View Details">
                  <i class="fa-solid fa-eye"></i>
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openEditLeadModal(${lead.id})" title="Edit Details">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
                ${state.user.role !== 'Agent' ? `
                  <button class="btn btn-danger btn-sm" onclick="deleteLead(${lead.id})" title="Delete Lead">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      });
    }
  } catch (err) {
    console.error('Error fetching leads:', err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--status-lost-text); padding: 3rem 0;">
          <i class="fa-solid fa-circle-exclamation" style="font-size: 1.5rem; margin-bottom: 0.5rem;"></i><br>Error loading leads. Is the server running?
        </td>
      </tr>
    `;
  }
}

// Helpers for filters
function triggerSearch() {
  // Clear any existing search timers
  clearTimeout(searchDebounceTimer);
  
  // Set debounce delay to 400ms to avoid flooding backend API requests
  searchDebounceTimer = setTimeout(() => {
    state.filters.search = document.getElementById('filter-search').value;
    state.pagination.page = 1; // Reset to page 1 on search
    fetchLeadsList();
  }, 400);
}

function clearFilters() {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-source').value = '';
  const filterAgent = document.getElementById('filter-agent');
  if (filterAgent) filterAgent.value = '';
  
  state.filters = { search: '', status: '', source: '', assigned_to: '' };
  state.pagination.page = 1;
  fetchLeadsList();
}

function changePage(direction) {
  state.pagination.page += direction;
  fetchLeadsList();
}

function toggleSort(field) {
  if (state.sorting.sortBy === field) {
    // Reverse sort direction
    state.sorting.sortOrder = state.sorting.sortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    state.sorting.sortBy = field;
    state.sorting.sortOrder = 'desc'; // Default to desc on new fields
  }
  fetchLeadsList();
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'New': return 'badge-new';
    case 'Contacted': return 'badge-contacted';
    case 'In Progress': return 'badge-inprogress';
    case 'Closed Won': return 'badge-closed';
    case 'Lost': return 'badge-lost';
    default: return 'badge-new';
  }
}

// ==========================================
// 7. Modals: Create/Edit Leads Form Handling
// ==========================================
function openCreateLeadModal() {
  // Setup modal attributes
  document.getElementById('lead-modal-title').innerText = 'Create New Lead';
  document.getElementById('lead-details-form').reset();
  document.getElementById('form-lead-id').value = '';
  
  // Hide status field for creation (always defaults to 'New')
  document.getElementById('form-status-group').style.display = 'none';

  // Populate agents select dropdown list
  populateAgentsDropdown('form-assignee');

  // Open modal UI overlay
  document.getElementById('lead-form-modal').classList.add('active');
}

async function openEditLeadModal(leadId) {
  try {
    const res = await fetchWithAuth(`/leads/${leadId}`);
    if (res.success) {
      const lead = res.lead;
      
      // Setup modal attributes
      document.getElementById('lead-modal-title').innerText = `Edit Lead: ${lead.name}`;
      document.getElementById('form-lead-id').value = lead.id;
      
      // Populate standard fields
      document.getElementById('form-name').value = lead.name;
      document.getElementById('form-email').value = lead.email;
      document.getElementById('form-phone').value = lead.phone;
      document.getElementById('form-source').value = lead.source;
      document.getElementById('form-notes').value = lead.notes || '';
      
      // Populate and Show status selector
      document.getElementById('form-status').value = lead.status;
      document.getElementById('form-status-group').style.display = 'block';

      // Role Check: Agents can't modify core fields, only status and notes
      const isAgent = state.user.role === 'Agent';
      document.getElementById('form-name').disabled = isAgent;
      document.getElementById('form-email').disabled = isAgent;
      document.getElementById('form-phone').disabled = isAgent;
      document.getElementById('form-source').disabled = isAgent;
      
      // Populate assignee agent field (Managers only)
      const agentGroup = document.getElementById('form-agent-group');
      if (isAgent) {
        agentGroup.style.display = 'none';
      } else {
        agentGroup.style.display = 'block';
        populateAgentsDropdown('form-assignee');
        document.getElementById('form-assignee').value = lead.assigned_to || '';
      }

      // Open modal overlay
      document.getElementById('lead-form-modal').classList.add('active');
    }
  } catch (err) {
    showAlert('danger', 'Error loading lead detail for edit.');
    console.error(err);
  }
}

function closeLeadFormModal() {
  document.getElementById('lead-form-modal').classList.remove('active');
}

async function submitLeadForm(e) {
  e.preventDefault();
  
  const leadId = document.getElementById('form-lead-id').value;
  const isEditing = !!leadId;
  
  // Extract inputs
  const payload = {
    name: document.getElementById('form-name').value,
    email: document.getElementById('form-email').value,
    phone: document.getElementById('form-phone').value,
    source: document.getElementById('form-source').value,
    notes: document.getElementById('form-notes').value
  };

  if (isEditing) {
    payload.status = document.getElementById('form-status').value;
    if (state.user.role !== 'Agent') {
      payload.assigned_to = document.getElementById('form-assignee').value;
    }
  } else {
    // If creating, get assignee values
    if (state.user.role !== 'Agent') {
      payload.assigned_to = document.getElementById('form-assignee').value;
    }
  }

  // Basic Form Validations
  if (!payload.name || !payload.email || !payload.phone) {
    showAlert('danger', 'Please enter all mandatory fields.');
    return;
  }

  try {
    const url = isEditing ? `/leads/${leadId}` : '/leads';
    const method = isEditing ? 'PUT' : 'POST';
    
    const res = await fetchWithAuth(url, method, payload);
    
    if (res.success) {
      showAlert('success', res.message || 'Lead saved successfully.');
      closeLeadFormModal();
      
      // Refresh views
      if (state.currentView === 'dashboard') {
        fetchDashboardStats();
        fetchActivityLogs();
      } else {
        fetchLeadsList();
      }
    } else {
      showAlert('danger', res.message || 'Error saving lead details.');
    }
  } catch (err) {
    showAlert('danger', 'Error submitting lead details form.');
    console.error(err);
  }
}

async function deleteLead(leadId) {
  if (!confirm('Are you absolutely sure you want to delete this lead? This action cannot be undone.')) {
    return;
  }

  try {
    const res = await fetchWithAuth(`/leads/${leadId}`, 'DELETE');
    if (res.success) {
      showAlert('success', res.message || 'Lead deleted successfully.');
      
      if (state.currentView === 'dashboard') {
        fetchDashboardStats();
        fetchActivityLogs();
      } else {
        fetchLeadsList();
      }
    } else {
      showAlert('danger', res.message || 'Failed to delete lead.');
    }
  } catch (err) {
    showAlert('danger', 'Error deleting lead.');
    console.error(err);
  }
}

// ==========================================
// 8. Lead Profile Details Modal Rendering
// ==========================================
async function openLeadDetails(leadId) {
  const modalBody = document.getElementById('lead-details-modal-body');
  modalBody.innerHTML = '<div style="text-align: center; padding: 2rem 0;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem;"></i><br><br>Loading profile timeline...</div>';
  
  // Show details modal overlay
  document.getElementById('lead-details-modal').classList.add('active');

  try {
    const res = await fetchWithAuth(`/leads/${leadId}`);
    if (res.success) {
      const lead = res.lead;
      const logs = res.activityLogs || [];
      
      const badgeClass = getStatusBadgeClass(lead.status);
      const agentName = lead.agent_name ? lead.agent_name : '<span style="color: var(--text-muted); font-style: italic;">Unassigned</span>';
      const companyLogo = lead.company_logo ? lead.company_logo : 'https://cdn-icons-png.flaticon.com/512/3256/3256037.png';
      
      // Build HTML
      let html = '';
      
      // 1. Company enrichment box (if details found)
      if (lead.company_name) {
        html += `
          <div class="enrichment-card">
            <div class="enrichment-logo">
              <img src="${companyLogo}" alt="${lead.company_name} Logo" onerror="this.src='https://cdn-icons-png.flaticon.com/512/3256/3256037.png'">
            </div>
            <div class="enrichment-details">
              <h4>${lead.company_name} (Auto-Enriched)</h4>
              <p>${lead.company_description || 'Company details loaded successfully via Microlink API.'}</p>
            </div>
          </div>
        `;
      }

      // 2. Profile core info grid
      html += `
        <div class="details-grid">
          <div class="detail-item">
            <span class="detail-label">Lead Name</span>
            <span class="detail-value" style="font-size: 1.1rem; font-weight: 700; color: #a5b4fc;">${lead.name}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Current Status</span>
            <span class="detail-value"><span class="badge ${badgeClass}" style="margin-top: 0.15rem;">${lead.status}</span></span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Email Address</span>
            <span class="detail-value"><a href="mailto:${lead.email}"><i class="fa-regular fa-envelope"></i> ${lead.email}</a></span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Phone Number</span>
            <span class="detail-value"><a href="tel:${lead.phone}"><i class="fa-solid fa-phone"></i> ${lead.phone}</a></span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Marketing Source</span>
            <span class="detail-value">${lead.source}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Assigned Agent</span>
            <span class="detail-value"><i class="fa-regular fa-user"></i> ${agentName}</span>
          </div>
        </div>

        <div class="card" style="padding: 0.75rem; background-color: rgba(255,255,255,0.01); margin-bottom: 1.5rem;">
          <span class="detail-label" style="display:block; margin-bottom: 0.25rem;">Observations / Notes</span>
          <p style="font-size: 0.85rem; color: var(--text-primary); white-space: pre-wrap;">${lead.notes || '<span style="color: var(--text-muted); font-style: italic;">No notes recorded yet.</span>'}</p>
        </div>

        <div>
          <h3 style="font-family: var(--font-display); font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem;">Activity Timeline Logs</h3>
          <div class="timeline">
      `;

      // 3. Activity Timeline logs
      if (logs.length === 0) {
        html += '<p style="color: var(--text-muted); font-size: 0.85rem; padding: 1rem 0;">No activities logged for this lead.</p>';
      } else {
        logs.forEach(log => {
          const dt = new Date(log.created_at);
          const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
          
          html += `
            <div class="timeline-item">
              <span class="timeline-time">${dateStr} @ ${timeStr}</span>
              <div class="timeline-title">${log.action_type}</div>
              <div class="timeline-desc">${log.description}</div>
            </div>
          `;
        });
      }

      html += `
          </div>
        </div>
      `;

      modalBody.innerHTML = html;
    } else {
      modalBody.innerHTML = `<div style="text-align: center; padding: 2rem 0; color: var(--status-lost-text);"><i class="fa-solid fa-circle-exclamation" style="font-size: 2rem;"></i><br><br>${res.message}</div>`;
    }
  } catch (err) {
    modalBody.innerHTML = '<div style="text-align: center; padding: 2rem 0; color: var(--status-lost-text);"><i class="fa-solid fa-circle-exclamation" style="font-size: 2rem;"></i><br><br>Connection failed. Could not reach server.</div>';
    console.error(err);
  }
}

function closeLeadDetailsModal() {
  document.getElementById('lead-details-modal').classList.remove('active');
}

// ==========================================
// 9. Real-Time WebSockets Client Connect
// ==========================================
function connectWebSocket() {
  if (ws) {
    ws.close();
  }

  console.log(`Connecting WebSocket client to: ${WS_BASE}`);
  ws = new WebSocket(WS_BASE);

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('WebSocket: Received Event:', message);
      
      // Filter out connection checks
      if (message.type === 'CONNECTION_SUCCESSFUL') return;

      // Real-time reactions
      // 1. Flash alert to user
      let title = 'Lead stream alert';
      if (message.type === 'LEAD_CREATED') title = `New Lead Created: "${message.data.name}"`;
      if (message.type === 'LEAD_UPDATED') title = `Lead Updated: "${message.data.name}"`;
      if (message.type === 'LEAD_DELETED') title = `A Lead was deleted from system.`;
      
      showAlert('success', `⚡ <strong>Real-time Update:</strong> ${title}`, 5000);

      // 2. Refresh active screens in the background
      if (state.currentView === 'dashboard') {
        fetchDashboardStats();
        fetchActivityLogs();
      } else if (state.currentView === 'leads') {
        fetchLeadsList();
      }
    } catch (err) {
      console.error('Error parsing WS message:', err);
    }
  };

  ws.onclose = () => {
    console.log('WebSocket: connection closed. Reconnecting in 6 seconds...');
    // Retry connection after 6 seconds
    setTimeout(() => {
      if (state.token) connectWebSocket();
    }, 6000);
  };

  ws.onerror = (err) => {
    console.error('WebSocket Error:', err);
    ws.close();
  };
}

// ==========================================
// 10. API Communication helper (HTTP wrapper)
// ==========================================
/**
 * Custom fetch client wrapper that automatically appends the JWT bearer token
 * in request headers if the user is authenticated.
 */
async function fetchWithAuth(endpoint, method = 'GET', body = null) {
  const headers = {};
  
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  
  // If we receive a 401 unauthorized, log out immediately
  if (response.status === 401) {
    logout();
    throw new Error('Unauthorized session expired. Redirecting to login.');
  }

  return await response.json();
}

/**
 * Fetch list of agents from auth service (only visible for Manager/Admin users)
 */
async function fetchAgentsList() {
  try {
    const res = await fetchWithAuth('/auth/agents');
    if (res.success) {
      state.agents = res.agents;
    }
  } catch (err) {
    console.error('Failed to load agents list:', err);
  }
}

/**
 * Helper: Populates dropdown inputs with active agents list
 */
function populateAgentsDropdown(elementId) {
  const select = document.getElementById(elementId);
  if (!select) return;
  
  // Reset select contents (preserve first option)
  const firstOption = select.options[0];
  select.innerHTML = '';
  select.appendChild(firstOption);

  state.agents.forEach(agent => {
    const opt = document.createElement('option');
    opt.value = agent.id;
    opt.innerText = agent.name;
    select.appendChild(opt);
  });

  // If this is the search filter element, we also update it
  if (elementId === 'form-assignee') {
    const filterSelect = document.getElementById('filter-agent');
    if (filterSelect) {
      const prevVal = filterSelect.value;
      filterSelect.innerHTML = '<option value="">All Agents</option>';
      state.agents.forEach(agent => {
        const opt = document.createElement('option');
        opt.value = agent.id;
        opt.innerText = agent.name;
        filterSelect.appendChild(opt);
      });
      filterSelect.value = prevVal;
    }
  }
}

// ==========================================
// 11. Custom Notification Banner System
// ==========================================
function showAlert(type, message, timeout = 4000) {
  const container = document.getElementById('alert-container');
  if (!container) return;

  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type}`;
  
  let icon = '<i class="fa-solid fa-circle-check"></i>';
  if (type === 'danger') icon = '<i class="fa-solid fa-circle-exclamation"></i>';
  
  alertDiv.innerHTML = `${icon} <span>${message}</span>`;
  
  // Append alert
  container.appendChild(alertDiv);
  
  // Auto dismiss alert
  setTimeout(() => {
    alertDiv.style.opacity = '0';
    alertDiv.style.transform = 'translateY(-10px)';
    alertDiv.style.transition = 'all 0.3s ease-out';
    setTimeout(() => {
      alertDiv.remove();
    }, 300);
  }, timeout);
}
