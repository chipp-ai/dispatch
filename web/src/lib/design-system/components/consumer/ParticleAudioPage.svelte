<script lang="ts">
  /**
   * ParticleAudioPage
   *
   * Full-screen immersive voice interface with real-time particle visualization.
   * Uses Three.js for GPU-accelerated particle effects and WebRTC for
   * bidirectional audio streaming with OpenAI's Realtime API.
   *
   * Features:
   * - 1000 particles in spherical distribution
   * - Audio-reactive animation (bass/mids/treble analysis)
   * - WebRTC data channel for tool execution
   * - Gradient background that expands with audio energy
   */
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { captureException } from '$lib/sentry';
  import * as THREE from 'three';
  import Spinner from '../Spinner.svelte';

  export let brandColor: string = '#4499ff';
  export let applicationId: string = '';
  export let apiBaseUrl: string = '';

  const dispatch = createEventDispatcher<{
    close: void;
    error: { message: string };
  }>();

  let mountElement: HTMLDivElement;
  let micEnabled = false;
  let connectionReady = false;
  let toolExecuting = false;
  let backgroundExpansion = 1;
  let connectionError: string | null = null;

  // WebRTC refs
  let peerConnection: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;

  // Three.js refs
  let renderer: THREE.WebGLRenderer | null = null;
  let animationId: number;

  /**
   * Initialize WebRTC connection after mic is enabled
   */
  async function initializeWebRTC(): Promise<void> {
    if (!peerConnection) {
      captureException(new Error('[ParticleAudio] No peer connection available'), {
        tags: { feature: "voice-agent" },
      });
      return;
    }

    console.log('[ParticleAudio] Starting WebRTC initialization');

    try {
      // Create an SDP offer
      console.log('[ParticleAudio] Creating SDP offer');
      const offer = await peerConnection.createOffer();
      console.log('[ParticleAudio] SDP offer created:', {
        type: offer.type,
        sdpLength: offer.sdp?.length,
      });

      await peerConnection.setLocalDescription(offer);
      console.log('[ParticleAudio] Local description set');

      // Fetch an ephemeral token from the backend
      const baseUrl = apiBaseUrl || '';
      const sessionUrl = applicationId
        ? `${baseUrl}/api/session?applicationId=${applicationId}`
        : `${baseUrl}/api/session`;
      console.log('[ParticleAudio] Fetching ephemeral token from', sessionUrl);

      let tokenResponse;
      try {
        tokenResponse = await fetch(sessionUrl, { credentials: 'include' });
        console.log('[ParticleAudio] Fetch completed, status:', tokenResponse.status);
      } catch (fetchError) {
        captureException(fetchError, {
          tags: { feature: "voice-agent" },
          extra: { action: "fetch-ephemeral-token", sessionUrl },
        });
        throw fetchError;
      }

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();

        let userMessage = 'Failed to connect';
        try {
          const errorData = JSON.parse(errorText);
          userMessage = errorData.error || userMessage;
        } catch {
          userMessage = errorText || userMessage;
        }

        throw new Error(userMessage);
      }

      const tokenData = await tokenResponse.json();
      console.log('[ParticleAudio] Token received:', {
        hasValue: !!tokenData.value,
        expiresAt: tokenData.expires_at,
      });

      const EPHEMERAL_KEY = tokenData.value;
      if (!EPHEMERAL_KEY) {
        throw new Error('No ephemeral key in response');
      }

      // Connect to OpenAI's Realtime API (GA endpoint)
      const realtimeApiUrl = 'https://api.openai.com/v1/realtime/calls';
      console.log('[ParticleAudio] Sending SDP to OpenAI:', realtimeApiUrl);

      const sdpResponse = await fetch(realtimeApiUrl, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(
          `OpenAI API failed: ${sdpResponse.status} ${sdpResponse.statusText} - ${errorText}`
        );
      }

      const answerSdp = await sdpResponse.text();
      console.log('[ParticleAudio] Received answer SDP:', {
        sdpLength: answerSdp.length,
        sdpPreview: answerSdp.substring(0, 100),
      });

      const answer = { type: 'answer' as const, sdp: answerSdp };

      // Set connection ready
      connectionReady = true;

      await peerConnection.setRemoteDescription(answer);
      console.log('[ParticleAudio] Remote description set');

      console.log('[ParticleAudio] WebRTC connection established with OpenAI Realtime API');
    } catch (error) {
      captureException(error, {
        tags: { feature: "voice-agent" },
        extra: { action: "webrtc-initialization", applicationId },
      });

      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      connectionError = errorMessage;
      dispatch('error', { message: errorMessage });

      // Reset state to allow retry
      micEnabled = false;
      connectionReady = false;
    }
  }

  /**
   * Handle enabling the microphone and starting WebRTC
   */
  async function handleEnableMic(): Promise<void> {
    connectionError = null;
    console.log('[ParticleAudio] User clicked enable microphone');

    try {
      // Check browser support
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Your browser does not support microphone access');
      }

      console.log('[ParticleAudio] Requesting microphone access');

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      console.log('[ParticleAudio] Microphone access granted:', {
        trackCount: stream.getTracks().length,
        audioTracks: stream.getAudioTracks().map((t) => ({
          id: t.id,
          label: t.label,
          enabled: t.enabled,
        })),
      });

      // Add local audio tracks to the peer connection
      if (peerConnection) {
        stream.getTracks().forEach((track) => {
          console.log('[ParticleAudio] Adding track to peer connection:', track.kind);
          peerConnection!.addTrack(track, stream);
        });
      } else {
        captureException(new Error('[ParticleAudio] No peer connection available to add tracks'), {
          tags: { feature: "voice-agent" },
        });
      }

      // Attach to hidden audio element
      const localAudio = document.getElementById('localAudio') as HTMLMediaElement;
      if (localAudio) {
        localAudio.srcObject = stream;
        localAudio.muted = true;
        await localAudio.play();
        console.log('[ParticleAudio] Local audio element playing (muted)');
      }

      micEnabled = true;
      console.log('[ParticleAudio] Mic enabled state set to true');

      // Proceed with WebRTC handshake
      await initializeWebRTC();

      console.log('[ParticleAudio] Microphone enabled and WebRTC handshake initiated');
    } catch (err) {
      captureException(err, {
        tags: { feature: "voice-agent" },
        extra: { action: "microphone-access" },
      });

      const errorMessage = err instanceof Error ? err.message : 'Microphone access failed';
      connectionError = errorMessage;

      // Reset state to allow retry
      micEnabled = false;
      connectionReady = false;
    }
  }

  /**
   * Handle retry after connection error
   */
  function handleRetry(): void {
    connectionError = null;
    micEnabled = false;
    connectionReady = false;
  }

  /**
   * Handle exit button click
   */
  function handleClose(): void {
    dispatch('close');
  }

  /**
   * Play audio notification for tool execution
   */
  function playToolNotification(): void {
    try {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.15);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.15);
    } catch (e) {
      console.log('[ParticleAudio] Could not play notification sound');
    }
  }

  onMount(() => {
    if (!mountElement) return;

    const container = mountElement;

    // -------------------------------
    // THREE.JS SETUP
    // -------------------------------
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = null;
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 100;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // -------------------------------
    // PARTICLE SYSTEM SETUP
    // -------------------------------
    const particleCount = 1000;
    const sphereDistributionRadius = 30;
    const particleGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const particleMaterial = new THREE.MeshStandardMaterial({
      color: brandColor,
      emissive: brandColor,
      emissiveIntensity: 0.5,
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
      depthWrite: false,
    });
    const particles = new THREE.InstancedMesh(particleGeometry, particleMaterial, particleCount);
    scene.add(particles);

    const initialPositions: THREE.Vector3[] = [];
    const influences: number[] = [];
    const dummy = new THREE.Object3D();
    const instanceOpacities = new Float32Array(particleCount);
    const instanceScales = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const r = Math.random() * sphereDistributionRadius;
      const theta = Math.acos(2 * Math.random() - 1);
      const phi = 2 * Math.PI * Math.random();
      const x = r * Math.sin(theta) * Math.cos(phi);
      const y = r * Math.sin(theta) * Math.sin(phi);
      const z = r * Math.cos(theta);
      const pos = new THREE.Vector3(x, y, z);
      initialPositions.push(pos);

      const d = r / sphereDistributionRadius;
      const influence = 1 - THREE.MathUtils.smoothstep(d, 0.75, 1);
      influences.push(influence);

      const distanceNorm = pos.length() / sphereDistributionRadius;
      instanceOpacities[i] = 1 - Math.min(distanceNorm, 1.0);
      const scale = THREE.MathUtils.lerp(1.3, 0.3, distanceNorm);
      instanceScales[i] = scale;

      dummy.position.copy(pos);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
    }
    particleGeometry.setAttribute(
      'instanceOpacity',
      new THREE.InstancedBufferAttribute(instanceOpacities, 1)
    );

    // Patch shader for per-instance opacity
    particleMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader =
        `
        attribute float instanceOpacity;
        varying float vInstanceOpacity;
        ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vInstanceOpacity = instanceOpacity;`
      );
      shader.fragmentShader =
        `
        varying float vInstanceOpacity;
        ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <output_fragment>',
        `gl_FragColor.a *= vInstanceOpacity;
         #include <output_fragment>`
      );
    };
    particleMaterial.needsUpdate = true;

    // -------------------------------
    // WEBRTC SETUP
    // -------------------------------
    console.log('[ParticleAudio] Creating RTCPeerConnection');

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    peerConnection = pc;

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log('[ParticleAudio] Connection state:', pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[ParticleAudio] ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        connectionReady = true;
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log('[ParticleAudio] ICE gathering state:', pc.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
      console.log('[ParticleAudio] Signaling state:', pc.signalingState);
    };

    // Create data channel for events
    console.log('[ParticleAudio] Creating data channel');
    const dc = pc.createDataChannel('oai-events');
    dataChannel = dc;

    dc.addEventListener('open', () => {
      console.log('[ParticleAudio] Data channel is open');
    });

    dc.addEventListener('close', () => {
      console.log('[ParticleAudio] Data channel closed');
    });

    dc.addEventListener('error', (error) => {
      captureException(new Error('[ParticleAudio] Data channel error'), {
        tags: { feature: "voice-agent" },
        extra: { error },
      });
    });

    dc.addEventListener('message', async (e) => {
      try {
        const realtimeEvent = JSON.parse(e.data);
        console.log('[ParticleAudio] Received realtime event:', realtimeEvent);

        // Handle function calls
        if (realtimeEvent.type === 'response.function_call_arguments.done') {
          const { call_id, name, arguments: argsString } = realtimeEvent;
          console.log('[ParticleAudio] Function call:', { call_id, name });

          toolExecuting = true;
          playToolNotification();

          let args: unknown;
          try {
            args = JSON.parse(argsString);
            console.log('[ParticleAudio] Function arguments:', args);

            // Execute tool via API
            const baseUrl = apiBaseUrl || '';
            const toolResponse = await fetch(
              `${baseUrl}/api/applications/${applicationId}/voice/tool-execute`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  toolName: name,
                  parameters: args,
                }),
              }
            );

            const result = await toolResponse.json();
            console.log('[ParticleAudio] Tool result:', result);

            const outputMessage = result.message || JSON.stringify(result);

            // Send function output back to OpenAI
            if (dataChannel?.readyState === 'open') {
              dataChannel.send(
                JSON.stringify({
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id,
                    output: outputMessage,
                  },
                })
              );
              console.log('[ParticleAudio] Sent function output for call_id:', call_id);

              // Request response generation
              dataChannel.send(
                JSON.stringify({
                  type: 'response.create',
                })
              );
              console.log('[ParticleAudio] Requested response generation');

              toolExecuting = false;
            }
          } catch (err) {
            captureException(err, {
              tags: { feature: "voice-agent" },
              extra: { action: "execute-function", functionName: name, call_id },
            });
            toolExecuting = false;

            // Send error back to OpenAI
            if (dataChannel?.readyState === 'open') {
              dataChannel.send(
                JSON.stringify({
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id,
                    output: JSON.stringify({
                      error: err instanceof Error ? err.message : 'Unknown error',
                    }),
                  },
                })
              );
            }
          }
        }
      } catch (err) {
        captureException(err, {
          tags: { feature: "voice-agent" },
          extra: { action: "parse-realtime-event" },
        });
      }
    });

    // Handle incoming remote audio
    let remoteAnalyser: AnalyserNode | null = null;

    pc.ontrack = (event) => {
      console.log('[ParticleAudio] Received remote track:', {
        kind: event.track.kind,
        id: event.track.id,
        streamCount: event.streams.length,
      });

      const remoteStream = event.streams[0];
      if (!remoteStream) {
        captureException(new Error('[ParticleAudio] No remote stream available'), {
          tags: { feature: "voice-agent" },
        });
        return;
      }

      const remoteAudio = document.getElementById('remoteAudio') as HTMLMediaElement;
      if (remoteAudio) {
        remoteAudio.srcObject = remoteStream;
        console.log('[ParticleAudio] Set remote audio source');
        remoteAudio
          .play()
          .then(() => console.log('[ParticleAudio] Remote audio playing'))
          .catch((err) => captureException(err, {
            tags: { feature: "voice-agent" },
            extra: { action: "remote-audio-play" },
          }));
      }

      // Setup audio analysis
      try {
        console.log('[ParticleAudio] Setting up audio analyser');
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(remoteStream);
        remoteAnalyser = audioCtx.createAnalyser();
        remoteAnalyser.fftSize = 256;
        source.connect(remoteAnalyser);
        console.log('[ParticleAudio] Audio analyser connected');
      } catch (err) {
        captureException(err, {
          tags: { feature: "voice-agent" },
          extra: { action: "setup-audio-analyser" },
        });
      }
    };

    // -------------------------------
    // ANIMATION LOOP
    // -------------------------------
    let currentExpansionFactor = 1;
    const FLUIDITY = 0.15;

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const time = performance.now() * 0.001;
      particles.rotation.y += 0.001;

      if (remoteAnalyser) {
        const dataArray = new Uint8Array(remoteAnalyser.frequencyBinCount);
        remoteAnalyser.getByteFrequencyData(dataArray);

        const getAverage = (start: number, end: number) => {
          let sum = 0;
          for (let i = start; i < end; i++) {
            sum += dataArray[i];
          }
          return end - start > 0 ? sum / (end - start) / 255 : 0;
        };

        const bass = getAverage(0, 15);
        const mids = getAverage(16, 60);
        const treble = getAverage(61, dataArray.length);

        const targetExpansionFactor = 1 + bass * 0.7;
        currentExpansionFactor = THREE.MathUtils.lerp(
          currentExpansionFactor,
          targetExpansionFactor,
          FLUIDITY
        );

        // Update background expansion
        backgroundExpansion = currentExpansionFactor;

        for (let i = 0; i < particleCount; i++) {
          const basePos = initialPositions[i].clone().multiplyScalar(currentExpansionFactor);
          const influence = influences[i];

          const fluidOffset = new THREE.Vector3(
            mids * 30 * Math.sin(time + i),
            mids * 30 * Math.cos(time + i * 1.1),
            mids * 30 * Math.sin(time + i * 1.3)
          ).multiplyScalar(FLUIDITY * influence);

          const jitter = new THREE.Vector3(
            treble * 10 * (Math.random() - 0.5),
            treble * 10 * (Math.random() - 0.5),
            treble * 10 * (Math.random() - 0.5)
          ).multiplyScalar(FLUIDITY * influence);

          dummy.position.copy(basePos).add(fluidOffset).add(jitter);
          const scale = instanceScales[i];
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          particles.setMatrixAt(i, dummy.matrix);
        }
        particles.instanceMatrix.needsUpdate = true;
      }
      renderer?.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (container && renderer) {
        const { clientWidth, clientHeight } = container;
        renderer.setSize(clientWidth, clientHeight);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
      }
    };
    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      particles.dispose();
      renderer?.dispose();
      pc.close();
    };
  });

  onDestroy(() => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    if (renderer) {
      renderer.dispose();
    }
    if (peerConnection) {
      peerConnection.close();
    }
  });
</script>

<div class="particle-audio-page">
  <!-- Hidden audio elements -->
  <audio id="remoteAudio" style="display: none;" autoplay></audio>
  <audio id="localAudio" style="display: none;" autoplay></audio>

  <!-- Exit button -->
  <button class="exit-button" on:click={handleClose}>Exit Voice Mode</button>

  <!-- Radial gradient background -->
  <div
    class="gradient-background"
    style="background: radial-gradient(circle at center, {brandColor}90 0%, transparent {25 *
      backgroundExpansion}%);"
  />

  <!-- Tool execution indicator -->
  {#if toolExecuting}
    <div class="tool-indicator">
      <div class="tool-ping" />
      Executing tool...
    </div>
  {/if}

  <!-- Three.js canvas container -->
  <div
    bind:this={mountElement}
    class="canvas-container"
    class:connected={micEnabled && connectionReady}
  />

  <!-- Connection overlay -->
  {#if !connectionReady}
    <div class="connection-overlay">
      {#if connectionError}
        <div class="error-message">
          <p class="error-title">Connection Error</p>
          <p class="error-detail">{connectionError}</p>
        </div>
        <button class="retry-button" on:click={handleRetry}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path
              d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"
            />
          </svg>
          Try Again
        </button>
      {:else}
        <button
          class="enable-mic-button"
          class:connecting={micEnabled && !connectionReady && !connectionError}
          on:click={handleEnableMic}
          disabled={micEnabled && !connectionReady && !connectionError}
        >
          {#if !micEnabled}
            Enable Microphone
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          {:else}
            <Spinner size="sm" />
            Connecting...
          {/if}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .particle-audio-page {
    position: absolute;
    inset: 0;
    background-color: hsl(var(--background));
    overflow: hidden;
  }

  .exit-button {
    position: absolute;
    bottom: 6rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    padding: var(--space-3) var(--space-6);
    border-radius: 9999px;
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    border: none;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .exit-button:hover {
    background-color: rgba(0, 0, 0, 0.9);
  }

  .gradient-background {
    position: absolute;
    inset: 0;
    transition: background 0.05s ease-out;
    pointer-events: none;
  }

  .tool-indicator {
    position: absolute;
    top: 5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border-radius: 9999px;
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    font-size: var(--text-sm);
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  .tool-ping {
    width: 0.5rem;
    height: 0.5rem;
    background-color: #60a5fa;
    border-radius: 50%;
    animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @keyframes ping {
    75%,
    100% {
      transform: scale(2);
      opacity: 0;
    }
  }

  .canvas-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transform: scale(0.5625);
    transition: all 0.3s ease-in-out;
  }

  .canvas-container.connected {
    transform: scale(0.75);
  }

  @media (min-width: 1024px) {
    .canvas-container {
      transform: scale(0.75);
    }

    .canvas-container.connected {
      transform: scale(1);
    }
  }

  .connection-overlay {
    position: absolute;
    inset: 0;
    z-index: 50;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: var(--space-4);
    backdrop-filter: blur(4px);
  }

  .error-message {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background-color: rgba(239, 68, 68, 0.9);
    color: white;
    font-size: var(--text-sm);
    max-width: 24rem;
    text-align: center;
  }

  .error-title {
    font-weight: var(--font-medium);
    margin: 0 0 var(--space-1);
  }

  .error-detail {
    margin: 0;
    color: rgba(255, 255, 255, 0.9);
  }

  .retry-button {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-6);
    border-radius: var(--radius-md);
    background-color: black;
    color: white;
    font-size: var(--text-base);
    border: none;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .retry-button:hover {
    background-color: #1f2937;
  }

  .retry-button svg {
    width: 1rem;
    height: 1rem;
  }

  .enable-mic-button {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-6);
    border-radius: var(--radius-md);
    background-color: black;
    color: white;
    font-size: var(--text-base);
    border: none;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .enable-mic-button.connecting {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .enable-mic-button svg {
    width: 1rem;
    height: 1rem;
  }
</style>
