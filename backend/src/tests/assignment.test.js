/**
 * Unit Tests for Auto-Assignment Strategy
 * 
 * Tests the "Least-Loaded Agent" auto-assignment service.
 * We mock the database query responses to test:
 * 1. Correct assignment when agents exist.
 * 2. Proper null response when no agents are in the database.
 * 
 * Highly readable and educational for a fresher.
 */

// Mock the database module
jest.mock('../db/db', () => {
  return {
    query: jest.fn(),
    usePostgres: false
  };
});

const db = require('../db/db');
const { getLeastLoadedAgent } = require('../services/assignmentService');

describe('Least-Loaded Agent Auto-Assignment Test Suite', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  test('should assign the lead to the agent with the lowest lead count', async () => {
    // Mock database output: database orders by lead_count ASC, so agent Bob is first
    db.query.mockResolvedValue([
      { id: 2, name: 'Bob Agent', lead_count: 3 },
      { id: 3, name: 'Alice Agent', lead_count: 5 }
    ]);

    const assignedAgentId = await getLeastLoadedAgent();

    // Verify database query was called
    expect(db.query).toHaveBeenCalledTimes(1);
    
    // Verify Bob (ID 2, count 3) was selected over Alice (ID 3, count 5)
    expect(assignedAgentId).toBe(2);
  });

  test('should return null if no agents exist in the database', async () => {
    // Mock database output: empty array (no agents found)
    db.query.mockResolvedValue([]);

    const assignedAgentId = await getLeastLoadedAgent();

    expect(db.query).toHaveBeenCalledTimes(1);
    
    // Verify result is null when there are no agents
    expect(assignedAgentId).toBeNull();
  });

  test('should throw an error if the database query fails', async () => {
    // Mock database output: Query throws a connection error
    db.query.mockRejectedValue(new Error('Database connection failed'));

    await expect(getLeastLoadedAgent()).rejects.toThrow('Database connection failed');
  });
});
