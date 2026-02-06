<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { toasts } from "$lib/design-system";
  import { captureException } from "$lib/sentry";
  import { Mic, RefreshCw } from "lucide-svelte";
  import * as THREE from "three";

  // Props
  export let brandColor: string = "#4499ff";
  export let applicationId: string = "";
  export let apiBaseUrl: string = "";
  export let onClose: (() => void) | undefined = undefined;

  // DOM refs
  let mountRef: HTMLDivElement;

  // WebRTC refs (not reactive, just storage)
  let pc: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;

  // State
  let micEnabled = false;
  let connectionReady = false;
  let toolExecuting = false;
  let backgroundExpansion = 1;
  let connectionError: string | null = null;

  // Animation cleanup
  let animationId: number;
  let renderer: THREE.WebGLRenderer | null = null;

  // Audio analyser ref
  let remoteAnalyser: AnalyserNode | null = null;

  // Particle system refs for animation
  let particles: THREE.InstancedMesh;
  let initialPositions: THREE.Vector3[] = [];
  let influences: number[] = [];
  let instanceScales: Float32Array;
  let dummy: THREE.Object3D;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let currentExpansionFactor = 1;
  const FLUIDITY = 0.15;
  const particleCount = 1000;
  const sphereDistributionRadius = 30;

  async function initializeWebRTC() {
    if (!pc) {
      captureException(new Error("No peer connection available"), {
        tags: { feature: "voice-webrtc" },
        extra: { context: "webrtc-init" },
      });
      return;
    }

    console.log("[ParticleAudio] Starting WebRTC initialization");

    try {
      // Create an SDP offer
      console.log("[ParticleAudio] Creating SDP offer");
      const offer = await pc.createOffer();
      console.log("[ParticleAudio] SDP offer created:", {
        type: offer.type,
        sdpLength: offer.sdp?.length,
      });

      await pc.setLocalDescription(offer);
      console.log("[ParticleAudio] Local description set");

      // Fetch an ephemeral token from backend
      const sessionUrl = applicationId
        ? `/api/voice/session?applicationId=${applicationId}`
        : `/api/voice/session`;
      console.log("[ParticleAudio] Fetching ephemeral token from", sessionUrl);

      let tokenResponse;
      try {
        tokenResponse = await fetch(sessionUrl, { credentials: "include" });
        console.log("[ParticleAudio] Fetch completed, status:", tokenResponse.status);
      } catch (fetchError) {
        captureException(fetchError, {
          tags: { feature: "voice-webrtc" },
          extra: { context: "session-fetch", sessionUrl },
        });
        throw fetchError;
      }

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        captureException(new Error(`Session API error: ${tokenResponse.status}`), {
          tags: { feature: "voice-webrtc" },
          extra: { context: "session-api", status: tokenResponse.status, errorText },
        });

        let userMessage = "Failed to connect";
        try {
          const errorData = JSON.parse(errorText);
          userMessage = errorData.error || userMessage;
        } catch {
          userMessage = errorText || userMessage;
        }

        throw new Error(userMessage);
      }

      const tokenData = await tokenResponse.json();
      console.log("[ParticleAudio] Token received:", {
        hasValue: !!tokenData.value,
        expiresAt: tokenData.expires_at,
      });

      const EPHEMERAL_KEY = tokenData.value;
      if (!EPHEMERAL_KEY) {
        throw new Error("No ephemeral key in response");
      }

      // Connect to OpenAI's Realtime API
      const realtimeApiUrl = "https://api.openai.com/v1/realtime/calls";
      console.log("[ParticleAudio] Sending SDP to OpenAI:", realtimeApiUrl);

      const sdpResponse = await fetch(realtimeApiUrl, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(
          `OpenAI API failed: ${sdpResponse.status} ${sdpResponse.statusText} - ${errorText}`
        );
      }

      const answerSdp = await sdpResponse.text();
      console.log("[ParticleAudio] Received answer SDP:", {
        sdpLength: answerSdp.length,
        sdpPreview: answerSdp.substring(0, 100),
      });

      const answer = { type: "answer" as const, sdp: answerSdp };

      // Set connection ready immediately
      connectionReady = true;

      await pc.setRemoteDescription(answer);
      console.log("[ParticleAudio] Remote description set");

      console.log("[ParticleAudio] WebRTC connection established with OpenAI Realtime API");
    } catch (error) {
      captureException(error, {
        tags: { feature: "voice-webrtc" },
        extra: { context: "webrtc-init", applicationId },
      });

      const errorMessage = error instanceof Error ? error.message : "Connection failed";
      connectionError = errorMessage;
      toasts.error(`Failed to connect: ${errorMessage}`);

      // Reset state to allow retry
      micEnabled = false;
      connectionReady = false;
    }
  }

  function setupThreeJS() {
    if (!mountRef) return;

    // THREE.JS SETUP
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mountRef.clientWidth, mountRef.clientHeight);
    mountRef.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = null;
    camera = new THREE.PerspectiveCamera(
      75,
      mountRef.clientWidth / mountRef.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 100;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // PARTICLE SYSTEM SETUP
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
    particles = new THREE.InstancedMesh(particleGeometry, particleMaterial, particleCount);
    scene.add(particles);

    dummy = new THREE.Object3D();
    const instanceOpacities = new Float32Array(particleCount);
    instanceScales = new Float32Array(particleCount);

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
      "instanceOpacity",
      new THREE.InstancedBufferAttribute(instanceOpacities, 1)
    );

    // Patch shader to use per-instance opacity
    particleMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader =
        `
        attribute float instanceOpacity;
        varying float vInstanceOpacity;
        ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         vInstanceOpacity = instanceOpacity;`
      );
      shader.fragmentShader =
        `
        varying float vInstanceOpacity;
        ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <output_fragment>",
        `gl_FragColor.a *= vInstanceOpacity;
         #include <output_fragment>`
      );
    };
    particleMaterial.needsUpdate = true;
  }

  function setupWebRTC() {
    console.log("[ParticleAudio] Creating RTCPeerConnection");

    pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    // Monitor connection state changes
    pc.onconnectionstatechange = () => {
      console.log("[ParticleAudio] Connection state:", pc?.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[ParticleAudio] ICE connection state:", pc?.iceConnectionState);
      if (pc?.iceConnectionState === "connected" || pc?.iceConnectionState === "completed") {
        connectionReady = true;
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log("[ParticleAudio] ICE gathering state:", pc?.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
      console.log("[ParticleAudio] Signaling state:", pc?.signalingState);
    };

    // Create a data channel for sending/receiving events
    console.log("[ParticleAudio] Creating data channel");
    const dc = pc.createDataChannel("oai-events");

    dc.addEventListener("open", () => {
      console.log("[ParticleAudio] Data channel is open");
      dataChannel = dc;
    });

    dc.addEventListener("close", () => {
      console.log("[ParticleAudio] Data channel closed");
    });

    dc.addEventListener("error", (error) => {
      captureException(error instanceof Event ? new Error("Data channel error") : error, {
        tags: { feature: "voice-webrtc" },
        extra: { context: "data-channel-error" },
      });
    });

    dc.addEventListener("message", async (e) => {
      try {
        const realtimeEvent = JSON.parse(e.data);
        console.log("[ParticleAudio] Received realtime event:", realtimeEvent);

        // Handle function calls
        if (realtimeEvent.type === "response.function_call_arguments.done") {
          const { call_id, name, arguments: argsString } = realtimeEvent;
          console.log("[ParticleAudio] Function call:", { call_id, name });

          // Show tool execution indicator
          toolExecuting = true;

          // Play a notification sound (rising tone)
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

          let args: unknown;
          try {
            args = JSON.parse(argsString);
            console.log("[ParticleAudio] Function arguments:", args);

            // Execute the tool via API
            const toolResponse = await fetch(
              `/api/applications/${applicationId}/voice/tool-execute`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  toolName: name,
                  parameters: args,
                }),
              }
            );

            const result = await toolResponse.json();
            console.log("[ParticleAudio] Tool result:", result);

            // Extract the message from the result for clean speech output
            const outputMessage = result.message || JSON.stringify(result);

            // Send function output back to OpenAI
            if (dataChannel?.readyState === "open") {
              dataChannel.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id,
                    output: outputMessage,
                  },
                })
              );
              console.log("[ParticleAudio] Sent function output for call_id:", call_id);

              // Request OpenAI to generate a response with the function output
              dataChannel.send(
                JSON.stringify({
                  type: "response.create",
                })
              );
              console.log("[ParticleAudio] Requested response generation");

              // Hide tool execution indicator
              toolExecuting = false;
            }
          } catch (err) {
            captureException(err, {
              tags: { feature: "voice-webrtc" },
              extra: { context: "function-execution", functionName: name, callId: call_id },
            });

            // Hide tool execution indicator on error
            toolExecuting = false;

            // Send error back to OpenAI
            if (dataChannel?.readyState === "open") {
              dataChannel.send(
                JSON.stringify({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id,
                    output: JSON.stringify({
                      error: err instanceof Error ? err.message : "Unknown error",
                    }),
                  },
                })
              );
            }
          }
        }
      } catch (err) {
        captureException(err, {
          tags: { feature: "voice-webrtc" },
          extra: { context: "realtime-event-parse" },
        });
      }
    });

    // Handle incoming remote tracks (AI audio)
    pc.ontrack = (event) => {
      console.log("[ParticleAudio] Received remote track:", {
        kind: event.track.kind,
        id: event.track.id,
        streamCount: event.streams.length,
      });

      const remoteStream = event.streams[0];
      if (!remoteStream) {
        captureException(new Error("No remote stream available"), {
          tags: { feature: "voice-webrtc" },
          extra: { context: "remote-track" },
        });
        return;
      }

      const remoteAudio = document.getElementById("remoteAudio") as HTMLMediaElement;
      if (remoteAudio) {
        remoteAudio.srcObject = remoteStream;
        console.log("[ParticleAudio] Set remote audio source");
        remoteAudio
          .play()
          .then(() => console.log("[ParticleAudio] Remote audio playing"))
          .catch((err) => captureException(err, {
            tags: { feature: "voice-webrtc" },
            extra: { context: "remote-audio-play" },
          }));
      } else {
        captureException(new Error("Remote audio element not found"), {
          tags: { feature: "voice-webrtc" },
          extra: { context: "remote-audio-element" },
        });
      }

      // Setup Web Audio analysis
      try {
        console.log("[ParticleAudio] Setting up audio analyser");
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(remoteStream);
        remoteAnalyser = audioCtx.createAnalyser();
        remoteAnalyser.fftSize = 256;
        source.connect(remoteAnalyser);
        console.log("[ParticleAudio] Audio analyser connected");
      } catch (err) {
        captureException(err, {
          tags: { feature: "voice-webrtc" },
          extra: { context: "audio-analyser-setup" },
        });
      }
    };
  }

  function animate() {
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

      // Update background expansion to match particle expansion
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

    if (renderer) {
      renderer.render(scene, camera);
    }
  }

  function handleResize() {
    if (mountRef && renderer && camera) {
      const { clientWidth, clientHeight } = mountRef;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    }
  }

  function handleRetry() {
    connectionError = null;
    micEnabled = false;
    connectionReady = false;
  }

  async function handleEnableMic() {
    // Clear any previous errors
    connectionError = null;
    console.log("[ParticleAudio] User clicked enable microphone");

    try {
      // First check if the browser supports getUserMedia
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Your browser does not support microphone access");
      }

      console.log("[ParticleAudio] Requesting microphone access");

      // Request access to the microphone with constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      console.log("[ParticleAudio] Microphone access granted:", {
        trackCount: stream.getTracks().length,
        audioTracks: stream.getAudioTracks().map((t) => ({
          id: t.id,
          label: t.label,
          enabled: t.enabled,
        })),
      });

      // Add the local audio tracks to the RTCPeerConnection
      if (pc) {
        stream.getTracks().forEach((track) => {
          console.log("[ParticleAudio] Adding track to peer connection:", track.kind);
          pc!.addTrack(track, stream);
        });
      } else {
        captureException(new Error("No peer connection available to add tracks"), {
          tags: { feature: "voice-webrtc" },
          extra: { context: "mic-enable" },
        });
      }

      // Attach the local stream to a hidden audio element
      const localAudio = document.getElementById("localAudio") as HTMLMediaElement;
      if (localAudio) {
        localAudio.srcObject = stream;
        localAudio.muted = true; // Prevent echo
        await localAudio.play();
        console.log("[ParticleAudio] Local audio element playing (muted)");
      } else {
        console.warn("[ParticleAudio] Local audio element not found");
      }

      // Mark the microphone as enabled
      micEnabled = true;
      console.log("[ParticleAudio] Mic enabled state set to true");

      // Proceed with the WebRTC handshake
      await initializeWebRTC();

      console.log("[ParticleAudio] Microphone enabled and WebRTC handshake initiated");
    } catch (err) {
      captureException(err, {
        tags: { feature: "voice-webrtc" },
        extra: { context: "microphone-access" },
      });

      const errorMessage = err instanceof Error ? err.message : "Microphone access failed";
      connectionError = errorMessage;
      toasts.error(`Failed to access microphone: ${errorMessage}`);

      // Reset state to allow retry
      micEnabled = false;
      connectionReady = false;
    }
  }

  onMount(() => {
    setupThreeJS();
    setupWebRTC();
    animate();
    window.addEventListener("resize", handleResize);
  });

  onDestroy(() => {
    cancelAnimationFrame(animationId);
    window.removeEventListener("resize", handleResize);
    if (particles) {
      particles.dispose();
    }
    if (renderer) {
      renderer.dispose();
    }
    if (pc) {
      pc.close();
    }
  });

  // Computed class for the canvas container
  $: canvasClass = micEnabled && connectionReady
    ? "scale-75 lg:scale-100"
    : "scale-[0.5625] lg:scale-75";
</script>

<div class="particle-page">
  <!-- Hidden audio elements for local and remote streams -->
  <audio id="remoteAudio" style="display: none;" autoplay></audio>
  <audio id="localAudio" style="display: none;" autoplay></audio>

  <!-- Exit voice mode button -->
  {#if onClose}
    <button class="exit-button" on:click={onClose}>
      Exit Voice Mode
    </button>
  {/if}

  <!-- Radial gradient background -->
  <div
    class="gradient-bg"
    style="background: radial-gradient(circle at center, {brandColor}90 0%, transparent {25 * backgroundExpansion}%);"
  ></div>

  <!-- Tool execution indicator -->
  {#if toolExecuting}
    <div class="tool-indicator">
      <div class="ping-dot"></div>
      Executing tool...
    </div>
  {/if}

  <!-- Container for the Three.js canvas -->
  <div
    bind:this={mountRef}
    class="canvas-container {canvasClass}"
  ></div>

  {#if !connectionReady}
    <div class="overlay">
      {#if connectionError}
        <div class="error-box">
          <p class="error-title">Connection Error</p>
          <p class="error-message">{connectionError}</p>
        </div>
        <button class="retry-button" on:click={handleRetry}>
          <RefreshCw size={16} />
          Try Again
        </button>
      {:else}
        <button
          class="mic-button"
          class:disabled={micEnabled && !connectionReady && !connectionError}
          on:click={handleEnableMic}
          disabled={micEnabled && !connectionReady && !connectionError}
        >
          {#if !micEnabled}
            Enable Microphone
            <Mic size={16} />
          {:else}
            <div class="spinner"></div>
            Connecting...
          {/if}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .particle-page {
    position: absolute;
    inset: 0;
  }

  .exit-button {
    position: absolute;
    bottom: 96px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    padding: 12px 24px;
    border-radius: 9999px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: background 0.2s;
  }

  .exit-button:hover {
    background: rgba(0, 0, 0, 0.9);
  }

  .gradient-bg {
    position: absolute;
    inset: 0;
    transition: background 0.05s ease-out;
  }

  .tool-indicator {
    position: absolute;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 50;
    padding: 8px 16px;
    border-radius: 9999px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    animation: pulse 2s infinite;
  }

  .ping-dot {
    width: 8px;
    height: 8px;
    background: #60a5fa;
    border-radius: 50%;
    animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
  }

  @keyframes ping {
    75%, 100% {
      transform: scale(2);
      opacity: 0;
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }

  .canvas-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s ease-in-out;
  }

  .canvas-container.scale-75 {
    transform: scale(0.75);
  }

  .canvas-container.scale-\[0\.5625\] {
    transform: scale(0.5625);
  }

  @media (min-width: 1024px) {
    .canvas-container.lg\:scale-100 {
      transform: scale(1);
    }

    .canvas-container.lg\:scale-75 {
      transform: scale(0.75);
    }
  }

  .overlay {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    position: absolute;
    inset: 0;
    z-index: 50;
    width: 100%;
    height: 100%;
    backdrop-filter: blur(4px);
    gap: 16px;
  }

  .error-box {
    padding: 12px 16px;
    border-radius: 8px;
    background: rgba(239, 68, 68, 0.9);
    color: white;
    font-size: 14px;
    max-width: 400px;
    text-align: center;
  }

  .error-title {
    font-weight: 500;
    margin: 0 0 4px;
  }

  .error-message {
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
  }

  .retry-button {
    padding: 12px 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: black;
    color: white;
    border: none;
    cursor: pointer;
    transition: background 0.2s;
  }

  .retry-button:hover {
    background: #1f2937;
  }

  .mic-button {
    padding: 12px 24px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    background: black;
    color: white;
    border: none;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .mic-button.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid white;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
