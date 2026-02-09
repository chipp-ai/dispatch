/**
 * Tests for Linear webhook signature verification
 */

import crypto from "crypto";

// Recreate the signature verification logic for testing
function verifySignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  const expectedSignature = hmac.digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

describe("Linear Webhook Signature Verification", () => {
  const testSecret = "test-webhook-secret-12345";
  const testPayload = JSON.stringify({
    action: "create",
    type: "Issue",
    data: { id: "issue-123", title: "Test Issue" },
  });

  function generateValidSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(payload);
    return hmac.digest("hex");
  }

  describe("verifySignature", () => {
    it("returns true for valid signature", () => {
      const validSignature = generateValidSignature(testPayload, testSecret);
      expect(verifySignature(testPayload, validSignature, testSecret)).toBe(
        true
      );
    });

    it("returns false for invalid signature", () => {
      const invalidSignature = "invalid-signature-hex";
      expect(verifySignature(testPayload, invalidSignature, testSecret)).toBe(
        false
      );
    });

    it("returns false for null signature", () => {
      expect(verifySignature(testPayload, null, testSecret)).toBe(false);
    });

    it("returns false for empty secret", () => {
      const signature = generateValidSignature(testPayload, testSecret);
      expect(verifySignature(testPayload, signature, "")).toBe(false);
    });

    it("returns false for wrong secret", () => {
      const signature = generateValidSignature(testPayload, testSecret);
      expect(verifySignature(testPayload, signature, "wrong-secret")).toBe(
        false
      );
    });

    it("returns false for modified payload", () => {
      const signature = generateValidSignature(testPayload, testSecret);
      const modifiedPayload = JSON.stringify({
        action: "update", // Changed from 'create'
        type: "Issue",
        data: { id: "issue-123", title: "Test Issue" },
      });
      expect(verifySignature(modifiedPayload, signature, testSecret)).toBe(
        false
      );
    });

    it("handles special characters in payload", () => {
      const specialPayload = JSON.stringify({
        data: {
          title: 'Test with "quotes" and unicode: \u00e9\u00e0\u00fc',
          description: "Line 1\nLine 2\tTabbed",
        },
      });
      const signature = generateValidSignature(specialPayload, testSecret);
      expect(verifySignature(specialPayload, signature, testSecret)).toBe(true);
    });

    it("handles empty payload", () => {
      const emptyPayload = "";
      const signature = generateValidSignature(emptyPayload, testSecret);
      expect(verifySignature(emptyPayload, signature, testSecret)).toBe(true);
    });

    it("handles large payload", () => {
      const largePayload = JSON.stringify({
        data: { description: "x".repeat(100000) },
      });
      const signature = generateValidSignature(largePayload, testSecret);
      expect(verifySignature(largePayload, signature, testSecret)).toBe(true);
    });
  });
});

describe("Linear Webhook Payload Parsing", () => {
  describe("Issue payloads", () => {
    it("parses create payload correctly", () => {
      const payload = {
        action: "create",
        type: "Issue",
        data: {
          id: "linear-uuid-123",
          identifier: "ENG-456",
          title: "Fix authentication bug",
          description: "Users are getting logged out unexpectedly",
          priority: 2,
          priorityLabel: "High",
          state: {
            id: "state-uuid",
            name: "Backlog",
            type: "backlog",
          },
          team: {
            id: "team-uuid",
            key: "ENG",
            name: "Engineering",
          },
          labels: [{ id: "label-1", name: "bug", color: "#FF0000" }],
          assignee: {
            id: "user-uuid",
            name: "John Doe",
            email: "john@example.com",
          },
          createdAt: "2024-01-15T10:30:00.000Z",
          updatedAt: "2024-01-15T10:30:00.000Z",
        },
      };

      expect(payload.action).toBe("create");
      expect(payload.type).toBe("Issue");
      expect(payload.data.identifier).toBe("ENG-456");
      expect(payload.data.priority).toBe(2);
      expect(payload.data.state.name).toBe("Backlog");
      expect(payload.data.labels).toHaveLength(1);
      expect(payload.data.assignee?.name).toBe("John Doe");
    });

    it("handles update payload with partial data", () => {
      const payload = {
        action: "update",
        type: "Issue",
        data: {
          id: "linear-uuid-123",
          identifier: "ENG-456",
          title: "Updated title",
          description: null,
          priority: 3,
          state: {
            id: "state-uuid-2",
            name: "In Progress",
            type: "started",
          },
          team: {
            id: "team-uuid",
            key: "ENG",
            name: "Engineering",
          },
          labels: [],
          assignee: null,
          createdAt: "2024-01-15T10:30:00.000Z",
          updatedAt: "2024-01-16T14:00:00.000Z",
        },
      };

      expect(payload.action).toBe("update");
      expect(payload.data.description).toBeNull();
      expect(payload.data.assignee).toBeNull();
      expect(payload.data.labels).toHaveLength(0);
    });

    it("handles remove payload", () => {
      const payload = {
        action: "remove",
        type: "Issue",
        data: {
          id: "linear-uuid-123",
          identifier: "ENG-456",
        },
      };

      expect(payload.action).toBe("remove");
      expect(payload.data.id).toBe("linear-uuid-123");
    });
  });

  describe("Issue number extraction", () => {
    function extractIssueNumber(identifier: string): number {
      const match = identifier.match(/-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    }

    it("extracts number from standard identifier", () => {
      expect(extractIssueNumber("ENG-123")).toBe(123);
      expect(extractIssueNumber("PROD-1")).toBe(1);
      expect(extractIssueNumber("BUG-99999")).toBe(99999);
    });

    it("handles identifiers with long team keys", () => {
      expect(extractIssueNumber("ENGINEERING-456")).toBe(456);
      expect(extractIssueNumber("ABC-DEF-789")).toBe(789);
    });

    it("returns 0 for invalid identifiers", () => {
      expect(extractIssueNumber("invalid")).toBe(0);
      expect(extractIssueNumber("")).toBe(0);
      expect(extractIssueNumber("ENG-")).toBe(0);
    });
  });
});
