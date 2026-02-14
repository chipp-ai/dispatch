/**
 * Tests for internalSlackService
 *
 * Verifies internal Slack notifications for the agent lifecycle:
 * - New error creates top-level message
 * - Agent started posts thread reply
 * - Agent completed posts thread reply with outcome details
 * - Respects NOTIFICATIONS_ENABLED flag
 * - Bails silently when INTERNAL_SLACK_CHANNEL_ID is not set
 */

// Mock Slack WebClient
const mockPostMessage = jest.fn();
jest.mock("@slack/web-api", () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

// Mock database
const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    query: (...args: unknown[]) => mockQuery(...args),
    queryOne: (...args: unknown[]) => mockQueryOne(...args),
  },
}));

describe("internalSlackService", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockPostMessage.mockReset();
    mockQuery.mockReset();
    mockQueryOne.mockReset();
    process.env = {
      ...originalEnv,
      SLACK_BOT_TOKEN: "xoxb-test-token",
      INTERNAL_SLACK_CHANNEL_ID: "C0AFDHR8X4Z",
      NOTIFICATIONS_ENABLED: "true",
      NEXT_PUBLIC_APP_URL: "https://issues.chipp.ai",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  async function loadService() {
    return await import("@/lib/services/internalSlackService");
  }

  // -------------------------------------------------------------------------
  // notifyInternalNewError
  // -------------------------------------------------------------------------

  describe("notifyInternalNewError", () => {
    const params = {
      issueId: "issue-abc",
      identifier: "DISPATCH-42",
      title: "Tool execution timeout",
      priority: "P2",
      source: "copilot",
      feature: "server-tools",
      eventCount: 15,
    };

    it("posts a top-level message to the internal channel", async () => {
      mockPostMessage.mockResolvedValueOnce({ ok: true, ts: "1234567890.123456" });
      mockQuery.mockResolvedValueOnce(undefined);

      const { notifyInternalNewError } = await loadService();
      await notifyInternalNewError(params);

      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      const call = mockPostMessage.mock.calls[0][0];
      expect(call.channel).toBe("C0AFDHR8X4Z");
      expect(call.text).toContain("DISPATCH-42");
      expect(call.text).toContain("[copilot/server-tools]");
      expect(call.text).toContain("Tool execution timeout");
      expect(call.text).toContain("P2");
      expect(call.text).toContain("15 events");
      expect(call.text).toContain("View in Dispatch");
      expect(call.text).toContain("https://issues.chipp.ai/issue/DISPATCH-42");
      // Top-level message: no thread_ts
      expect(call.thread_ts).toBeUndefined();
      expect(call.unfurl_links).toBe(false);
    });

    it("stores internal_slack_ts on the issue when message succeeds", async () => {
      mockPostMessage.mockResolvedValueOnce({ ok: true, ts: "1234567890.123456" });
      mockQuery.mockResolvedValueOnce(undefined);

      const { notifyInternalNewError } = await loadService();
      await notifyInternalNewError(params);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE dispatch_issue SET internal_slack_ts"),
        ["1234567890.123456", "issue-abc"]
      );
    });

    it("does not store ts when Slack returns no ts", async () => {
      mockPostMessage.mockResolvedValueOnce({ ok: true });

      const { notifyInternalNewError } = await loadService();
      await notifyInternalNewError(params);

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("uses correct priority emoji for P1", async () => {
      mockPostMessage.mockResolvedValueOnce({ ok: true, ts: "123" });
      mockQuery.mockResolvedValueOnce(undefined);

      const { notifyInternalNewError } = await loadService();
      await notifyInternalNewError({ ...params, priority: "P1" });

      const text = mockPostMessage.mock.calls[0][0].text;
      expect(text).toContain(":rotating_light:");
    });

    it("handles singular event count", async () => {
      mockPostMessage.mockResolvedValueOnce({ ok: true, ts: "123" });
      mockQuery.mockResolvedValueOnce(undefined);

      const { notifyInternalNewError } = await loadService();
      await notifyInternalNewError({ ...params, eventCount: 1 });

      const text = mockPostMessage.mock.calls[0][0].text;
      expect(text).toContain("1 event");
      expect(text).not.toContain("1 events");
    });
  });

  // -------------------------------------------------------------------------
  // notifyInternalAgentStarted
  // -------------------------------------------------------------------------

  describe("notifyInternalAgentStarted", () => {
    const params = {
      issueId: "issue-abc",
      identifier: "DISPATCH-42",
      spawnType: "error_fix",
    };

    it("posts a thread reply when internal_slack_ts exists", async () => {
      mockQueryOne.mockResolvedValueOnce({ internal_slack_ts: "1234567890.123456" });
      mockPostMessage.mockResolvedValueOnce({ ok: true });

      const { notifyInternalAgentStarted } = await loadService();
      await notifyInternalAgentStarted(params);

      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      const call = mockPostMessage.mock.calls[0][0];
      expect(call.channel).toBe("C0AFDHR8X4Z");
      expect(call.thread_ts).toBe("1234567890.123456");
      expect(call.text).toContain("Agent started");
      expect(call.text).toContain("error_fix");
    });

    it("does nothing when no internal_slack_ts on issue", async () => {
      mockQueryOne.mockResolvedValueOnce({ internal_slack_ts: null });

      const { notifyInternalAgentStarted } = await loadService();
      await notifyInternalAgentStarted(params);

      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it("does nothing when issue not found", async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const { notifyInternalAgentStarted } = await loadService();
      await notifyInternalAgentStarted(params);

      expect(mockPostMessage).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // notifyInternalAgentCompleted
  // -------------------------------------------------------------------------

  describe("notifyInternalAgentCompleted", () => {
    it("posts a success thread reply with outcome details", async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          internal_slack_ts: "1234567890.123456",
          identifier: "DISPATCH-42",
          spawn_status: "completed",
          outcome_summary: "Identified root cause in billing webhook handler",
          cost_usd: 0.42,
          run_outcome: "success",
        })
        .mockResolvedValueOnce({
          pr_url: "https://github.com/chipp-ai/chipp-deno/pull/234",
        });

      mockPostMessage.mockResolvedValueOnce({ ok: true });

      const { notifyInternalAgentCompleted } = await loadService();
      await notifyInternalAgentCompleted("issue-abc");

      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      const call = mockPostMessage.mock.calls[0][0];
      expect(call.channel).toBe("C0AFDHR8X4Z");
      expect(call.thread_ts).toBe("1234567890.123456");
      expect(call.text).toContain(":white_check_mark:");
      expect(call.text).toContain("Investigation complete");
      expect(call.text).toContain("Identified root cause");
      expect(call.text).toContain("https://github.com/chipp-ai/chipp-deno/pull/234");
      expect(call.text).toContain("$0.42");
    });

    it("posts a failure thread reply when spawn_status is failed", async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          internal_slack_ts: "1234567890.123456",
          identifier: "DISPATCH-42",
          spawn_status: "failed",
          outcome_summary: "Could not reproduce the error",
          cost_usd: 0.15,
          run_outcome: "failed",
        })
        .mockResolvedValueOnce({ pr_url: null });

      mockPostMessage.mockResolvedValueOnce({ ok: true });

      const { notifyInternalAgentCompleted } = await loadService();
      await notifyInternalAgentCompleted("issue-abc");

      const call = mockPostMessage.mock.calls[0][0];
      expect(call.text).toContain(":x:");
      expect(call.text).toContain("Investigation failed");
      expect(call.text).toContain("Could not reproduce");
      expect(call.text).not.toContain("PR:");
    });

    it("omits PR line when no PR exists", async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          internal_slack_ts: "1234567890.123456",
          identifier: "DISPATCH-42",
          spawn_status: "completed",
          outcome_summary: "Fixed it",
          cost_usd: 0.1,
          run_outcome: "success",
        })
        .mockResolvedValueOnce(null); // no PR

      mockPostMessage.mockResolvedValueOnce({ ok: true });

      const { notifyInternalAgentCompleted } = await loadService();
      await notifyInternalAgentCompleted("issue-abc");

      const text = mockPostMessage.mock.calls[0][0].text;
      expect(text).not.toContain("PR:");
    });

    it("omits cost line when cost is 0", async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          internal_slack_ts: "1234567890.123456",
          identifier: "DISPATCH-42",
          spawn_status: "completed",
          outcome_summary: null,
          cost_usd: 0,
          run_outcome: "success",
        })
        .mockResolvedValueOnce(null);

      mockPostMessage.mockResolvedValueOnce({ ok: true });

      const { notifyInternalAgentCompleted } = await loadService();
      await notifyInternalAgentCompleted("issue-abc");

      const text = mockPostMessage.mock.calls[0][0].text;
      expect(text).not.toContain("Cost:");
    });

    it("does nothing when no internal_slack_ts", async () => {
      mockQueryOne.mockResolvedValueOnce({
        internal_slack_ts: null,
        identifier: "DISPATCH-42",
        spawn_status: "completed",
        outcome_summary: null,
        cost_usd: null,
        run_outcome: null,
      });

      const { notifyInternalAgentCompleted } = await loadService();
      await notifyInternalAgentCompleted("issue-abc");

      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it("does nothing when issue not found", async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const { notifyInternalAgentCompleted } = await loadService();
      await notifyInternalAgentCompleted("issue-abc");

      expect(mockPostMessage).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Guard: NOTIFICATIONS_ENABLED=false
  // -------------------------------------------------------------------------

  describe("when NOTIFICATIONS_ENABLED=false", () => {
    beforeEach(() => {
      process.env.NOTIFICATIONS_ENABLED = "false";
    });

    it("notifyInternalNewError does nothing", async () => {
      const { notifyInternalNewError } = await loadService();
      await notifyInternalNewError({
        issueId: "x",
        identifier: "D-1",
        title: "test",
        priority: "P3",
        source: "test",
        feature: "test",
        eventCount: 1,
      });
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it("notifyInternalAgentStarted does nothing", async () => {
      const { notifyInternalAgentStarted } = await loadService();
      await notifyInternalAgentStarted({
        issueId: "x",
        identifier: "D-1",
        spawnType: "error_fix",
      });
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it("notifyInternalAgentCompleted does nothing", async () => {
      const { notifyInternalAgentCompleted } = await loadService();
      await notifyInternalAgentCompleted("x");
      expect(mockPostMessage).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Guard: No INTERNAL_SLACK_CHANNEL_ID
  // -------------------------------------------------------------------------

  describe("when INTERNAL_SLACK_CHANNEL_ID is not set", () => {
    beforeEach(() => {
      delete process.env.INTERNAL_SLACK_CHANNEL_ID;
    });

    it("notifyInternalNewError does nothing", async () => {
      const { notifyInternalNewError } = await loadService();
      await notifyInternalNewError({
        issueId: "x",
        identifier: "D-1",
        title: "test",
        priority: "P3",
        source: "test",
        feature: "test",
        eventCount: 1,
      });
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it("notifyInternalAgentStarted does nothing", async () => {
      const { notifyInternalAgentStarted } = await loadService();
      await notifyInternalAgentStarted({
        issueId: "x",
        identifier: "D-1",
        spawnType: "error_fix",
      });
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it("notifyInternalAgentCompleted does nothing", async () => {
      const { notifyInternalAgentCompleted } = await loadService();
      await notifyInternalAgentCompleted("x");
      expect(mockPostMessage).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Guard: No SLACK_BOT_TOKEN
  // -------------------------------------------------------------------------

  describe("when SLACK_BOT_TOKEN is not set", () => {
    beforeEach(() => {
      delete process.env.SLACK_BOT_TOKEN;
    });

    it("notifyInternalNewError does nothing", async () => {
      const { notifyInternalNewError } = await loadService();
      await notifyInternalNewError({
        issueId: "x",
        identifier: "D-1",
        title: "test",
        priority: "P3",
        source: "test",
        feature: "test",
        eventCount: 1,
      });
      expect(mockPostMessage).not.toHaveBeenCalled();
    });
  });
});
