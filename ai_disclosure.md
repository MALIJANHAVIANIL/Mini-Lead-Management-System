# AI Usage Disclosure Statement

This document details the collaborative pairing between the developer and the AI coding assistant (Antigravity) to build the Mini Lead Management System.

---

## 1. AI Tools Utilized
- **AI Coding Assistant**: Antigravity (powered by Google Gemini models).

---

## 2. What AI Was Used For
The AI assistant assisted with the following development tasks:
- **Project Structure & Scaffolding**: Creating directories and generating standard files (`package.json`, `Dockerfile`, `docker-compose.yml`, and `.env`).
- **Database Helper Design**: Writing the Promise-based query wrapper in `db.js` that abstracts SQLite and PostgreSQL interfaces.
- **Service Integrations**: Writing the standard fetch integration for `microlink.io` and the database aggregation query for the Least-Loaded Agent selector.
- **REST and WS Endpoints**: Writing Express routing paths, controllers for users and leads, and the WebSocket server event broadcaster.
- **CSS Designing**: Writing custom styling tokens, transitions, dark-theme assets, card layout rules, and responsive media query blocks.
- **Unit Testing**: Scaffolding Jest test mocks for database-isolated testing.

---

## 3. What Was Managed Manually
The developer directed and modified the implementation in the following areas:
- **Fresher-Level Scope Definition**: Explicitly instructing the system to avoid complex abstract patterns (like heavy ORM configurations or advanced React client routers), opting for readable raw SQL and simple vanilla DOM switching instead.
- **Environment Workaround**: Resolving Windows PowerShell execution restrictions by targeting `npm.cmd` wrapper runtimes instead of default scripting paths.
- **Database Placeholders Validation**: Verifying that SQLite is capable of handling standard PostgreSQL-style `$1, $2` parameters via dynamic query replacements.
- **Aesthetic Refinements**: Directing the visual layout of dashboard components and status indicator badge selections.
