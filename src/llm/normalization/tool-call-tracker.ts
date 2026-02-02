/**
 * Tool Call ID Tracker
 *
 * Maintains tool call ID correlation for providers that don't provide IDs (Google).
 *
 * Google's API doesn't include tool call IDs - it correlates tool results by function name.
 * When we need to convert from Google format to unified format (or to other providers),
 * we need to generate IDs and maintain the correlation.
 *
 * This tracker:
 * 1. Generates deterministic IDs when decoding Google tool calls
 * 2. Tracks the mapping between generated IDs and function names
 * 3. Enables correlation of tool results when converting between formats
 */

/**
 * Tool call tracking entry
 */
export interface ToolCallEntry {
  /** Generated unique ID for this tool call */
  id: string;
  /** Name of the function being called */
  functionName: string;
  /** Sequence number for this function (if called multiple times) */
  sequence: number;
  /** Timestamp when this tool call was tracked */
  timestamp: number;
}

/**
 * Tool Call ID Tracker
 *
 * Tracks tool call IDs for providers (like Google) that don't provide them.
 * Enables correlation of tool results with tool calls across format conversions.
 */
export class ToolCallTracker {
  private callsByName: Map<string, ToolCallEntry[]> = new Map();
  private callsById: Map<string, ToolCallEntry> = new Map();
  private sequenceByName: Map<string, number> = new Map();

  /**
   * Generate a unique ID for a tool call
   *
   * Uses a deterministic format: call_{functionName}_{sequence}_{timestamp}_{random}
   * This ensures uniqueness while maintaining some predictability for debugging.
   */
  generateId(functionName: string): string {
    const sequence = (this.sequenceByName.get(functionName) || 0) + 1;
    this.sequenceByName.set(functionName, sequence);

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);

    const id = `call_${this.sanitizeName(functionName)}_${sequence}_${timestamp}_${random}`;

    // Track this call
    const entry: ToolCallEntry = {
      id,
      functionName,
      sequence,
      timestamp,
    };

    // Store by name
    const byName = this.callsByName.get(functionName) || [];
    byName.push(entry);
    this.callsByName.set(functionName, byName);

    // Store by ID
    this.callsById.set(id, entry);

    return id;
  }

  /**
   * Correlate a tool result to a tool call by function name
   *
   * When converting tool results from a format that uses names (Google) to one
   * that uses IDs (OpenAI, Anthropic), we need to find the matching tool call ID.
   *
   * This uses FIFO correlation - the first unmatched tool call with the given name
   * is considered the match.
   *
   * @param functionName - The name of the function
   * @returns The tool call ID if found, undefined otherwise
   */
  correlate(functionName: string): string | undefined {
    const calls = this.callsByName.get(functionName);
    if (!calls || calls.length === 0) {
      return undefined;
    }

    // Return the first (oldest) call for this function name
    // Caller should call markUsed() after processing
    return calls[0].id;
  }

  /**
   * Mark a tool call as used (result received)
   *
   * This removes the call from the FIFO queue, allowing subsequent
   * calls with the same function name to be correlated.
   *
   * @param id - The tool call ID to mark as used
   */
  markUsed(id: string): void {
    const entry = this.callsById.get(id);
    if (!entry) {
      return;
    }

    // Remove from by-name list
    const byName = this.callsByName.get(entry.functionName);
    if (byName) {
      const index = byName.findIndex((e) => e.id === id);
      if (index !== -1) {
        byName.splice(index, 1);
      }
      if (byName.length === 0) {
        this.callsByName.delete(entry.functionName);
      }
    }

    // Remove from by-id map
    this.callsById.delete(id);
  }

  /**
   * Get a tool call entry by ID
   */
  getById(id: string): ToolCallEntry | undefined {
    return this.callsById.get(id);
  }

  /**
   * Get all pending tool calls for a function name
   */
  getByName(functionName: string): ToolCallEntry[] {
    return this.callsByName.get(functionName) || [];
  }

  /**
   * Check if there are pending (uncorrelated) tool calls
   */
  hasPendingCalls(): boolean {
    return this.callsById.size > 0;
  }

  /**
   * Get count of pending tool calls
   */
  getPendingCount(): number {
    return this.callsById.size;
  }

  /**
   * Reset tracker state
   *
   * Call this when starting a new conversation or request.
   */
  reset(): void {
    this.callsByName.clear();
    this.callsById.clear();
    this.sequenceByName.clear();
  }

  /**
   * Sanitize function name for use in ID
   */
  private sanitizeName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .substring(0, 32)
      .toLowerCase();
  }
}

/**
 * Singleton tracker for session-scoped correlation
 *
 * Note: For multi-request scenarios (concurrent conversations), you should
 * create separate tracker instances per conversation/session.
 */
export const globalToolCallTracker = new ToolCallTracker();

/**
 * Create a new tool call tracker instance
 */
export function createToolCallTracker(): ToolCallTracker {
  return new ToolCallTracker();
}
