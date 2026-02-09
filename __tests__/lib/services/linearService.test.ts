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

    it("maps triage to Triage", () => {
      expect(mapLinearStatus("triage")).toBe("Triage");
      expect(mapLinearStatus("Triage")).toBe("Triage");
    });

    it("maps waiting for agent to Waiting for agent", () => {
      expect(mapLinearStatus("waiting for agent")).toBe("Waiting for agent");
      expect(mapLinearStatus("Waiting for agent")).toBe("Waiting for agent");
    });

    it("maps being developed to Being Developed", () => {
      expect(mapLinearStatus("being developed")).toBe("Being Developed");
      expect(mapLinearStatus("Being Developed")).toBe("Being Developed");
    });

    it("maps pr open to PR Open", () => {
      expect(mapLinearStatus("pr open")).toBe("PR Open");
      expect(mapLinearStatus("PR Open")).toBe("PR Open");
    });

    it("maps verify in staging to Verify in Staging", () => {
      expect(mapLinearStatus("verify in staging")).toBe("Verify in Staging");
      expect(mapLinearStatus("Verify in Staging")).toBe("Verify in Staging");
    });

    it("maps verify in prod to Verify in Prod", () => {
      expect(mapLinearStatus("verify in prod")).toBe("Verify in Prod");
      expect(mapLinearStatus("Verify in Prod")).toBe("Verify in Prod");
    });

    it("maps ready for prod to Ready for prod", () => {
      expect(mapLinearStatus("ready for prod")).toBe("Ready for prod");
      expect(mapLinearStatus("Ready for prod")).toBe("Ready for prod");
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
