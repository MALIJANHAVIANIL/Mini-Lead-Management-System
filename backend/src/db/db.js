/**
 * Database Layer for Mini Lead Management System
 * 
 * This file handles database connections for both SQLite (default, zero-setup for local runs)
 * and PostgreSQL (for production/assessment requirements).
 * 
 * It exports a unified query helper `db.query(sql, params)` which runs queries asynchronously
 * using Promise (async/await) syntax, making it clean and easy for a fresher to read.
 */

const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const usePostgres = !!process.env.DATABASE_URL;
let pgPool = null;
let sqliteDb = null;

if (usePostgres) {
  console.log('Database Mode: PostgreSQL');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
} else {
  console.log('Database Mode: SQLite');
  const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || './database.db');
  console.log(`SQLite database file path: ${dbPath}`);
  sqliteDb = new sqlite3.Database(dbPath);
}

/**
 * Unified query method.
 * Runs SQL queries on PostgreSQL or SQLite depending on configuration.
 * Automatically translates PostgreSQL parameter placeholders ($1, $2, etc.) to SQLite format (?)
 * 
 * @param {string} sql - SQL query string with $1, $2 placeholder style
 * @param {Array} params - Array of parameter values matching the placeholders
 * @returns {Promise<Array>} - Resolves to an array of rows
 */
async function query(sql, params = []) {
  if (usePostgres) {
    const result = await pgPool.query(sql, params);
    return result.rows;
  } else {
    // For SQLite, convert postgres-style $1, $2... placeholders to SQLite-style ?
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    
    return new Promise((resolve, reject) => {
      // For SELECT queries, use db.all. For INSERT/UPDATE/DELETE, use db.run or db.all.
      // db.all works for all queries and returns rows, which makes it simple for freshers.
      sqliteDb.all(sqliteSql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }
}

/**
 * Helper to run write queries (INSERT, UPDATE, DELETE) and get metadata.
 * For example, getting the inserted row ID.
 */
async function run(sql, params = []) {
  if (usePostgres) {
    // In Postgres, we append "RETURNING id" to SQL or just run query and check rows
    const result = await pgPool.query(sql, params);
    return {
      rows: result.rows,
      insertedId: result.rows[0] ? result.rows[0].id : null,
      changes: result.rowCount
    };
  } else {
    const sqliteSql = sql.replace(/\$\d+/g, '?');
    return new Promise((resolve, reject) => {
      sqliteDb.run(sqliteSql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            insertedId: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }
}

/**
 * Initialize Tables (Create tables if they don't exist).
 * This is run automatically when the server starts to make the app ready-to-run.
 */
async function initializeDatabase() {
  try {
    // Users Table
    const createUsersTable = usePostgres ? `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('Admin', 'Manager', 'Agent')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    ` : `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('Admin', 'Manager', 'Agent')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Leads Table
    const createLeadsTable = usePostgres ? `
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        source VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'New',
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        company_name VARCHAR(150),
        company_logo TEXT,
        company_description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    ` : `
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'New',
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        company_name TEXT,
        company_logo TEXT,
        company_description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Activity Logs Table
    const createLogsTable = usePostgres ? `
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action_type VARCHAR(50) NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    ` : `
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action_type TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await query(createUsersTable);
    await query(createLeadsTable);
    await query(createLogsTable);

    // Create Indexes for faster search and filtering (requirement)
    if (usePostgres) {
      await query(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to)`);
    } else {
      await query(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source)`);
      await query(`CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to)`);
    }

    console.log('Database tables and indexes initialized successfully.');
  } catch (error) {
    console.error('Error initializing database tables:', error);
    process.exit(1);
  }
}

module.exports = {
  query,
  run,
  initializeDatabase,
  usePostgres
};
