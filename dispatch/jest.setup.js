// Add global fetch for API calls
const crossFetch = require("cross-fetch");
global.fetch = crossFetch.fetch;
global.Request = crossFetch.Request;
global.Response = crossFetch.Response;
global.Headers = crossFetch.Headers;

// Add TextEncoder and TextDecoder
if (typeof global.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Add crypto.randomUUID polyfill
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  };
}

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

// Suppress console output during tests (optional)
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};
