<script lang="ts">
  import BuilderCard from "./BuilderCard.svelte";
  import { Input } from "$lib/design-system";

  export let name: string = "";
  export let description: string = "";
  export let inputTextHint: string = "";
  export let disclaimerText: string = "";
  export let startingMessage: string = "";
  export let conversationStarters: string[] = ["", "", "", ""];

  export let onNameChange: (value: string) => void = () => {};
  export let onDescriptionChange: (value: string) => void = () => {};
  export let onInputTextHintChange: (value: string) => void = () => {};
  export let onDisclaimerTextChange: (value: string) => void = () => {};
  export let onStartingMessageChange: (value: string) => void = () => {};
  export let onConversationStarterChange: (index: number, value: string) => void = () => {};

  const placeholders = [
    "Let's get started!",
    "Begin your adventure now.",
    "Unlock something new today!",
    "Start your journey here.",
  ];

  function clearStarter(index: number) {
    onConversationStarterChange(index, "");
  }
</script>

<BuilderCard title="Basics" rightIcon="dropdown">
  <div class="form">
    <div class="field">
      <div class="label-row">
        <label for="name">Name</label>
        <span class="tooltip" title="The display name of your AI assistant">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <Input
        placeholder="New Application"
        value={name}
        on:input={(e) => {
          const target = e.currentTarget as HTMLInputElement;
          if (target) onNameChange(target.value);
        }}
        maxlength={30}
      />
    </div>

    <div class="field">
      <div class="label-row">
        <label for="description">Description</label>
        <span class="tooltip" title="A brief description of what your AI assistant does">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <Input
        placeholder="Your cool app description"
        value={description}
        on:input={(e) => {
          const target = e.currentTarget as HTMLInputElement;
          if (target) onDescriptionChange(target.value);
        }}
        maxlength={200}
      />
    </div>

    <div class="field">
      <div class="label-row">
        <label for="inputTextHint">Input Text Hint</label>
        <span class="tooltip" title="Placeholder text shown in the user's message input field">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <Input
        placeholder="Type here to chat"
        value={inputTextHint}
        on:input={(e) => {
          const target = e.currentTarget as HTMLInputElement;
          if (target) onInputTextHintChange(target.value);
        }}
        maxlength={50}
      />
    </div>

    <div class="field">
      <div class="label-row">
        <label for="disclaimerText">Disclaimer Text</label>
        <span class="tooltip" title="The text shown underneath the input field">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <Input
        placeholder="This AI chat can make mistakes. Consider checking important information."
        value={disclaimerText}
        on:input={(e) => {
          const target = e.currentTarget as HTMLInputElement;
          if (target) onDisclaimerTextChange(target.value);
        }}
        maxlength={100}
      />
    </div>

    <div class="field">
      <div class="label-row">
        <label for="startingMessage">Starting Message</label>
        <span
          class="tooltip"
          title="An optional message your AI will send when users start a new chat"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      <textarea
        placeholder="Hi! I'm here to help you with..."
        value={startingMessage}
        on:input={(e) => {
          const target = e.currentTarget as HTMLTextAreaElement;
          if (target) onStartingMessageChange(target.value);
        }}
        maxlength={500}
      ></textarea>
      <p class="char-count">{startingMessage.length}/500</p>
    </div>

    <div class="field">
      <div class="label-row">
        <label for="conversationStarters">Conversation Starters</label>
        <span
          class="tooltip"
          title="Suggested prompts that users can click to start a conversation"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
      </div>
      {#each conversationStarters as starter, index}
        <div class="starter-input">
          <Input
            placeholder={placeholders[index]}
            value={starter}
            on:input={(e) => {
              const target = e.currentTarget as HTMLInputElement;
              if (target) onConversationStarterChange(index, target.value);
            }}
            maxlength={100}
          />
          <button class="clear-button" on:click={() => clearStarter(index)} aria-label="Clear conversation starter">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      {/each}
    </div>
  </div>
</BuilderCard>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .label-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .tooltip {
    color: var(--text-tertiary);
    cursor: help;
    display: flex;
    align-items: center;
  }

  .tooltip:hover {
    color: var(--text-secondary);
  }

  textarea {
    width: 100%;
    min-height: 100px;
    padding: var(--space-3);
    border-radius: var(--radius-xl);
    border: 2px solid var(--border-primary);
    font-size: var(--text-sm);
    font-family: inherit;
    resize: vertical;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-alpha);
  }

  .char-count {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-align: right;
    margin: 0;
  }

  .starter-input {
    position: relative;
  }

  .clear-button {
    position: absolute;
    right: var(--space-2);
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    padding: var(--space-1);
    cursor: pointer;
    color: var(--text-tertiary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .clear-button:hover {
    color: var(--text-secondary);
  }
</style>
