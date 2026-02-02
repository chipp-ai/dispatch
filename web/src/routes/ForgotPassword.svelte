<script lang="ts">
  import {
    Button,
    Card,
    Input,
    ThemeToggle,
    ChippLogo,
    Spinner,
    toasts,
  } from "$lib/design-system";
  import { isAuthenticated } from "../stores/auth";
  import { push } from "svelte-spa-router";
  import { onMount } from "svelte";

  let email = "";
  let isLoading = false;
  let emailError = "";
  let emailSent = false;

  // Redirect if already authenticated
  onMount(() => {
    if ($isAuthenticated) {
      push("/");
    }
  });

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

    return true;
  }

  async function handleSubmit() {
    if (!validateEmail()) return;

    isLoading = true;

    try {
      const response = await fetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        toasts.error("Error", data.error || "Failed to send reset email");
        return;
      }

      // Always show success to prevent email enumeration
      emailSent = true;
      toasts.success("Email sent", "Check your inbox for reset instructions");
    } catch (error) {
      console.error("Forgot password error:", error);
      toasts.error("Error", "Failed to send reset email. Please try again.");
    } finally {
      isLoading = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !isLoading) {
      handleSubmit();
    }
  }
</script>

<div class="forgot-password-page">
  <div class="theme-toggle-wrapper">
    <ThemeToggle />
  </div>

  <Card padding="lg">
    <div class="forgot-password-content">
      <div class="logo-wrapper">
        <ChippLogo size="lg" />
      </div>

      {#if emailSent}
        <div class="success-state">
          <div class="success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="22,4 12,14.01 9,11.01" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1>Check your email</h1>
          <p>We've sent password reset instructions to <strong>{email}</strong></p>
          <p class="secondary">Didn't receive the email? Check your spam folder or try again.</p>

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            on:click={() => { emailSent = false; }}
          >
            Try another email
          </Button>
        </div>
      {:else}
        <h1>Forgot password?</h1>
        <p>Enter your email and we'll send you instructions to reset your password.</p>

        <form class="form" on:submit|preventDefault={handleSubmit}>
          <Input
            type="email"
            label="Email"
            placeholder="you@example.com"
            bind:value={email}
            error={emailError}
            disabled={isLoading}
            on:keydown={handleKeydown}
          />

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={isLoading}
            on:click={handleSubmit}
          >
            {#if isLoading}
              <Spinner size="sm" />
              Sending...
            {:else}
              Send reset instructions
            {/if}
          </Button>
        </form>
      {/if}

      <p class="back-link">
        <a href="#/login">Back to login</a>
      </p>
    </div>
  </Card>
</div>

<style>
  .forgot-password-page {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--space-4);
    background-color: var(--bg-secondary);
  }

  .theme-toggle-wrapper {
    position: absolute;
    top: var(--space-4);
    right: var(--space-4);
  }

  .forgot-password-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    text-align: center;
    min-width: 360px;
    max-width: 400px;
  }

  .logo-wrapper {
    margin-bottom: var(--space-2);
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

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: 100%;
    margin-top: var(--space-2);
  }

  .success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
  }

  .success-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--color-success-bg, #ecfdf5);
    color: var(--color-success, #10b981);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-2);
  }

  .success-icon svg {
    width: 32px;
    height: 32px;
  }

  .success-state strong {
    color: var(--text-primary);
  }

  .success-state .secondary {
    font-size: var(--text-sm);
    color: var(--text-tertiary);
  }

  .back-link {
    font-size: var(--text-sm);
    margin-top: var(--space-2);
  }

  .back-link a {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: var(--font-medium);
  }

  .back-link a:hover {
    text-decoration: underline;
  }
</style>
