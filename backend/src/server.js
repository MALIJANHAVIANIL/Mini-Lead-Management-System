/**
 * Backend Server Entry Point
 * 
 * Sets up Express app, handles WebSockets, initializes database tables,
 * mounts route endpoints, and starts listening for client connections.
 * 
 * Designed to be easy to understand for beginners.
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Import Database Initializer
const db = require('./db/db');

// Import Routing Module
const apiRoutes = require('./routes/api');

// Load configurations from .env
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// Middleware Setup
// ==========================================
// 1. Enable CORS so the Plain HTML frontend can call our endpoints
app.use(cors());

// 2. Body parsers (allows backend to receive JSON body payloads in requests)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// API Documentation (Swagger/OpenAPI)
// ==========================================
try {
  // We set up a simple endpoint to serve our Swagger documentation.
  // The frontend or any developer can navigate to http://localhost:5000/api-docs/ to read it.
  const swaggerUi = require('swagger-ui-express');
  const swaggerDocument = require('./swagger.json');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  console.log('API Swagger Docs available at: http://localhost:5000/api-docs/');
} catch (err) {
  console.log('Skipping Swagger UI setup: Swagger UI packages may not be fully loaded.');
}

// ==========================================
// Mount Routes
// ==========================================
// Mount all our routes under /api
app.use('/api', apiRoutes);

// Simple healthcheck route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', database: db.usePostgres ? 'PostgreSQL' : 'SQLite' });
});

// Serve frontend static assets if needed, or let user open files directly
// For simplicity, we also let Express serve the frontend folder if it exists next to it.
app.use(express.static(path.join(__dirname, '../../frontend')));

// ==========================================
// Create HTTP and WebSocket Server
// ==========================================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket Connection handler
wss.on('connection', (ws) => {
  console.log('New client connected via WebSockets.');

  ws.send(JSON.stringify({
    type: 'CONNECTION_SUCCESSFUL',
    message: 'Successfully connected to Lead Management WebSocket stream.'
  }));

  ws.on('close', () => {
    console.log('Client disconnected from WebSockets.');
  });
});

/**
 * WebSocket Broadcast Helper
 * Sends a real-time event message to all connected web clients.
 * Mounted on app.locals so it can be called from leadsController.js!
 */
app.locals.broadcast = (messageObj) => {
  const jsonMessage = JSON.stringify(messageObj);
  let count = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonMessage);
      count++;
    }
  });
  console.log(`WebSocket: Broadcasted event type "${messageObj.type}" to ${count} clients.`);
};

// ==========================================
// Initialize DB and Start Server
// ==========================================
async function startServer() {
  console.log('Initializing database tables...');
  await db.initializeDatabase();
  
  server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`Server is running on: http://localhost:${PORT}`);
    console.log(`WebSockets stream active on same port.`);
    console.log(`====================================================`);
  });
}

startServer();
