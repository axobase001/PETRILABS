/**
 * Jest Test Setup
 */

import { logger } from '../utils/logger';

// Disable logging during tests
logger.transports.forEach((t) => {
  t.silent = true;
});

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Global test timeout
jest.setTimeout(30000);

// Clean up after all tests
afterAll(async () => {
  // Add any global cleanup here
});
