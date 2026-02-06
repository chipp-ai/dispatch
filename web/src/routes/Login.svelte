<script lang="ts">
  import {
    Button,
    Input,
    ThemeToggle,
    ChippLogo,
    Spinner,
    toasts,
    WelcomeBackScreen,
  } from "$lib/design-system";
  import { API_URL } from "$lib/config";
  import { isAuthenticated } from "../stores/auth";
  import {
    checkLegacySession,
    legacyUser,
    checkWelcomeScreenSeen,
    markWelcomeScreenSeen,
  } from "../stores/legacySession";
  import { push } from "svelte-spa-router";
  import { onMount } from "svelte";
  import { captureException } from "$lib/sentry";

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

  function handleMouseMove(e: MouseEvent) {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 30;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 30;
  }

  const isDev = import.meta.env.DEV;

  let email = "";
  let password = "";
  let isLoading = false;
  let emailError = "";
  let passwordError = "";
  let showWelcomeScreen = false;
  let mounted = false;

  // Redirect if already authenticated
  onMount(async () => {
    // Trigger entrance animations
    setTimeout(() => mounted = true, 50);

    if ($isAuthenticated) {
      push("/");
      return;
    }

    // Check for error in URL
    const hash = window.location.hash;
    const errorMatch = hash.match(/error=([^&]+)/);
    if (errorMatch) {
      const error = errorMatch[1];
      if (error === "invalid_credentials") {
        toasts.error("Invalid credentials", "Please check your email and password");
      } else if (error === "auth_failed") {
        toasts.error("Authentication failed", "Please try again");
      }
    }

    // Check for existing chipp-admin session
    const legacyResult = await checkLegacySession();
    if (legacyResult.isLoggedIn && legacyResult.user?.email) {
      // Check if they've already seen the welcome screen
      const hasSeen = await checkWelcomeScreenSeen(legacyResult.user.email);
      if (!hasSeen) {
        email = legacyResult.user.email;
        showWelcomeScreen = true;
      }
    }
  });

  function handleWelcomeContinue() {
    // Mark as seen before continuing to OAuth
    if ($legacyUser?.email) {
      markWelcomeScreenSeen($legacyUser.email);
    }
    handleGoogleLogin();
  }

  function handleSwitchAccount() {
    // Mark as seen even when switching accounts
    if ($legacyUser?.email) {
      markWelcomeScreenSeen($legacyUser.email);
    }
    showWelcomeScreen = false;
    email = "";
  }

  function validateForm(): boolean {
    let isValid = true;
    emailError = "";
    passwordError = "";

    if (!email) {
      emailError = "Email is required";
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailError = "Please enter a valid email";
      isValid = false;
    }

    if (!password) {
      passwordError = "Password is required";
      isValid = false;
    }

    return isValid;
  }

  async function handleEmailLogin() {
    if (!validateForm()) return;

    isLoading = true;

    try {
      const response = await fetch("/auth/login/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          toasts.error("Invalid credentials", "Please check your email and password");
        } else if (response.status === 404) {
          toasts.error("Account not found", "No account exists with this email");
        } else {
          toasts.error("Login failed", data.error || "Please try again");
        }
        return;
      }

      toasts.success("Welcome back!", "You have been logged in");
      push("/");
    } catch (error) {
      captureException(error, { tags: { page: "login", feature: "login-submit" } });
      toasts.error("Login failed", "Please try again later");
    } finally {
      isLoading = false;
    }
  }

  function handleGoogleLogin() {
    window.location.href = `${API_URL}/auth/login/google`;
  }

  function handleMicrosoftLogin() {
    window.location.href = `${API_URL}/auth/login/microsoft`;
  }

  function handleDevLogin() {
    window.location.href = `${API_URL}/auth/dev-login`;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !isLoading) {
      handleEmailLogin();
    }
  }
</script>

<svelte:window on:mousemove={handleMouseMove} />

<!-- Welcome screen for detected legacy sessions -->
{#if showWelcomeScreen && $legacyUser}
  <WelcomeBackScreen
    name={$legacyUser.name}
    email={$legacyUser.email}
    image={$legacyUser.image}
    on:continue={handleWelcomeContinue}
    on:switchAccount={handleSwitchAccount}
  />
{:else}
  <div class="login-page">
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

    <!-- Theme toggle -->
    <div class="theme-toggle-wrapper">
      <ThemeToggle />
    </div>

    <!-- Glassmorphism card -->
    <div class="login-card" class:mounted>
      <div class="card-glow"></div>

      <div class="login-content">
        <div class="logo-wrapper" class:mounted style="--delay: 0.1s">
          <div class="logo-glow"></div>
          <div class="logo-container">
            <ChippLogo size="lg" />
          </div>
        </div>

        <h1 class:mounted style="--delay: 0.15s">Welcome back</h1>
        <p class="subtitle" class:mounted style="--delay: 0.2s">Sign in to your account to continue</p>

        <form class="form" on:submit|preventDefault={handleEmailLogin}>
          <div class:mounted style="--delay: 0.25s">
            <Input
              type="email"
              label="Email"
              placeholder="you@example.com"
              bind:value={email}
              error={emailError}
              disabled={isLoading}
              on:keydown={handleKeydown}
            />
          </div>

          <div class:mounted style="--delay: 0.3s">
            <Input
              type="password"
              label="Password"
              placeholder="Enter your password"
              bind:value={password}
              error={passwordError}
              disabled={isLoading}
              on:keydown={handleKeydown}
            />
          </div>

          <a href="#/forgot-password" class="forgot-password-link" class:mounted style="--delay: 0.35s">
            Forgot password?
          </a>

          <div class="button-wrapper" class:mounted style="--delay: 0.4s">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={isLoading}
              on:click={handleEmailLogin}
            >
              {#if isLoading}
                <Spinner size="sm" />
                Signing in...
              {:else}
                Sign in
              {/if}
            </Button>
          </div>
        </form>

        <div class="divider" class:mounted style="--delay: 0.45s">
          <span>or continue with</span>
        </div>

        <div class="oauth-buttons" class:mounted style="--delay: 0.5s">
          <button class="oauth-btn" on:click={handleGoogleLogin} disabled={isLoading}>
            <svg class="oauth-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google
          </button>

          <button class="oauth-btn" on:click={handleMicrosoftLogin} disabled={isLoading}>
            <svg class="oauth-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.4 11.4H2V2h9.4v9.4z" fill="#F25022"/>
              <path d="M22 11.4h-9.4V2H22v9.4z" fill="#7FBA00"/>
              <path d="M11.4 22H2v-9.4h9.4V22z" fill="#00A4EF"/>
              <path d="M22 22h-9.4v-9.4H22V22z" fill="#FFB900"/>
            </svg>
            Microsoft
          </button>
        </div>

        {#if isDev}
          <div class="dev-divider" class:mounted style="--delay: 0.55s">
            <span>dev mode</span>
          </div>
          <div class:mounted style="--delay: 0.6s">
            <Button variant="outline" size="lg" fullWidth on:click={handleDevLogin}>
              Dev Login (hunter@chipp.ai)
            </Button>
          </div>
        {/if}

        <p class="signup-link" class:mounted style="--delay: 0.65s">
          Don't have an account? <a href="#/signup">Sign up</a>
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  .login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--space-4);
    background: linear-gradient(135deg,
      hsl(var(--background)) 0%,
      hsl(var(--muted)) 100%
    );
    position: relative;
    overflow: hidden;
  }

  /* Grain texture */
  .grain-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    pointer-events: none;
    opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  }

  /* Animated mesh gradient */
  .gradient-mesh {
    position: absolute;
    inset: -50%;
    opacity: 0.6;
    background:
      radial-gradient(ellipse 80% 60% at 10% 20%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
      radial-gradient(ellipse 60% 50% at 90% 80%, rgba(139, 92, 246, 0.12) 0%, transparent 50%),
      radial-gradient(ellipse 50% 40% at 50% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%);
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
    background: rgba(59, 130, 246, 0.12);
    top: -10%;
    left: -5%;
    animation-delay: 0s;
  }

  .orb-2 {
    width: 300px;
    height: 300px;
    background: rgba(139, 92, 246, 0.1);
    bottom: -5%;
    right: -5%;
    animation-delay: -7s;
  }

  .orb-3 {
    width: 250px;
    height: 250px;
    /* Use orange-yellow for better visibility against light backgrounds */
    background: rgba(251, 146, 60, 0.15);
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
    background: rgba(59, 130, 246, 0.3);
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.2);
  }

  .particle-purple {
    background: rgba(139, 92, 246, 0.3);
    box-shadow: 0 0 10px rgba(139, 92, 246, 0.2);
  }

  .particle-yellow {
    background: rgba(250, 204, 21, 0.35);
    box-shadow: 0 0 10px rgba(250, 204, 21, 0.25);
  }

  .particle-orange {
    background: rgba(251, 146, 60, 0.32);
    box-shadow: 0 0 10px rgba(251, 146, 60, 0.22);
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

  /* Theme toggle */
  .theme-toggle-wrapper {
    position: fixed;
    top: var(--space-4);
    right: var(--space-4);
    z-index: 50;
  }

  /* Glassmorphism card */
  .login-card {
    position: relative;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: var(--radius-2xl);
    border: 1px solid rgba(0, 0, 0, 0.08);
    padding: var(--space-8);
    width: 100%;
    max-width: 420px;
    z-index: 10;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.5),
      0 25px 50px -12px rgba(0, 0, 0, 0.15),
      0 0 80px -20px rgba(59, 130, 246, 0.15);
    opacity: 0;
    transform: translateY(20px) scale(0.98);
    transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .login-card.mounted {
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
      rgba(59, 130, 246, 0.15) 0%,
      transparent 50%,
      rgba(139, 92, 246, 0.1) 100%
    );
    z-index: -1;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .login-card:hover .card-glow {
    opacity: 1;
  }

  .login-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    text-align: center;
  }

  /* Entrance animations for children */
  .logo-wrapper,
  h1,
  .subtitle,
  .form > div,
  .forgot-password-link,
  .button-wrapper,
  .divider,
  .oauth-buttons,
  .dev-divider,
  .signup-link {
    opacity: 0;
    transform: translateY(15px);
    transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    transition-delay: var(--delay, 0s);
  }

  .logo-wrapper.mounted,
  h1.mounted,
  .subtitle.mounted,
  .form > div.mounted,
  .forgot-password-link.mounted,
  .button-wrapper.mounted,
  .divider.mounted,
  .oauth-buttons.mounted,
  .dev-divider.mounted,
  .signup-link.mounted {
    opacity: 1;
    transform: translateY(0);
  }

  .logo-wrapper {
    position: relative;
    margin-bottom: var(--space-2);
  }

  .logo-glow {
    position: absolute;
    inset: -40px;
    background: radial-gradient(circle, rgba(250, 204, 21, 0.3) 0%, transparent 70%);
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

  h1 {
    font-family: var(--font-display, "Chubbo", sans-serif);
    font-size: var(--text-3xl);
    font-weight: var(--font-bold);
    color: hsl(var(--foreground));
    margin: 0;
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-family: var(--font-sans, "Mulish", sans-serif);
    color: hsl(var(--muted-foreground));
    margin: 0;
    font-size: var(--text-base);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
    margin-top: var(--space-4);
  }

  .forgot-password-link {
    align-self: flex-end;
    font-size: var(--text-sm);
    color: hsl(var(--accent));
    text-decoration: none;
    margin-top: calc(-1 * var(--space-1));
    transition: color 0.2s ease;
  }

  .forgot-password-link:hover {
    color: hsl(var(--accent) / 0.8);
  }

  .button-wrapper {
    margin-top: var(--space-2);
  }

  .divider {
    display: flex;
    align-items: center;
    width: 100%;
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
  }

  .divider::before,
  .divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      hsl(var(--border)),
      transparent
    );
  }

  .oauth-buttons {
    display: flex;
    gap: var(--space-3);
    width: 100%;
  }

  .oauth-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: hsla(var(--secondary), 0.5);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    color: hsl(var(--foreground));
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .oauth-btn:hover:not(:disabled) {
    background: hsla(var(--secondary), 0.8);
    border-color: hsl(var(--border) / 0.8);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px hsla(var(--background), 0.3);
  }

  .oauth-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .oauth-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .oauth-icon {
    width: 18px;
    height: 18px;
  }

  .dev-divider {
    display: flex;
    align-items: center;
    width: 100%;
    gap: var(--space-3);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
    margin-top: var(--space-2);
  }

  .dev-divider::before,
  .dev-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      hsl(var(--border)),
      transparent
    );
  }

  .signup-link {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-top: var(--space-2);
  }

  .signup-link a {
    color: hsl(var(--accent));
    text-decoration: none;
    font-weight: var(--font-medium);
    transition: color 0.2s ease;
  }

  .signup-link a:hover {
    color: hsl(var(--accent) / 0.8);
  }

  /* Responsive */
  @media (max-width: 480px) {
    .login-card {
      padding: var(--space-6);
    }

    h1 {
      font-size: var(--text-2xl);
    }

    .oauth-buttons {
      flex-direction: column;
    }

    .orb-1, .orb-2, .orb-3 {
      display: none;
    }
  }

  /* Dark mode adjustments */
  :global(.dark) .login-card,
  :global([data-theme="dark"]) .login-card {
    background: rgba(15, 23, 42, 0.8);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.05),
      0 25px 50px -12px rgba(0, 0, 0, 0.5),
      0 0 80px -20px rgba(96, 165, 250, 0.2);
  }

  :global(.dark) .particle-blue,
  :global([data-theme="dark"]) .particle-blue {
    background: rgba(96, 165, 250, 0.35);
    box-shadow: 0 0 12px rgba(96, 165, 250, 0.25);
  }

  :global(.dark) .particle-purple,
  :global([data-theme="dark"]) .particle-purple {
    background: rgba(167, 139, 250, 0.35);
    box-shadow: 0 0 12px rgba(167, 139, 250, 0.25);
  }

  :global(.dark) .particle-yellow,
  :global([data-theme="dark"]) .particle-yellow {
    background: rgba(250, 204, 21, 0.4);
    box-shadow: 0 0 12px rgba(250, 204, 21, 0.3);
  }

  :global(.dark) .particle-orange,
  :global([data-theme="dark"]) .particle-orange {
    background: rgba(251, 146, 60, 0.38);
    box-shadow: 0 0 12px rgba(251, 146, 60, 0.28);
  }

  :global(.dark) .orb-1,
  :global([data-theme="dark"]) .orb-1 {
    background: rgba(96, 165, 250, 0.15);
  }

  :global(.dark) .orb-2,
  :global([data-theme="dark"]) .orb-2 {
    background: rgba(167, 139, 250, 0.12);
  }

  :global(.dark) .orb-3,
  :global([data-theme="dark"]) .orb-3 {
    /* Chipp yellow works better on dark backgrounds */
    background: rgba(249, 219, 0, 0.12);
  }
</style>
