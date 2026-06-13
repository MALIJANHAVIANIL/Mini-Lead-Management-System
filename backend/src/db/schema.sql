-- PostgreSQL Database Schema for Mini Lead Management System
-- Use this file to set up your PostgreSQL database.

-- Drop existing tables if needed (uncomment for fresh setup)
-- DROP TABLE IF EXISTS activity_logs;
-- DROP TABLE IF EXISTS leads;
-- DROP TABLE IF EXISTS users;

-- 1. Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('Admin', 'Manager', 'Agent')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Leads Table
CREATE TABLE leads (
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
);

-- 3. Activity Logs Table
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL, -- e.g., 'Lead Created', 'Lead Updated', 'Lead Assigned', 'Status Changed'
    description TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Database Indexes for Performance Optimization
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_source ON leads(source);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);

-- 5. Insert Seed Data (Optional - Admin User)
-- Default Password: AdminPassword123 (hashed using bcrypt)
-- Hashed value: $2a$10$tM7w14aE73X7P64pW/6.a.Z2Hw9M7bM0qj2uUq6eUqJk3nJ2Q6T1K
-- INSERT INTO users (name, email, password, role) 
-- VALUES ('System Admin', 'admin@leadsystem.com', '$2a$10$tM7w14aE73X7P64pW/6.a.Z2Hw9M7bM0qj2uUq6eUqJk3nJ2Q6T1K', 'Admin');
