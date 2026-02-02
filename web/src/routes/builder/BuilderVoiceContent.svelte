<script lang="ts">
  import { onMount } from "svelte";
  import { push } from "svelte-spa-router";
  import { toasts, Button, Switch, Input, Textarea, Select, SelectItem, Slider, Card, Skeleton } from "$lib/design-system";
  import { Phone, Save, AlertCircle, Mic, Volume2, Clock, MessageCircle } from "lucide-svelte";

  export let appId: string;
  export let app: { id: string; name: string };

  // Types
  interface VoiceAgentConfig {
    enabled: boolean;
    provider: "openai" | "elevenlabs" | "google" | "azure";
    voice: {
      voiceId: string;
      language: string;
      pitch?: number;
      speed?: number;
    };
    stt: {
      provider: "openai" | "google" | "azure";
      model: string;
      language: string;
    };
    telephony?: {
      enabled: boolean;
      provider: "twilio" | "vonage";
      phoneNumber?: string;
    };
    interruption: {
      enabled: boolean;
      threshold: number;
    };
    systemPrompt?: string;
    maxDuration?: number;
    greeting?: string;
  }

  // Voice provider configurations
  const VOICE_PROVIDERS = {
    openai: {
      name: "OpenAI",
      voices: [
        { id: "alloy", name: "Alloy" },
        { id: "echo", name: "Echo" },
        { id: "fable", name: "Fable" },
        { id: "onyx", name: "Onyx" },
        { id: "nova", name: "Nova" },
        { id: "shimmer", name: "Shimmer" },
      ],
    },
    elevenlabs: {
      name: "ElevenLabs",
      voices: [
        { id: "rachel", name: "Rachel" },
        { id: "drew", name: "Drew" },
        { id: "clyde", name: "Clyde" },
        { id: "paul", name: "Paul" },
        { id: "domi", name: "Domi" },
        { id: "dave", name: "Dave" },
      ],
    },
    google: {
      name: "Google Cloud",
      voices: [
        { id: "en-US-Neural2-A", name: "Neural2 A (Female)" },
        { id: "en-US-Neural2-C", name: "Neural2 C (Female)" },
        { id: "en-US-Neural2-D", name: "Neural2 D (Male)" },
        { id: "en-US-Neural2-F", name: "Neural2 F (Female)" },
      ],
    },
    azure: {
      name: "Azure",
      voices: [
        { id: "en-US-JennyNeural", name: "Jenny (Female)" },
        { id: "en-US-GuyNeural", name: "Guy (Male)" },
        { id: "en-US-AriaNeural", name: "Aria (Female)" },
        { id: "en-US-DavisNeural", name: "Davis (Male)" },
      ],
    },
  };

  const STT_PROVIDERS = [
    { id: "openai", name: "OpenAI Whisper" },
    { id: "google", name: "Google Cloud" },
    { id: "azure", name: "Azure Speech" },
  ];

  // State
  let config: VoiceAgentConfig = {
    enabled: false,
    provider: "openai",
    voice: {
      voiceId: "nova",
      language: "en-US",
    },
    stt: {
      provider: "openai",
      model: "whisper-1",
      language: "en-US",
    },
    interruption: {
      enabled: true,
      threshold: 0.5,
    },
    maxDuration: 300,
  };

  let isLoading = true;
  let isSaving = false;
  let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  onMount(async () => {
    await loadConfig();
  });

  // Auto-save when enabled toggle changes
  function handleEnabledChange(enabled: boolean) {
    config = { ...config, enabled };
    // Immediately save when toggling enabled
    saveConfig();
  }

  // Debounced auto-save for other settings
  function scheduleAutoSave() {
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }
    autoSaveTimeout = setTimeout(() => {
      saveConfig();
    }, 1000);
  }

  async function loadConfig() {
    if (!appId) return;

    try {
      isLoading = true;
      const response = await fetch(`/api/applications/${appId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load application");
      }

      const data = await response.json();
      const appData = data.data;

      // Load voice config from settings or capabilities
      const voiceConfig = appData.capabilities?.voiceAgent || appData.settings?.voiceAgent;
      if (voiceConfig) {
        config = { ...config, ...voiceConfig };
      }
    } catch (error) {
      console.error("Error loading config:", error);
      toasts.error("Failed to load voice settings");
    } finally {
      isLoading = false;
    }
  }

  async function saveConfig() {
    if (!appId || isSaving) return;

    isSaving = true;
    try {
      const response = await fetch(`/api/applications/${appId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          capabilities: {
            voiceAgent: config,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      toasts.success("Voice settings saved");
    } catch (error) {
      console.error("Error saving config:", error);
      toasts.error("Failed to save voice settings");
    } finally {
      isSaving = false;
    }
  }

  // Get current provider's voices
  $: currentVoices = VOICE_PROVIDERS[config.provider]?.voices || [];

  // Update voice when provider changes
  function handleProviderChange(newProvider: string) {
    const provider = newProvider as keyof typeof VOICE_PROVIDERS;
    const firstVoice = VOICE_PROVIDERS[provider]?.voices[0]?.id || "nova";
    config = {
      ...config,
      provider,
      voice: {
        ...config.voice,
        voiceId: firstVoice,
      },
    };
  }

  // Launch voice mode
  function launchVoiceMode() {
    push(`/apps/${appId}/voice/talk`);
  }
</script>

<div class="voice-container">
  {#if isLoading}
    <div class="loading-state">
      <Skeleton class="card-skeleton" />
      <Skeleton class="card-skeleton" />
    </div>
  {:else}
    <div class="voice-content">
      <!-- Header -->
      <div class="voice-header">
        <div class="header-icon">
          <Phone size={24} />
        </div>
        <div class="header-text">
          <h2>Voice Agent Settings</h2>
          <p>Configure your AI voice agent for real-time conversations</p>
        </div>
      </div>

      <!-- Talk to Bot CTA (when enabled) -->
      {#if config.enabled}
        <Card class="talk-cta-card">
          <div class="talk-cta">
            <div class="talk-cta-content">
              <MessageCircle size={20} />
              <div>
                <h3>Test Your Voice Agent</h3>
                <p>Start a real-time voice conversation with your AI</p>
              </div>
            </div>
            <Button variant="default" size="lg" on:click={launchVoiceMode}>
              <Mic size={16} />
              Talk to Bot
            </Button>
          </div>
        </Card>
      {/if}

      <!-- Main Settings Card -->
      <Card>
        <div class="card-content">
          <!-- Enable Toggle -->
          <div class="setting-row">
            <div class="setting-info">
              <label for="enabled" class="setting-label">Enable Voice Agent</label>
              <p class="setting-description">Allow users to interact with your app via voice</p>
            </div>
            <Switch
              id="enabled"
              checked={config.enabled}
              on:change={(e) => handleEnabledChange(e.detail)}
            />
          </div>

          {#if config.enabled}
            <div class="divider" />

            <!-- Voice Provider -->
            <div class="setting-section">
              <div class="setting-row vertical">
                <label class="setting-label">
                  <Volume2 size={16} />
                  Voice Provider
                </label>
                <Select
                  value={config.provider}
                  on:change={(e) => handleProviderChange(e.detail)}
                >
                  {#each Object.entries(VOICE_PROVIDERS) as [key, provider]}
                    <SelectItem value={key}>{provider.name}</SelectItem>
                  {/each}
                </Select>
              </div>

              <!-- Voice Selection -->
              <div class="setting-row vertical">
                <label class="setting-label">Voice</label>
                <Select
                  value={config.voice.voiceId}
                  on:change={(e) => config = { ...config, voice: { ...config.voice, voiceId: e.detail }}}
                >
                  {#each currentVoices as voice}
                    <SelectItem value={voice.id}>{voice.name}</SelectItem>
                  {/each}
                </Select>
              </div>
            </div>

            <div class="divider" />

            <!-- Speech Recognition -->
            <div class="setting-section">
              <div class="setting-row vertical">
                <label class="setting-label">
                  <Mic size={16} />
                  Speech Recognition Provider
                </label>
                <Select
                  value={config.stt.provider}
                  on:change={(e) => config = { ...config, stt: { ...config.stt, provider: e.detail }}}
                >
                  {#each STT_PROVIDERS as provider}
                    <SelectItem value={provider.id}>{provider.name}</SelectItem>
                  {/each}
                </Select>
              </div>
            </div>

            <div class="divider" />

            <!-- Interruption Settings -->
            <div class="setting-section">
              <div class="setting-row">
                <div class="setting-info">
                  <label class="setting-label">Allow Interruption</label>
                  <p class="setting-description">Let users interrupt the AI while it's speaking</p>
                </div>
                <Switch
                  checked={config.interruption.enabled}
                  on:change={(e) => config = { ...config, interruption: { ...config.interruption, enabled: e.detail }}}
                />
              </div>

              {#if config.interruption.enabled}
                <div class="slider-setting">
                  <label class="setting-label">Interruption Threshold</label>
                  <Slider
                    value={config.interruption.threshold}
                    min={0}
                    max={1}
                    step={0.1}
                    on:change={(e) => config = { ...config, interruption: { ...config.interruption, threshold: e.detail }}}
                  />
                  <p class="setting-description">
                    {config.interruption.threshold.toFixed(1)} (Lower = more sensitive)
                  </p>
                </div>
              {/if}
            </div>

            <div class="divider" />

            <!-- Greeting Message -->
            <div class="setting-section">
              <div class="setting-row vertical">
                <label for="greeting" class="setting-label">Greeting Message</label>
                <Textarea
                  id="greeting"
                  value={config.greeting || ""}
                  placeholder="Hi! I'm your AI assistant. How can I help you today?"
                  rows={2}
                  on:input={(e) => config = { ...config, greeting: (e.target as HTMLTextAreaElement).value }}
                />
              </div>
            </div>

            <!-- System Prompt Override -->
            <div class="setting-section">
              <div class="setting-row vertical">
                <label for="systemPrompt" class="setting-label">System Prompt (Optional)</label>
                <Textarea
                  id="systemPrompt"
                  value={config.systemPrompt || ""}
                  placeholder="Additional instructions for the voice agent..."
                  rows={4}
                  on:input={(e) => config = { ...config, systemPrompt: (e.target as HTMLTextAreaElement).value }}
                />
                <p class="setting-description">
                  Override or extend the main system prompt for voice interactions
                </p>
              </div>
            </div>

            <!-- Max Duration -->
            <div class="setting-section">
              <div class="setting-row vertical">
                <label for="maxDuration" class="setting-label">
                  <Clock size={16} />
                  Max Call Duration (seconds)
                </label>
                <Input
                  id="maxDuration"
                  type="number"
                  value={String(config.maxDuration || 300)}
                  min={60}
                  max={3600}
                  on:input={(e) => config = { ...config, maxDuration: parseInt((e.target as HTMLInputElement).value) || 300 }}
                />
              </div>
            </div>

            <div class="divider" />

            <!-- Telephony Settings -->
            <div class="telephony-section">
              <h3 class="section-title">
                <Phone size={18} />
                Telephony Integration
              </h3>
              <p class="section-description">Enable phone call access to your voice agent</p>

              <div class="setting-row">
                <div class="setting-info">
                  <label class="setting-label">Enable Telephony</label>
                </div>
                <Switch
                  checked={config.telephony?.enabled || false}
                  on:change={(e) => config = {
                    ...config,
                    telephony: {
                      ...config.telephony,
                      enabled: e.detail,
                      provider: config.telephony?.provider || "twilio",
                    },
                  }}
                />
              </div>

              {#if config.telephony?.enabled}
                <div class="setting-row vertical">
                  <label class="setting-label">Provider</label>
                  <Select
                    value={config.telephony.provider}
                    on:change={(e) => config = {
                      ...config,
                      telephony: {
                        enabled: config.telephony?.enabled ?? false,
                        provider: e.detail,
                        phoneNumber: config.telephony?.phoneNumber,
                      },
                    }}
                  >
                    <SelectItem value="twilio">Twilio</SelectItem>
                    <SelectItem value="vonage">Vonage</SelectItem>
                  </Select>
                </div>

                <div class="setting-row vertical">
                  <label for="phoneNumber" class="setting-label">Phone Number</label>
                  <Input
                    id="phoneNumber"
                    value={config.telephony.phoneNumber || ""}
                    placeholder="+1234567890"
                    on:input={(e) => config = {
                      ...config,
                      telephony: {
                        enabled: config.telephony?.enabled ?? false,
                        provider: config.telephony?.provider ?? "twilio",
                        phoneNumber: (e.target as HTMLInputElement).value,
                      },
                    }}
                  />
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </Card>

      <!-- Save Button -->
      <div class="save-section">
        <Button
          variant="primary"
          size="lg"
          on:click={saveConfig}
          disabled={isSaving}
          class="save-button"
        >
          {#if isSaving}
            Saving...
          {:else}
            <Save size={16} />
            Save Settings
          {/if}
        </Button>
      </div>
    </div>
  {/if}
</div>

<style>
  .voice-container {
    height: 100%;
    overflow-y: auto;
    padding: var(--space-6);
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  :global(.card-skeleton) {
    height: 200px;
    border-radius: var(--radius-lg);
  }

  .voice-content {
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .voice-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
  }

  .header-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: hsl(var(--primary) / 0.1);
    border-radius: var(--radius-lg);
    color: hsl(var(--primary));
  }

  .header-text h2 {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-1);
  }

  .header-text p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .card-content {
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .setting-row.vertical {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
  }

  .setting-info {
    flex: 1;
  }

  .setting-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: hsl(var(--foreground));
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .setting-description {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    margin: var(--space-1) 0 0;
  }

  .setting-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .slider-setting {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-left: var(--space-4);
  }

  .divider {
    height: 1px;
    background: hsl(var(--border));
    margin: var(--space-2) 0;
  }

  .telephony-section {
    background: hsl(var(--muted) / 0.5);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .section-title {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .section-description {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }

  .save-section {
    display: flex;
    justify-content: flex-end;
  }

  :global(.save-button) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  :global(.talk-cta-card) {
    background: linear-gradient(135deg, hsl(var(--primary) / 0.1) 0%, hsl(var(--primary) / 0.05) 100%);
    border: 1px solid hsl(var(--primary) / 0.2);
  }

  .talk-cta {
    padding: var(--space-4) var(--space-5);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .talk-cta-content {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: hsl(var(--primary));
  }

  .talk-cta-content h3 {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
    margin: 0 0 var(--space-0-5);
  }

  .talk-cta-content p {
    font-size: var(--text-sm);
    color: hsl(var(--muted-foreground));
    margin: 0;
  }
</style>
