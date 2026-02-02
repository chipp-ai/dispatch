<script lang="ts">
  import GlobalNavBar from "../lib/design-system/components/GlobalNavBar.svelte";
  import PlanCard from "../lib/design-system/components/PlanCard.svelte";
  import { organizationStore } from "../stores/organization";
  import { isAuthenticated } from "../stores/auth";

  let openFaqIndex: number | null = null;
  $: subscriptionTier = $organizationStore.organization?.subscriptionTier || "";

  // Check if user is on trial (simplified - just check tier for now)
  $: isInTrial = false;

  const plans = [
    {
      plan: "Pro",
      tier: "PRO",
      tagline: "Perfect for one person building & sharing.",
      cost: "29",
      costCaption: "/month + usage over $10",
      buttonText: "Get Started",
      subheading: "1 Editor and Unlimited Visitors",
      benefits: [
        "Start with 500 messages free",
        "Best Models",
        "Unlimited Knowledge Sources",
        "Unlimited API Access",
        "1 x Custom Agent Domain",
        "Deploy to WhatsApp, Slack, more",
        "Sell Individual Agents",
        "Community Support",
      ],
    },
    {
      plan: "Team",
      tier: "TEAM",
      tagline: "Best for working with others.",
      cost: "99",
      costCaption: "/month + usage over $30",
      buttonText: "Get Started",
      subheading: "Unlimited Editors and Visitors",
      benefits: [
        "Everything in Pro plus:",
        "Unlimited AI HQs",
        "Team Management",
        "5 x Custom Agent Domains",
        "Sell Agent Bundles",
        "Email Support",
      ],
      highlight: true,
      mostPopular: true,
    },
    {
      plan: "Business",
      tier: "BUSINESS",
      tagline: "Keep data private - no data shared with model providers like OpenAI.",
      cost: "299",
      costCaption: "/month + usage over $100",
      buttonText: "Get Started",
      subheading: "Unlimited Editors and Visitors",
      benefits: [
        "Everything in Team plus:",
        "Zero Data Retention (ZDR)",
        "Custom Domains for HQs (coming soon)",
        "Unlimited Custom Domains",
        "HIPAA Compatible (with add-on)",
        "Single-tenant compatible (with add-on)",
        "Full Encryption compatible (with add-on)",
        "Private Slack Support",
      ],
      mostPrivate: true,
    },
  ];

  const addOns = [
    {
      title: "Enterprise",
      price: "$500/mo",
      features: [
        { name: "Private Cloud (VPC)", description: "Dedicated infrastructure for maximum security" },
        { name: "Data Sovereignty", description: "Choose your database location for compliance" },
        { name: "Custom Domain", description: "Use Chipp on your site (e.g. ai.yourdomain.com)" },
        { name: "White-label Platform", description: "Remove all Chipp branding, use your own" },
      ],
      mostPopular: true,
    },
    {
      title: "Encryption",
      price: "$500/mo",
      features: [
        { name: "Encrypted Chat History", description: "Full end-to-end encryption of all conversations" },
        { name: "Team-Only Access", description: "Only approved users on your team can view conversations" },
        { name: "Zero Chipp Visibility", description: "Chipp team has no access to your encrypted data" },
      ],
    },
    {
      title: "Phone Agent",
      price: "$10/mo/number",
      features: [
        { name: "Custom Number", description: "Call your number to speak with your agent" },
        { name: "Local Area Code", description: "Search for the best number by area code or location" },
        { name: "Smart Phone Agents", description: "Access knowledge and tools for real-time answers on calls" },
      ],
    },
  ];

  const faqData = [
    {
      question: "Are there API costs?",
      answer: "Chipp pays for all API costs - no extra charge to you. The LLM providers charge us every time a message is sent, which is why we have a usage limit.",
    },
    {
      question: "What is a message?",
      answer: "A message is each interaction sent to your AI agent. This includes both user questions and the agent's responses. Each message uses tokens from your usage allowance.",
    },
    {
      question: "What is a knowledge source?",
      answer: "Every document, webpage, YouTube video, etc. is a knowledge source. These sources help your agent know how to behave.",
    },
    {
      question: "What is an editor vs a user?",
      answer: "Every Chipp plan allows you to share your chat with any user. Editors have the ability to create and edit your agents. The number of editors changes per plan.",
    },
    {
      question: "What is a chat log?",
      answer: "Editors can choose to see what users ask. The chat logs can also be exported to download or Google Sheet. Paid plans provide access to all chat logs.",
    },
    {
      question: "What models are available?",
      answer: "Chipp provides the best models for you from OpenAI, Google, Anthropic, and open source providers. All paid plans can choose their model per app.",
    },
  ];

  async function handlePlanClick(tier: string) {
    // Redirect to main app's plans page for checkout
    // The main app has the full Stripe integration with usage-based billing
    const mainAppUrl = import.meta.env.VITE_MAIN_APP_URL || "https://app.chipp.ai";

    if (isAuthenticated) {
      // Direct to checkout with autoCheckout param
      window.location.href = `${mainAppUrl}/plans?autoCheckout=${tier}&period=MONTHLY`;
    } else {
      // Redirect to signup/login first
      const returnUrl = encodeURIComponent(`/plans?autoCheckout=${tier}&period=MONTHLY`);
      window.location.href = `${mainAppUrl}/auth/signup?next=${returnUrl}`;
    }
  }

  function handleContactUs() {
    window.open("https://chipp.ai/contact", "_blank");
  }

  function toggleFaq(index: number) {
    openFaqIndex = openFaqIndex === index ? null : index;
  }

  function isPlanDisabled(tier: string): boolean {
    return subscriptionTier === tier && !isInTrial;
  }

  function getButtonText(tier: string): string {
    if (isPlanDisabled(tier)) {
      return "Current Plan";
    }
    return "Get Started";
  }

</script>

<svelte:head>
  <title>Plans & Pricing - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="plans-page">
  <!-- Hero Section -->
  <section class="hero">
    <div class="hero-content">
      <h1>Simple, transparent pricing</h1>
      <p class="hero-subtitle">Start building AI agents in minutes. Scale as you grow.</p>
    </div>
  </section>

  <!-- Plans Grid -->
  <section class="plans-section">
    <div class="plans-grid">
      {#each plans as plan}
        <PlanCard
          plan={plan.plan}
          tagline={plan.tagline}
          cost={plan.cost}
          costCaption={plan.costCaption}
          buttonText={getButtonText(plan.tier)}
          subheading={plan.subheading}
          benefits={plan.benefits}
          highlight={plan.highlight || false}
          mostPopular={plan.mostPopular || false}
          mostPrivate={plan.mostPrivate || false}
          disabled={isPlanDisabled(plan.tier)}
          on:click={() => handlePlanClick(plan.tier)}
        />
      {/each}
    </div>
  </section>

  <!-- Add-ons Section -->
  <section class="addons-section">
    <h2>Business Add-ons</h2>
    <p class="section-subtitle">Enhance your Business plan with these powerful add-ons</p>
    <div class="addons-grid">
      {#each addOns as addon}
        <div class="addon-card" class:most-popular={addon.mostPopular}>
          {#if addon.mostPopular}
            <span class="addon-badge">Popular</span>
          {/if}
          <h3>{addon.title}</h3>
          <div class="addon-price">{addon.price}</div>
          <ul class="addon-features">
            {#each addon.features as feature}
              <li>
                <strong>{feature.name}</strong>
                <span>{feature.description}</span>
              </li>
            {/each}
          </ul>
          <button class="addon-cta" on:click={handleContactUs}>Contact Sales</button>
        </div>
      {/each}
    </div>
  </section>

  <!-- FAQ Section -->
  <section class="faq-section">
    <h2>Frequently Asked Questions</h2>
    <div class="faq-list">
      {#each faqData as faq, index}
        <div class="faq-item" class:open={openFaqIndex === index}>
          <button class="faq-question" on:click={() => toggleFaq(index)}>
            <span>{faq.question}</span>
            <svg class="faq-chevron" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          {#if openFaqIndex === index}
            <div class="faq-answer">
              <p>{faq.answer}</p>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- Contact Section -->
  <section class="contact-section">
    <h2>Need something custom?</h2>
    <p>Contact our sales team for enterprise solutions and custom pricing.</p>
    <button class="contact-cta" on:click={handleContactUs}>Contact Sales</button>
  </section>
</div>

<style>
  .plans-page {
    min-height: 100vh;
    background: hsl(var(--background));
    padding-top: 80px;
  }

  /* Hero Section */
  .hero {
    padding: var(--space-16) var(--space-8);
    text-align: center;
    background: linear-gradient(180deg, hsl(var(--muted) / 0.3) 0%, hsl(var(--background)) 100%);
  }

  .hero-content {
    max-width: 800px;
    margin: 0 auto;
  }

  .hero h1 {
    font-family: var(--font-heading);
    font-size: var(--text-5xl);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin-bottom: var(--space-4);
  }

  .hero-subtitle {
    font-family: var(--font-body);
    font-size: var(--text-xl);
    color: hsl(var(--muted-foreground));
  }

  /* Plans Section */
  .plans-section {
    padding: var(--space-8);
    max-width: 1200px;
    margin: 0 auto;
  }

  .plans-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: var(--space-8);
  }

  /* Add-ons Section */
  .addons-section {
    padding: var(--space-16) var(--space-8);
    max-width: 1200px;
    margin: 0 auto;
  }

  .addons-section h2 {
    font-family: var(--font-heading);
    font-size: var(--text-3xl);
    font-weight: 600;
    color: hsl(var(--foreground));
    text-align: center;
    margin-bottom: var(--space-2);
  }

  .section-subtitle {
    font-family: var(--font-body);
    font-size: var(--text-lg);
    color: hsl(var(--muted-foreground));
    text-align: center;
    margin-bottom: var(--space-8);
  }

  .addons-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-6);
  }

  .addon-card {
    position: relative;
    padding: var(--space-6);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    transition: all 0.2s ease;
  }

  .addon-card:hover {
    border-color: hsl(var(--foreground) / 0.2);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }

  .addon-card.most-popular {
    border-color: var(--brand-yellow);
  }

  .addon-badge {
    position: absolute;
    top: -12px;
    right: 16px;
    padding: 4px 12px;
    background: var(--brand-yellow);
    color: #111;
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 600;
    border-radius: 999px;
  }

  .addon-card h3 {
    font-family: var(--font-heading);
    font-size: var(--text-xl);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .addon-price {
    font-family: var(--font-body);
    font-size: var(--text-2xl);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin-bottom: var(--space-4);
  }

  .addon-features {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-6) 0;
  }

  .addon-features li {
    margin-bottom: var(--space-3);
  }

  .addon-features strong {
    display: block;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .addon-features span {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .addon-cta {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: transparent;
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    color: hsl(var(--foreground));
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .addon-cta:hover {
    background: hsl(var(--muted));
  }

  /* FAQ Section */
  .faq-section {
    padding: var(--space-16) var(--space-8);
    max-width: 800px;
    margin: 0 auto;
  }

  .faq-section h2 {
    font-family: var(--font-heading);
    font-size: var(--text-3xl);
    font-weight: 600;
    color: hsl(var(--foreground));
    text-align: center;
    margin-bottom: var(--space-8);
  }

  .faq-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .faq-item {
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius);
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .faq-item.open {
    border-color: hsl(var(--foreground) / 0.2);
  }

  .faq-question {
    width: 100%;
    padding: var(--space-4) var(--space-5);
    background: hsl(var(--background));
    border: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 500;
    color: hsl(var(--foreground));
    cursor: pointer;
    text-align: left;
  }

  .faq-chevron {
    width: 20px;
    height: 20px;
    color: hsl(var(--muted-foreground));
    transition: transform 0.2s ease;
  }

  .faq-item.open .faq-chevron {
    transform: rotate(180deg);
  }

  .faq-answer {
    padding: 0 var(--space-5) var(--space-4) var(--space-5);
    background: hsl(var(--background));
  }

  .faq-answer p {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    line-height: 1.6;
  }

  /* Contact Section */
  .contact-section {
    padding: var(--space-16) var(--space-8);
    text-align: center;
    background: hsl(var(--muted) / 0.3);
    margin-top: var(--space-8);
  }

  .contact-section h2 {
    font-family: var(--font-heading);
    font-size: var(--text-2xl);
    font-weight: 600;
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .contact-section p {
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-6);
  }

  .contact-cta {
    padding: var(--space-3) var(--space-8);
    background: hsl(var(--foreground));
    color: hsl(var(--background));
    border: none;
    border-radius: var(--radius);
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .contact-cta:hover {
    opacity: 0.9;
  }

  @media (max-width: 768px) {
    .hero h1 {
      font-size: var(--text-3xl);
    }

    .hero-subtitle {
      font-size: var(--text-lg);
    }

    .plans-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
