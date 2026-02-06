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
  import { push, querystring } from "svelte-spa-router";
  import { onMount } from "svelte";
  import { captureException } from "$lib/sentry";

  let password = "";
  let confirmPassword = "";
  let isLoading = false;
  let passwordError = "";
  let confirmPasswordError = "";
  let resetComplete = false;
  let tokenError = false;

  let token = "";

  // Redirect if already authenticated
  onMount(() => {
    if ($isAuthenticated) {
      push("/");
      return;
    }

    // Get token from query string
    const params = new URLSearchParams($querystring);
    token = params.get("token") || "";

    if (!token) {
      tokenError = true;
    }
  });

  function validateForm(): boolean {
    let isValid = true;
    passwordError = "";
    confirmPasswordError = "";

    if (!password) {
      passwordError = "Password is required";
      isValid = false;
    } else if (password.length < 8) {
      passwordError = "Password must be at least 8 characters";
      isValid = false;
    }

    if (!confirmPassword) {
      confirmPasswordError = "Please confirm your password";
      isValid = false;
    } else if (password !== confirmPassword) {
      confirmPasswordError = "Passwords do not match";
      isValid = false;
    }

    return isValid;
  }

  async function handleSubmit() {
    if (!validateForm()) return;

    isLoading = true;

    try {
      const response = await fetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 400 && data.error?.includes("expired")) {
          tokenError = true;
          toasts.error("Link expired", "Please request a new password reset link");
        } else if (response.status === 400 && data.error?.includes("invalid")) {
          tokenError = true;
          toasts.error("Invalid link", "Please request a new password reset link");
        } else {
          toasts.error("Error", data.error || "Failed to reset password");
        }
        return;
      }

      resetComplete = true;
      toasts.success("Password reset", "Your password has been successfully reset");
    } catch (error) {
      captureException(error, { tags: { page: "reset-password", feature: "reset-submit" } });
      toasts.error("Error", "Failed to reset password. Please try again.");
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

<div class="reset-password-page">
  <div class="theme-toggle-wrapper">
    <ThemeToggle />
  </div>

  <Card padding="lg">
    <div class="reset-password-content">
      <div class="logo-wrapper">
        <ChippLogo size="lg" />
      </div>

      {#if tokenError}
        <div class="error-state">
          <div class="error-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h1>Invalid or expired link</h1>
          <p>This password reset link is invalid or has expired. Please request a new one.</p>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            on:click={() => push("/forgot-password")}
          >
            Request new reset link
          </Button>
        </div>
      {:else if resetComplete}
        <div class="success-state">
          <div class="success-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke-linecap="round" stroke-linejoin="round"/>
              <polyline points="22,4 12,14.01 9,11.01" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1>Password reset complete</h1>
          <p>Your password has been successfully reset. You can now log in with your new password.</p>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            on:click={() => push("/login")}
          >
            Go to login
          </Button>
        </div>
      {:else}
        <h1>Reset your password</h1>
        <p>Enter a new password for your account.</p>

        <form class="form" on:submit|preventDefault={handleSubmit}>
          <Input
            type="password"
            label="New password"
            placeholder="Enter new password"
            bind:value={password}
            error={passwordError}
            disabled={isLoading}
            on:keydown={handleKeydown}
          />

          <Input
            type="password"
            label="Confirm password"
            placeholder="Confirm new password"
            bind:value={confirmPassword}
            error={confirmPasswordError}
            disabled={isLoading}
            on:keydown={handleKeydown}
          />

          <div class="password-requirements">
            <span class:met={password.length >= 8}>At least 8 characters</span>
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={isLoading}
            on:click={handleSubmit}
          >
            {#if isLoading}
              <Spinner size="sm" />
              Resetting password...
            {:else}
              Reset password
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
  .reset-password-page {
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

  .reset-password-content {
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
    gap: var(--space-3);
    width: 100%;
    margin-top: var(--space-2);
  }

  .password-requirements {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--text-tertiary);
    text-align: left;
  }

  .password-requirements span {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .password-requirements span::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-tertiary);
  }

  .password-requirements span.met {
    color: var(--color-success, #10b981);
  }

  .password-requirements span.met::before {
    background: var(--color-success, #10b981);
  }

  .success-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
  }

  .success-icon,
  .error-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--space-2);
  }

  .success-icon {
    background: var(--color-success-bg, #ecfdf5);
    color: var(--color-success, #10b981);
  }

  .error-icon {
    background: var(--color-error-bg, #fef2f2);
    color: var(--color-error, #ef4444);
  }

  .success-icon svg,
  .error-icon svg {
    width: 32px;
    height: 32px;
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
