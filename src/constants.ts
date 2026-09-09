import { QualityTier, SimulationPhase, SimulationState } from './types.ts';

export const TIERS: Record<QualityTier, number> = {
  ULTRA: 131072,
  HIGH: 65536,
  MED: 32768,
  LOW: 16384,
};

export const PHASES: SimulationPhase[] = [
  {
    id: 0,
    name: 'QUANTUM CHRYSALIS',
    tag: 'Harmonic Schrödinger wavepacket interference & orbital nodal probability',
    systemType: 'Quantum Electrodynamics',
    formula: 'ψ_nlm(r,θ,φ) = R_nl(r) Y_l^m(θ,φ) e^{-iEt/ℏ}',
  },
  {
    id: 1,
    name: 'KERR ACCRETION DISK',
    tag: 'Relativistic Lense-Thirring frame dragging & polar relativistic plasma jets',
    systemType: 'General Relativity',
    formula: 'ds² = -(1 - 2Mr/ρ²)dt² - (4Mar sin²θ/ρ²)dtdφ + ...',
  },
  {
    id: 2,
    name: 'NEURAL CONNECTOME',
    tag: 'Axonal branching network with travelling action potential spike trains',
    systemType: 'Biomimetic Neurophysics',
    formula: '∂V/∂t = D ∇²V + f(V) - w + I_{syn}(t)',
  },
  {
    id: 3,
    name: 'SUPERNOVA BLAST',
    tag: 'Thermonuclear shockwave breakout & turbulent Rayleigh-Taylor fingers',
    systemType: 'Astrophysical Hydrodynamics',
    formula: 'R_s(t) = ξ_0 (E t² / ρ_0)^{1/5}, At = (ρ_2 - ρ_1)/(ρ_2 + ρ_1)',
  },
  {
    id: 4,
    name: '3D HYPERSPACE PATHWAY',
    tag: 'Einstein-Rosen wormhole geodesic conduit with relativistic particle corridor',
    systemType: 'Spacetime Transit Geodesic',
    formula: 'ds² = -c²dt² + dl² + (b_0² + l²)(dθ² + sin²θ dφ²)',
  },
  {
    id: 5,
    name: 'TORNADIC CYCLONE',
    tag: 'Dual mesocyclonic Rankine vortex with thermal convective updraft funnel',
    systemType: 'Atmospheric Fluid Dynamics',
    formula: '∂ω/∂t + (u·∇)ω = (ω·∇)u + ν∇²ω + ∇θ × g',
  },
];

export function createInitialSimulationState(): SimulationState {
  const motionReduced = typeof window !== 'undefined' && 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    active: true,
    webgpuSupported: false,
    backend: 'Probing hardware...',
    tier: 'ULTRA',
    particleCount: TIERS.ULTRA,
    seed: 0x9af3c1,
    time: 0.0,
    dt: motionReduced ? 0.008 : 0.016,
    eventPhase: 4, // Default to the 3D HYPERSPACE PATHWAY!
    phaseTimer: 0.0,
    autopilot: !motionReduced,
    audioMode: 'SYNTH',
    audioRMS: { low: 0.0, mid: 0.0, high: 0.0 },
    cursor: { x: 0, y: 0, ndcX: 0, ndcY: 0, down: false, force: 0.0 },
    camera: {
      azimuth: 0.78,
      elevation: 0.35,
      distance: 4.8,
      targetDist: 4.8,
      targetLook: [0, 0, 0],
      look: [0, 0, 0],
      matrix: new Float32Array(16),
    },
    fpsHistory: new Float32Array(30),
    fpsIndex: 0,
    lastTimestamp: typeof performance !== 'undefined' ? performance.now() : 0,
    motionReduced,
    cameraMode: 'ORBIT',
    flightProgress: 0.0,
    flightSpeed: 0.55,
  };
}
