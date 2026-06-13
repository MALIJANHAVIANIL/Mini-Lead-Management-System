/**
 * Auto-Assignment Service for Leads
 * 
 * When a lead is created, it must be automatically assigned to an agent.
 * 
 * We implement the "Least-Loaded Agent" assignment strategy:
 * 1. Fetch all users who have the role of 'Agent'.
 * 2. Count the number of leads currently assigned to each agent.
 * 3. Assign the new lead to the agent with the lowest number of leads.
 * 4. If there's a tie, SQLite/PostgreSQL naturally selects the first one.
 * 5. If no agents exist in the system, the lead remains unassigned.
 */

const db = require('../db/db');

/**
 * Finds the agent with the fewest assigned leads and returns their user ID.
 * 
 * @returns {Promise<number|null>} The ID of the least-loaded agent, or null if no agents exist.
 */
async function getLeastLoadedAgent() {
  try {
    // This query:
    // 1. Selects all users with role = 'Agent'
    // 2. Joins with the leads table to count their assigned leads
    // 3. Groups by agent user ID
    // 4. Orders by the count in ascending order (lowest first)
    //
    // This is a standard ANSI SQL query that runs perfectly on both PostgreSQL and SQLite!
    const queryStr = `
      SELECT u.id, u.name, COUNT(l.id) AS lead_count
      FROM users u
      LEFT JOIN leads l ON u.id = l.assigned_to
      WHERE u.role = 'Agent'
      GROUP BY u.id, u.name
      ORDER BY lead_count ASC
      LIMIT 1
    `;
    
    const results = await db.query(queryStr);
    
    // If no agents are registered in the system, return null
    if (results.length === 0) {
      console.warn('Auto-assignment failed: No users with the role "Agent" found.');
      return null;
    }
    
    // Return the ID of the agent with the lowest count
    console.log(`Auto-assignment selected agent ${results[0].name} (ID: ${results[0].id}) with current load: ${results[0].lead_count} leads.`);
    return results[0].id;
  } catch (error) {
    console.error('Error during auto-assignment selection:', error);
    throw error;
  }
}

module.exports = {
  getLeastLoadedAgent
};
