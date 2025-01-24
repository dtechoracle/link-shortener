// Increase timeout for all tests
jest.setTimeout(60000);

// Suppress console logs during tests unless there's an error
global.console = {
  ...console,
  log: jest.fn(),
  error: console.error,
  warn: console.warn,
  info: jest.fn(),
  debug: jest.fn(),
};

// Clean up resources after all tests
afterAll(async () => {
  // Additional cleanup if needed
  await new Promise((resolve) => setTimeout(resolve, 500));
});
