<!--
  Consumer Signup Page

  Registration form for end-users (consumers) of published chat applications.
  Features:
  - Email/password signup with required fields
  - Domain restriction display (if app requires specific domain)
  - OTP verification flow after signup
  - Custom redirect after successful verification
-->
<script lang="ts">
  import { push } from "svelte-spa-router";
  import { consumerAuth, consumerApp, consumerIsLoading, consumerError } from "../../stores/consumerAuth";
  import ConsumerLayout from "./ConsumerLayout.svelte";
  import { getAppNameIdFromContext } from "$lib/utils/consumer-context";

  // App is determined by vanity subdomain or injected brand config
  const appNameId = getAppNameIdFromContext();

  let email = "";
  let password = "";
  let confirmPassword = "";
  let name = "";
  let localError = "";

  $: app = $consumerApp;
  $: domainRestriction = app?.settings?.signupsRestrictedToDomain;

  async function handleSignup() {
    localError = "";

    // Validate required fields
    if (!email) {
      localError = "Please enter your email";
      return;
    }

    // Block '+' in email addresses (security measure)
    if (email.includes("+")) {
      localError = "Email addresses cannot contain '+' characters";
      return;
    }

    // Check domain restriction client-side for better UX
    if (domainRestriction && !email.toLowerCase().endsWith(`@${domainRestriction}`)) {
      localError = `Email must be from @${domainRestriction} domain`;
      return;
    }

    if (!password) {
      localError = "Please enter a password";
      return;
    }

    if (password.length < 8) {
      localError = "Password must be at least 8 characters";
      return;
    }

    if (password !== confirmPassword) {
      localError = "Passwords do not match";
      return;
    }

    const result = await consumerAuth.signup(
      appNameId,
      email,
      password,
      name || undefined
    );

    if (result.success) {
      if (result.requiresVerification) {
        // Store email for verification page
        sessionStorage.setItem("verify_email", email);
        sessionStorage.setItem("signup_password", password); // For auto-login after verify
        push(`/chat/verify`);
      } else {
        // Handle redirect after signup if configured
        const redirectUrl = app?.settings?.redirectAfterSignupUrl;
        if (redirectUrl) {
          window.location.href = redirectUrl;
        } else {
          push(`/chat`);
        }
      }
    } else {
      localError = result.error || "Signup failed";
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      handleSignup();
    }
  }
</script>

<ConsumerLayout {appNameId}>
<div class="signup-page">
  <div class="signup-container">
    {#if app?.pictureUrl}
      <img src={app.pictureUrl} alt={app.name} class="app-logo" />
    {/if}

    <h1>Welcome!</h1>
    {#if app?.name}
      <p class="subtitle">Sign up to continue to {app.name}</p>
    {/if}

    <form on:submit|preventDefault={handleSignup}>
      {#if localError || $consumerError}
        <div class="error-message">
          {localError || $consumerError}
        </div>
      {/if}

      {#if domainRestriction}
        <div class="domain-hint">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          Only @{domainRestriction} emails can sign up
        </div>
      {/if}

      <div class="form-group">
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          bind:value={email}
          placeholder={domainRestriction ? `you@${domainRestriction}` : "you@example.com"}
          autocomplete="email"
          required
          on:keydown={handleKeydown}
        />
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          bind:value={password}
          placeholder="At least 8 characters"
          autocomplete="new-password"
          required
          on:keydown={handleKeydown}
        />
      </div>

      <div class="form-group">
        <label for="confirmPassword">Confirm Password</label>
        <input
          id="confirmPassword"
          type="password"
          bind:value={confirmPassword}
          placeholder="Confirm your password"
          autocomplete="new-password"
          required
          on:keydown={handleKeydown}
        />
      </div>

      <button
        type="submit"
        class="submit-button"
        disabled={$consumerIsLoading}
      >
        {#if $consumerIsLoading}
          Creating account...
        {:else}
          Create Account
        {/if}
      </button>
    </form>

    <div class="auth-footer">
      <p>
        Already have an account?
        <a href="#/chat/login">Sign in</a>
      </p>
    </div>
  </div>
</div>
</ConsumerLayout>

<style>
  .signup-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--consumer-background, hsl(var(--background)));
    padding: var(--space-4);
  }

  .signup-container {
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

  .domain-hint {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background: hsl(var(--muted) / 0.5);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    color: hsl(var(--muted-foreground));
    font-size: var(--text-sm);
  }

  .domain-hint svg {
    flex-shrink: 0;
    opacity: 0.7;
  }

  .auth-footer {
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: 1px solid hsl(var(--border));
  }

  .auth-footer p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
  }

  .auth-footer a {
    color: var(--consumer-primary, hsl(var(--primary)));
    text-decoration: underline;
  }
</style>
