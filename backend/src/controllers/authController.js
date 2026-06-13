/**
 * User Authentication Controller
 * 
 * This file handles:
 * 1. User Registration (Hashing password using bcryptjs)
 * 2. User Login (Verifying password and issuing JWT)
 * 3. Fetching logged-in user profile (me)
 * 4. Fetching all available agents (for assignment/filters)
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/db');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

/**
 * Register User
 * POST /api/auth/register
 */
async function register(req, res) {
  const { name, email, password, role } = req.body;

  // 1. Basic validation
  if (!name || !email || !password || !role) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please provide all required fields: name, email, password, role.' 
    });
  }

  // Validate role
  if (!['Admin', 'Manager', 'Agent'].includes(role)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid role. Role must be Admin, Manager, or Agent.' 
    });
  }

  try {
    // 2. Check if user already exists
    const existingUsers = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'A user with this email already exists.' 
      });
    }

    // 3. Hash the password using bcryptjs
    // Generate salt and hash
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Save the user in the database
    // We use standard ANSI SQL that works on both SQLite and PostgreSQL.
    // In Postgres, we use RETURNING id. Our db.run method handles getting the lastID.
    const sql = 'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)';
    const params = [name, email.toLowerCase(), hashedPassword, role];
    
    const result = await db.run(sql, params);
    
    // Determine the newly created user ID
    // db.run returns lastID/insertedId for SQLite and we can query for Postgres
    let userId = result.insertedId;
    if (db.usePostgres) {
      // For PostgreSQL we can get the inserted ID by running query instead of run, or we can check the returning rows.
      // Wait, let's write our register query to return ID for Postgres if pg is used,
      // or we can query the user. To be safe on both databases, let's fetch the user email we just created.
      const users = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      userId = users[0].id;
    }

    // 5. Create a JWT Token so they can login immediately
    const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1d' });

    res.status(201).json({
      success: true,
      message: 'User registered successfully!',
      token,
      user: {
        id: userId,
        name,
        email: email.toLowerCase(),
        role
      }
    });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error during registration.' 
    });
  }
}

/**
 * Login User
 * POST /api/auth/login
 */
async function login(req, res) {
  const { email, password } = req.body;

  // 1. Basic validation
  if (!email || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Please enter both email and password.' 
    });
  }

  try {
    // 2. Find user in database
    const users = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (users.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid credentials. User does not exist.' 
      });
    }

    const user = users[0];

    // 3. Verify the password by comparing bcrypt hashes
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid credentials. Password incorrect.' 
      });
    }

    // 4. Generate JWT
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });

    res.status(200).json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error during login.' 
    });
  }
}

/**
 * Get Current Logged-in User Info
 * GET /api/auth/me
 */
async function getMe(req, res) {
  // req.user was populated by the protect middleware!
  res.status(200).json({
    success: true,
    user: req.user
  });
}

/**
 * Get List of Agents
 * GET /api/auth/agents
 * Useful for drop-downs in forms or agent statistics.
 */
async function getAgents(req, res) {
  try {
    const agents = await db.query('SELECT id, name, email FROM users WHERE role = \'Agent\' ORDER BY name ASC');
    res.status(200).json({
      success: true,
      agents
    });
  } catch (error) {
    console.error('Error fetching agents:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error retrieving agents list.' 
    });
  }
}

module.exports = {
  register,
  login,
  getMe,
  getAgents
};
