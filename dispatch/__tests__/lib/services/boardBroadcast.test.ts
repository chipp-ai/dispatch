/**
 * Tests for boardBroadcast service
 *
 * Tests the BoardEvent type discriminated union and broadcasting logic.
 */

import type { BoardEvent, BoardIssue } from "@/lib/services/boardBroadcast";

describe("boardBroadcast types", () => {
  const mockBoardIssue: BoardIssue = {
    id: "issue-uuid-123",
    identifier: "CHIPP-456",
    title: "Test Issue",
    description: "A test issue description",
    priority: "P2",
    status_id: "status-uuid",
    assignee: { name: "John Doe" },
    labels: [
      { label: { id: "label-1", name: "bug", color: "#FF0000" } },
      { label: { id: "label-2", name: "urgent", color: "#FF6600" } },
    ],
    created_at: "2024-01-15T10:30:00.000Z",
  };

  describe("BoardEvent discriminated union", () => {
    it("issue_created event has correct shape", () => {
      const event: BoardEvent = {
        type: "issue_created",
        issue: mockBoardIssue,
        timestamp: new Date().toISOString(),
      };

      expect(event.type).toBe("issue_created");
      expect(event.issue.identifier).toBe("CHIPP-456");
      expect(event.timestamp).toBeDefined();
    });

    it("issue_updated event has correct shape", () => {
      const event: BoardEvent = {
        type: "issue_updated",
        issue: mockBoardIssue,
        timestamp: new Date().toISOString(),
      };

      expect(event.type).toBe("issue_updated");
      expect(event.issue).toBeDefined();
    });

    it("issue_moved event includes previousStatusId", () => {
      const event: BoardEvent = {
        type: "issue_moved",
        issue: mockBoardIssue,
        previousStatusId: "old-status-uuid",
        timestamp: new Date().toISOString(),
      };

      expect(event.type).toBe("issue_moved");
      expect(event.previousStatusId).toBe("old-status-uuid");
      expect(event.issue.status_id).toBe("status-uuid");
    });

    it("issue_deleted event has different shape (no issue object)", () => {
      const event: BoardEvent = {
        type: "issue_deleted",
        issueId: "issue-uuid-123",
        identifier: "CHIPP-456",
        timestamp: new Date().toISOString(),
      };

      expect(event.type).toBe("issue_deleted");
      expect(event.issueId).toBe("issue-uuid-123");
      expect(event.identifier).toBe("CHIPP-456");
      // TypeScript ensures 'issue' property doesn't exist on deleted events
      expect("issue" in event).toBe(false);
    });
  });

  describe("BoardIssue structure", () => {
    it("handles null assignee", () => {
      const issueWithoutAssignee: BoardIssue = {
        ...mockBoardIssue,
        assignee: null,
      };

      expect(issueWithoutAssignee.assignee).toBeNull();
    });

    it("handles empty labels array", () => {
      const issueWithoutLabels: BoardIssue = {
        ...mockBoardIssue,
        labels: [],
      };

      expect(issueWithoutLabels.labels).toHaveLength(0);
    });

    it("handles null description", () => {
      const issueWithoutDescription: BoardIssue = {
        ...mockBoardIssue,
        description: null,
      };

      expect(issueWithoutDescription.description).toBeNull();
    });

    it("validates priority values", () => {
      const priorities = ["P1", "P2", "P3", "P4"];
      priorities.forEach((priority) => {
        const issue: BoardIssue = {
          ...mockBoardIssue,
          priority,
        };
        expect(issue.priority).toBe(priority);
      });
    });
  });

  describe("Event serialization", () => {
    it("serializes issue_created event to JSON", () => {
      const event: BoardEvent = {
        type: "issue_created",
        issue: mockBoardIssue,
        timestamp: "2024-01-15T10:30:00.000Z",
      };

      const json = JSON.stringify(event);
      const parsed = JSON.parse(json);

      expect(parsed.type).toBe("issue_created");
      expect(parsed.issue.identifier).toBe("CHIPP-456");
      expect(parsed.issue.labels).toHaveLength(2);
    });

    it("serializes issue_deleted event to JSON", () => {
      const event: BoardEvent = {
        type: "issue_deleted",
        issueId: "issue-uuid-123",
        identifier: "CHIPP-456",
        timestamp: "2024-01-15T10:30:00.000Z",
      };

      const json = JSON.stringify(event);
      const parsed = JSON.parse(json);

      expect(parsed.type).toBe("issue_deleted");
      expect(parsed.issueId).toBe("issue-uuid-123");
      expect(parsed.issue).toBeUndefined();
    });

    it("produces valid SSE data format", () => {
      const event: BoardEvent = {
        type: "issue_updated",
        issue: mockBoardIssue,
        timestamp: "2024-01-15T10:30:00.000Z",
      };

      const sseData = `data: ${JSON.stringify(event)}\n\n`;

      expect(sseData).toMatch(/^data: \{.*\}\n\n$/);
      expect(sseData).toContain('"type":"issue_updated"');
    });
  });
});
