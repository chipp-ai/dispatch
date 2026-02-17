/**
 * Tests for linearService
 *
 * Tests the Linear API mapping functions and utility functions.
 */

import {
  mapLinearPriority,
  mapLinearStatus,
} from "@/lib/services/linearService";

describe("linearService", () => {
  describe("mapLinearPriority", () => {
    it("maps Urgent (1) to P1", () => {
      expect(mapLinearPriority(1)).toBe("P1");
    });

    it("maps High (2) to P2", () => {
      expect(mapLinearPriority(2)).toBe("P2");
    });

    it("maps Medium (3) to P3", () => {
      expect(mapLinearPriority(3)).toBe("P3");
    });

    it("maps Low (4) to P4", () => {
      expect(mapLinearPriority(4)).toBe("P4");
    });

    it("maps No priority (0) to P3 as default", () => {
      expect(mapLinearPriority(0)).toBe("P3");
    });

    it("maps unknown values to P3 as default", () => {
      expect(mapLinearPriority(5)).toBe("P3");
      expect(mapLinearPriority(-1)).toBe("P3");
      expect(mapLinearPriority(99)).toBe("P3");
    });
  });

  describe("mapLinearStatus", () => {
    it("maps backlog to Backlog", () => {
      expect(mapLinearStatus("backlog")).toBe("Backlog");
      expect(mapLinearStatus("Backlog")).toBe("Backlog");
      expect(mapLinearStatus("BACKLOG")).toBe("Backlog");
    });

    it("maps triage to Backlog", () => {
      expect(mapLinearStatus("triage")).toBe("Backlog");
      expect(mapLinearStatus("Triage")).toBe("Backlog");
    });

    it("maps investigating to Investigating", () => {
      expect(mapLinearStatus("investigating")).toBe("Investigating");
    });

    it("maps waiting for agent to Needs Review", () => {
      expect(mapLinearStatus("waiting for agent")).toBe("Needs Review");
      expect(mapLinearStatus("Waiting for agent")).toBe("Needs Review");
    });

    it("maps being developed to In Progress", () => {
      expect(mapLinearStatus("being developed")).toBe("In Progress");
      expect(mapLinearStatus("Being Developed")).toBe("In Progress");
    });

    it("maps in progress to In Progress", () => {
      expect(mapLinearStatus("in progress")).toBe("In Progress");
    });

    it("maps pr open to In Review", () => {
      expect(mapLinearStatus("pr open")).toBe("In Review");
      expect(mapLinearStatus("PR Open")).toBe("In Review");
    });

    it("maps verify in staging to Done", () => {
      expect(mapLinearStatus("verify in staging")).toBe("Done");
      expect(mapLinearStatus("Verify in Staging")).toBe("Done");
    });

    it("maps verify in prod to Done", () => {
      expect(mapLinearStatus("verify in prod")).toBe("Done");
      expect(mapLinearStatus("Verify in Prod")).toBe("Done");
    });

    it("maps ready for prod to Done", () => {
      expect(mapLinearStatus("ready for prod")).toBe("Done");
      expect(mapLinearStatus("Ready for prod")).toBe("Done");
    });

    it("maps done to Done", () => {
      expect(mapLinearStatus("done")).toBe("Done");
      expect(mapLinearStatus("Done")).toBe("Done");
    });

    it("maps canceled/cancelled to Canceled", () => {
      expect(mapLinearStatus("canceled")).toBe("Canceled");
      expect(mapLinearStatus("cancelled")).toBe("Canceled");
      expect(mapLinearStatus("Canceled")).toBe("Canceled");
    });

    it("returns original status name for unmapped statuses", () => {
      expect(mapLinearStatus("Custom Status")).toBe("Custom Status");
      expect(mapLinearStatus("Unknown")).toBe("Unknown");
    });
  });
});
