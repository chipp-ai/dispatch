<!--
  Consumer Login Page

  Login form for end-users (consumers) of published chat applications.
  Supports email/password login and magic link authentication.
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
  let showMagicLink = false;
  let magicLinkSent = false;
  let localError = "";

  $: app = $consumerApp;

  async function handleLogin() {
    localError = "";

    if (!email || !password) {
      localError = "Please enter email and password";
      return;
    }

    const result = await consumerAuth.login(appNameId, email, password);

    if (result.success) {
      push(`/chat`);
    } else {
      localError = result.error || "Login failed";
    }
  }

  async function handleMagicLink() {
    localError = "";

    if (!email) {
      localError = "Please enter your email";
      return;
    }

    const result = await consumerAuth.requestMagicLink(appNameId, email);

    if (result.success) {
      magicLinkSent = true;
    } else {
      localError = result.error || "Failed to send magic link";
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      if (showMagicLink) {
        handleMagicLink();
      } else {
        handleLogin();
      }
    }
  }
</script>

<ConsumerLayout {appNameId}>
<div class="login-page">
  <div class="login-container">
    {#if app?.pictureUrl}
      <img src={app.pictureUrl} alt={app.name} class="app-logo" />
    {/if}

    <h1>{app?.name || "Login"}</h1>

    {#if magicLinkSent}
      <div class="success-message">
        <p>Check your email for a magic link to sign in.</p>
        <button
          type="button"
          class="text-button"
          on:click={() => { magicLinkSent = false; showMagicLink = false; }}
        >
          Back to login
        </button>
      </div>
    {:else}
      <form on:submit|preventDefault={showMagicLink ? handleMagicLink : handleLogin}>
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

        {#if !showMagicLink}
          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              bind:value={password}
              placeholder="Your password"
              autocomplete="current-password"
              on:keydown={handleKeydown}
            />
          </div>
        {/if}

        <button
          type="submit"
          class="submit-button"
          disabled={$consumerIsLoading}
        >
          {#if $consumerIsLoading}
            Signing in...
          {:else if showMagicLink}
            Send Magic Link
          {:else}
            Sign In
          {/if}
        </button>
      </form>

      <div class="auth-options">
        {#if showMagicLink}
          <button
            type="button"
            class="text-button"
            on:click={() => showMagicLink = false}
          >
            Sign in with password instead
          </button>
        {:else}
          <button
            type="button"
            class="text-button"
            on:click={() => showMagicLink = true}
          >
            Sign in with magic link
          </button>
        {/if}
      </div>

      <div class="auth-footer">
        <p>
          Don't have an account?
          <a href="#/chat/signup">Sign up</a>
        </p>
      </div>
    {/if}
  </div>
</div>
</ConsumerLayout>

<style>
  .login-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--consumer-background, hsl(var(--background)));
    padding: var(--space-4);
  }

  .login-container {
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

  .success-message {
    padding: var(--space-4);
    background: hsl(var(--primary) / 0.1);
    border-radius: var(--radius-md);
    color: hsl(var(--foreground));
  }

  .success-message p {
    margin-bottom: var(--space-4);
  }

  .auth-options {
    margin-top: var(--space-4);
  }

  .text-button {
    background: none;
    border: none;
    color: var(--consumer-primary, hsl(var(--primary)));
    font-size: var(--text-sm);
    cursor: pointer;
    text-decoration: underline;
  }

  .text-button:hover {
    opacity: 0.8;
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
