<script lang="ts">
  import { onMount } from "svelte";
  import { fly, slide } from "svelte/transition";
  import GlobalNavBar from "../lib/design-system/components/GlobalNavBar.svelte";
  import PlanCard from "../lib/design-system/components/PlanCard.svelte";
  import { toasts } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { organizationStore } from "../stores/organization";
  import { isAuthenticated } from "../stores/auth";
  import { push } from "svelte-spa-router";

  let openFaqIndex: number | null = null;
  let loadingTier: string | null = null;
  let visible = false;

  $: subscriptionTier = $organizationStore.organization?.subscriptionTier || "";
  $: subscriptionTrialEndsAt = $organizationStore.organization?.subscriptionTrialEndsAt;

  // Check if user is on trial
  $: isInTrial = subscriptionTrialEndsAt
    ? new Date() < new Date(subscriptionTrialEndsAt)
    : false;

  onMount(() => {
    // Trigger staggered animations
    visible = true;

    // Handle autoCheckout URL parameter (for returning from login)
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.split("?")[1] || "");
    const autoCheckoutTier = params.get("autoCheckout");

    if (autoCheckoutTier && $isAuthenticated) {
      // Clear the URL params to prevent re-triggering
      const newHash = hash.split("?")[0];
      window.history.replaceState({}, "", newHash || "#/plans");

      // Trigger checkout for the specified tier
      handlePlanClick(autoCheckoutTier.toUpperCase());
    }
  });

  const plans = [
    {
      plan: "Pro",
      tier: "PRO",
      tagline: "Perfect for one person building & sharing.",
      cost: "29",
      costCaption: "/month + usage over $10",
      buttonText: "Get Started",
      subheading: "Includes $10 of AI Usage, Plus:",
      benefits: [
        "Best Models",
        "Unlimited Knowledge Sources",
        "API Access",
        "Voice Agents",
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
      subheading: "Includes $30 of AI Usage, Pro Features, Plus:",
      benefits: [
        "Unlimited AI HQs",
        "Team Management",
        "Voice Cloning",
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
      subheading: "Includes $100 of AI Usage, Team Features, Plus:",
      benefits: [
        "Zero Data Retention (ZDR)",
        "HIPAA Compliant",
        "White Glove Onboarding and Training",
        "Private Slack Support",
      ],
      mostPrivate: true,
    },
  ];

  const addOns = [
    {
      title: "White Label Chipp",
      price: "$1000/mo",
      features: [
        { name: "Custom Domain", description: "Use Chipp on your site (e.g. ai.yourdomain.com)" },
        { name: "White-label Platform", description: "Remove all Chipp branding, use your own" },
        { name: "Sell Subscriptions", description: "Sell access to your platform at any price" },
        { name: "Custom Email and Authentication", description: "Send trigger emails and provide login with your messaging and branding" },
      ],
      mostPopular: true,
    },
  ];

  const comparisonRows = [
    { label: "Usage Included (monthly)", pro: "$10", team: "$30", business: "$100", enterprise: "Custom" },
    { label: "Agents + Knowledge + Users", pro: "Unlimited", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
    { label: "Team Members", pro: "1", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
    { label: "AI HQs (Agent Bundles)", pro: "-", team: "Unlimited", business: "Unlimited", enterprise: "Unlimited" },
    { label: "Voice", pro: "Voice Agents", team: "Voice Agents + Voice Cloning", business: "Voice Agents + Voice Cloning", enterprise: "Custom" },
    { label: "Compliance", pro: "-", team: "-", business: "HIPAA Compliant + ZDR", enterprise: "Custom" },
    { label: "Sales Capabilities", pro: "Sell Agents", team: "Sell Agent Bundles", business: "Sell Agent Bundles", enterprise: "Sell White-Label Platform" },
    { label: "Support", pro: "Community", team: "Email", business: "Private Slack + White Glove Onboarding", enterprise: "Embedded Expert" },
  ];

  const securityFeatures = [
    { icon: "shield", title: "SOC 2 Type II", description: "Third-party security audit and compliance certification", badge: true },
    { icon: "lock", title: "Trust Center", description: "Complete security documentation and certifications", link: "https://trust.chipp.ai" },
    { icon: "privacy", title: "Zero Data Retention", description: "Your data never shared with model providers like OpenAI (with upgrade)" },
    { icon: "building", title: "On-Premises", description: "Deploy on your infrastructure for complete data control (with upgrade)" },
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
    {
      question: "Can I white label Chipp?",
      answer: "Yes! Chipp allows all plans to change the logo and style on their apps. Paid plans can add a custom domain with the ability to add additional custom domains. Enterprise clients can white label the Chipp builder experience for their team.",
    },
    {
      question: "Can I host Chipp in any location?",
      answer: "Yes! With our Enterprise Add-on you can run Chipp in a private cloud, or VPC, in any location you need, such as an EU location, Brazil, UAE or elsewhere.",
    },
    {
      question: "Are you SOC2 Certified?",
      answer: "Yes! Chipp is SOC 2 Type II certified. Visit our Trust Center for all security and privacy documents and certifications.",
      hasLink: true,
      linkText: "Trust Center",
      linkUrl: "https://trust.chipp.ai/",
    },
  ];

  async function handlePlanClick(tier: string) {
    if ($isAuthenticated) {
      // Check if this would be a downgrade
      const tierOrder: Record<string, number> = {
        FREE: 0,
        PRO: 1,
        TEAM: 2,
        BUSINESS: 3,
        ENTERPRISE: 4,
      };
      const currentTierLevel = tierOrder[subscriptionTier] || 0;
      const newTierLevel = tierOrder[tier] || 0;

      if (newTierLevel < currentTierLevel) {
        if (!window.confirm("Are you sure you want to downgrade your plan?")) {
          return;
        }
      }

      // Call the API to get the Stripe checkout URL
      loadingTier = tier;
      try {
        const returnToUrl = `${window.location.origin}/#/dashboard`;
        const cancelUrl = `${window.location.origin}/#/plans`;

        const params = new URLSearchParams({
          subscriptionTier: tier,
          subscriptionPeriod: "MONTHLY",
          returnToUrl,
          cancelUrl,
          upsellSource: `plans_page:${tier.toLowerCase()}_card`,
        });

        const response = await fetch(`/api/stripe/plans/payment-url?${params.toString()}`, {
          credentials: "include",
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to generate payment URL");
        }

        const data = await response.json();
        window.location.href = data.url;
      } catch (error) {
        captureException(error, { tags: { page: "plans", feature: "payment-url" } });
        toasts.error("Error", "Failed to generate payment URL. Please try again.");
        loadingTier = null;
      }
    } else {
      // Redirect unauthenticated users to login with return URL to complete checkout
      const returnUrl = encodeURIComponent(`/plans?autoCheckout=${tier}&period=MONTHLY`);
      push(`/login?next=${returnUrl}`);
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

  function isLoadingPlan(tier: string): boolean {
    return loadingTier === tier;
  }
</script>

<svelte:head>
  <title>Plans & Pricing - Chipp</title>
</svelte:head>

<GlobalNavBar sticky={true} />

<div class="plans-page">
  <!-- Hero Section -->
  {#if visible}
    <section class="hero" in:fly={{ y: 20, duration: 600 }}>
      <div class="hero-content">
        <div class="stickers">
          <img src="/assets/build-sticker.png" alt="Build" class="sticker" />
          <img src="/assets/share-sticker.png" alt="Share" class="sticker" />
          <img src="/assets/grow-sticker.png" alt="Grow" class="sticker" />
        </div>
        <h1>Plans with Unlimited Power</h1>
        <p class="hero-subtitle">
          Chipp offers unlimited apps and visitors on all plans. Start with an individual plan.
          Then upgrade to add team members and privacy.
        </p>
      </div>
    </section>
  {/if}

  <!-- Plans Grid -->
  {#if visible}
    <section class="plans-section" in:fly={{ y: 20, duration: 600, delay: 200 }}>
      <div class="plans-grid">
        {#each plans as plan, index}
          <div in:fly={{ y: 30, duration: 600, delay: 300 + index * 100 }}>
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
              isLoading={isLoadingPlan(plan.tier)}
              on:click={() => handlePlanClick(plan.tier)}
            />
          </div>
        {/each}
      </div>

      <!-- Enterprise CTA -->
      <div class="enterprise-cta">
        <p>
          Need <strong>enterprise security</strong>, <strong>SSO</strong>,
          <strong>custom contracts</strong>, or <strong>value-added licenses</strong>?
        </p>
        <button class="secondary-cta" on:click={handleContactUs}>Contact Sales</button>
      </div>
    </section>
  {/if}

  <!-- Add-ons Section -->
  {#if visible}
    <section class="addons-section" in:fly={{ y: 20, duration: 600, delay: 600 }}>
      <h2>Business Plan Add-ons</h2>
      <p class="section-subtitle">
        ...with features to help you sell your own AI agents and platform.
        Click below to purchase the Business Plan and Add-on.
      </p>
      <div class="addons-grid">
        {#each addOns as addon}
          <div class="addon-card" class:most-popular={addon.mostPopular}>
            {#if addon.mostPopular}
              <span class="addon-badge">Popular</span>
            {/if}
            <div class="addon-header">
              <h3>{addon.title}</h3>
              <div class="addon-price">{addon.price}</div>
            </div>
            <ul class="addon-features">
              {#each addon.features as feature}
                <li>
                  <span class="check-icon">
                    <svg viewBox="0 0 16 16" fill="none">
                      <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                  <div>
                    <strong>{feature.name}</strong>
                    <span>{feature.description}</span>
                  </div>
                </li>
              {/each}
            </ul>
            <a href="https://checkout.chipp.ai/b/cNi4gz2encSP84D3FVdMI0d" class="addon-cta" target="_blank" rel="noopener noreferrer">
              Get Started
            </a>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Section Divider -->
  <div class="section-divider">
    <div class="divider-line"></div>
    <div class="divider-dot"></div>
    <div class="divider-line"></div>
  </div>

  <!-- What to Tell IT Section -->
  {#if visible}
    <section class="security-section" in:fly={{ y: 20, duration: 600, delay: 700 }}>
      <h2>What to Tell IT</h2>
      <p class="section-subtitle">Enterprise-grade security and compliance your IT team will approve</p>

      <div class="security-grid">
        {#each securityFeatures as feature}
          <div class="security-card">
            <div class="security-icon">
              {#if feature.icon === "shield"}
                <span class="soc-badge-text">SOC 2</span>
              {:else if feature.icon === "lock"}
                <span class="icon-emoji">&#128274;</span>
              {:else if feature.icon === "privacy"}
                <span class="icon-emoji">&#128737;</span>
              {:else if feature.icon === "building"}
                <span class="icon-emoji">&#127970;</span>
              {/if}
            </div>
            <h3>{feature.title}</h3>
            <p>{feature.description}</p>
            {#if feature.link}
              <a href={feature.link} target="_blank" rel="noopener noreferrer" class="security-link">
                View Trust Center &rarr;
              </a>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Compare Plans Section -->
  {#if visible}
    <section class="comparison-section" in:fly={{ y: 20, duration: 600, delay: 800 }}>
      <h2>Compare Plans</h2>

      <div class="comparison-table-wrapper">
        <table class="comparison-table">
          <thead>
            <tr>
              <th class="feature-header">
                <span class="header-small">Choose</span>
                <span class="header-large">Best Monthly Plan</span>
              </th>
              <th>
                <div class="plan-header">
                  <span class="plan-price">$29<span class="price-period">/mo</span></span>
                  <span class="plan-usage">+ usage over $10</span>
                  <button
                    class="table-cta primary"
                    on:click={() => handlePlanClick("PRO")}
                    disabled={isPlanDisabled("PRO") || isLoadingPlan("PRO")}
                  >
                    {isLoadingPlan("PRO") ? "Loading..." : getButtonText("PRO")}
                  </button>
                </div>
              </th>
              <th>
                <div class="plan-header">
                  <span class="plan-price">$99<span class="price-period">/mo</span></span>
                  <span class="plan-usage">+ usage over $30</span>
                  <button
                    class="table-cta primary"
                    on:click={() => handlePlanClick("TEAM")}
                    disabled={isPlanDisabled("TEAM") || isLoadingPlan("TEAM")}
                  >
                    {isLoadingPlan("TEAM") ? "Loading..." : getButtonText("TEAM")}
                  </button>
                </div>
              </th>
              <th>
                <div class="plan-header">
                  <span class="plan-price">$299<span class="price-period">/mo</span></span>
                  <span class="plan-usage">+ usage over $100</span>
                  <button
                    class="table-cta secondary"
                    on:click={() => handlePlanClick("BUSINESS")}
                    disabled={isPlanDisabled("BUSINESS") || isLoadingPlan("BUSINESS")}
                  >
                    {isLoadingPlan("BUSINESS") ? "Loading..." : getButtonText("BUSINESS")}
                  </button>
                </div>
              </th>
              <th>
                <div class="plan-header">
                  <span class="plan-price custom">Custom</span>
                  <span class="plan-usage">&nbsp;</span>
                  <button class="table-cta primary" on:click={handleContactUs}>
                    Chat With Us
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {#each comparisonRows as row}
              <tr>
                <td class="feature-label">{row.label}</td>
                <td>{row.pro}</td>
                <td>{row.team}</td>
                <td>{row.business}</td>
                <td>{row.enterprise}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <!-- All About Usage Section -->
  {#if visible}
    <section class="usage-section" in:fly={{ y: 20, duration: 600, delay: 900 }}>
      <div class="usage-card">
        <h2>All About Usage</h2>
        <div class="usage-content">
          <p class="usage-bold">Chipp pays for all AI costs on your account.</p>
          <p>That means every time you ask a question, we pay whichever model provider you choose (OpenAI, Google, etc.).</p>
          <p>To make things easy for you, initial usage is included with your plan.</p>
          <p>If you exceed that usage in a given month, you are charged the overage. Chipp charges the direct cost for the model you choose with a 30% service fee.</p>

          <div class="usage-highlight">
            <strong>Quick Reference:</strong> $10/mo provides roughly 10 million words on the top models, more on the smaller models.
          </div>
        </div>
      </div>
    </section>
  {/if}

  <!-- Section Divider -->
  <div class="section-divider">
    <div class="divider-line"></div>
    <div class="divider-dot"></div>
    <div class="divider-line"></div>
  </div>

  <!-- FAQ Section -->
  {#if visible}
    <section class="faq-section" in:fly={{ y: 20, duration: 600, delay: 1000 }}>
      <h2>Frequently Asked Questions</h2>
      <p class="section-subtitle">Everything you need to know about our plans and pricing</p>

      <div class="faq-list">
        {#each faqData as faq, index}
          <div class="faq-item" class:open={openFaqIndex === index}>
            <button class="faq-question" on:click={() => toggleFaq(index)}>
              <span>{faq.question}</span>
              <svg class="faq-chevron" viewBox="0 0 24 24" fill="none">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            {#if openFaqIndex === index}
              <div class="faq-answer" transition:slide={{ duration: 300 }}>
                <p>
                  {faq.answer}
                  {#if faq.hasLink}
                    <a href={faq.linkUrl} target="_blank" rel="noopener noreferrer" class="faq-link">{faq.linkText}</a>
                  {/if}
                </p>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- More Questions Section -->
  {#if visible}
    <section class="more-questions-section" in:fly={{ y: 20, duration: 600, delay: 1100 }}>
      <h2>More Questions?</h2>
      <p class="section-subtitle">Ask Chipp!</p>

      <div class="chatbot-embed">
        <iframe
          src="https://chippysupportai-10031755.chipp.ai"
          height="600"
          width="100%"
          frameborder="0"
          title="Chippy Support AI"
        ></iframe>
      </div>
    </section>
  {/if}

  <!-- Contact Section -->
  {#if visible}
    <section class="contact-section" in:fly={{ y: 20, duration: 600, delay: 1200 }}>
      <h2>Need something custom?</h2>
      <p>Contact our sales team for enterprise solutions and custom pricing.</p>
      <button class="contact-cta" on:click={handleContactUs}>Contact Sales</button>
    </section>
  {/if}
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
    max-width: 900px;
    margin: 0 auto;
  }

  .stickers {
    display: flex;
    justify-content: center;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .sticker {
    width: 88px;
    height: auto;
    object-fit: contain;
  }

  .sticker:nth-child(2) {
    width: 98px;
  }

  .sticker:nth-child(3) {
    width: 98px;
  }

  .hero h1 {
    font-family: var(--font-heading);
    font-size: var(--text-5xl);
    font-weight: 400;
    color: hsl(var(--foreground));
    margin-bottom: var(--space-6);
  }

  .hero-subtitle {
    font-family: var(--font-body);
    font-size: var(--text-xl);
    color: hsl(var(--muted-foreground));
    max-width: 700px;
    margin: 0 auto;
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
    margin-bottom: var(--space-12);
  }

  .enterprise-cta {
    text-align: center;
    margin-top: var(--space-8);
  }

  .enterprise-cta p {
    font-family: var(--font-body);
    font-size: var(--text-lg);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-4);
  }

  .enterprise-cta strong {
    color: hsl(var(--foreground));
  }

  .secondary-cta {
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

  .secondary-cta:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  /* Section Divider */
  .section-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-12) var(--space-8);
    max-width: 1000px;
    margin: 0 auto;
  }

  .divider-line {
    flex: 1;
    max-width: 400px;
    height: 1px;
    background: linear-gradient(90deg, transparent, hsl(var(--border)), transparent);
  }

  .divider-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--brand-yellow);
    margin: 0 var(--space-6);
  }

  /* Add-ons Section */
  .addons-section {
    padding: var(--space-16) var(--space-8);
    max-width: 800px;
    margin: 0 auto;
  }

  .addons-section h2 {
    font-family: var(--font-heading);
    font-size: var(--text-4xl);
    font-weight: 400;
    color: hsl(var(--foreground));
    text-align: center;
    margin-bottom: var(--space-4);
  }

  .section-subtitle {
    font-family: var(--font-body);
    font-size: var(--text-lg);
    color: hsl(var(--muted-foreground));
    text-align: center;
    margin-bottom: var(--space-12);
  }

  .addons-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .addon-card {
    position: relative;
    padding: var(--space-8);
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
    border: 2px solid var(--brand-yellow);
    box-shadow: 0 8px 32px rgba(249, 210, 0, 0.2);
  }

  .addon-badge {
    position: absolute;
    top: -12px;
    right: 24px;
    padding: 4px 12px;
    background: var(--brand-yellow);
    color: #111;
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 600;
    border-radius: 999px;
  }

  .addon-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-6);
  }

  .addon-card h3 {
    font-family: var(--font-heading);
    font-size: var(--text-2xl);
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .addon-price {
    font-family: var(--font-heading);
    font-size: var(--text-2xl);
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .addon-features {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-6) 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .addon-features li {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .addon-features .check-icon {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--brand-yellow);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .addon-features .check-icon svg {
    width: 12px;
    height: 12px;
    color: #111;
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
    display: block;
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: hsl(var(--foreground));
    color: hsl(var(--background));
    border: none;
    border-radius: var(--radius);
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .addon-cta:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  /* Security Section */
  .security-section {
    padding: var(--space-16) var(--space-8);
    max-width: 1200px;
    margin: 0 auto;
  }

  .security-section h2 {
    font-family: var(--font-heading);
    font-size: var(--text-4xl);
    font-weight: 400;
    color: hsl(var(--foreground));
    text-align: center;
    margin-bottom: var(--space-4);
  }

  .security-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-6);
  }

  .security-card {
    text-align: center;
    padding: var(--space-6);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    transition: all 0.2s ease;
  }

  .security-card:hover {
    border-color: hsl(var(--foreground) / 0.2);
  }

  .security-icon {
    width: 80px;
    height: 80px;
    margin: 0 auto var(--space-4);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .soc-badge-text {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--brand-yellow);
    color: #111;
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .icon-emoji {
    font-size: 40px;
    line-height: 1;
  }

  .security-card h3 {
    font-family: var(--font-body);
    font-size: var(--text-lg);
    font-weight: 700;
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .security-card p {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-3);
  }

  .security-link {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    color: hsl(var(--foreground));
    text-decoration: none;
  }

  .security-link:hover {
    text-decoration: underline;
  }

  /* Comparison Section */
  .comparison-section {
    padding: var(--space-16) var(--space-8);
    max-width: 1400px;
    margin: 0 auto;
  }

  .comparison-section h2 {
    font-family: var(--font-heading);
    font-size: var(--text-4xl);
    font-weight: 400;
    color: hsl(var(--foreground));
    text-align: center;
    margin-bottom: var(--space-12);
  }

  .comparison-table-wrapper {
    overflow-x: auto;
    border-radius: var(--radius-lg);
    border: 1px solid hsl(var(--border));
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  }

  .comparison-table {
    width: 100%;
    border-collapse: collapse;
    background: linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted) / 0.3) 100%);
  }

  .comparison-table th,
  .comparison-table td {
    padding: var(--space-4);
    text-align: center;
    border-bottom: 1px solid hsl(var(--border));
  }

  .comparison-table th {
    background: linear-gradient(180deg, hsl(var(--muted) / 0.5) 0%, hsl(var(--muted) / 0.3) 100%);
    border-left: 1px solid hsl(var(--border));
  }

  .comparison-table th:first-child {
    border-left: none;
    text-align: left;
  }

  .feature-header {
    min-width: 200px;
  }

  .header-small {
    display: block;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    font-weight: 400;
    margin-bottom: var(--space-1);
  }

  .header-large {
    display: block;
    font-family: var(--font-heading);
    font-size: var(--text-xl);
    color: hsl(var(--foreground));
    font-weight: 400;
  }

  .plan-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: center;
    min-width: 140px;
  }

  .plan-price {
    font-family: var(--font-heading);
    font-size: var(--text-3xl);
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .plan-price.custom {
    font-size: var(--text-2xl);
  }

  .price-period {
    font-family: var(--font-body);
    font-size: var(--text-lg);
    font-weight: 400;
    color: hsl(var(--muted-foreground));
  }

  .plan-usage {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .table-cta {
    width: 100%;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .table-cta.primary {
    background: var(--brand-yellow);
    color: #111;
  }

  .table-cta.secondary {
    background: hsl(var(--foreground));
    color: hsl(var(--background));
  }

  .table-cta:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .table-cta:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .comparison-table td {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    border-left: 1px solid hsl(var(--border));
  }

  .comparison-table td:first-child {
    border-left: none;
  }

  .feature-label {
    text-align: left !important;
    font-weight: 500;
    color: hsl(var(--foreground));
    background: hsl(var(--muted) / 0.3);
  }

  .comparison-table tr:last-child td {
    border-bottom: none;
  }

  /* Usage Section */
  .usage-section {
    padding: var(--space-16) var(--space-8);
    max-width: 900px;
    margin: 0 auto;
  }

  .usage-card {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    padding: var(--space-10);
  }

  .usage-card h2 {
    font-family: var(--font-heading);
    font-size: var(--text-3xl);
    font-weight: 400;
    color: hsl(var(--foreground));
    text-align: center;
    margin-bottom: var(--space-8);
  }

  .usage-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .usage-content p {
    font-family: var(--font-body);
    font-size: var(--text-lg);
    color: hsl(var(--muted-foreground));
    line-height: 1.7;
  }

  .usage-bold {
    font-weight: 700;
    color: hsl(var(--foreground)) !important;
  }

  .usage-highlight {
    margin-top: var(--space-4);
    padding: var(--space-6);
    background: hsl(48 100% 95%);
    border-left: 4px solid var(--brand-yellow);
    border-radius: 0 var(--radius) var(--radius) 0;
    font-family: var(--font-body);
    font-size: var(--text-base);
    color: hsl(var(--foreground));
  }

  /* FAQ Section */
  .faq-section {
    padding: var(--space-16) var(--space-8);
    max-width: 900px;
    margin: 0 auto;
  }

  .faq-section h2 {
    font-family: var(--font-heading);
    font-size: var(--text-4xl);
    font-weight: 400;
    color: hsl(var(--foreground));
    text-align: center;
    margin-bottom: var(--space-4);
  }

  .faq-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-top: var(--space-12);
  }

  .faq-item {
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .faq-item:hover {
    border-color: hsl(48 100% 50% / 0.5);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }

  .faq-item.open {
    border-color: hsl(var(--foreground) / 0.2);
  }

  .faq-question {
    width: 100%;
    padding: var(--space-5);
    background: transparent;
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
    transition: background 0.2s ease;
  }

  .faq-question:hover {
    background: hsl(var(--muted) / 0.5);
  }

  .faq-chevron {
    width: 20px;
    height: 20px;
    color: hsl(var(--muted-foreground));
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .faq-item.open .faq-chevron {
    transform: rotate(180deg);
  }

  .faq-answer {
    padding: 0 var(--space-5) var(--space-5) var(--space-5);
    border-top: 1px solid hsl(var(--border));
  }

  .faq-answer p {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    line-height: 1.7;
    padding-top: var(--space-4);
  }

  .faq-link {
    color: hsl(var(--foreground));
    font-weight: 600;
    text-decoration: underline;
  }

  /* More Questions Section */
  .more-questions-section {
    padding: var(--space-16) var(--space-8);
    max-width: 900px;
    margin: 0 auto;
  }

  .more-questions-section h2 {
    font-family: var(--font-heading);
    font-size: var(--text-4xl);
    font-weight: 400;
    color: hsl(var(--foreground));
    text-align: center;
    margin-bottom: var(--space-2);
  }

  .chatbot-embed {
    margin-top: var(--space-8);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .chatbot-embed iframe {
    display: block;
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

  /* Responsive */
  @media (max-width: 768px) {
    .hero h1 {
      font-size: var(--text-3xl);
    }

    .hero-subtitle {
      font-size: var(--text-lg);
    }

    .stickers {
      gap: var(--space-2);
    }

    .sticker {
      width: 60px;
    }

    .sticker:nth-child(2),
    .sticker:nth-child(3) {
      width: 68px;
    }

    .plans-grid {
      grid-template-columns: 1fr;
    }

    .comparison-table-wrapper {
      margin: 0 calc(-1 * var(--space-4));
      border-radius: 0;
    }

    .security-grid {
      grid-template-columns: 1fr 1fr;
    }

    .addons-section h2,
    .security-section h2,
    .comparison-section h2,
    .faq-section h2,
    .more-questions-section h2 {
      font-size: var(--text-3xl);
    }
  }

  @media (max-width: 480px) {
    .security-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
