# Mini Lead Management System (LeadStream)

A clean, high-quality full-stack Lead Management System designed for freshmen to learn and explain. It features an Express/Node.js backend with dual-database support (PostgreSQL and zero-setup SQLite), real-time WebSocket updates, third-party profile enrichment, role-based access control, and a beautiful premium vanilla HTML/CSS/JS frontend.

---

## Features Built
1. **JWT Authentication**: Password hashing using `bcryptjs` and route protection with JSON Web Tokens.
2. **Role-Based Access Control (RBAC)**: Support for Admin, Manager, and Agent roles, enforcing field-level update permissions.
3. **Auto-Assignment (Least-Loaded)**: Intelligent assignment logic that finds the agent with the lowest number of active leads.
4. **Third-Party Profile Enrichment**: Extracts email domains to fetch company name, logo, and description automatically using a keyless public API (`microlink.io`).
5. **Real-time Live Feed**: WebSocket broadcast server to stream lead updates instantly to user dashboards.
6. **Robust Search & Filtering**: Client and server-side pagination, searching, sorting, and status/source filters.
7. **Observability Logs**: Activity table auditing user actions (Lead Created, Lead Updated, Lead Assigned, Status Changed).
8. **Interactive Swagger Docs**: Visual API explorer available at `/api-docs`.

---

## Project Directory Structure
```text
lead-management-system/
├── backend/
│   ├── src/
│   │   ├── controllers/      # Route handler functions (Auth, Leads)
│   │   ├── db/               # DB connections & schemas (SQLite/PostgreSQL)
│   │   ├── middleware/       # JWT verification & Authorization guards
│   │   ├── routes/           # Express router endpoints
│   │   ├── services/         # Auto-assignment & Microlink enrichment logic
│   │   ├── tests/            # Jest test suite for assignment logic
│   │   ├── server.js         # HTTP and WebSocket server setup
│   │   └── swagger.json      # Swagger OpenAPI specifications
│   ├── .env                  # Port, DB credentials, JWT secret keys
│   ├── Dockerfile            # Docker image configuration for backend
│   └── package.json          # Node dependency configurations
├── frontend/
│   ├── app.js                # Frontend SPA state, fetch wrappers, and WS client
│   ├── index.html            # Semantic SPA view containers
│   └── style.css             # CSS layouts, custom properties, animations
├── docker-compose.yml        # Orchestration file for Node API and Postgres containers
└── README.md                 # Comprehensive project guide (this file)
```

---

## Database Setup & Modes
To make testing simple, the application supports **two database engines** configured via `.env`:

### Mode A: SQLite (Default - Plug-and-Play)
No installation required! 
- If `DATABASE_URL` is empty or left undefined in `backend/.env`, the system automatically spins up a local database file `backend/database.db` and generates tables/indexes on startup.

### Mode B: PostgreSQL (Mandatory Tech Stack Option)
- Provide a PostgreSQL database connection string in `backend/.env` under the key `DATABASE_URL`.
- Example: `DATABASE_URL=postgresql://username:password@localhost:5432/lead_db`
- The application will automatically route all query requests using the PostgreSQL pool client `pg`.
- Plain schema creation scripts are available in `backend/src/db/schema.sql`.

---

## Quick Start (How to Run)

### Option 1: Standard Local Execution (Recommended for freshers)
1. **Install Dependencies**:
   Navigate to the `backend/` directory and run:
   ```bash
   cd backend
   npm.cmd install
   ```
2. **Launch the Server**:
   Start the Node development environment:
   ```bash
   npm run dev
   ```
   *The server will start on [http://localhost:5000](http://localhost:5000) and initialize SQLite.*
3. **Open the Frontend**:
   Simply double-click the `frontend/index.html` file to open it in any browser, or access it at `http://localhost:5000/` which is served by the Express backend.

### Option 2: Run with Docker (Full Stack including PostgreSQL)
1. Ensure Docker Desktop is installed and running on your system.
2. Run the command from the root directory:
   ```bash
   docker-compose up --build
   ```
   *This spins up a PostgreSQL container on port `5432` and the Node backend API on port `5000` connected together.*
3. Access the frontend app by opening `frontend/index.html` or navigating to `http://localhost:5000`.

---

## Testing the Application
We have included Jest unit tests targeting the auto-assignment calculations. Run them using:
```bash
cd backend
npm.cmd test
```

---

## API Documentation
Once the server is running, navigate to:
👉 [http://localhost:5000/api-docs/](http://localhost:5000/api-docs/)

This page provides an interactive Swagger UI where you can inspect all endpoints, headers, payloads, and response shapes.
