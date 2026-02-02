<!--
  Consumer OTP Verification Page

  Allows users to verify their email with a 6-digit OTP code
  after signup or when requested.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { consumerAuth, consumerApp, consumerIsLoading, consumerError } from "../../stores/consumerAuth";
  import ConsumerLayout from "./ConsumerLayout.svelte";
  import { getAppNameIdFromContext } from "$lib/utils/consumer-context";

  // App is determined by vanity subdomain or injected brand config
  const appNameId = getAppNameIdFromContext();

  let email = "";
  let otpCode = "";
  let localError = "";
  let resendCooldown = 0;
  let resendTimer: ReturnType<typeof setInterval> | null = null;

  $: app = $consumerApp;

  onMount(() => {
    // Get email from session storage (set during signup)
    const storedEmail = sessionStorage.getItem("verify_email");
    if (storedEmail) {
      email = storedEmail;
    }

    return () => {
      if (resendTimer) {
        clearInterval(resendTimer);
      }
    };
  });

  async function handleVerify() {
    localError = "";

    if (!email) {
      localError = "Please enter your email";
      return;
    }

    if (!otpCode || otpCode.length !== 6) {
      localError = "Please enter a valid 6-digit code";
      return;
    }

    const result = await consumerAuth.verifyOtp(appNameId, email, otpCode);

    if (result.success) {
      // Clear stored data
      sessionStorage.removeItem("verify_email");
      sessionStorage.removeItem("signup_password");

      // Handle redirect after signup if configured
      const redirectUrl = app?.settings?.redirectAfterSignupUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        push(`/chat`);
      }
    } else {
      localError = result.error || "Verification failed";
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;

    localError = "";

    if (!email) {
      localError = "Please enter your email";
      return;
    }

    // Start cooldown
    resendCooldown = 60;
    resendTimer = setInterval(() => {
      resendCooldown--;
      if (resendCooldown <= 0 && resendTimer) {
        clearInterval(resendTimer);
        resendTimer = null;
      }
    }, 1000);

    // Request new OTP using the dedicated resend endpoint
    const result = await consumerAuth.resendOtp(appNameId, email);
    if (!result.success) {
      localError = result.error || "Failed to resend code";
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      handleVerify();
    }
  }

  // Format OTP input to only allow digits
  function handleOtpInput(event: Event) {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    otpCode = input.value;
  }
</script>

<ConsumerLayout {appNameId}>
<div class="verify-page">
  <div class="verify-container">
    {#if app?.pictureUrl}
      <img src={app.pictureUrl} alt={app.name} class="app-logo" />
    {/if}

    <h1>Verify Your Email</h1>
    <p class="subtitle">
      Enter the 6-digit code sent to your email
    </p>

    <form on:submit|preventDefault={handleVerify}>
      {#if localError || $consumerError}
        <div class="error-message">
          {localError || $consumerError}
        </div>
      {/if}

      <div class="form-group">
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder="you@example.com"
          autocomplete="email"
          on:keydown={handleKeydown}
        />
      </div>

      <div class="form-group">
        <label for="otp">Verification Code</label>
        <input
          id="otp"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          value={otpCode}
          on:input={handleOtpInput}
          placeholder="000000"
          class="otp-input"
          autocomplete="one-time-code"
          on:keydown={handleKeydown}
        />
      </div>

      <button
        type="submit"
        class="submit-button"
        disabled={$consumerIsLoading || otpCode.length !== 6}
      >
        {#if $consumerIsLoading}
          Verifying...
        {:else}
          Verify Email
        {/if}
      </button>
    </form>

    <div class="resend-section">
      <p>Didn't receive the code?</p>
      <button
        type="button"
        class="text-button"
        on:click={handleResendOtp}
        disabled={resendCooldown > 0}
      >
        {#if resendCooldown > 0}
          Resend in {resendCooldown}s
        {:else}
          Resend Code
        {/if}
      </button>
    </div>

    <div class="auth-footer">
      <a href="#/chat/login">Back to login</a>
    </div>
  </div>
</div>
</ConsumerLayout>

<style>
  .verify-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--consumer-background, hsl(var(--background)));
    padding: var(--space-4);
  }

  .verify-container {
    width: 100%;
    max-width: 400px;
    background: hsl(var(--card));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    padding: var(--space-8);
    text-align: center;
  }

  .app-logo {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-full);
    object-fit: cover;
    margin-bottom: var(--space-4);
  }

  h1 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin-bottom: var(--space-2);
  }

  .subtitle {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin-bottom: var(--space-6);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    text-align: left;
  }

  label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
  }

  input {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-base);
  }

  input:focus {
    outline: none;
    border-color: var(--consumer-primary, hsl(var(--primary)));
    box-shadow: 0 0 0 2px var(--consumer-primary, hsl(var(--primary) / 0.2));
  }

  .otp-input {
    text-align: center;
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    letter-spacing: 0.5em;
    padding: var(--space-4);
  }

  .submit-button {
    width: 100%;
    padding: var(--space-3);
    background: var(--consumer-primary, hsl(var(--primary)));
    color: hsl(var(--primary-foreground));
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .submit-button:hover:not(:disabled) {
    opacity: 0.9;
  }

  .submit-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    padding: var(--space-3);
    background: hsl(var(--destructive) / 0.1);
    border: 1px solid hsl(var(--destructive) / 0.3);
    border-radius: var(--radius-md);
    color: hsl(var(--destructive));
    font-size: var(--text-sm);
    text-align: left;
  }

  .resend-section {
    margin-top: var(--space-6);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .resend-section p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .text-button {
    background: none;
    border: none;
    color: var(--consumer-primary, hsl(var(--primary)));
    font-size: var(--text-sm);
    cursor: pointer;
    text-decoration: underline;
  }

  .text-button:hover:not(:disabled) {
    opacity: 0.8;
  }

  .text-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    text-decoration: none;
  }

  .auth-footer {
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: 1px solid hsl(var(--border));
  }

  .auth-footer a {
    font-size: var(--text-sm);
    color: var(--consumer-primary, hsl(var(--primary)));
    text-decoration: underline;
  }
</style>
