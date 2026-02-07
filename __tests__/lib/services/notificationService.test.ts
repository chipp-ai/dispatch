/**
 * Tests for notificationService
 *
 * Note: The notification service uses module-level caching for the Slack client
 * and reads SLACK_BOT_TOKEN at load time. These tests verify the basic
 * behavior and type exports work correctly.
 */

// Mock dependencies before imports
jest.mock("@/lib/db", () => ({
  db: {
    query: jest.fn(),
    queryOne: jest.fn(),
  },
}));

jest.mock("@slack/web-api", () => ({
  WebClient: jest.fn(),
}));

jest.mock("@/lib/services/watcherService", () => ({
  getWatchingCustomers: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/services/customerUserService", () => ({
  getUsersForNotification: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/services/customerService", () => ({
  getCustomerById: jest.fn().mockResolvedValue(null),
}));

import {
  notifyStatusChange,
  notifyIssueCreated,
  notifyCommentAdded,
  type IssueStatusChange,
  type IssueCreated,
  type CommentAdded,
} from "@/lib/services/notificationService";

import { getWatchingCustomers } from "@/lib/services/watcherService";

const mockGetWatchingCustomers = getWatchingCustomers as jest.MockedFunction<
  typeof getWatchingCustomers
>;

describe("notificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("notifyStatusChange", () => {
    const statusChange: IssueStatusChange = {
      issueId: "issue-123",
      identifier: "ACME-1",
      title: "Critical bug fix",
      previousStatus: "Backlog",
      newStatus: "In Progress",
      slackThreadTs: null,
    };

    it("checks for watching customers", async () => {
      mockGetWatchingCustomers.mockResolvedValueOnce([]);

      await notifyStatusChange(statusChange);

      expect(mockGetWatchingCustomers).toHaveBeenCalledWith("issue-123");
    });

    it("completes without error when no watchers", async () => {
      mockGetWatchingCustomers.mockResolvedValueOnce([]);

      await expect(notifyStatusChange(statusChange)).resolves.not.toThrow();
    });
  });

  describe("notifyIssueCreated", () => {
    const issueCreated: IssueCreated = {
      issueId: "issue-123",
      identifier: "ACME-1",
      title: "New feature request",
      description: "Please add dark mode",
      priority: "P2",
      status: "Backlog",
      reporterName: "John Doe",
      slackChannelId: null,
      slackThreadTs: null,
      customerId: null,
    };

    it("completes without error when no slack channel", async () => {
      await expect(notifyIssueCreated(issueCreated)).resolves.not.toThrow();
    });

    it("handles all priority levels", async () => {
      for (const priority of ["P1", "P2", "P3", "P4"]) {
        await expect(
          notifyIssueCreated({ ...issueCreated, priority })
        ).resolves.not.toThrow();
      }
    });
  });

  describe("notifyCommentAdded", () => {
    const commentAdded: CommentAdded = {
      issueId: "issue-123",
      identifier: "ACME-1",
      issueTitle: "Critical bug",
      commentBody: "I've pushed a fix for this",
      authorName: "Hunter",
      slackThreadTs: null,
    };

    it("completes without error", async () => {
      await expect(notifyCommentAdded(commentAdded)).resolves.not.toThrow();
    });

    it("handles long comment bodies", async () => {
      const longComment = {
        ...commentAdded,
        commentBody: "x".repeat(1000),
      };
      await expect(notifyCommentAdded(longComment)).resolves.not.toThrow();
    });
  });

  describe("interface exports", () => {
    it("IssueStatusChange has correct shape", () => {
      const change: IssueStatusChange = {
        issueId: "test",
        identifier: "TEST-1",
        title: "Test",
        previousStatus: "A",
        newStatus: "B",
        slackThreadTs: null,
      };
      expect(change.issueId).toBe("test");
      expect(change.identifier).toBe("TEST-1");
      expect(change.previousStatus).toBe("A");
      expect(change.newStatus).toBe("B");
    });

    it("IssueCreated has correct shape", () => {
      const issue: IssueCreated = {
        issueId: "test",
        identifier: "TEST-1",
        title: "Test",
        description: "Test description",
        priority: "P3",
        status: "Backlog",
        reporterName: "Tester",
        slackChannelId: "C123",
        slackThreadTs: "1234.5678",
        customerId: "cust-1",
      };
      expect(issue.issueId).toBe("test");
      expect(issue.priority).toBe("P3");
      expect(issue.customerId).toBe("cust-1");
    });

    it("CommentAdded has correct shape", () => {
      const comment: CommentAdded = {
        issueId: "test",
        identifier: "TEST-1",
        issueTitle: "Test Issue",
        commentBody: "Test comment",
        authorName: "Test User",
        slackThreadTs: "1234.5678",
      };
      expect(comment.authorName).toBe("Test User");
      expect(comment.commentBody).toBe("Test comment");
    });
  });
});
