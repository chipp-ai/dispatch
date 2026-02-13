/**
 * Tests for source-aware spawn thresholds.
 *
 * getSpawnThresholds is a pure function -- no DB needed.
 * checkSpawnGate is tested via mocked DB calls to verify
 * that source context flows through to threshold decisions.
 */

// Mock the DB before importing the module
jest.mock("../../db", () => ({
  db: {
    query: jest.fn(),
    queryOne: jest.fn(),
  },
}));

jest.mock("../agentRunService", () => ({
  createRun: jest.fn(),
}));

import { getSpawnThresholds, checkSpawnGate, hasEnoughEvents, hasPassedSpawnDelay } from "../spawnService";
import { db } from "../../db";

const mockQueryOne = db.queryOne as jest.MockedFunction<typeof db.queryOne>;

describe("getSpawnThresholds", () => {
  it("returns immediate thresholds for ci-deploy source", () => {
    const result = getSpawnThresholds("ci-deploy");
    expect(result).toEqual({ eventThreshold: 1, delayMinutes: 0 });
  });

  it("returns immediate thresholds for migration source", () => {
    const result = getSpawnThresholds("migration");
    expect(result).toEqual({ eventThreshold: 1, delayMinutes: 0 });
  });

  it("returns immediate thresholds for infrastructure source", () => {
    const result = getSpawnThresholds("infrastructure");
    expect(result).toEqual({ eventThreshold: 1, delayMinutes: 0 });
  });

  it("returns runtime thresholds for consumer-chat source", () => {
    const result = getSpawnThresholds("consumer-chat");
    expect(result.eventThreshold).toBe(5);
    expect(result.delayMinutes).toBe(5);
  });

  it("returns runtime thresholds for builder-chat source", () => {
    const result = getSpawnThresholds("builder-chat");
    expect(result.eventThreshold).toBe(5);
    expect(result.delayMinutes).toBe(5);
  });

  it("returns runtime thresholds for unknown source", () => {
    const result = getSpawnThresholds("some-random-source");
    expect(result.eventThreshold).toBe(5);
    expect(result.delayMinutes).toBe(5);
  });

  it("returns runtime thresholds when source is undefined", () => {
    const result = getSpawnThresholds(undefined);
    expect(result.eventThreshold).toBe(5);
    expect(result.delayMinutes).toBe(5);
  });

  it("returns runtime thresholds when source is empty string", () => {
    const result = getSpawnThresholds("");
    expect(result.eventThreshold).toBe(5);
    expect(result.delayMinutes).toBe(5);
  });
});

describe("hasEnoughEvents", () => {
  it("uses provided threshold override", async () => {
    mockQueryOne.mockResolvedValueOnce({ event_count: 3 });
    // 3 >= 3, should pass
    expect(await hasEnoughEvents("fp123", 3)).toBe(true);
  });

  it("rejects when below provided threshold", async () => {
    mockQueryOne.mockResolvedValueOnce({ event_count: 2 });
    // 2 >= 5, should fail
    expect(await hasEnoughEvents("fp123", 5)).toBe(false);
  });

  it("passes when at exact threshold", async () => {
    mockQueryOne.mockResolvedValueOnce({ event_count: 5 });
    expect(await hasEnoughEvents("fp123", 5)).toBe(true);
  });

  it("uses default threshold when none provided", async () => {
    // Default MIN_EVENT_COUNT_TO_SPAWN is 1
    mockQueryOne.mockResolvedValueOnce({ event_count: 1 });
    expect(await hasEnoughEvents("fp123")).toBe(true);
  });
});

describe("hasPassedSpawnDelay", () => {
  it("passes immediately with 0 delay override", async () => {
    mockQueryOne.mockResolvedValueOnce({
      created_at: new Date(), // just now
    });
    expect(await hasPassedSpawnDelay("fp123", 0)).toBe(true);
  });

  it("rejects when delay not passed", async () => {
    mockQueryOne.mockResolvedValueOnce({
      created_at: new Date(), // just now
    });
    // 5 minute delay, created just now -> should fail
    expect(await hasPassedSpawnDelay("fp123", 5)).toBe(false);
  });

  it("passes when delay has elapsed", async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    mockQueryOne.mockResolvedValueOnce({
      created_at: tenMinutesAgo,
    });
    // 5 minute delay, created 10 min ago -> should pass
    expect(await hasPassedSpawnDelay("fp123", 5)).toBe(true);
  });
});

describe("checkSpawnGate - source-aware behavior", () => {
  beforeEach(() => {
    // Clear any env overrides
    delete process.env.SPAWN_KILL_SWITCH;
  });

  it("allows immediate spawn for ci-deploy source with 1 event", async () => {
    // Not in cooldown
    mockQueryOne.mockResolvedValueOnce(null);
    // Has 1 event (enough for ci-deploy threshold of 1)
    mockQueryOne.mockResolvedValueOnce({ event_count: 1 });
    // Created just now (0 delay for ci-deploy)
    mockQueryOne.mockResolvedValueOnce({ created_at: new Date() });
    // Concurrency check
    mockQueryOne.mockResolvedValueOnce({ count: "0" });
    // Budget check
    mockQueryOne.mockResolvedValueOnce({ spawn_count: 0 });

    const result = await checkSpawnGate("fp123", "ci-deploy");
    expect(result.allowed).toBe(true);
  });

  it("blocks runtime source with only 1 event", async () => {
    // Not in cooldown
    mockQueryOne.mockResolvedValueOnce(null);
    // Has 1 event (not enough for runtime threshold of 5)
    mockQueryOne.mockResolvedValueOnce({ event_count: 1 });

    const result = await checkSpawnGate("fp123", "consumer-chat");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("below_event_threshold");
    expect(result.reason).toContain("need 5");
    expect(result.reason).toContain("consumer-chat");
  });

  it("allows runtime source after reaching threshold and delay", async () => {
    // Not in cooldown
    mockQueryOne.mockResolvedValueOnce(null);
    // Has 5 events (enough for runtime threshold)
    mockQueryOne.mockResolvedValueOnce({ event_count: 5 });
    // Created 10 min ago (past 5 min delay)
    mockQueryOne.mockResolvedValueOnce({
      created_at: new Date(Date.now() - 10 * 60 * 1000),
    });
    // Concurrency check
    mockQueryOne.mockResolvedValueOnce({ count: "0" });
    // Budget check
    mockQueryOne.mockResolvedValueOnce({ spawn_count: 0 });

    const result = await checkSpawnGate("fp123", "consumer-chat");
    expect(result.allowed).toBe(true);
  });

  it("blocks runtime source when delay not passed even with enough events", async () => {
    // Not in cooldown
    mockQueryOne.mockResolvedValueOnce(null);
    // Has 10 events
    mockQueryOne.mockResolvedValueOnce({ event_count: 10 });
    // Created just now (hasn't passed 5 min delay)
    mockQueryOne.mockResolvedValueOnce({ created_at: new Date() });

    const result = await checkSpawnGate("fp123", "builder-chat");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("spawn_delay");
    expect(result.reason).toContain("waiting 5m");
  });

  it("respects kill switch regardless of source", async () => {
    process.env.SPAWN_KILL_SWITCH = "true";
    const result = await checkSpawnGate("fp123", "ci-deploy");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("kill_switch");
  });

  it("respects cooldown regardless of source", async () => {
    // In cooldown
    mockQueryOne.mockResolvedValueOnce({
      cooldown_until: new Date(Date.now() + 60000),
    });

    const result = await checkSpawnGate("fp123", "ci-deploy");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("cooldown");
  });
});
