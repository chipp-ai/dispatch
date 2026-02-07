import {
  getCustomerHealthMetrics,
  getCustomerIssuesWithHealth,
  getCustomerRecentActivity,
  getAllCustomersHealthSummary,
} from "@/lib/services/customerStatsService";
import { db } from "@/lib/db";

// Mock the database module
jest.mock("@/lib/db", () => ({
  db: {
    query: jest.fn(),
    queryOne: jest.fn(),
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

describe("customerStatsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getCustomerHealthMetrics", () => {
    it("returns null when customer not found", async () => {
      mockDb.queryOne.mockResolvedValueOnce(null);

      const result = await getCustomerHealthMetrics("non-existent-id");

      expect(result).toBeNull();
      expect(mockDb.queryOne).toHaveBeenCalledTimes(1);
    });

    it("returns health metrics for existing customer", async () => {
      // Mock customer lookup
      mockDb.queryOne
        .mockResolvedValueOnce({ id: "cust-123", name: "Acme Corp" })
        // Mock metrics queries - these return in order
        .mockResolvedValueOnce({ count: "10" }) // total issues
        .mockResolvedValueOnce({ count: "7" }) // open issues
        .mockResolvedValueOnce({ count: "3" }) // closed issues
        .mockResolvedValueOnce({ count: "2" }) // stale issues
        .mockResolvedValueOnce({ count: "1" }) // critical stale
        .mockResolvedValueOnce({ count: "3" }) // unresponded
        .mockResolvedValueOnce({ count: "2" }) // high priority open
        .mockResolvedValueOnce({
          last_activity: new Date("2025-12-10T10:00:00Z"),
        })
        .mockResolvedValueOnce({ created_at: new Date("2025-12-08T10:00:00Z") })
        .mockResolvedValueOnce({ avg_hours: "4.5" });

      const result = await getCustomerHealthMetrics("cust-123");

      expect(result).not.toBeNull();
      expect(result?.customerId).toBe("cust-123");
      expect(result?.customerName).toBe("Acme Corp");
      expect(result?.totalIssues).toBe(10);
      expect(result?.openIssues).toBe(7);
      expect(result?.closedIssues).toBe(3);
      expect(result?.staleIssues).toBe(2);
      expect(result?.criticalStale).toBe(1);
      expect(result?.unrespondedIssues).toBe(3);
      expect(result?.highPriorityOpen).toBe(2);
      expect(result?.avgResponseTimeHours).toBe(4.5);
    });

    it("handles missing optional fields", async () => {
      mockDb.queryOne
        .mockResolvedValueOnce({ id: "cust-123", name: "New Customer" })
        .mockResolvedValueOnce({ count: "0" })
        .mockResolvedValueOnce({ count: "0" })
        .mockResolvedValueOnce({ count: "0" })
        .mockResolvedValueOnce({ count: "0" })
        .mockResolvedValueOnce({ count: "0" })
        .mockResolvedValueOnce({ count: "0" })
        .mockResolvedValueOnce({ count: "0" })
        .mockResolvedValueOnce({ last_activity: null })
        .mockResolvedValueOnce({ created_at: null })
        .mockResolvedValueOnce({ avg_hours: null });

      const result = await getCustomerHealthMetrics("cust-123");

      expect(result?.totalIssues).toBe(0);
      expect(result?.lastActivityAt).toBeNull();
      expect(result?.avgResponseTimeHours).toBeNull();
      expect(result?.daysSinceActivity).toBeNull();
    });
  });

  describe("getCustomerIssuesWithHealth", () => {
    const mockIssues = [
      {
        id: "issue-1",
        identifier: "ACME-1",
        title: "Critical bug",
        priority: "P1",
        status_name: "In Progress",
        status_color: "#3b82f6",
        created_at: new Date("2025-12-01"),
        updated_at: new Date("2025-12-10"),
        comment_count: "3",
      },
      {
        id: "issue-2",
        identifier: "ACME-2",
        title: "Feature request",
        priority: "P3",
        status_name: "Backlog",
        status_color: "#6b7280",
        created_at: new Date("2025-12-05"),
        updated_at: new Date("2025-12-05"),
        comment_count: "0",
      },
    ];

    it("returns all issues with health details", async () => {
      mockDb.query.mockResolvedValueOnce(mockIssues);

      const result = await getCustomerIssuesWithHealth("cust-123");

      expect(result).toHaveLength(2);
      expect(result[0].identifier).toBe("ACME-1");
      expect(result[0].hasTeamResponse).toBe(true);
      expect(result[0].commentCount).toBe(3);
      expect(result[1].identifier).toBe("ACME-2");
      expect(result[1].hasTeamResponse).toBe(false);
      expect(result[1].commentCount).toBe(0);
    });

    it("applies stale filter", async () => {
      mockDb.query.mockResolvedValueOnce([mockIssues[1]]);

      await getCustomerIssuesWithHealth("cust-123", { filter: "stale" });

      const calledQuery = mockDb.query.mock.calls[0][0] as string;
      expect(calledQuery).toContain("updated_at < NOW() - INTERVAL '3 days'");
    });

    it("applies unresponded filter", async () => {
      mockDb.query.mockResolvedValueOnce([mockIssues[1]]);

      await getCustomerIssuesWithHealth("cust-123", { filter: "unresponded" });

      const calledQuery = mockDb.query.mock.calls[0][0] as string;
      expect(calledQuery).toContain("NOT EXISTS");
    });

    it("applies critical filter", async () => {
      mockDb.query.mockResolvedValueOnce([mockIssues[0]]);

      await getCustomerIssuesWithHealth("cust-123", { filter: "critical" });

      const calledQuery = mockDb.query.mock.calls[0][0] as string;
      expect(calledQuery).toContain("priority IN ('P1', 'P2')");
    });

    it("respects limit option", async () => {
      mockDb.query.mockResolvedValueOnce(mockIssues);

      await getCustomerIssuesWithHealth("cust-123", { limit: 10 });

      expect(mockDb.query.mock.calls[0][1]).toContain(10);
    });
  });

  describe("getCustomerRecentActivity", () => {
    it("returns combined activity sorted by timestamp", async () => {
      const comments = [
        {
          issue_id: "issue-1",
          issue_identifier: "ACME-1",
          issue_title: "Critical bug",
          body: "Working on this now",
          created_at: new Date("2025-12-12T10:00:00Z"),
          author_name: "Hunter",
        },
      ];

      const issues = [
        {
          id: "issue-2",
          identifier: "ACME-2",
          title: "New feature",
          created_at: new Date("2025-12-11T10:00:00Z"),
        },
      ];

      mockDb.query
        .mockResolvedValueOnce(comments)
        .mockResolvedValueOnce(issues);

      const result = await getCustomerRecentActivity("cust-123", 20);

      expect(result).toHaveLength(2);
      // Should be sorted by timestamp descending
      expect(result[0].type).toBe("comment_added");
      expect(result[0].actorName).toBe("Hunter");
      expect(result[1].type).toBe("issue_created");
    });

    it("truncates long comment bodies", async () => {
      const longBody = "x".repeat(150);
      const comments = [
        {
          issue_id: "issue-1",
          issue_identifier: "ACME-1",
          issue_title: "Test",
          body: longBody,
          created_at: new Date(),
          author_name: null,
        },
      ];

      mockDb.query.mockResolvedValueOnce(comments).mockResolvedValueOnce([]);

      const result = await getCustomerRecentActivity("cust-123");

      expect(result[0].description).toContain("...");
      expect(result[0].description.length).toBeLessThanOrEqual(103); // 100 + "..."
    });
  });

  describe("getAllCustomersHealthSummary", () => {
    it("returns health summary for all customers with scores", async () => {
      const mockCustomers = [
        {
          id: "cust-1",
          name: "Healthy Corp",
          slug: "healthy",
          slack_channel_id: "C123",
          total_issues: "10",
          open_issues: "2",
          stale_issues: "0",
          critical_stale: "0",
          high_priority_open: "0",
          last_activity: new Date(),
        },
        {
          id: "cust-2",
          name: "Troubled Inc",
          slug: "troubled",
          slack_channel_id: null,
          total_issues: "20",
          open_issues: "15",
          stale_issues: "5",
          critical_stale: "2",
          high_priority_open: "3",
          last_activity: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
        },
      ];

      mockDb.query.mockResolvedValueOnce(mockCustomers);

      const result = await getAllCustomersHealthSummary("workspace-123");

      expect(result).toHaveLength(2);

      // Healthy customer should have high score
      expect(result[0].name).toBe("Healthy Corp");
      expect(result[0].healthScore).toBe(100);
      expect(result[0].slackChannelId).toBe("C123");

      // Troubled customer should have low score
      expect(result[1].name).toBe("Troubled Inc");
      expect(result[1].healthScore).toBeLessThan(50);
      expect(result[1].criticalStale).toBe(2);
    });

    it("calculates health score penalties correctly", async () => {
      // Customer with critical issues
      const criticalCustomer = {
        id: "cust-1",
        name: "Critical",
        slug: "critical",
        slack_channel_id: null,
        total_issues: "10",
        open_issues: "10",
        stale_issues: "0",
        critical_stale: "3", // 3 * 20 = -60 points
        high_priority_open: "0",
        last_activity: new Date(),
      };

      mockDb.query.mockResolvedValueOnce([criticalCustomer]);

      const result = await getAllCustomersHealthSummary("workspace-123");

      // 100 - 60 (capped at 60 for critical) = 40
      expect(result[0].healthScore).toBe(40);
    });
  });
});
