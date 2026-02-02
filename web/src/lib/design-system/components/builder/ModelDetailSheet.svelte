<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { getBlendedPrice, badgeColors, type ModelConfig, type Badge } from "./modelConfig";

  export let open: boolean = false;
  export let model: ModelConfig | null = null;
  export let onSelect: (modelId: string) => void = () => {};
  export let subscriptionTier: "FREE" | "PRO" | "TEAM" | "BUSINESS" | "ENTERPRISE" = "PRO";

  // Plan configurations
  const planConfig = {
    FREE: { name: "Free", price: 0, includedUsage: 0 },
    PRO: { name: "Pro", price: 29, includedUsage: 10 },
    TEAM: { name: "Team", price: 99, includedUsage: 30 },
    BUSINESS: { name: "Business", price: 299, includedUsage: 100 },
    ENTERPRISE: { name: "Enterprise", price: 0, includedUsage: 500 },
  };

  $: currentPlan = planConfig[subscriptionTier];

  const dispatch = createEventDispatcher();

  // Pricing calculator state - message-based like chipp-admin
  let messagesPerMonth = 10000;
  let avgInputTokens = 500;
  let avgOutputTokens = 300;

  // Calculate costs
  $: promptCost = model
    ? ((messagesPerMonth * avgInputTokens) / 1_000_000) * model.pricing.prompt
    : 0;
  $: completionCost = model
    ? ((messagesPerMonth * avgOutputTokens) / 1_000_000) * model.pricing.completion
    : 0;
  $: totalCost = promptCost + completionCost;

  function close() {
    open = false;
    dispatch("close");
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  function handleSelect() {
    if (model) {
      onSelect(model.id);
      close();
    }
  }

  function getBadgeStyle(badge: Badge): string {
    return badgeColors[badge] || "bg-gray-100 text-gray-800";
  }

  function formatNumber(num: number): string {
    return num.toLocaleString();
  }

  // Billing scenarios matching chipp-admin
  interface BillingScenario {
    name: string;
    messagesPerMonth: number;
    avgPromptTokens: number;
    avgCompletionTokens: number;
    description: string;
  }

  const scenarios: BillingScenario[] = [
    {
      name: "Light Usage",
      messagesPerMonth: 1000,
      avgPromptTokens: 300,
      avgCompletionTokens: 150,
      description: "Personal projects, occasional testing",
    },
    {
      name: "Medium Usage",
      messagesPerMonth: 10000,
      avgPromptTokens: 500,
      avgCompletionTokens: 300,
      description: "Active development, customer support chatbot",
    },
    {
      name: "Heavy Usage",
      messagesPerMonth: 50000,
      avgPromptTokens: 800,
      avgCompletionTokens: 500,
      description: "High-volume production app, enterprise deployment",
    },
  ];

  function getScenarioCost(scenario: BillingScenario): {
    promptCost: number;
    completionCost: number;
    totalCost: number;
    includedUsage: number;
    overage: number;
    userPays: number;
  } {
    const plan = planConfig[subscriptionTier];
    if (!model) return { promptCost: 0, completionCost: 0, totalCost: 0, includedUsage: plan.includedUsage, overage: 0, userPays: plan.price };

    const totalPromptTokens = scenario.messagesPerMonth * scenario.avgPromptTokens;
    const totalCompletionTokens = scenario.messagesPerMonth * scenario.avgCompletionTokens;

    const pCost = (totalPromptTokens / 1_000_000) * model.pricing.prompt;
    const cCost = (totalCompletionTokens / 1_000_000) * model.pricing.completion;
    const tCost = pCost + cCost;

    // Use current plan's included usage
    const overage = Math.max(0, tCost - plan.includedUsage);
    const userPays = plan.price > 0 ? plan.price + overage : overage;

    return { promptCost: pCost, completionCost: cCost, totalCost: tCost, includedUsage: plan.includedUsage, overage, userPays };
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open && model}
  <div class="sheet-overlay" transition:fade={{ duration: 150 }} on:click={handleOverlayClick}>
    <div
      class="sheet-content"
      role="dialog"
      aria-modal="true"
      transition:fly={{ x: 300, duration: 200 }}
    >
      <button class="close-btn" on:click={close} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      <div class="sheet-scroll">
        <!-- Hero Section -->
        <div class="hero">
          <div class="hero-header">
            <h2 class="model-name">{model.name}</h2>
            <div class="badges">
              {#each model.badges as badge}
                <span class="badge {getBadgeStyle(badge)}">{badge}</span>
              {/each}
            </div>
          </div>
          <p class="model-description">{model.description}</p>

          <div class="stats-grid">
            <div class="stat">
              <span class="stat-label">Context Window</span>
              <span class="stat-value">{model.tokenLimit}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Provider</span>
              <span class="stat-value capitalize">{model.provider}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Avg. Price</span>
              <span class="stat-value">{getBlendedPrice(model.pricing)}</span>
            </div>
          </div>
        </div>

        <!-- Use Cases Section -->
        <div class="section">
          <h3 class="section-title">Best Use Cases</h3>
          <ul class="use-cases">
            {#each model.useCases as useCase}
              <li>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{useCase}</span>
              </li>
            {/each}
          </ul>
        </div>

        <!-- Pricing Calculator -->
        <div class="section">
          <h3 class="section-title">Pricing Calculator</h3>

          <div class="calculator calculator-highlight">
            <div class="calc-field">
              <label for="messages-per-month">Messages per month</label>
              <input
                id="messages-per-month"
                type="number"
                class="calc-number-input"
                bind:value={messagesPerMonth}
                min="0"
              />
            </div>
            <div class="calc-row">
              <div class="calc-field">
                <label for="avg-input-tokens">Avg. input tokens</label>
                <input
                  id="avg-input-tokens"
                  type="number"
                  class="calc-number-input"
                  bind:value={avgInputTokens}
                  min="0"
                />
              </div>
              <div class="calc-field">
                <label for="avg-output-tokens">Avg. output tokens</label>
                <input
                  id="avg-output-tokens"
                  type="number"
                  class="calc-number-input"
                  bind:value={avgOutputTokens}
                  min="0"
                />
              </div>
            </div>

            <div class="calc-breakdown">
              <div class="calc-result-main">
                <span>Monthly AI Cost:</span>
                <span class="cost">${totalCost.toFixed(2)}</span>
              </div>
              <div class="calc-details">
                <div class="calc-detail">
                  Input: ${promptCost.toFixed(2)} ({formatNumber(messagesPerMonth)} msgs × {avgInputTokens} tokens)
                </div>
                <div class="calc-detail">
                  Output: ${completionCost.toFixed(2)} ({formatNumber(messagesPerMonth)} msgs × {avgOutputTokens} tokens)
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Billing Scenarios -->
        <div class="section">
          <h3 class="section-title">Example Billing Scenarios</h3>
          <div class="scenarios">
            {#each scenarios as scenario}
              {@const cost = getScenarioCost(scenario)}
              <div class="scenario">
                <div class="scenario-header">
                  <div class="scenario-info">
                    <span class="scenario-name">{scenario.name}</span>
                    <span class="scenario-desc">{scenario.description}</span>
                  </div>
                  <span class="scenario-badge">{formatNumber(scenario.messagesPerMonth)} msgs/mo</span>
                </div>

                <div class="scenario-cost-row">
                  <span class="scenario-label">AI Model Cost:</span>
                  <span class="scenario-cost">${cost.totalCost.toFixed(2)}</span>
                </div>

                <div class="scenario-pro-box">
                  <div class="pro-row">
                    <span>{currentPlan.name} Plan {#if currentPlan.price > 0}(${currentPlan.price}/mo){/if}:</span>
                    <span>{#if currentPlan.includedUsage > 0}Includes ${currentPlan.includedUsage} usage{:else}Pay as you go{/if}</span>
                  </div>
                  {#if cost.overage > 0}
                    <div class="pro-row overage">
                      <span>Overage:</span>
                      <span>${cost.overage.toFixed(2)}</span>
                    </div>
                    <div class="pro-row total">
                      <span>Your Total:</span>
                      <span>${cost.userPays.toFixed(2)}/mo</span>
                    </div>
                  {:else if currentPlan.price > 0}
                    <div class="pro-row total covered">
                      <span>Your Total:</span>
                      <span>${currentPlan.price.toFixed(2)}/mo (fully covered!)</span>
                    </div>
                  {:else}
                    <div class="pro-row total covered">
                      <span>Your Total:</span>
                      <span>$0.00/mo (within credits)</span>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <div class="service-fee-note">
            <strong>Note:</strong> Chipp charges direct model cost + 30% service fee. Included usage varies by plan: Pro ($10/mo), Team ($30/mo), Business ($100/mo).
          </div>
        </div>

        <!-- Technical Details -->
        <div class="section">
          <h3 class="section-title">Technical Details</h3>
          <div class="details-grid">
            <div class="detail">
              <span class="detail-label">Model ID</span>
              <code class="detail-value">{model.id}</code>
            </div>
            <div class="detail">
              <span class="detail-label">Context Length</span>
              <span class="detail-value">{model.tokenLimitDescription}</span>
            </div>
          </div>
          <a
            href={model.learnMoreLink}
            target="_blank"
            rel="noopener noreferrer"
            class="learn-more"
          >
            Learn more
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div class="sheet-footer">
        <button type="button" class="select-btn" on:click={handleSelect}>
          Select {model.name}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background-color: rgba(0, 0, 0, 0.5);
  }

  .sheet-content {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 480px;
    background-color: var(--bg-primary);
    border-left: 1px solid var(--border-primary);
    box-shadow: var(--shadow-xl);
    display: flex;
    flex-direction: column;
  }

  .close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius-lg);
    transition: all 0.2s ease;
    z-index: 10;
  }

  .close-btn:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }

  .close-btn svg {
    width: 18px;
    height: 18px;
  }

  .sheet-scroll {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-6);
  }

  /* Hero */
  .hero {
    margin-bottom: var(--space-6);
  }

  .hero-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
    padding-right: var(--space-10); /* Space for close button */
  }

  .model-name {
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .badge {
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 500;
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  .model-description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0 0 var(--space-4) 0;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
    padding: var(--space-4);
    background: var(--bg-secondary);
    border-radius: var(--radius-xl);
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }

  .stat-label {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .stat-value {
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text-primary);
  }

  .stat-value.capitalize {
    text-transform: capitalize;
  }

  /* Sections */
  .section {
    margin-bottom: var(--space-6);
  }

  .section-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 var(--space-3) 0;
  }

  /* Use Cases */
  .use-cases {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .use-cases li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .use-cases svg {
    color: var(--color-success);
    flex-shrink: 0;
  }

  /* Pricing */
  .pricing-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    padding: var(--space-3);
    background: var(--bg-secondary);
    border-radius: var(--radius-lg);
  }

  .price-row {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .price {
    font-weight: 500;
    color: var(--text-primary);
  }

  .calculator {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--bg-secondary);
    border-radius: var(--radius-xl);
  }

  .calculator-highlight {
    background: var(--glow-blue);
    border: 1px solid hsl(var(--accent, 217 91% 55%));
  }

  .calc-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .calc-field label {
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .calc-number-input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    background: var(--bg-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    color: var(--text-primary);
  }

  .calc-number-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .calc-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .calc-breakdown {
    padding-top: var(--space-3);
    border-top: 1px solid hsl(var(--accent, 217 91% 55%) / 0.3);
  }

  .calc-result-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-2);
  }

  .calc-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .calc-detail {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .cost {
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-primary);
  }

  /* Scenarios */
  .scenarios {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .scenario {
    padding: var(--space-4);
    background: var(--bg-secondary);
    border-radius: var(--radius-xl);
  }

  .scenario-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .scenario-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .scenario-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .scenario-desc {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .scenario-badge {
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-full);
    white-space: nowrap;
  }

  .scenario-cost-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-sm);
    margin-bottom: var(--space-3);
  }

  .scenario-label {
    color: var(--text-secondary);
  }

  .scenario-cost {
    font-weight: 600;
    color: var(--text-primary);
  }

  .scenario-pro-box {
    padding: var(--space-3);
    background: var(--glow-green);
    border: 1px solid var(--color-success);
    border-radius: var(--radius-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--text-primary);
  }

  .pro-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .pro-row.overage {
    color: var(--color-warning);
  }

  .pro-row.total {
    padding-top: var(--space-2);
    border-top: 1px solid var(--border-primary);
    font-weight: 600;
  }

  .pro-row.covered {
    color: var(--color-success);
  }

  .service-fee-note {
    margin-top: var(--space-4);
    padding: var(--space-3);
    background: var(--bg-tertiary);
    border-radius: var(--radius-lg);
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .service-fee-note strong {
    color: var(--text-secondary);
  }

  /* Technical Details */
  .details-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .detail {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-label {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
  }

  .detail-value {
    font-size: var(--text-sm);
    color: var(--text-primary);
  }

  code.detail-value {
    font-family: monospace;
    background: var(--bg-secondary);
    padding: 4px 8px;
    border-radius: var(--radius-md);
    display: inline-block;
  }

  .learn-more {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--color-primary);
    text-decoration: none;
  }

  .learn-more:hover {
    text-decoration: underline;
  }

  /* Footer */
  .sheet-footer {
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--border-primary);
    background: var(--bg-primary);
  }

  .select-btn {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-sm);
    font-weight: 600;
    color: white;
    background: var(--color-primary);
    border: none;
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .select-btn:hover {
    background: var(--color-primary-dark);
  }

  /* Badge colors */
  .bg-orange-100 { background-color: #ffedd5; }
  .text-orange-800 { color: #9a3412; }
  .bg-purple-100 { background-color: #f3e8ff; }
  .text-purple-800 { color: #6b21a8; }
  .bg-blue-100 { background-color: #dbeafe; }
  .text-blue-800 { color: #1e40af; }
  .bg-green-100 { background-color: #dcfce7; }
  .text-green-800 { color: #166534; }
  .bg-yellow-100 { background-color: #fef9c3; }
  .text-yellow-800 { color: #854d0e; }
  .bg-pink-100 { background-color: #fce7f3; }
  .text-pink-800 { color: #9d174d; }
  .bg-gray-100 { background-color: #f3f4f6; }
  .text-gray-800 { color: #1f2937; }
</style>
