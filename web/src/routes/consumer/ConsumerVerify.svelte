<!--
  Consumer OTP Verification Page

  Allows users to verify their email with a 6-digit OTP code
  after signup or when requested. Uses individual digit boxes
  with auto-advance, paste support, and brand-color animations.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { push } from "svelte-spa-router";
  import { consumerAuth, consumerApp, consumerIsLoading, consumerError } from "../../stores/consumerAuth";
  import ConsumerLayout from "./ConsumerLayout.svelte";
  import { getAppNameIdFromContext } from "$lib/utils/consumer-context";

  const appNameId = getAppNameIdFromContext();

  let email = "";
  let otpDigits: string[] = ["", "", "", "", "", ""];
  let otpInputRefs: HTMLInputElement[] = [];
  let localError = "";
  let resendCooldown = 0;
  let resendTimer: ReturnType<typeof setInterval> | null = null;

  $: app = $consumerApp;
  $: otpCode = otpDigits.join("");
  $: allFilled = otpCode.length === 6;

  onMount(() => {
    const storedEmail = sessionStorage.getItem("verify_email");
    if (storedEmail) {
      email = storedEmail;
    }

    // Focus first digit box after mount
    tick().then(() => {
      if (otpInputRefs[0]) otpInputRefs[0].focus();
    });

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

    if (otpCode.length !== 6) {
      localError = "Please enter a valid 6-digit code";
      return;
    }

    const result = await consumerAuth.verifyOtp(appNameId, email, otpCode);

    if (result.success) {
      sessionStorage.removeItem("verify_email");
      sessionStorage.removeItem("signup_password");

      const redirectUrl = app?.settings?.redirectAfterSignupUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        push(`/chat`);
      }
    } else {
      localError = result.error || "Verification failed";
      // Clear digits and refocus on error
      otpDigits = ["", "", "", "", "", ""];
      tick().then(() => {
        if (otpInputRefs[0]) otpInputRefs[0].focus();
      });
    }
  }

  function handleDigitInput(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, "");

    if (value.length === 0) {
      otpDigits[index] = "";
      return;
    }

    // Take only first digit
    otpDigits[index] = value[0];
    input.value = value[0];

    // Auto-advance to next input
    if (index < 5 && otpInputRefs[index + 1]) {
      otpInputRefs[index + 1].focus();
    }

    // Auto-submit when all filled
    if (otpDigits.every(d => d !== "")) {
      handleVerify();
    }
  }

  function handleDigitKeydown(index: number, event: KeyboardEvent) {
    if (event.key === "Backspace") {
      if (otpDigits[index] === "" && index > 0) {
        // Move to previous box and clear it
        otpDigits[index - 1] = "";
        otpInputRefs[index - 1].focus();
        event.preventDefault();
      } else {
        otpDigits[index] = "";
      }
    } else if (event.key === "ArrowLeft" && index > 0) {
      otpInputRefs[index - 1].focus();
      event.preventDefault();
    } else if (event.key === "ArrowRight" && index < 5) {
      otpInputRefs[index + 1].focus();
      event.preventDefault();
    } else if (event.key === "Enter") {
      handleVerify();
    }
  }

  function handleDigitPaste(event: ClipboardEvent) {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 0) return;

    for (let i = 0; i < 6; i++) {
      otpDigits[i] = pasted[i] || "";
    }

    // Focus last filled input or the next empty one
    const focusIndex = Math.min(pasted.length, 5);
    tick().then(() => {
      if (otpInputRefs[focusIndex]) otpInputRefs[focusIndex].focus();
      // Auto-submit if all 6 pasted
      if (pasted.length === 6) handleVerify();
    });
  }

  function handleDigitFocus(event: FocusEvent) {
    const input = event.target as HTMLInputElement;
    input.select();
  }

  async function handleResendOtp() {
    if (resendCooldown > 0) return;

    localError = "";

    if (!email) {
      localError = "Please enter your email";
      return;
    }

    resendCooldown = 60;
    resendTimer = setInterval(() => {
      resendCooldown--;
      if (resendCooldown <= 0 && resendTimer) {
        clearInterval(resendTimer);
        resendTimer = null;
      }
    }, 1000);

    const result = await consumerAuth.resendOtp(appNameId, email);
    if (!result.success) {
      localError = result.error || "Failed to resend code";
    }
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
        />
      </div>

      <div class="form-group">
        <label>Verification Code</label>
        <div class="otp-boxes" on:paste={handleDigitPaste}>
          {#each otpDigits as digit, index}
            <input
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="1"
              class="otp-digit"
              class:filled={digit !== ""}
              value={digit}
              autocomplete={index === 0 ? "one-time-code" : "off"}
              bind:this={otpInputRefs[index]}
              on:input={(e) => handleDigitInput(index, e)}
              on:keydown={(e) => handleDigitKeydown(index, e)}
              on:focus={handleDigitFocus}
            />
          {/each}
        </div>
      </div>

      <button
        type="submit"
        class="submit-button"
        disabled={$consumerIsLoading || !allFilled}
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

  input[type="email"] {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-md);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    font-size: var(--text-base);
  }

  input[type="email"]:focus {
    outline: none;
    border-color: var(--consumer-primary, hsl(var(--primary)));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--consumer-primary, hsl(var(--primary))) 20%, transparent);
  }

  /* OTP digit boxes */
  .otp-boxes {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  .otp-digit {
    width: 48px;
    height: 56px;
    text-align: center;
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    border: 2px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    padding: 0;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    caret-color: var(--consumer-primary, hsl(var(--primary)));
  }

  .otp-digit:focus {
    outline: none;
    border-color: var(--consumer-primary, hsl(var(--primary)));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--consumer-primary, hsl(var(--primary))) 6%, transparent);
  }

  .otp-digit.filled {
    border-color: var(--consumer-primary, hsl(var(--primary)));
    animation: digitBounce 0.3s ease-out;
  }

  @keyframes digitBounce {
    0% { transform: translateY(0); }
    40% { transform: translateY(-5px); }
    100% { transform: translateY(0); }
  }

  @media (max-width: 400px) {
    .otp-boxes {
      gap: 6px;
    }
    .otp-digit {
      width: 40px;
      height: 48px;
      font-size: var(--text-base);
    }
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
