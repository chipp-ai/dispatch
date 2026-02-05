<script lang="ts">
  import {
    Button,
    Input,
    ThemeToggle,
    ChippLogo,
    Spinner,
    toasts,
    Testimonials,
    SignupDecorations,
    WelcomeBackScreen,
  } from "$lib/design-system";
  import { API_URL } from "$lib/config";
  import { isAuthenticated } from "../stores/auth";
  import { isWhitelabeled } from "../stores/whitelabel";
  import {
    checkLegacySession,
    legacyUser,
  } from "../stores/legacySession";
  import { push } from "svelte-spa-router";
  import { onMount } from "svelte";

  type Step = "email" | "password" | "otp";

  let step: Step = "email";
  let email = "";
  let password = "";
  let confirmPassword = "";
  let otpCode = "";
  let isLoading = false;

  // Error states
  let emailError = "";
  let passwordError = "";
  let confirmPasswordError = "";
  let otpError = "";

  // OTP input refs
  let otpInputs: HTMLInputElement[] = [];
  let otpValues = ["", "", "", "", "", ""];

  // Welcome screen state
  let showWelcomeScreen = false;

  // Redirect if already authenticated
  onMount(async () => {
    if ($isAuthenticated) {
      push("/");
      return;
    }

    // Check for existing chipp-admin session
    const legacyResult = await checkLegacySession();
    if (legacyResult.isLoggedIn && legacyResult.user?.email) {
      email = legacyResult.user.email;
      showWelcomeScreen = true;
    }
  });

  function handleWelcomeContinue() {
    // User wants to continue with their detected account - use Google OAuth
    handleGoogleSignup();
  }

  function handleSwitchAccount() {
    // User wants to use a different account
    showWelcomeScreen = false;
    email = "";
  }

  function validateEmail(): boolean {
    emailError = "";
    if (!email) {
      emailError = "Email is required";
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      emailError = "Please enter a valid email";
      return false;
    }
    if (email.includes("+")) {
      emailError = "Email addresses with '+' are not allowed";
      return false;
    }
    return true;
  }

  function validatePassword(): boolean {
    passwordError = "";
    confirmPasswordError = "";

    if (!password) {
      passwordError = "Password is required";
      return false;
    }
    if (password.length < 8) {
      passwordError = "Password must be at least 8 characters";
      return false;
    }
    if (!confirmPassword) {
      confirmPasswordError = "Please confirm your password";
      return false;
    }
    if (password !== confirmPassword) {
      confirmPasswordError = "Passwords do not match";
      return false;
    }
    return true;
  }

  async function handleEmailSubmit() {
    if (!validateEmail()) return;

    isLoading = true;

    try {
      // Check if email exists
      const response = await fetch("/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.exists) {
        emailError = "An account with this email already exists";
        return;
      }

      // Move to password step
      step = "password";
    } catch (error) {
      console.error("Email check error:", error);
      toasts.error("Error", "Please try again");
    } finally {
      isLoading = false;
    }
  }

  async function handlePasswordSubmit() {
    if (!validatePassword()) return;

    isLoading = true;

    try {
      // Send OTP to email
      const response = await fetch("/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        toasts.error("Error", data.error || "Failed to send verification code");
        return;
      }

      toasts.success("Verification code sent", "Please check your email");
      step = "otp";
    } catch (error) {
      console.error("Send OTP error:", error);
      toasts.error("Error", "Please try again");
    } finally {
      isLoading = false;
    }
  }

  async function handleOtpSubmit() {
    const code = otpValues.join("");
    if (code.length !== 6) {
      otpError = "Please enter the 6-digit code";
      return;
    }

    isLoading = true;
    otpError = "";

    try {
      // Verify OTP and create account
      const response = await fetch("/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, otp: code }),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 400 && data.error?.includes("Invalid")) {
          otpError = "Invalid verification code";
        } else if (response.status === 410) {
          otpError = "Verification code expired. Please request a new one.";
        } else {
          toasts.error("Signup failed", data.error || "Please try again");
        }
        return;
      }

      toasts.success("Account created!", "Welcome to Chipp");
      push("/");
    } catch (error) {
      console.error("Signup error:", error);
      toasts.error("Error", "Please try again");
    } finally {
      isLoading = false;
    }
  }

  function handleOtpInput(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    // Only allow digits
    if (!/^\d*$/.test(value)) {
      input.value = otpValues[index];
      return;
    }

    otpValues[index] = value.slice(-1);
    otpValues = [...otpValues]; // Trigger reactivity

    // Auto-advance to next input
    if (value && index < 5) {
      otpInputs[index + 1]?.focus();
    }
  }

  function handleOtpKeydown(index: number, event: KeyboardEvent) {
    // Handle backspace
    if (event.key === "Backspace" && !otpValues[index] && index > 0) {
      otpInputs[index - 1]?.focus();
    }
    // Handle paste
    if (event.key === "v" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      navigator.clipboard.readText().then((text) => {
        const digits = text.replace(/\D/g, "").slice(0, 6);
        for (let i = 0; i < digits.length; i++) {
          otpValues[i] = digits[i];
        }
        otpValues = [...otpValues];
        if (digits.length === 6) {
          handleOtpSubmit();
        }
      });
    }
  }

  async function handleResendOtp() {
    isLoading = true;

    try {
      const response = await fetch("/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json();
        toasts.error("Error", data.error || "Failed to resend code");
        return;
      }

      toasts.success("Code resent", "Please check your email");
      otpValues = ["", "", "", "", "", ""];
      otpError = "";
    } catch (error) {
      console.error("Resend OTP error:", error);
      toasts.error("Error", "Please try again");
    } finally {
      isLoading = false;
    }
  }

  function handleGoogleSignup() {
    // OAuth must go directly to API domain so cookies are set correctly for callback
    window.location.href = `${API_URL}/auth/login/google`;
  }

  function handleMicrosoftSignup() {
    // OAuth must go directly to API domain so cookies are set correctly for callback
    window.location.href = `${API_URL}/auth/login/microsoft`;
  }

  function goBack() {
    if (step === "password") {
      step = "email";
    } else if (step === "otp") {
      step = "password";
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !isLoading) {
      if (step === "email") {
        handleEmailSubmit();
      } else if (step === "password") {
        handlePasswordSubmit();
      } else if (step === "otp") {
        handleOtpSubmit();
      }
    }
  }
</script>

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
  <div class="signup-page">
    <!-- Left Panel: Form -->
    <div class="form-panel">
      <div class="theme-toggle-wrapper">
        <ThemeToggle />
      </div>

      <div class="signup-content">
        <div class="logo-wrapper">
          <!-- Radial gradient glow -->
          <div class="logo-glow"></div>
          <!-- Logo with float animation -->
          <div class="logo-float">
            <div class="logo-container">
              <ChippLogo size="lg" />
              <!-- Shimmer overlay -->
              <div class="shimmer-container">
                <div class="shimmer"></div>
              </div>
            </div>
          </div>
          <!-- Shadow for depth -->
          <div class="logo-shadow"></div>
        </div>

        {#if step === "email"}
          <span class="welcome-text">WELCOME TO CHIPP</span>
        <h1>Create an account for free</h1>

        <div class="oauth-buttons">
          <button
            class="oauth-button black"
            disabled={isLoading}
            on:click={handleGoogleSignup}
          >
            <svg class="oauth-icon" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <button
            class="oauth-button black"
            disabled={isLoading}
            on:click={handleMicrosoftSignup}
          >
            <svg class="oauth-icon" viewBox="0 0 24 24" fill="none">
              <path d="M11.4 11.4H2V2h9.4v9.4z" fill="#F25022"/>
              <path d="M22 11.4h-9.4V2H22v9.4z" fill="#7FBA00"/>
              <path d="M11.4 22H2v-9.4h9.4V22z" fill="#00A4EF"/>
              <path d="M22 22h-9.4v-9.4H22V22z" fill="#FFB900"/>
            </svg>
            Continue with Microsoft
          </button>
        </div>

        <div class="divider">
          <span>OR</span>
        </div>

        <form class="form" on:submit|preventDefault={handleEmailSubmit}>
          <Input
            type="email"
            label="Email"
            placeholder="you@example.com"
            bind:value={email}
            error={emailError}
            disabled={isLoading}
            on:keydown={handleKeydown}
          />

          <button
            class="email-button"
            disabled={isLoading}
            on:click={handleEmailSubmit}
          >
            {#if isLoading}
              <Spinner size="sm" />
              Checking...
            {:else}
              <svg class="mail-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              Continue with an email
            {/if}
          </button>
        </form>

      {:else if step === "password"}
        <button class="back-button" on:click={goBack} disabled={isLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>

        <h1>Create your password</h1>
        <p>For <strong>{email}</strong></p>

        <form class="form" on:submit|preventDefault={handlePasswordSubmit}>
          <Input
            type="password"
            label="Password"
            placeholder="At least 8 characters"
            bind:value={password}
            error={passwordError}
            disabled={isLoading}
            on:keydown={handleKeydown}
          />

          <Input
            type="password"
            label="Confirm Password"
            placeholder="Confirm your password"
            bind:value={confirmPassword}
            error={confirmPasswordError}
            disabled={isLoading}
            on:keydown={handleKeydown}
          />

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={isLoading}
            on:click={handlePasswordSubmit}
          >
            {#if isLoading}
              <Spinner size="sm" />
              Sending code...
            {:else}
              Continue
            {/if}
          </Button>
        </form>

      {:else if step === "otp"}
        <button class="back-button" on:click={goBack} disabled={isLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>

        <h1>Verify your email</h1>
        <p>Enter the 6-digit code sent to <strong>{email}</strong></p>

        <div class="otp-container">
          {#each otpValues as _, index}
            <input
              type="text"
              inputmode="numeric"
              maxlength="1"
              class="otp-input"
              class:error={otpError}
              bind:this={otpInputs[index]}
              bind:value={otpValues[index]}
              on:input={(e) => handleOtpInput(index, e)}
              on:keydown={(e) => handleOtpKeydown(index, e)}
              disabled={isLoading}
            />
          {/each}
        </div>

        {#if otpError}
          <span class="error-text">{otpError}</span>
        {/if}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={isLoading || otpValues.join("").length !== 6}
          on:click={handleOtpSubmit}
        >
          {#if isLoading}
            <Spinner size="sm" />
            Creating account...
          {:else}
            Create account
          {/if}
        </Button>

        <button class="resend-button" on:click={handleResendOtp} disabled={isLoading}>
          Didn't receive a code? <span>Resend</span>
        </button>
      {/if}

      <p class="login-link">
        Already have an account? <a href="#/login">Sign in</a>
      </p>
    </div>
  </div>

  <!-- Right Panel: Testimonials (hidden for whitelabel and on mobile) -->
    {#if !$isWhitelabeled}
      <div class="testimonials-panel">
        <SignupDecorations />
        <div class="testimonials-wrapper">
          <Testimonials />
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .signup-page {
    display: flex;
    min-height: 100vh;
    width: 100%;
  }

  /* Left Panel - Form */
  .form-panel {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    background-color: var(--bg-primary);
    position: relative;
  }

  .theme-toggle-wrapper {
    position: absolute;
    top: var(--space-4);
    left: var(--space-4);
  }

  .signup-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    text-align: center;
    min-width: 360px;
    max-width: 400px;
    width: 100%;
  }

  .logo-wrapper {
    position: relative;
    margin-bottom: var(--space-4);
  }

  .logo-glow {
    position: absolute;
    inset: -48px;
    border-radius: 9999px;
    filter: blur(24px);
    opacity: 0.4;
    background: radial-gradient(circle, #F9DB00 15%, transparent 70%);
    transition: opacity 0.5s ease;
  }

  .logo-wrapper:hover .logo-glow {
    opacity: 0.6;
  }

  .logo-float {
    position: relative;
    animation: float 3s ease-in-out infinite;
  }

  .logo-container {
    position: relative;
    transition: transform 0.3s ease;
  }

  .logo-container:hover {
    transform: scale(1.05);
  }

  .shimmer-container {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .shimmer {
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    animation: shine 3s infinite;
  }

  .shimmer::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 50%;
    transform: skewX(-12deg);
    background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.2), transparent);
  }

  .logo-shadow {
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    width: 64px;
    height: 8px;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 9999px;
    filter: blur(6px);
    animation: shadow-pulse 3s ease-in-out infinite;
  }

  @keyframes float {
    0% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
    100% { transform: translateY(0); }
  }

  @keyframes shine {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }

  @keyframes shadow-pulse {
    0%, 100% { opacity: 0.4; transform: translateX(-50%) scale(1); }
    50% { opacity: 0.2; transform: translateX(-50%) scale(1.1); }
  }

  .welcome-text {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    letter-spacing: 0.1em;
    color: var(--text-secondary);
    text-transform: uppercase;
  }

  /* Right Panel - Testimonials */
  .testimonials-panel {
    display: none;
    flex: 1;
    background-color: #fde047; /* Yellow-300 */
    position: relative;
    min-height: 100vh;
    overflow: visible;
  }

  /* Show testimonials panel on large screens */
  @media (min-width: 1024px) {
    .testimonials-panel {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
  }

  .testimonials-wrapper {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
    padding: 0 80px;
  }

  h1 {
    font-size: var(--text-2xl);
    font-weight: var(--font-semibold);
    color: var(--text-primary);
    margin: 0;
  }

  p {
    color: var(--text-secondary);
    margin: 0;
  }

  p strong {
    color: var(--text-primary);
  }

  .back-button {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    background: none;
    border: none;
    cursor: pointer;
    border-radius: var(--radius-md);
    transition: color var(--transition-fast);
  }

  .back-button:hover:not(:disabled) {
    color: var(--text-primary);
  }

  .back-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .back-button svg {
    width: 16px;
    height: 16px;
  }

  .oauth-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
  }

  .oauth-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: opacity var(--transition-fast);
  }

  .oauth-button.black {
    background-color: #000;
    color: #fff;
    border: 0.5px solid #989897;
    box-shadow:
      0px 0.48px 1.25px -1.17px rgba(0, 0, 0, 0.1),
      0px 1.83px 4.76px -2.33px rgba(0, 0, 0, 0.09),
      0px 8px 20.8px -3.5px rgba(0, 0, 0, 0.05),
      inset 0px -2px 9px 0px rgba(255, 255, 255, 0.49),
      0px 0px 0px 2px rgba(0, 0, 0, 0.2);
    transition:
      opacity var(--transition-fast),
      transform var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .oauth-button.black:hover:not(:disabled) {
    opacity: 0.95;
    transform: translateY(-1px);
    box-shadow:
      0px 0.6px 1.5px -1.17px rgba(0, 0, 0, 0.12),
      0px 2.2px 5.7px -2.33px rgba(0, 0, 0, 0.11),
      0px 10px 26px -3.5px rgba(0, 0, 0, 0.07),
      inset 0px -2px 9px 0px rgba(255, 255, 255, 0.55),
      0px 0px 0px 2px rgba(0, 0, 0, 0.25);
  }

  .oauth-button.black:active:not(:disabled) {
    transform: translateY(0);
    box-shadow:
      0px 0.3px 0.8px -1.17px rgba(0, 0, 0, 0.08),
      0px 1.2px 3.1px -2.33px rgba(0, 0, 0, 0.07),
      0px 5px 13px -3.5px rgba(0, 0, 0, 0.04),
      inset 0px -2px 9px 0px rgba(255, 255, 255, 0.45),
      0px 0px 0px 2px rgba(0, 0, 0, 0.18);
  }

  .oauth-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .oauth-icon {
    width: 20px;
    height: 20px;
    margin-right: var(--space-2);
  }

  .email-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    background-color: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .email-button:hover:not(:disabled) {
    background-color: var(--bg-tertiary);
  }

  .email-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .mail-icon {
    width: 20px;
    height: 20px;
    margin-right: var(--space-2);
  }

  .divider {
    display: flex;
    align-items: center;
    width: 100%;
    gap: var(--space-3);
    color: var(--text-tertiary);
    font-size: var(--text-sm);
  }

  .divider::before,
  .divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background-color: var(--border-primary);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
  }

  .otp-container {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
    width: 100%;
  }

  .otp-input {
    width: 48px;
    height: 56px;
    text-align: center;
    font-size: var(--text-2xl);
    font-weight: var(--font-semibold);
    color: var(--text-primary);
    background-color: var(--bg-primary);
    border: 2px solid var(--border-primary);
    border-radius: var(--radius-lg);
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .otp-input:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
    outline: none;
  }

  .otp-input.error {
    border-color: var(--color-error);
  }

  .otp-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-text {
    font-size: var(--text-sm);
    color: var(--color-error);
  }

  .resend-button {
    background: none;
    border: none;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
  }

  .resend-button span {
    color: var(--color-primary);
    font-weight: var(--font-medium);
  }

  .resend-button:hover span {
    text-decoration: underline;
  }

  .resend-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .login-link {
    font-size: var(--text-sm);
    margin-top: var(--space-2);
  }

  .login-link a {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: var(--font-medium);
  }

  .login-link a:hover {
    text-decoration: underline;
  }
</style>
