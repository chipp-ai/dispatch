<script lang="ts">
  import { onMount } from "svelte";
  import { Card, toasts } from "$lib/design-system";
  import { MessageSquare, Users, Clock, TrendingUp, BarChart3 } from "lucide-svelte";

  export let appId: string;
  export let app: { id: string; name: string };

  // Metrics data
  interface ChatSession {
    id: string;
    consumer_id: string | null;
    source: string;
    started_at: string;
    ended_at: string | null;
  }

  let sessions: ChatSession[] = [];
  let isLoading = true;

  // Computed metrics
  $: totalSessions = sessions.length;
  $: uniqueUsers = new Set(sessions.filter(s => s.consumer_id).map(s => s.consumer_id)).size;
  $: avgDuration = calculateAvgDuration();
  $: sessionsBySource = calculateSessionsBySource();

  function calculateAvgDuration(): number {
    const completedSessions = sessions.filter(s => s.ended_at);
    if (completedSessions.length === 0) return 0;

    const totalMinutes = completedSessions.reduce((sum, s) => {
      const duration = (new Date(s.ended_at!).getTime() - new Date(s.started_at).getTime()) / 60000;
      return sum + duration;
    }, 0);

    return Math.round(totalMinutes / completedSessions.length);
  }

  function calculateSessionsBySource(): { source: string; count: number; percentage: number }[] {
    const counts: Record<string, number> = {};
    sessions.forEach(s => {
      counts[s.source] = (counts[s.source] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([source, count]) => ({
        source,
        count,
        percentage: Math.round((count / sessions.length) * 100) || 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  onMount(async () => {
    await loadSessions();
  });

  async function loadSessions() {
    if (!appId) return;

    try {
      isLoading = true;
      // Fetch a larger batch for metrics calculation
      const response = await fetch(
        `/api/chat/${appId}/sessions?limit=100`,
        { credentials: "include" }
      );

      if (!response.ok) {
        throw new Error("Failed to load sessions");
      }

      const result = await response.json();
      sessions = result.data;
    } catch (e) {
      console.error("Failed to load sessions:", e);
      toasts.error("Error", "Failed to load metrics data");
    } finally {
      isLoading = false;
    }
  }

  function getSourceColor(source: string): string {
    switch (source) {
      case "APP": return "hsl(var(--primary))";
      case "API": return "hsl(220, 70%, 50%)";
      case "WHATSAPP": return "hsl(142, 70%, 40%)";
      case "SLACK": return "hsl(300, 70%, 40%)";
      case "EMAIL": return "hsl(30, 70%, 50%)";
      default: return "hsl(var(--muted-foreground))";
    }
  }
</script>

<div class="metrics-content">
  {#if isLoading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading metrics...</p>
    </div>
  {:else}
    <!-- Stats Cards -->
    <div class="stats-grid">
      <Card padding="lg" class="stat-card">
        <div class="stat-icon">
          <MessageSquare size={24} />
        </div>
        <div class="stat-info">
          <span class="stat-value">{totalSessions}</span>
          <span class="stat-label">Total Sessions</span>
        </div>
      </Card>

      <Card padding="lg" class="stat-card">
        <div class="stat-icon users">
          <Users size={24} />
        </div>
        <div class="stat-info">
          <span class="stat-value">{uniqueUsers}</span>
          <span class="stat-label">Unique Users</span>
        </div>
      </Card>

      <Card padding="lg" class="stat-card">
        <div class="stat-icon clock">
          <Clock size={24} />
        </div>
        <div class="stat-info">
          <span class="stat-value">{avgDuration} min</span>
          <span class="stat-label">Avg Duration</span>
        </div>
      </Card>

      <Card padding="lg" class="stat-card">
        <div class="stat-icon trending">
          <TrendingUp size={24} />
        </div>
        <div class="stat-info">
          <span class="stat-value">{sessions.filter(s => {
            const date = new Date(s.started_at);
            const now = new Date();
            return date > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          }).length}</span>
          <span class="stat-label">Last 7 Days</span>
        </div>
      </Card>
    </div>

    <!-- Sessions by Source -->
    <Card padding="lg" class="chart-card">
      <div class="chart-header">
        <BarChart3 size={20} />
        <h3>Sessions by Source</h3>
      </div>

      {#if sessionsBySource.length === 0}
        <p class="no-data">No session data available</p>
      {:else}
        <div class="bar-chart">
          {#each sessionsBySource as { source, count, percentage }}
            <div class="bar-row">
              <div class="bar-label">
                <span class="source-name">{source}</span>
                <span class="source-count">{count} ({percentage}%)</span>
              </div>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  style="width: {percentage}%; background-color: {getSourceColor(source)}"
                ></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </Card>

    <!-- Recent Activity -->
    <Card padding="lg" class="chart-card">
      <div class="chart-header">
        <Clock size={20} />
        <h3>Recent Activity</h3>
      </div>

      {#if sessions.length === 0}
        <p class="no-data">No recent activity</p>
      {:else}
        <div class="activity-list">
          {#each sessions.slice(0, 10) as session}
            <div class="activity-item">
              <div class="activity-dot" style="background-color: {getSourceColor(session.source)}"></div>
              <div class="activity-info">
                <span class="activity-source">{session.source}</span>
                <span class="activity-time">
                  {new Date(session.started_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </Card>
  {/if}
</div>

<style>
  .metrics-content {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    gap: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid hsl(var(--border));
    border-top-color: hsl(var(--primary));
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .stat-card :global(.card) {
    background: hsl(var(--card));
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg);
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
    flex-shrink: 0;
  }

  .stat-icon.users {
    background: hsl(142 70% 40% / 0.1);
    color: hsl(142 70% 40%);
  }

  .stat-icon.clock {
    background: hsl(220 70% 50% / 0.1);
    color: hsl(220 70% 50%);
  }

  .stat-icon.trending {
    background: hsl(30 70% 50% / 0.1);
    color: hsl(30 70% 50%);
  }

  .stat-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .stat-value {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
  }

  .stat-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .chart-card {
    margin-bottom: var(--space-4);
  }

  .chart-card :global(.card) {
    background: hsl(var(--card));
  }

  .chart-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    color: hsl(var(--foreground));
  }

  .chart-header h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
  }

  .no-data {
    text-align: center;
    color: hsl(var(--muted-foreground));
    font-style: italic;
    padding: var(--space-8) 0;
  }

  .bar-chart {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .bar-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .bar-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-sm);
  }

  .source-name {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .source-count {
    color: hsl(var(--muted-foreground));
  }

  .bar-track {
    height: 8px;
    background: hsl(var(--muted));
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: var(--radius-full);
    transition: width 0.3s ease;
  }

  .activity-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .activity-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: 1px solid hsl(var(--border) / 0.5);
  }

  .activity-item:last-child {
    border-bottom: none;
  }

  .activity-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .activity-info {
    display: flex;
    justify-content: space-between;
    flex: 1;
    font-size: var(--text-sm);
  }

  .activity-source {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  .activity-time {
    color: hsl(var(--muted-foreground));
  }

  @media (max-width: 768px) {
    .metrics-content {
      padding: var(--space-4);
    }

    .stats-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
