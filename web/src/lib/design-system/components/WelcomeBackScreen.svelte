<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import Button from "./Button.svelte";
  import ChippLogo from "./ChippLogo.svelte";

  export let name: string | null = null;
  export let email: string | null = null;
  export let image: string | null = null;

  // Whitelabel customization props
  export let logoUrl: string | null = null;
  export let logoDarkUrl: string | null = null;
  export let companyName: string = "Chipp";
  export let subtitle: string | null = null;

  const dispatch = createEventDispatcher<{
    continue: void;
    switchAccount: void;
  }>();

  // Get first name for friendlier greeting
  $: firstName = name?.split(" ")[0] || "there";

  // Default subtitle for whitelabel - generic message
  $: displaySubtitle = subtitle ||
    `We've rebuilt ${companyName} from the ground up with a faster, more powerful experience. Your apps are ready to come along for the ride.`;

  // Check if using custom logo
  $: hasCustomLogo = !!logoUrl;

  // Generate initials for avatar fallback
  $: initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : email?.[0]?.toUpperCase() || "?";

  // Generate floating particles with random properties
  const particleColors = ['blue', 'purple', 'yellow', 'orange'] as const;
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    delay: i * 1.2,
    size: Math.random() * 12 + 6,
    left: `${Math.random() * 100}%`,
    duration: Math.random() * 12 + 18,
    blur: Math.random() > 0.8,
    color: particleColors[i % particleColors.length],
  }));

  // Mouse position for parallax effect
  let mouseX = 0;
  let mouseY = 0;
  let mounted = false;

  function handleMouseMove(e: MouseEvent) {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 30;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 30;
  }

  onMount(() => {
    setTimeout(() => mounted = true, 50);
  });
</script>

<svelte:window on:mousemove={handleMouseMove} />

<div class="welcome-screen">
  <!-- Grain texture overlay -->
  <div class="grain-overlay"></div>

  <!-- Animated mesh gradient background -->
  <div
    class="gradient-mesh"
    style="transform: translate({mouseX}px, {mouseY}px)"
  ></div>

  <!-- Accent orbs -->
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>

  <!-- Floating particles -->
  <div class="particles-container">
    {#each particles as particle (particle.id)}
      <div
        class="particle particle-{particle.color}"
        class:particle-blur={particle.blur}
        style="
          width: {particle.size}px;
          height: {particle.size}px;
          left: {particle.left};
          animation-delay: {particle.delay}s;
          animation-duration: {particle.duration}s;
        "
      ></div>
    {/each}
  </div>

  <!-- Glassmorphism card -->
  <div class="content-card" class:mounted>
    <div class="card-glow"></div>

    <div class="content">
      <!-- Logo with glow -->
      <div class="logo-section" class:mounted style="--delay: 0.1s">
        <div class="logo-glow"></div>
        <div class="logo-container">
          {#if hasCustomLogo}
            <!-- Light mode custom logo -->
            <img
              src={logoUrl}
              alt={companyName}
              class="custom-logo"
              class:has-dark-variant={!!logoDarkUrl}
            />
            <!-- Dark mode custom logo (if provided) -->
            {#if logoDarkUrl}
              <img
                src={logoDarkUrl}
                alt={companyName}
                class="custom-logo custom-logo-dark"
              />
            {/if}
          {:else}
            <ChippLogo size="lg" />
          {/if}
        </div>
      </div>

      <!-- Welcome message -->
      <div class="welcome-text">
        <span class="eyebrow" class:mounted style="--delay: 0.15s">Welcome back</span>
        <h1 class:mounted style="--delay: 0.2s">Hey {firstName}!</h1>
        <p class="subtitle" class:mounted style="--delay: 0.25s">
          {displaySubtitle}
        </p>
      </div>

      <!-- User card -->
      <div class="user-card" class:mounted style="--delay: 0.3s">
        <div class="user-avatar">
          {#if image}
            <img src={image} alt={name || "User"} />
          {:else}
            <span class="avatar-initials">{initials}</span>
          {/if}
          <div class="avatar-ring"></div>
        </div>
        <div class="user-info">
          {#if name}
            <span class="user-name">{name}</span>
          {/if}
          <span class="user-email">{email}</span>
        </div>
        <div class="checkmark">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
            <path
              d="M8 12l2.5 2.5L16 9"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </div>

      <!-- Features preview -->
      <div class="features" class:mounted style="--delay: 0.35s">
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <span>Lightning fast</span>
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
              <path d="M12 2a10 10 0 0 1 10 10" />
              <circle cx="12" cy="12" r="4" />
            </svg>
          </div>
          <span>Smarter AI</span>
        </div>
        <div class="feature">
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </div>
          <span>New tools</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="actions" class:mounted style="--delay: 0.4s">
        <Button variant="primary" size="lg" fullWidth on:click={() => dispatch("continue")}>
          <svg
            class="button-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          Continue to Import
        </Button>
        <button class="switch-account" on:click={() => dispatch("switchAccount")}>
          Not {firstName}? Use a different account
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .welcome-screen {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg,
      hsl(var(--background)) 0%,
      hsl(var(--muted)) 100%
    );
    z-index: 100;
    overflow: hidden;
  }

  /* Grain texture */
  .grain-overlay {
    position: fixed;
    inset: 0;
    z-index: 101;
    pointer-events: none;
    opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  }

  /* Animated mesh gradient - uses brand colors with fallbacks */
  .gradient-mesh {
    position: absolute;
    inset: -50%;
    opacity: 0.6;
    background:
      radial-gradient(ellipse 80% 60% at 10% 20%, var(--brand-color-muted, rgba(59, 130, 246, 0.15)) 0%, transparent 50%),
      radial-gradient(ellipse 60% 50% at 90% 80%, var(--brand-tertiary-muted, rgba(139, 92, 246, 0.12)) 0%, transparent 50%),
      radial-gradient(ellipse 50% 40% at 50% 50%, var(--brand-color-muted, rgba(59, 130, 246, 0.08)) 0%, transparent 50%);
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
  }

  /* Floating orbs */
  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    pointer-events: none;
    animation: orb-float 20s ease-in-out infinite;
  }

  .orb-1 {
    width: 400px;
    height: 400px;
    background: var(--brand-color-muted, rgba(59, 130, 246, 0.12));
    top: -10%;
    left: -5%;
    animation-delay: 0s;
  }

  .orb-2 {
    width: 300px;
    height: 300px;
    background: var(--brand-tertiary-muted, rgba(139, 92, 246, 0.1));
    bottom: -5%;
    right: -5%;
    animation-delay: -7s;
  }

  .orb-3 {
    width: 250px;
    height: 250px;
    background: var(--brand-secondary-muted, rgba(251, 146, 60, 0.15));
    top: 50%;
    right: 20%;
    animation-delay: -14s;
  }

  @keyframes orb-float {
    0%, 100% {
      transform: translate(0, 0) scale(1);
    }
    25% {
      transform: translate(30px, -30px) scale(1.05);
    }
    50% {
      transform: translate(-20px, 20px) scale(0.95);
    }
    75% {
      transform: translate(20px, 30px) scale(1.02);
    }
  }

  /* Particles */
  .particles-container {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 5;
  }

  .particle {
    position: absolute;
    border-radius: 50%;
    opacity: 0;
    top: 100%;
    animation: float ease-in-out infinite;
  }

  .particle-blue {
    background: var(--brand-color-muted, rgba(59, 130, 246, 0.3));
    box-shadow: 0 0 10px var(--brand-color-glow, rgba(59, 130, 246, 0.2));
  }

  .particle-purple {
    background: var(--brand-tertiary-muted, rgba(139, 92, 246, 0.3));
    box-shadow: 0 0 10px var(--brand-tertiary-muted, rgba(139, 92, 246, 0.2));
  }

  .particle-yellow {
    background: var(--brand-color-glow, rgba(250, 204, 21, 0.35));
    box-shadow: 0 0 10px var(--brand-color-glow, rgba(250, 204, 21, 0.25));
  }

  .particle-orange {
    background: var(--brand-secondary-muted, rgba(251, 146, 60, 0.32));
    box-shadow: 0 0 10px var(--brand-secondary-muted, rgba(251, 146, 60, 0.22));
  }

  .particle-blur {
    filter: blur(2px);
  }

  @keyframes float {
    0%, 100% {
      transform: translateY(0) rotate(0deg);
      opacity: 0;
    }
    10% {
      opacity: 0.7;
    }
    90% {
      opacity: 0.7;
    }
    100% {
      transform: translateY(-100vh) rotate(360deg);
      opacity: 0;
    }
  }

  /* Glassmorphism card */
  .content-card {
    position: relative;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: var(--radius-2xl);
    border: 1px solid rgba(0, 0, 0, 0.08);
    padding: var(--space-8);
    width: 100%;
    max-width: 480px;
    z-index: 10;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.5),
      0 25px 50px -12px rgba(0, 0, 0, 0.15),
      0 0 80px -20px var(--brand-color-muted, rgba(59, 130, 246, 0.15));
    opacity: 0;
    transform: translateY(20px) scale(0.98);
    transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .content-card.mounted {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* Subtle card glow */
  .card-glow {
    position: absolute;
    inset: -1px;
    border-radius: var(--radius-2xl);
    background: linear-gradient(
      135deg,
      var(--brand-color-muted, rgba(59, 130, 246, 0.15)) 0%,
      transparent 50%,
      var(--brand-tertiary-muted, rgba(139, 92, 246, 0.1)) 100%
    );
    z-index: -1;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .content-card:hover .card-glow {
    opacity: 1;
  }

  /* Content */
  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    text-align: center;
  }

  /* Entrance animations for children */
  .logo-section,
  .eyebrow,
  h1,
  .subtitle,
  .user-card,
  .features,
  .actions {
    opacity: 0;
    transform: translateY(15px);
    transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    transition-delay: var(--delay, 0s);
  }

  .logo-section.mounted,
  .eyebrow.mounted,
  h1.mounted,
  .subtitle.mounted,
  .user-card.mounted,
  .features.mounted,
  .actions.mounted {
    opacity: 1;
    transform: translateY(0);
  }

  /* Logo */
  .logo-section {
    position: relative;
    margin-bottom: var(--space-2);
  }

  .logo-glow {
    position: absolute;
    inset: -40px;
    background: radial-gradient(circle, var(--brand-color-glow, rgba(250, 204, 21, 0.3)) 0%, transparent 70%);
    filter: blur(20px);
    animation: pulse 3s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 0.3;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.1);
    }
  }

  .logo-container {
    position: relative;
  }

  .custom-logo {
    max-height: 64px;
    max-width: 200px;
    width: auto;
    height: auto;
    object-fit: contain;
  }

  .custom-logo.has-dark-variant {
    display: block;
  }

  .custom-logo-dark {
    display: none;
  }

  :global(.dark) .custom-logo.has-dark-variant,
  :global([data-theme="dark"]) .custom-logo.has-dark-variant {
    display: none;
  }

  :global(.dark) .custom-logo-dark,
  :global([data-theme="dark"]) .custom-logo-dark {
    display: block;
  }

  /* Welcome text */
  .welcome-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .eyebrow {
    font-family: var(--font-sans, "Mulish", sans-serif);
    font-size: var(--text-xs);
    font-weight: var(--font-bold);
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--brand-color, #f9db00);
  }

  h1 {
    font-family: var(--font-display, "Chubbo", sans-serif);
    font-size: 2.5rem;
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-family: var(--font-sans, "Mulish", sans-serif);
    font-size: var(--text-base);
    color: hsl(var(--foreground) / 0.7);
    margin: 0;
    line-height: 1.6;
    max-width: 340px;
  }

  /* User card */
  .user-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-xl);
    width: 100%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .user-avatar {
    position: relative;
    width: 56px;
    height: 56px;
    flex-shrink: 0;
  }

  .user-avatar img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar-initials {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--brand-color, #f9db00) 0%, #f59e0b 100%);
    color: #000;
    font-size: var(--text-lg);
    font-weight: var(--font-bold);
  }

  .avatar-ring {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid var(--brand-color, #f9db00);
    opacity: 0.5;
  }

  .user-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .user-name {
    font-family: var(--font-sans, "Mulish", sans-serif);
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .user-email {
    font-family: var(--font-sans, "Mulish", sans-serif);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .checkmark {
    width: 32px;
    height: 32px;
    color: var(--brand-secondary, #10b981);
    flex-shrink: 0;
  }

  .checkmark svg {
    width: 100%;
    height: 100%;
  }

  /* Features */
  .features {
    display: flex;
    gap: var(--space-6);
  }

  .feature {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .feature-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    color: hsl(var(--foreground));
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .feature-icon svg {
    width: 20px;
    height: 20px;
  }

  .feature span {
    font-family: var(--font-sans, "Mulish", sans-serif);
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground) / 0.65);
  }

  /* Actions */
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    margin-top: var(--space-2);
  }

  .actions :global(.button) {
    height: 52px;
    font-size: var(--text-base);
  }

  .button-icon {
    width: 20px;
    height: 20px;
    margin-right: var(--space-2);
  }

  .switch-account {
    background: none;
    border: none;
    font-family: var(--font-sans, "Mulish", sans-serif);
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    cursor: pointer;
    padding: var(--space-2);
    transition: color var(--transition-fast);
  }

  .switch-account:hover {
    color: hsl(var(--foreground));
  }

  /* Responsive */
  @media (max-width: 480px) {
    .content-card {
      padding: var(--space-6);
      margin: var(--space-4);
    }

    h1 {
      font-size: 2rem;
    }

    .features {
      gap: var(--space-4);
    }

    .orb-1, .orb-2, .orb-3 {
      display: none;
    }
  }

  /* Dark mode adjustments */
  :global(.dark) .content-card,
  :global([data-theme="dark"]) .content-card {
    background: rgba(15, 23, 42, 0.8);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.05),
      0 25px 50px -12px rgba(0, 0, 0, 0.5),
      0 0 80px -20px var(--brand-color-glow, rgba(96, 165, 250, 0.2));
  }

  :global(.dark) .particle-blue,
  :global([data-theme="dark"]) .particle-blue {
    background: var(--brand-color-muted, rgba(96, 165, 250, 0.35));
    box-shadow: 0 0 12px var(--brand-color-glow, rgba(96, 165, 250, 0.25));
  }

  :global(.dark) .particle-purple,
  :global([data-theme="dark"]) .particle-purple {
    background: var(--brand-tertiary-muted, rgba(167, 139, 250, 0.35));
    box-shadow: 0 0 12px var(--brand-tertiary-muted, rgba(167, 139, 250, 0.25));
  }

  :global(.dark) .particle-yellow,
  :global([data-theme="dark"]) .particle-yellow {
    background: var(--brand-color-glow, rgba(250, 204, 21, 0.4));
    box-shadow: 0 0 12px var(--brand-color-glow, rgba(250, 204, 21, 0.3));
  }

  :global(.dark) .particle-orange,
  :global([data-theme="dark"]) .particle-orange {
    background: var(--brand-secondary-muted, rgba(251, 146, 60, 0.38));
    box-shadow: 0 0 12px var(--brand-secondary-muted, rgba(251, 146, 60, 0.28));
  }

  :global(.dark) .orb-1,
  :global([data-theme="dark"]) .orb-1 {
    background: var(--brand-color-muted, rgba(96, 165, 250, 0.15));
  }

  :global(.dark) .orb-2,
  :global([data-theme="dark"]) .orb-2 {
    background: var(--brand-tertiary-muted, rgba(167, 139, 250, 0.12));
  }

  :global(.dark) .orb-3,
  :global([data-theme="dark"]) .orb-3 {
    background: var(--brand-secondary-muted, rgba(249, 219, 0, 0.12));
  }

  :global(.dark) .eyebrow,
  :global([data-theme="dark"]) .eyebrow {
    color: var(--brand-color-light, #fbbf24);
  }

  :global(.dark) .user-card,
  :global([data-theme="dark"]) .user-card {
    background: hsla(var(--secondary), 0.5);
    box-shadow: none;
  }

  :global(.dark) .feature-icon,
  :global([data-theme="dark"]) .feature-icon {
    background: hsla(var(--secondary), 0.5);
    box-shadow: none;
  }
</style>
