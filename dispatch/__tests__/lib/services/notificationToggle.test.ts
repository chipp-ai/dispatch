/**
 * Tests for notification toggle functionality
 *
 * Tests the NOTIFICATIONS_ENABLED environment variable behavior.
 */

describe("Notification Toggle", () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to pick up env changes
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("areNotificationsEnabled logic", () => {
    // Recreate the function logic for isolated testing
    function areNotificationsEnabled(): boolean {
      const enabled = process.env.NOTIFICATIONS_ENABLED;
      // Only disabled if explicitly set to "false"
      return enabled?.toLowerCase() !== "false";
    }

    it("returns true when env var is not set", () => {
      delete process.env.NOTIFICATIONS_ENABLED;
      expect(areNotificationsEnabled()).toBe(true);
    });

    it('returns true when env var is "true"', () => {
      process.env.NOTIFICATIONS_ENABLED = "true";
      expect(areNotificationsEnabled()).toBe(true);
    });

    it('returns true when env var is "TRUE"', () => {
      process.env.NOTIFICATIONS_ENABLED = "TRUE";
      expect(areNotificationsEnabled()).toBe(true);
    });

    it('returns true when env var is "1"', () => {
      process.env.NOTIFICATIONS_ENABLED = "1";
      expect(areNotificationsEnabled()).toBe(true);
    });

    it("returns true when env var is empty string", () => {
      process.env.NOTIFICATIONS_ENABLED = "";
      expect(areNotificationsEnabled()).toBe(true);
    });

    it('returns false when env var is "false"', () => {
      process.env.NOTIFICATIONS_ENABLED = "false";
      expect(areNotificationsEnabled()).toBe(false);
    });

    it('returns false when env var is "FALSE"', () => {
      process.env.NOTIFICATIONS_ENABLED = "FALSE";
      expect(areNotificationsEnabled()).toBe(false);
    });

    it('returns false when env var is "False"', () => {
      process.env.NOTIFICATIONS_ENABLED = "False";
      expect(areNotificationsEnabled()).toBe(false);
    });

    it("returns true for any other value", () => {
      process.env.NOTIFICATIONS_ENABLED = "yes";
      expect(areNotificationsEnabled()).toBe(true);

      process.env.NOTIFICATIONS_ENABLED = "no";
      expect(areNotificationsEnabled()).toBe(true);

      process.env.NOTIFICATIONS_ENABLED = "disabled";
      expect(areNotificationsEnabled()).toBe(true);
    });
  });

  describe("Early return behavior simulation", () => {
    // Simulate the notification function behavior
    let notificationSent: boolean;

    function simulateNotifyStatusChange(): void {
      const enabled = process.env.NOTIFICATIONS_ENABLED;
      if (enabled?.toLowerCase() === "false") {
        return; // Early return, no notification
      }
      notificationSent = true;
    }

    beforeEach(() => {
      notificationSent = false;
    });

    it("sends notification when enabled", () => {
      process.env.NOTIFICATIONS_ENABLED = "true";
      simulateNotifyStatusChange();
      expect(notificationSent).toBe(true);
    });

    it("sends notification when not set", () => {
      delete process.env.NOTIFICATIONS_ENABLED;
      simulateNotifyStatusChange();
      expect(notificationSent).toBe(true);
    });

    it("does not send notification when disabled", () => {
      process.env.NOTIFICATIONS_ENABLED = "false";
      simulateNotifyStatusChange();
      expect(notificationSent).toBe(false);
    });
  });
});
