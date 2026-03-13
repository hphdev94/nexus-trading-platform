/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  collectCoverageFrom: [
    'api/**/*.js',
    '!api/_lib/**'   // libs tested indirectly via helpers.test.js
  ],
  coverageThreshold: {
    global: {
      branches:   40,
      functions:  50,
      lines:      50,
      statements: 50
    }
  },
  testTimeout: 15000,
  // Report JUnit XML for GitHub Actions test summary
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '.',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ],
  // Clear mocks between each test
  clearMocks: true,
  // Verbose output in CI
  verbose: process.env.CI === 'true'
};
