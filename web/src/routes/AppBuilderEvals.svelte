<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import BuilderSidebar from "../lib/design-system/components/builder/BuilderSidebar.svelte";
  import BuilderHeader from "../lib/design-system/components/builder/BuilderHeader.svelte";
  import { Card, Input, Button } from "$lib/design-system";
  import {
    FlaskConical,
    Plus,
    Play,
    CheckCircle2,
    XCircle,
    Clock,
    Trash2,
    X,
    ChevronDown,
    ChevronUp,
    Loader2,
    Edit2,
    Save
  } from "lucide-svelte";
  import { captureException } from "$lib/sentry";

  export let params: { appId?: string } = {};

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

  interface App {
    id: string;
    name: string;
  }

  let app: App | null = null;
  let isLoading = true;
  let evaluations: Evaluation[] = [];

  // Create modal state
  let showCreateModal = false;
  let newEvalName = '';
  let newTestCases: { input: string; expectedOutput: string }[] = [{ input: '', expectedOutput: '' }];
  let isCreating = false;

  // Expanded evaluation state
  let expandedEvalId: string | null = null;

  // Running evaluation state
  let runningEvalId: string | null = null;

  // Edit state
  let editingEvalId: string | null = null;
  let editingName = '';

  // Selected eval for detail view
  let selectedEvalId: string | null = null;
  $: selectedEval = evaluations.find(e => e.id === selectedEvalId) || null;

  onMount(async () => {
    if (!params.appId) {
      push("/apps");
      return;
    }
    await Promise.all([loadApp(), loadEvaluations()]);
  });

  async function loadApp() {
    try {
      const response = await fetch(`/api/applications/${params.appId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status === 401) {
          window.location.hash = "#/login";
          return;
        }
        throw new Error("Failed to load app");
      }

      const result = await response.json();
      app = result.data;
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-evals", feature: "load-app" }, extra: { appId: params.appId } });
    } finally {
      isLoading = false;
    }
  }

  async function loadEvaluations() {
    try {
      const response = await fetch(`/api/applications/${params.appId}/evaluations`, {
        credentials: "include",
      });

      if (response.ok) {
        const result = await response.json();
        evaluations = result.data || [];
      }
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-evals", feature: "load-evaluations" }, extra: { appId: params.appId } });
    }
  }

  async function createEvaluation() {
    if (!newEvalName.trim()) return;

    const validTestCases = newTestCases.filter(tc => tc.input.trim() && tc.expectedOutput.trim());
    if (validTestCases.length === 0) return;

    isCreating = true;
    try {
      const response = await fetch(`/api/applications/${params.appId}/evaluations`, {
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
        closeCreateModal();
      }
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-evals", feature: "create-evaluation" }, extra: { appId: params.appId, evalName: newEvalName } });
    } finally {
      isCreating = false;
    }
  }

  async function runEvaluation(evalId: string) {
    runningEvalId = evalId;

    // Find the evaluation to get its test cases
    const evaluation = evaluations.find(e => e.id === evalId);

    // Update local state to show running
    evaluations = evaluations.map(e =>
      e.id === evalId ? { ...e, status: 'running' as const } : e
    );

    try {
      const response = await fetch(`/api/applications/${params.appId}/evaluations/${evalId}/run`, {
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
      }
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-evals", feature: "run-evaluation" }, extra: { appId: params.appId, evalId } });
      // Reset status on error
      evaluations = evaluations.map(e =>
        e.id === evalId ? { ...e, status: 'pending' as const } : e
      );
    } finally {
      runningEvalId = null;
    }
  }

  async function deleteEvaluation(evalId: string) {
    if (!confirm('Are you sure you want to delete this test suite?')) return;

    try {
      const response = await fetch(`/api/applications/${params.appId}/evaluations/${evalId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        evaluations = evaluations.filter(e => e.id !== evalId);
      }
    } catch (e) {
      captureException(e, { tags: { page: "app-builder-evals", feature: "delete-evaluation" }, extra: { appId: params.appId, evalId } });
    }
  }

  function startEditing(evaluation: Evaluation) {
    editingEvalId = evaluation.id;
    editingName = evaluation.name;
  }

  async function saveEdit(evalId: string) {
    if (!editingName.trim()) return;

    // For now, just update locally since mock API doesn't have PATCH for evals
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

  function toggleExpanded(evalId: string) {
    expandedEvalId = expandedEvalId === evalId ? null : evalId;
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

<svelte:head>
  <title>Evaluations - Chipp</title>
</svelte:head>

<div class="app-builder">
  <BuilderSidebar appId={params.appId} activeTab="evals" />

  <div class="main-content">
    <BuilderHeader
      appName={app?.name || "Loading..."}
      lastSaved={null}
      isSaving={false}
      hasUnsavedChanges={false}
      onSave={() => {}}
      onPublish={() => {}}
      isPublishing={false}
      hidePublish={true}
    />

    <div class="split-panel-layout">
      <!-- Left Panel: Evals List -->
      <div class="left-panel">
        {#if isLoading}
          <div class="loading-state">
            <div class="spinner"></div>
            <p>Loading...</p>
          </div>
        {:else}
          <div class="panel-content">
            <div class="header-section">
              <div class="header-icon">
                <FlaskConical size={24} />
              </div>
              <div>
                <h1>Evaluations</h1>
                <p>Test and validate your AI</p>
              </div>
            </div>

            <!-- Stats Overview -->
            {#if evaluations.length > 0}
              <div class="stats-grid">
                <Card padding="sm" class="stat-card">
                  <div class="stat-value">{evaluations.length}</div>
                  <div class="stat-label">Suites</div>
                </Card>
                <Card padding="sm" class="stat-card">
                  <div class="stat-value">{totalTestCases}</div>
                  <div class="stat-label">Cases</div>
                </Card>
                <Card padding="sm" class="stat-card">
                  <div class="stat-value">{passedSuites}</div>
                  <div class="stat-label">Passing</div>
                </Card>
                <Card padding="sm" class="stat-card">
                  <div class="stat-value">{avgScore !== null ? `${avgScore}%` : '—'}</div>
                  <div class="stat-label">Score</div>
                </Card>
              </div>
            {/if}

            <Card padding="md" class="evals-card">
              <div class="card-header">
                <h2>Test Suites</h2>
                <Button variant="primary" size="sm" on:click={() => showCreateModal = true}>
                  <Plus size={14} />
                  Create
                </Button>
              </div>

              {#if evaluations.length === 0}
                <div class="empty-state-small">
                  <FlaskConical size={32} />
                  <p>No evaluations yet</p>
                  <span>Create your first test suite</span>
                </div>
              {:else}
                <div class="evals-list">
                  {#each evaluations as evaluation (evaluation.id)}
                    <button
                      class="eval-item-btn"
                      class:selected={selectedEvalId === evaluation.id}
                      on:click={() => selectedEvalId = evaluation.id}
                    >
                      <div
                        class="eval-status-icon"
                        style="color: {getStatusColor(evaluation.status)}"
                      >
                        <svelte:component this={getStatusIcon(evaluation.status)} size={16} />
                      </div>
                      <div class="eval-item-info">
                        <span class="eval-name">{evaluation.name}</span>
                        <span class="eval-meta">
                          {evaluation.testCases?.length || 0} cases
                          {#if evaluation.score !== null}
                            • {evaluation.score}%
                          {/if}
                        </span>
                      </div>
                    </button>
                  {/each}
                </div>
              {/if}
            </Card>
          </div>
        {/if}
      </div>

      <!-- Resizable Handle -->
      <div class="resize-handle"></div>

      <!-- Right Panel: Detail View or Empty State -->
      <div class="right-panel">
        {#if selectedEval}
          <div class="detail-view">
            <div class="detail-header">
              <div class="detail-title-row">
                {#if editingEvalId === selectedEval.id}
                  <div class="edit-name-row">
                    <input
                      type="text"
                      bind:value={editingName}
                      class="edit-name-input"
                      on:keydown={(e) => e.key === 'Enter' && saveEdit(selectedEval.id)}
                    />
                    <button class="icon-btn save" on:click={() => saveEdit(selectedEval.id)}>
                      <Save size={14} />
                    </button>
                    <button class="icon-btn cancel" on:click={cancelEdit}>
                      <X size={14} />
                    </button>
                  </div>
                {:else}
                  <h2>{selectedEval.name}</h2>
                  <button class="icon-btn" on:click={() => startEditing(selectedEval)}>
                    <Edit2 size={16} />
                  </button>
                {/if}
              </div>
              <div class="detail-actions">
                <Button
                  variant="primary"
                  on:click={() => runEvaluation(selectedEval.id)}
                  disabled={runningEvalId === selectedEval.id}
                >
                  {#if runningEvalId === selectedEval.id}
                    <Loader2 size={16} class="spinning" />
                  {:else}
                    <Play size={16} />
                  {/if}
                  Run Evaluation
                </Button>
                <button class="icon-btn delete" on:click={() => deleteEvaluation(selectedEval.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div class="detail-stats">
              <div class="detail-stat">
                <span class="detail-stat-value">{selectedEval.testCases?.length || 0}</span>
                <span class="detail-stat-label">Test Cases</span>
              </div>
              <div class="detail-stat">
                <span class="detail-stat-value" class:good={selectedEval.score !== null && selectedEval.score >= 80} class:bad={selectedEval.score !== null && selectedEval.score < 50}>
                  {selectedEval.score !== null ? `${selectedEval.score}%` : '—'}
                </span>
                <span class="detail-stat-label">Pass Rate</span>
              </div>
              <div class="detail-stat">
                <span class="detail-stat-value">{getStatusLabel(selectedEval.status)}</span>
                <span class="detail-stat-label">Status</span>
              </div>
              {#if selectedEval.lastRun}
                <div class="detail-stat">
                  <span class="detail-stat-value">{new Date(selectedEval.lastRun).toLocaleDateString()}</span>
                  <span class="detail-stat-label">Last Run</span>
                </div>
              {/if}
            </div>

            {#if selectedEval.testCases?.length > 0}
              <Card padding="md" class="test-cases-card">
                <h3>Test Cases</h3>
                <div class="test-cases-table">
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
          <!-- Empty State for Right Panel -->
          <div class="empty-state-panel">
            <div class="empty-state-content">
              <div class="empty-state-icon">
                <FlaskConical size={48} />
              </div>
              <h3>Select an evaluation</h3>
              <p>Choose a test suite from the list to view details and run evaluations</p>
            </div>
          </div>
        {/if}
      </div>
    </div>
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
  .app-builder {
    display: flex;
    min-height: 100vh;
    background: hsl(var(--background));
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  @media (min-width: 1024px) {
    .main-content {
      margin-left: 100px;
    }
  }

  /* Two-Panel Split Layout */
  .split-panel-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .left-panel {
    width: 100%;
    overflow-y: auto;
    border-right: 1px solid var(--border-primary);
    background: hsl(var(--background));
  }

  @media (min-width: 1024px) {
    .left-panel {
      width: 35%;
      min-width: 320px;
      max-width: 450px;
    }
  }

  .panel-content {
    padding: var(--space-6);
  }

  .resize-handle {
    display: none;
    width: 4px;
    background: transparent;
    cursor: col-resize;
  }

  .resize-handle:hover {
    background: hsl(var(--primary) / 0.3);
  }

  @media (min-width: 1024px) {
    .resize-handle {
      display: block;
    }
  }

  .right-panel {
    display: none;
    flex: 1;
    overflow-y: auto;
    background: hsl(var(--muted) / 0.3);
  }

  @media (min-width: 1024px) {
    .right-panel {
      display: flex;
    }
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

  .header-section {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-lg);
    background: hsl(var(--primary) / 0.1);
    color: hsl(var(--primary));
  }

  .header-section h1 {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    margin: 0;
    color: hsl(var(--foreground));
  }

  .header-section p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  /* Stats Grid - Compact for left panel */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  :global(.stat-card) {
    text-align: center;
  }

  .stat-value {
    font-size: var(--text-lg);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
  }

  .stat-label {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .evals-card {
    margin-bottom: var(--space-4);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
  }

  .card-header h2 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    margin: 0;
  }

  /* Empty State Small - for left panel */
  .empty-state-small {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6);
    color: hsl(var(--muted-foreground));
    text-align: center;
  }

  .empty-state-small p {
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    margin: 0;
    font-size: var(--text-sm);
  }

  .empty-state-small span {
    font-size: var(--text-xs);
  }

  /* Evals List - Clickable items */
  .evals-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .eval-item-btn {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .eval-item-btn:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .eval-item-btn.selected {
    background: hsl(var(--primary) / 0.1);
    border-color: hsl(var(--primary) / 0.3);
  }

  .eval-status-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .eval-item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .eval-name {
    font-size: var(--text-sm);
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

  /* Right Panel - Empty State */
  .empty-state-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: var(--space-8);
  }

  .empty-state-content {
    text-align: center;
    max-width: 300px;
  }

  .empty-state-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    margin: 0 auto var(--space-4);
    border-radius: var(--radius-xl);
    background: hsl(var(--background));
    color: hsl(var(--muted-foreground));
    box-shadow: var(--shadow-sm);
  }

  .empty-state-content h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-2) 0;
    color: hsl(var(--foreground));
  }

  .empty-state-content p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  /* Right Panel - Detail View */
  .detail-view {
    width: 100%;
    padding: var(--space-6);
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .detail-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .detail-title-row h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    margin: 0;
    color: hsl(var(--foreground));
  }

  .detail-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .detail-stats {
    display: flex;
    gap: var(--space-6);
    padding: var(--space-4);
    margin-bottom: var(--space-6);
    background: hsl(var(--background));
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-primary);
  }

  .detail-stat {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .detail-stat-value {
    font-size: var(--text-lg);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
  }

  .detail-stat-value.good {
    color: hsl(142 70% 40%);
  }

  .detail-stat-value.bad {
    color: hsl(0 70% 50%);
  }

  .detail-stat-label {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  :global(.test-cases-card) {
    background: hsl(var(--background));
  }

  :global(.test-cases-card) h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-4) 0;
    color: hsl(var(--foreground));
  }

  .test-cases-table {
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .edit-name-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .edit-name-input {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-sm);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }

  .icon-btn {
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

  .icon-btn:hover {
    background: hsl(var(--muted));
    color: hsl(var(--foreground));
  }

  .icon-btn.delete:hover {
    background: hsl(0 70% 50% / 0.1);
    color: hsl(0 70% 50%);
  }

  .icon-btn.save:hover {
    background: hsl(142 70% 40% / 0.1);
    color: hsl(142 70% 40%);
  }

  .icon-btn.cancel:hover {
    background: hsl(0 70% 50% / 0.1);
    color: hsl(0 70% 50%);
  }

  /* Test Cases Table */
  .test-cases-header {
    display: grid;
    grid-template-columns: 1fr 1fr 60px;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    background: hsl(var(--muted) / 0.5);
    border-bottom: 1px solid var(--border-primary);
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
    border-bottom: 1px solid var(--border-primary);
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
    .main-content {
      margin-left: 0;
    }

    .page-content {
      padding: var(--space-4);
    }

    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .eval-row {
      flex-wrap: wrap;
    }

    .eval-actions {
      width: 100%;
      justify-content: flex-end;
      margin-top: var(--space-2);
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
