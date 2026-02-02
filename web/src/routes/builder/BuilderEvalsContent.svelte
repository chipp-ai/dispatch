<script lang="ts">
  import { onMount } from "svelte";
  import { Card, Input, Button, toasts } from "$lib/design-system";
  import {
    FlaskConical,
    Plus,
    Play,
    CheckCircle2,
    XCircle,
    Clock,
    Trash2,
    X,
    Loader2,
    Edit2,
    Save
  } from "lucide-svelte";

  export let appId: string;
  export let app: { id: string; name: string };

  // Selected evaluation for detail view
  let selectedEvalId: string | null = null;
  $: selectedEval = evaluations.find(e => e.id === selectedEvalId) || null;

  interface TestCase {
    id: string;
    input: string;
    expectedOutput: string;
    result?: 'passed' | 'failed' | null;
    actualOutput?: string;
  }

  interface Evaluation {
    id: string;
    name: string;
    status: 'passed' | 'failed' | 'pending' | 'running';
    lastRun: string | null;
    score: number | null;
    testCases: TestCase[];
  }

  let evaluations: Evaluation[] = [];

  // Create modal state
  let showCreateModal = false;
  let newEvalName = '';
  let newTestCases: { input: string; expectedOutput: string }[] = [{ input: '', expectedOutput: '' }];
  let isCreating = false;

  // Running evaluation state
  let runningEvalId: string | null = null;

  // Edit state
  let editingEvalId: string | null = null;
  let editingName = '';

  onMount(async () => {
    await loadEvaluations();
  });

  async function loadEvaluations() {
    try {
      const response = await fetch(`/api/applications/${appId}/evaluations`, {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        evaluations = result.data || [];
      }
    } catch (e) {
      console.error("Failed to load evaluations:", e);
    }
  }

  async function createEvaluation() {
    if (!newEvalName.trim()) return;

    const validTestCases = newTestCases.filter(tc => tc.input.trim() && tc.expectedOutput.trim());
    if (validTestCases.length === 0) return;

    isCreating = true;
    try {
      const response = await fetch(`/api/applications/${appId}/evaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newEvalName,
          testCases: validTestCases.map((tc, i) => ({
            id: `tc-${Date.now()}-${i}`,
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            result: null,
          })),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        evaluations = [...evaluations, result.data];
        selectedEvalId = result.data.id;
        closeCreateModal();
        toasts.success("Created", "Test suite created successfully");
      }
    } catch (e) {
      console.error("Failed to create evaluation:", e);
      toasts.error("Error", "Failed to create test suite");
    } finally {
      isCreating = false;
    }
  }

  async function runEvaluation(evalId: string) {
    runningEvalId = evalId;

    const evaluation = evaluations.find(e => e.id === evalId);

    evaluations = evaluations.map(e =>
      e.id === evalId ? { ...e, status: 'running' as const } : e
    );

    try {
      const response = await fetch(`/api/applications/${appId}/evaluations/${evalId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ testCases: evaluation?.testCases || [] }),
      });

      if (response.ok) {
        const result = await response.json();
        evaluations = evaluations.map(e =>
          e.id === evalId ? { ...e, ...result.data } : e
        );
        toasts.success("Complete", "Evaluation run completed");
      }
    } catch (e) {
      console.error("Failed to run evaluation:", e);
      evaluations = evaluations.map(e =>
        e.id === evalId ? { ...e, status: 'pending' as const } : e
      );
      toasts.error("Error", "Failed to run evaluation");
    } finally {
      runningEvalId = null;
    }
  }

  async function deleteEvaluation(evalId: string) {
    if (!confirm('Are you sure you want to delete this test suite?')) return;

    try {
      const response = await fetch(`/api/applications/${appId}/evaluations/${evalId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        evaluations = evaluations.filter(e => e.id !== evalId);
        if (selectedEvalId === evalId) {
          selectedEvalId = null;
        }
        toasts.success("Deleted", "Test suite deleted");
      }
    } catch (e) {
      console.error("Failed to delete evaluation:", e);
      toasts.error("Error", "Failed to delete test suite");
    }
  }

  function startEditing(evaluation: Evaluation) {
    editingEvalId = evaluation.id;
    editingName = evaluation.name;
  }

  async function saveEdit(evalId: string) {
    if (!editingName.trim()) return;

    evaluations = evaluations.map(e =>
      e.id === evalId ? { ...e, name: editingName } : e
    );
    editingEvalId = null;
    editingName = '';
  }

  function cancelEdit() {
    editingEvalId = null;
    editingName = '';
  }

  function closeCreateModal() {
    showCreateModal = false;
    newEvalName = '';
    newTestCases = [{ input: '', expectedOutput: '' }];
  }

  function addTestCase() {
    newTestCases = [...newTestCases, { input: '', expectedOutput: '' }];
  }

  function removeTestCase(index: number) {
    if (newTestCases.length > 1) {
      newTestCases = newTestCases.filter((_, i) => i !== index);
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'passed': return CheckCircle2;
      case 'failed': return XCircle;
      case 'running': return Loader2;
      default: return Clock;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'passed': return 'hsl(142 70% 40%)';
      case 'failed': return 'hsl(0 70% 50%)';
      case 'running': return 'hsl(var(--primary))';
      default: return 'hsl(var(--muted-foreground))';
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'passed': return 'Passed';
      case 'failed': return 'Failed';
      case 'running': return 'Running...';
      default: return 'Not run';
    }
  }

  // Stats
  $: totalTestCases = evaluations.reduce((sum, e) => sum + (e.testCases?.length || 0), 0);
  $: passedSuites = evaluations.filter(e => e.status === 'passed').length;
  $: avgScore = evaluations.length > 0
    ? Math.round(evaluations.filter(e => e.score !== null).reduce((sum, e) => sum + (e.score || 0), 0) / Math.max(evaluations.filter(e => e.score !== null).length, 1))
    : null;
</script>

<div class="split-panel-layout">
  <!-- Left Panel: Eval List -->
  <div class="left-panel">
    <div class="panel-header">
      <h2>Test Suites</h2>
      <Button variant="primary" size="sm" on:click={() => showCreateModal = true}>
        <Plus size={16} />
        Create
      </Button>
    </div>

    <!-- Eval List -->
    <div class="eval-list">
      {#if evaluations.length === 0}
        <div class="empty-list">
          <FlaskConical size={32} />
          <p>No evaluations yet</p>
          <span>Create your first test suite to get started</span>
        </div>
      {:else}
        {#each evaluations as evaluation (evaluation.id)}
          <button
            class="eval-item"
            class:selected={selectedEvalId === evaluation.id}
            on:click={() => selectedEvalId = evaluation.id}
          >
            <div
              class="eval-status-badge"
              style="color: {getStatusColor(evaluation.status)}"
              class:spinning={evaluation.status === 'running'}
            >
              <svelte:component this={getStatusIcon(evaluation.status)} size={18} />
            </div>
            <div class="eval-info">
              <span class="eval-name">{evaluation.name}</span>
              <span class="eval-meta">
                {evaluation.testCases?.length || 0} test cases
                {#if evaluation.score !== null}
                  • {evaluation.score}%
                {/if}
              </span>
            </div>
          </button>
        {/each}
      {/if}
    </div>

    <!-- Stats -->
    {#if evaluations.length > 0}
      <div class="stats-section">
        <div class="stat-row">
          <span class="stat-label">Total Suites</span>
          <span class="stat-value">{evaluations.length}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Test Cases</span>
          <span class="stat-value">{totalTestCases}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Passing</span>
          <span class="stat-value">{passedSuites}</span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Right Panel: Eval Detail or Empty State -->
  <div class="right-panel">
    {#if selectedEval}
      <div class="eval-detail">
        <div class="detail-header">
          {#if editingEvalId === selectedEval.id}
            <div class="edit-form-inline">
              <Input bind:value={editingName} placeholder="Suite name" />
              <div class="edit-actions">
                <Button variant="ghost" size="sm" on:click={cancelEdit}>Cancel</Button>
                <Button variant="primary" size="sm" on:click={() => saveEdit(selectedEval.id)}>Save</Button>
              </div>
            </div>
          {:else}
            <div class="detail-title">
              <div class="title-row">
                <div
                  class="status-icon"
                  style="color: {getStatusColor(selectedEval.status)}"
                  class:spinning={selectedEval.status === 'running'}
                >
                  <svelte:component this={getStatusIcon(selectedEval.status)} size={24} />
                </div>
                <h2>{selectedEval.name}</h2>
              </div>
              <div class="detail-actions">
                <Button variant="ghost" size="sm" on:click={() => startEditing(selectedEval)}>
                  <Edit2 size={14} />
                  Edit
                </Button>
                <Button variant="ghost" size="sm" on:click={() => deleteEvaluation(selectedEval.id)}>
                  <Trash2 size={14} />
                  Delete
                </Button>
              </div>
            </div>
          {/if}
        </div>

        <!-- Stats Cards -->
        <div class="detail-stats">
          <Card padding="md" class="detail-stat-card">
            <div class="detail-stat-value">{selectedEval.testCases?.length || 0}</div>
            <div class="detail-stat-label">Test Cases</div>
          </Card>
          <Card padding="md" class="detail-stat-card">
            <div class="detail-stat-value" class:good={selectedEval.score !== null && selectedEval.score >= 80} class:bad={selectedEval.score !== null && selectedEval.score < 50}>
              {selectedEval.score !== null ? `${selectedEval.score}%` : '—'}
            </div>
            <div class="detail-stat-label">Pass Rate</div>
          </Card>
          <Card padding="md" class="detail-stat-card">
            <div class="detail-stat-value">{getStatusLabel(selectedEval.status)}</div>
            <div class="detail-stat-label">Status</div>
          </Card>
        </div>

        <!-- Run Button -->
        <div class="run-section">
          <Button
            variant="primary"
            on:click={() => runEvaluation(selectedEval.id)}
            disabled={runningEvalId === selectedEval.id}
          >
            {#if runningEvalId === selectedEval.id}
              <Loader2 size={16} class="spinning" />
              Running...
            {:else}
              <Play size={16} />
              Run Evaluation
            {/if}
          </Button>
          {#if selectedEval.lastRun}
            <span class="last-run">Last run: {new Date(selectedEval.lastRun).toLocaleDateString()}</span>
          {/if}
        </div>

        <!-- Test Cases -->
        {#if selectedEval.testCases?.length > 0}
          <Card padding="md" class="test-cases-card">
            <h3>Test Cases</h3>
            <div class="test-cases">
              <div class="test-cases-header">
                <span>Input</span>
                <span>Expected Output</span>
                <span>Result</span>
              </div>
              {#each selectedEval.testCases as testCase (testCase.id)}
                <div class="test-case-row" class:passed={testCase.result === 'passed'} class:failed={testCase.result === 'failed'}>
                  <div class="test-input">{testCase.input}</div>
                  <div class="test-expected">{testCase.expectedOutput}</div>
                  <div class="test-result">
                    {#if testCase.result === 'passed'}
                      <CheckCircle2 size={16} style="color: hsl(142 70% 40%)" />
                    {:else if testCase.result === 'failed'}
                      <XCircle size={16} style="color: hsl(0 70% 50%)" />
                    {:else}
                      <Clock size={16} style="color: hsl(var(--muted-foreground))" />
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </Card>
        {/if}
      </div>
    {:else}
      <div class="empty-state">
        <div class="empty-icon">
          <FlaskConical size={48} />
        </div>
        <h3>Select an evaluation</h3>
        <p>Choose a test suite from the list to view details and run tests</p>
      </div>
    {/if}
  </div>
</div>

<!-- Create Test Suite Modal -->
{#if showCreateModal}
  <div class="modal-overlay" on:click={closeCreateModal} on:keydown={(e) => e.key === 'Escape' && closeCreateModal()}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h2>Create Test Suite</h2>
        <button class="close-btn" on:click={closeCreateModal}>
          <X size={20} />
        </button>
      </div>

      <div class="modal-body">
        <div class="form-group">
          <label for="eval-name">Suite Name</label>
          <Input
            id="eval-name"
            bind:value={newEvalName}
            placeholder="e.g., Customer Support Responses"
          />
        </div>

        <div class="form-group">
          <label>Test Cases</label>
          <p class="form-hint">Define input prompts and expected response criteria</p>

          <div class="test-cases-form">
            {#each newTestCases as testCase, index}
              <div class="test-case-form-row">
                <div class="test-case-inputs">
                  <textarea
                    bind:value={testCase.input}
                    placeholder="User input / prompt"
                    rows="2"
                  ></textarea>
                  <textarea
                    bind:value={testCase.expectedOutput}
                    placeholder="Expected response should contain..."
                    rows="2"
                  ></textarea>
                </div>
                {#if newTestCases.length > 1}
                  <button class="remove-case-btn" on:click={() => removeTestCase(index)}>
                    <X size={16} />
                  </button>
                {/if}
              </div>
            {/each}

            <button class="add-case-btn" on:click={addTestCase}>
              <Plus size={16} />
              Add Test Case
            </button>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <Button variant="ghost" on:click={closeCreateModal}>Cancel</Button>
        <Button
          variant="default"
          on:click={createEvaluation}
          disabled={!newEvalName.trim() || !newTestCases.some(tc => tc.input.trim() && tc.expectedOutput.trim()) || isCreating}
        >
          {#if isCreating}
            <Loader2 size={16} class="spinning" />
          {/if}
          Create Suite
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .split-panel-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Left Panel */
  .left-panel {
    width: 320px;
    min-width: 280px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid hsl(var(--border));
    background: hsl(var(--background));
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4);
    border-bottom: 1px solid hsl(var(--border));
  }

  .panel-header h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
  }

  .eval-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
  }

  .empty-list {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-8) var(--space-4);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .empty-list p {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .empty-list span {
    font-size: var(--text-sm);
  }

  .eval-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .eval-item:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .eval-item.selected {
    background: hsl(var(--primary) / 0.1);
  }

  .eval-status-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: hsl(var(--muted) / 0.5);
    flex-shrink: 0;
  }

  .eval-status-badge.spinning :global(svg) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .eval-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .eval-name {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .eval-meta {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .stats-section {
    padding: var(--space-4);
    border-top: 1px solid hsl(var(--border));
    background: hsl(var(--muted) / 0.3);
  }

  .stat-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-1) 0;
  }

  .stat-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .stat-value {
    font-weight: var(--font-semibold);
  }

  /* Right Panel */
  .right-panel {
    flex: 1;
    overflow-y: auto;
    background: hsl(var(--muted) / 0.2);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
    text-align: center;
    padding: var(--space-8);
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    border-radius: var(--radius-lg);
    background: hsl(var(--muted) / 0.5);
  }

  .empty-state h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
  }

  .empty-state p {
    font-size: var(--text-sm);
    margin: 0;
  }

  .eval-detail {
    padding: var(--space-6);
    max-width: 800px;
  }

  .detail-header {
    margin-bottom: var(--space-6);
  }

  .detail-title {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .title-row h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    margin: 0;
  }

  .status-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .status-icon.spinning :global(svg) {
    animation: spin 1s linear infinite;
  }

  .detail-actions {
    display: flex;
    gap: var(--space-2);
  }

  .edit-form-inline {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  /* Detail Stats */
  .detail-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  :global(.detail-stat-card) {
    text-align: center;
  }

  .detail-stat-value {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-1);
  }

  .detail-stat-value.good {
    color: hsl(142 70% 40%);
  }

  .detail-stat-value.bad {
    color: hsl(0 70% 50%);
  }

  .detail-stat-label {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  /* Run Section */
  .run-section {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .run-section :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  .last-run {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  /* Test Cases Card */
  :global(.test-cases-card) {
    margin-bottom: var(--space-4);
  }

  :global(.test-cases-card) h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-4) 0;
  }

  .test-cases {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .test-cases-header {
    display: grid;
    grid-template-columns: 1fr 1fr 60px;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    background: hsl(var(--muted) / 0.3);
    border-bottom: 1px solid hsl(var(--border));
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
  }

  .test-case-row {
    display: grid;
    grid-template-columns: 1fr 1fr 60px;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid hsl(var(--border) / 0.5);
    font-size: var(--text-sm);
  }

  .test-case-row:last-child {
    border-bottom: none;
  }

  .test-case-row.passed {
    background: hsl(142 70% 40% / 0.05);
  }

  .test-case-row.failed {
    background: hsl(0 70% 50% / 0.05);
  }

  .test-input, .test-expected {
    color: hsl(var(--foreground));
    word-break: break-word;
  }

  .test-result {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: hsl(var(--card));
    border-radius: var(--radius-lg);
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid hsl(var(--border));
  }

  .modal-header h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
  }

  .close-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .modal-body {
    flex: 1;
    padding: var(--space-6);
    overflow-y: auto;
  }

  .form-group {
    margin-bottom: var(--space-5);
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-group label {
    display: block;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    margin-bottom: var(--space-2);
    color: hsl(var(--foreground));
  }

  .form-hint {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0 0 var(--space-3) 0;
  }

  .test-cases-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .test-case-form-row {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-3);
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius-md);
  }

  .test-case-inputs {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .test-case-inputs textarea {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-sm);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    resize: vertical;
    font-family: inherit;
  }

  .test-case-inputs textarea::placeholder {
    color: hsl(var(--muted-foreground));
  }

  .remove-case-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    align-self: flex-start;
    margin-top: var(--space-2);
  }

  .remove-case-btn:hover {
    background: hsl(0 70% 50% / 0.1);
    color: hsl(0 70% 50%);
  }

  .add-case-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: 1px dashed hsl(var(--border));
    border-radius: var(--radius-md);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    font-size: var(--text-sm);
  }

  .add-case-btn:hover {
    border-color: hsl(var(--primary));
    color: hsl(var(--primary));
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid hsl(var(--border));
  }

  .modal-footer :global(.spinning) {
    animation: spin 1s linear infinite;
  }

  @media (max-width: 768px) {
    .split-panel-layout {
      flex-direction: column;
    }

    .left-panel {
      width: 100%;
      min-width: unset;
      max-height: 50vh;
      border-right: none;
      border-bottom: 1px solid hsl(var(--border));
    }

    .right-panel {
      flex: 1;
    }

    .detail-stats {
      grid-template-columns: 1fr;
    }

    .test-cases-header,
    .test-case-row {
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }

    .test-cases-header span:last-child,
    .test-result {
      display: none;
    }
  }
</style>
