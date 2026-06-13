/**
 * Authentication and Authorization Middleware
 * 
 * This file contains middlewares to:
 * 1. Verify JSON Web Tokens (JWT) for protected routes.
 * 2. Check user roles (Admin, Manager, Agent) to enforce access control.
 * 
 * Simple and heavily commented for beginners.
 */

const jwt = require('jsonwebtoken');
const db = require('../db/db');

// Read the secret key from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

/**
 * Protect Routes Middleware
 * 
 * Verifies that the client has sent a valid JWT in the Authorization header.
 * Example Header: "Authorization: Bearer <your_jwt_token>"
 */
async function protect(req, res, next) {
  let token;

  // 1. Check if token exists in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 2. If no token found, return 401 (Unauthorized)
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Not authorized, please login to get access.' 
    });
  }

  try {
    // 3. Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);

    // 4. Fetch the user details from DB using the ID decoded from the token
    const users = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [decoded.id]);
    
    if (users.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'User belonging to this token no longer exists.' 
      });
    }

    // 5. Attach the user object to the request (req.user)
    // This allows controllers to know who is making the request and what their role is.
    req.user = users[0];
    next();
  } catch (error) {
    console.error('JWT Verification Error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Not authorized, invalid token.' 
    });
  }
}

/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * Restricts access to specific roles.
 * Usage: authorize('Admin', 'Manager') - will only allow Admins or Managers to pass.
 * 
 * @param {...string} roles - The roles allowed to access the route
 */
function authorize(...roles) {
  return (req, res, next) => {
    // Check if the authenticated user has one of the allowed roles
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Role '${req.user ? req.user.role : 'Guest'}' is not authorized to access this resource.`
      });
    }
    next();
  };
}

module.exports = {
  protect,
  authorize
};
