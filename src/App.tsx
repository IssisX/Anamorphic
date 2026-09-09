import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AudioMode,
  CameraMode,
  EngineDiagnostics,
  IRenderEngine,
  QualityTier,
  SimulationState,
} from './types.ts';
import { createInitialSimulationState, PHASES, TIERS } from './constants.ts';
import { Mat4 } from './math/mat4.ts';
import { AudioReactor } from './audio/audioReactor.ts';
import { WebGPUEngine } from './engine/webgpuEngine.ts';
import { WebGL2FallbackEngine } from './engine/webgl2Engine.ts';
import { getPathwayPoint, getPathwayTangent, getPathwayFrame } from './engine/pathwayMath.ts';
import { HudOverlay } from './components/HudOverlay.tsx';
import { DiagnosticsPanel } from './components/DiagnosticsPanel.tsx';
import { InteractionHint } from './components/InteractionHint.tsx';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<SimulationState>(createInitialSimulationState());
  const engineRef = useRef<IRenderEngine | null>(null);
  const audioReactorRef = useRef<AudioReactor>(new AudioReactor());
  const animFrameIdRef = useRef<number>(0);

  // Synchronized React state for UI overlay controls
  const [active, setActive] = useState(true);
  const [autopilot, setAutopilot] = useState(!stateRef.current.motionReduced);
  const [audioMode, setAudioMode] = useState<AudioMode>('SYNTH');
  const [tier, setTier] = useState<QualityTier>('ULTRA');
  const [cameraMode, setCameraMode] = useState<CameraMode>(stateRef.current.cameraMode || 'ORBIT');
  const [seed, setSeed] = useState(stateRef.current.seed);
  const [currentPhase, setCurrentPhase] = useState(stateRef.current.eventPhase);
  const [backendLabel, setBackendLabel] = useState('PROBING HARDWARE...');
  const [webgpuSupported, setWebgpuSupported] = useState(false);
  const [diagVisible, setDiagVisible] = useState(false);
  const [diagnostics, setDiagnostics] = useState<EngineDiagnostics>({
    backend: '--',
    particleCount: TIERS.ULTRA,
    frametimeMs: 16.6,
    fps: 60,
    tier: 'ULTRA',
    phaseId: 1,
    phaseName: 'AGGREGATION',
    energyEntropy: 0.0,
    audioRMS: 0.0,
    resolution: '--',
  });

  const triggerPhase = useCallback((phaseIndex: number) => {
    stateRef.current.eventPhase = phaseIndex;
    stateRef.current.phaseTimer = 0.0;
    setCurrentPhase(phaseIndex);
    if (engineRef.current && engineRef.current.reconfigureSystem) {
      engineRef.current.reconfigureSystem(phaseIndex, stateRef.current);
    }
  }, []);

  const reseedUniverse = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 0xffffff);
    stateRef.current.seed = newSeed;
    setSeed(newSeed);
    if (engineRef.current) {
      engineRef.current.initialize(stateRef.current);
    }
  }, []);

  const cycleTier = useCallback(() => {
    const tierList: QualityTier[] = ['LOW', 'MED', 'HIGH', 'ULTRA'];
    const currentIdx = tierList.indexOf(stateRef.current.tier);
    const nextTier = tierList[(currentIdx + 1) % tierList.length];

    stateRef.current.tier = nextTier;
    stateRef.current.particleCount = TIERS[nextTier];
    setTier(nextTier);

    if (engineRef.current) {
      engineRef.current.initialize(stateRef.current);
    }
  }, []);

  const toggleCameraMode = useCallback(() => {
    const nextMode: CameraMode =
      stateRef.current.cameraMode === 'ORBIT' ? 'PATHWAY_FLIGHT' : 'ORBIT';
    stateRef.current.cameraMode = nextMode;
    setCameraMode(nextMode);
    if (nextMode === 'PATHWAY_FLIGHT' && stateRef.current.eventPhase !== 4) {
      triggerPhase(4);
    }
  }, [triggerPhase]);

  const cycleAudio = useCallback(async () => {
    const reactor = audioReactorRef.current;
    const current = stateRef.current.audioMode;

    if (current === 'SYNTH') {
      const micGranted = await reactor.activateMic();
      if (micGranted) {
        stateRef.current.audioMode = 'MIC';
        setAudioMode('MIC');
      } else {
        reactor.mute();
        stateRef.current.audioMode = 'OFF';
        setAudioMode('OFF');
      }
    } else if (current === 'MIC') {
      reactor.mute();
      stateRef.current.audioMode = 'OFF';
      setAudioMode('OFF');
    } else {
      reactor.fallbackToSynth();
      stateRef.current.audioMode = 'SYNTH';
      setAudioMode('SYNTH');
    }
  }, []);

  const toggleActive = useCallback(() => {
    stateRef.current.active = !stateRef.current.active;
    setActive(stateRef.current.active);
  }, []);

  const toggleAutopilot = useCallback(() => {
    stateRef.current.autopilot = !stateRef.current.autopilot;
    setAutopilot(stateRef.current.autopilot);
  }, []);

  const toggleDiag = useCallback(() => {
    setDiagVisible((prev) => !prev);
  }, []);

  // Main Graphics Bootstrap and Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    let resizeTimer: number | null = null;

    const isMobileDevice =
      typeof navigator !== 'undefined' &&
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        ('ontouchstart' in window && window.innerWidth < 1024));

    const handleResize = () => {
      if (!canvas || destroyed) return;
      // Galaxy Fold 6 foldable display optimization:
      // Outer screen: ~412x960, Inner screen: ~800x932. Physical DPR can be 2.6-3.0.
      // Clamping to 1.35 on mobile provides sharp retina rendering while preventing
      // 5-megapixel VRAM overruns and Adreno GPU watchdog timeouts (TDR device lost).
      const maxDpr = isMobileDevice ? 1.35 : 2.0;
      const dpr = Math.min(window.devicePixelRatio || 1.0, maxDpr);
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        if (engineRef.current) {
          engineRef.current.resize();
        }
      }
    };

    const debouncedResize = () => {
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        handleResize();
      }, 50);
    };

    const initGraphics = async () => {
      let initialized = false;

      // On mobile screens, initialize with HIGH (65k) or MED (32k) to avoid GPU watchdogs
      if (isMobileDevice && stateRef.current.tier === 'ULTRA') {
        stateRef.current.tier = 'HIGH';
        stateRef.current.particleCount = TIERS.HIGH;
        setTier('HIGH');
      }

      // 1. Probe WebGPU
      if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
        try {
          const adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance',
          });

          if (adapter) {
            // Safe device request without restrictive limits that fail on mobile drivers
            const device = await adapter.requestDevice();

            device.addEventListener('uncapturederror', (event: any) => {
              console.warn('WebGPU uncaptured validation warning:', event.error);
            });

            device.lost.then((info) => {
              console.warn('WebGPU device lost:', info.reason, info.message);
              if (!destroyed) {
                // Adaptive recovery: step down tier to prevent infinite loop of GPU timeouts
                if (stateRef.current.tier === 'ULTRA') {
                  stateRef.current.tier = 'HIGH';
                  stateRef.current.particleCount = TIERS.HIGH;
                  setTier('HIGH');
                } else if (stateRef.current.tier === 'HIGH') {
                  stateRef.current.tier = 'MED';
                  stateRef.current.particleCount = TIERS.MED;
                  setTier('MED');
                }
                // Delay restart to give GPU driver time to stabilize
                setTimeout(() => {
                  if (!destroyed) {
                    initGraphics();
                  }
                }, 700);
              }
            });

            if (destroyed) {
              device.destroy();
              return;
            }

            const ctx = canvas.getContext('webgpu');
            if (ctx) {
              const format = navigator.gpu.getPreferredCanvasFormat();
              ctx.configure({
                device,
                format,
                alphaMode: 'opaque',
              });

              const gpuEngine = new WebGPUEngine(canvas, device, ctx, format);
              await gpuEngine.initialize(stateRef.current);

              if (destroyed) {
                gpuEngine.destroy();
                return;
              }

              engineRef.current = gpuEngine;
              stateRef.current.webgpuSupported = true;
              stateRef.current.backend = 'WebGPU (Hardware Accelerated Compute)';
              setWebgpuSupported(true);
              setBackendLabel('CORE: WEBGPU RESIDENT');
              initialized = true;
            }
          }
        } catch (e) {
          console.warn('WebGPU initialization failed, descending to WebGL2 fallback:', e);
        }
      }

      // 2. WebGL2 Fallback
      if (!initialized) {
        const glFallback = new WebGL2FallbackEngine(canvas);
        const ok = glFallback.initialize(stateRef.current);
        if (ok) {
          engineRef.current = glFallback;
          stateRef.current.webgpuSupported = false;
          stateRef.current.backend = 'WebGL2 (Compatibility Fallback)';
          stateRef.current.tier = 'MED';
          stateRef.current.particleCount = 32768;
          setTier('MED');
          setWebgpuSupported(false);
          setBackendLabel('CORE: WEBGL2 FALLBACK');
          initialized = true;
        } else {
          setBackendLabel('GRAPHICS INITIALIZATION FAILED');
          return;
        }
      }

      handleResize();
    };

    initGraphics();
    window.addEventListener('resize', debouncedResize);

    // Render loop
    let diagThrottle = 0;
    const frameLoop = (now: number) => {
      animFrameIdRef.current = requestAnimationFrame(frameLoop);

      const state = stateRef.current;
      const delta = Math.min((now - state.lastTimestamp) / 1000.0, 0.05);
      state.lastTimestamp = now;

      // Track FPS
      const currentFps = 1.0 / Math.max(delta, 0.0001);
      state.fpsHistory[state.fpsIndex] = currentFps;
      state.fpsIndex = (state.fpsIndex + 1) % 30;

      if (!state.active) return;

      state.time += delta;
      state.dt = delta;

      // Audio reactor analysis
      audioReactorRef.current.update(
        state.time,
        state.audioMode,
        state.eventPhase,
        state.audioRMS
      );

      // 60-Second Autonomous Choreography
      if (state.autopilot) {
        state.phaseTimer += delta;
        if (state.phaseTimer > 15.0 && state.eventPhase === 1) triggerPhase(2);
        else if (state.phaseTimer > 12.0 && state.eventPhase === 2) triggerPhase(3);
        else if (state.phaseTimer > 7.0 && state.eventPhase === 3) triggerPhase(4);
        else if (state.phaseTimer > 14.0 && state.eventPhase === 4) triggerPhase(5);
        else if (state.phaseTimer > 12.0 && state.eventPhase === 5) triggerPhase(1);

        // Smooth cinematic camera orbit
        state.camera.azimuth += delta * 0.12;
        state.camera.elevation = 0.35 + Math.sin(state.time * 0.2) * 0.25;
      }

      // Smooth camera interpolation
      state.camera.distance +=
        (state.camera.targetDist - state.camera.distance) * 0.05;

      let camPos: [number, number, number];
      let camLook: [number, number, number];
      let camUp: [number, number, number] = [0, 1, 0];

      if (state.cameraMode === 'PATHWAY_FLIGHT') {
        state.flightProgress = (state.flightProgress + delta * state.flightSpeed) % (Math.PI * 2);
        const pt = getPathwayPoint(state.flightProgress);
        const lookAhead = getPathwayPoint((state.flightProgress + 0.16) % (Math.PI * 2));
        const frame = getPathwayFrame(state.flightProgress);
        camPos = [
          pt[0] + frame.normal[0] * 0.03,
          pt[1] + frame.normal[1] * 0.03,
          pt[2] + frame.normal[2] * 0.03,
        ];
        camLook = [lookAhead[0], lookAhead[1], lookAhead[2]];
        camUp = frame.normal;
      } else {
        const cx =
          state.camera.distance *
          Math.cos(state.camera.elevation) *
          Math.sin(state.camera.azimuth);
        const cy = state.camera.distance * Math.sin(state.camera.elevation);
        const cz =
          state.camera.distance *
          Math.cos(state.camera.elevation) *
          Math.cos(state.camera.azimuth);
        camPos = [cx, cy, cz];
        camLook = state.camera.look;
        camUp = [0, 1, 0];
      }

      const aspect = canvas.width / Math.max(1, canvas.height);
      const fov = state.cameraMode === 'PATHWAY_FLIGHT' ? 62.0 : 45.0;
      const proj = Mat4.perspective(fov * (Math.PI / 180.0), aspect, 0.05, 100.0);
      const view = Mat4.lookAt(camPos, camLook, camUp);
      const viewProj = Mat4.multiply(proj, view);

      // Execute Active Render Engine
      if (engineRef.current) {
        engineRef.current.render(viewProj, camPos, state);
      }

      // Throttle telemetry updates to 10Hz
      diagThrottle += delta;
      if (diagThrottle > 0.1) {
        diagThrottle = 0;
        let avgFps = 0;
        for (let i = 0; i < 30; i++) avgFps += state.fpsHistory[i];
        avgFps /= 30.0;

        const currentPhaseObj = PHASES[state.eventPhase] || PHASES[1];
        setDiagnostics({
          backend: state.webgpuSupported ? 'WebGPU (Compute)' : 'WebGL2 (Fallback)',
          particleCount: state.particleCount,
          frametimeMs: delta * 1000.0,
          fps: avgFps,
          tier: state.tier,
          phaseId: state.eventPhase,
          phaseName: currentPhaseObj.name,
          energyEntropy: state.audioRMS.low * 2.0 + state.audioRMS.high * 3.0,
          audioRMS: state.audioRMS.mid,
          resolution: `${canvas.width} \u00d7 ${canvas.height}`,
        });
      }
    };

    animFrameIdRef.current = requestAnimationFrame(frameLoop);

    return () => {
      destroyed = true;
      cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', debouncedResize);
      if (resizeTimer !== null) clearTimeout(resizeTimer);
      if (engineRef.current && engineRef.current.destroy) {
        engineRef.current.destroy();
      }
    };
  }, [triggerPhase]);

  // Pointer & Window Interaction Listeners
  useEffect(() => {
    return () => {
      audioReactorRef.current.destroy();
    };
  }, []);

  useEffect(() => {
    const toNDC = (clientX: number, clientY: number) => ({
      x: (clientX / window.innerWidth) * 2.0 - 1.0,
      y: -((clientY / window.innerHeight) * 2.0 - 1.0),
    });

    const activePointers = new Map<number, { x: number; y: number }>();
    let lastPointerPos = { x: 0, y: 0 };
    let initialPinchDist = 0;
    let initialCameraDist = 3.6;
    let lastTapTime = 0;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('#hud-overlay') || target.closest('#diag-panel')) return;

      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Mobile double-tap gesture detection
      const now = performance.now();
      if (now - lastTapTime < 320 && activePointers.size === 1) {
        triggerPhase(3); // Rupture trigger
        lastTapTime = 0;
        return;
      }
      lastTapTime = now;

      if (activePointers.size === 1) {
        lastPointerPos = { x: e.clientX, y: e.clientY };
        const ndc = toNDC(e.clientX, e.clientY);
        stateRef.current.cursor.down = true;
        stateRef.current.cursor.ndcX = ndc.x;
        stateRef.current.cursor.ndcY = ndc.y;
        stateRef.current.cursor.force = e.button === 2 ? -2.8 : 2.6;
      } else if (activePointers.size === 2) {
        // Pinch-to-zoom initialization for touchscreens
        stateRef.current.cursor.down = false;
        stateRef.current.cursor.force = 0.0;
        const pts = Array.from(activePointers.values());
        initialPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        initialCameraDist = stateRef.current.camera.targetDist;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const target = e.target as HTMLElement;
      if (target.closest('#hud-overlay') || target.closest('#diag-panel')) return;

      if (activePointers.size === 1) {
        const ndc = toNDC(e.clientX, e.clientY);
        stateRef.current.cursor.ndcX = ndc.x;
        stateRef.current.cursor.ndcY = ndc.y;

        if (stateRef.current.cursor.down) {
          // Robust delta calculation for Android Chrome (bypasses unreliable movementX)
          const dx = e.clientX - lastPointerPos.x;
          const dy = e.clientY - lastPointerPos.y;
          lastPointerPos = { x: e.clientX, y: e.clientY };

          stateRef.current.camera.azimuth += dx * 0.005;
          stateRef.current.camera.elevation = Math.max(
            -1.4,
            Math.min(1.4, stateRef.current.camera.elevation - dy * 0.005)
          );
        }
      } else if (activePointers.size === 2 && initialPinchDist > 0) {
        // Multi-touch Pinch to Zoom on Galaxy Fold 6
        const pts = Array.from(activePointers.values());
        const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const scale = initialPinchDist / Math.max(1, currentDist);
        stateRef.current.camera.targetDist = Math.max(
          2.0,
          Math.min(10.0, initialCameraDist * scale)
        );
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size === 0) {
        stateRef.current.cursor.down = false;
        stateRef.current.cursor.force = 0.0;
        initialPinchDist = 0;
      } else if (activePointers.size === 1) {
        const remaining = Array.from(activePointers.values())[0];
        lastPointerPos = { x: remaining.x, y: remaining.y };
      }
    };

    const handlePointerCancel = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      if (activePointers.size === 0) {
        stateRef.current.cursor.down = false;
        stateRef.current.cursor.force = 0.0;
        initialPinchDist = 0;
      }
    };

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('#diag-panel')) return;
      stateRef.current.camera.targetDist = Math.max(
        2.0,
        Math.min(10.0, stateRef.current.camera.targetDist + e.deltaY * 0.004)
      );
    };

    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('#hud-overlay')) return;
      triggerPhase(3); // Rupture
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        toggleActive();
      } else if (e.code === 'KeyD') {
        toggleDiag();
      } else if (e.code === 'KeyR') {
        reseedUniverse();
      } else if (e.code === 'KeyC') {
        toggleAutopilot();
      } else if (e.code === 'KeyM') {
        cycleAudio();
      } else if (e.code === 'KeyQ') {
        cycleTier();
      } else if (e.code === 'KeyF') {
        toggleCameraMode();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('dblclick', handleDblClick);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('dblclick', handleDblClick);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [
    triggerPhase,
    toggleActive,
    toggleDiag,
    reseedUniverse,
    toggleAutopilot,
    cycleAudio,
    cycleTier,
    toggleCameraMode,
  ]);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#030305] text-[#e6e8eb]">
      <canvas id="viewport" ref={canvasRef} />

      <HudOverlay
        active={active}
        onToggleActive={toggleActive}
        onReseed={reseedUniverse}
        audioMode={audioMode}
        onToggleAudio={cycleAudio}
        autopilot={autopilot}
        onToggleAutopilot={toggleAutopilot}
        tier={tier}
        onCycleTier={cycleTier}
        cameraMode={cameraMode}
        onToggleCameraMode={toggleCameraMode}
        diagVisible={diagVisible}
        onToggleDiag={toggleDiag}
        backendLabel={backendLabel}
        webgpuSupported={webgpuSupported}
        currentPhase={currentPhase}
        phases={PHASES}
        onSelectPhase={triggerPhase}
        seed={seed}
      />

      <DiagnosticsPanel
        visible={diagVisible}
        onClose={() => setDiagVisible(false)}
        diagnostics={diagnostics}
      />

      <InteractionHint />
    </main>
  );
}
