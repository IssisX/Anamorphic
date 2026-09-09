export type QualityTier = 'LOW' | 'MED' | 'HIGH' | 'ULTRA';

export type CameraMode = 'ORBIT' | 'PATHWAY_FLIGHT';

export type AudioMode = 'OFF' | 'SYNTH' | 'MIC';

export interface AudioRMS {
  low: number;
  mid: number;
  high: number;
}

export interface CursorState {
  x: number;
  y: number;
  ndcX: number;
  ndcY: number;
  down: boolean;
  force: number;
}

export interface CameraState {
  azimuth: number;
  elevation: number;
  distance: number;
  targetDist: number;
  targetLook: [number, number, number];
  look: [number, number, number];
  matrix: Float32Array;
}

export interface SimulationPhase {
  id: number;
  name: string;
  tag: string;
  systemType: string;
  formula: string;
}

export interface SimulationState {
  active: boolean;
  webgpuSupported: boolean;
  backend: string;
  tier: QualityTier;
  particleCount: number;
  seed: number;
  time: number;
  dt: number;
  eventPhase: number;
  phaseTimer: number;
  autopilot: boolean;
  audioMode: AudioMode;
  audioRMS: AudioRMS;
  cursor: CursorState;
  camera: CameraState;
  fpsHistory: Float32Array;
  fpsIndex: number;
  lastTimestamp: number;
  motionReduced: boolean;
  cameraMode: CameraMode;
  flightProgress: number;
  flightSpeed: number;
}

export interface EngineDiagnostics {
  backend: string;
  particleCount: number;
  frametimeMs: number;
  fps: number;
  tier: QualityTier;
  phaseId: number;
  phaseName: string;
  energyEntropy: number;
  audioRMS: number;
  resolution: string;
  cameraMode: 'ORBIT' | 'PATHWAY_FLIGHT';
}

export interface IRenderEngine {
  initialize(state?: SimulationState): Promise<boolean> | boolean;
  resize(): void;
  reconfigureSystem?(systemId: number, state: SimulationState): void;
  render(
    camMatrix: Float32Array,
    camPos: [number, number, number],
    state: SimulationState
  ): void;
  destroy?(): void;
}
