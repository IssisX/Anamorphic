import React from 'react';
import { AudioMode, CameraMode, QualityTier, SimulationPhase } from '../types.ts';
import { Activity, Atom, Compass, Cpu, Eye, Orbit, Play, Pause, Radio, RefreshCw, Volume2 } from 'lucide-react';

interface HudOverlayProps {
  active: boolean;
  onToggleActive: () => void;
  onReseed: () => void;
  audioMode: AudioMode;
  onToggleAudio: () => void;
  autopilot: boolean;
  onToggleAutopilot: () => void;
  tier: QualityTier;
  onCycleTier: () => void;
  cameraMode: CameraMode;
  onToggleCameraMode: () => void;
  diagVisible: boolean;
  onToggleDiag: () => void;
  backendLabel: string;
  webgpuSupported: boolean;
  currentPhase: number;
  phases: SimulationPhase[];
  onSelectPhase: (phaseId: number) => void;
  seed: number;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  active,
  onToggleActive,
  onReseed,
  audioMode,
  onToggleAudio,
  autopilot,
  onToggleAutopilot,
  tier,
  onCycleTier,
  cameraMode,
  onToggleCameraMode,
  diagVisible,
  onToggleDiag,
  backendLabel,
  webgpuSupported,
  currentPhase,
  phases,
  onSelectPhase,
  seed,
}) => {
  const statusDotClass = webgpuSupported
    ? 'status-dot active'
    : backendLabel.includes('FALLBACK')
    ? 'status-dot fallback'
    : 'status-dot';

  const audioLabel =
    audioMode === 'MIC'
      ? 'MIC ACTIVE'
      : audioMode === 'SYNTH'
      ? 'SYNTHESIS'
      : 'MUTED';

  const activeSystem = phases.find((p) => p.id === currentPhase) || phases[0];

  return (
    <div id="hud-overlay">
      {/* Top Header Bar */}
      <header className="hud-top">
        <div className="hud-element brand-container">
          <div className="flex items-center gap-2">
            <Atom size={14} className="text-[#9baec8] animate-pulse" />
            <div className="brand-title">THE ANAMORPHIC ENGINE</div>
          </div>
          <div className="prelude-tag">
            <span>SYS {activeSystem.id}: {activeSystem.systemType}</span>
            <span className="opacity-50 ml-2 hidden sm:inline font-mono">{activeSystem.formula}</span>
          </div>
        </div>

        <div className="status-badge hud-element">
          <div id="status-dot" className={statusDotClass} />
          <span id="backend-label">{backendLabel}</span>
        </div>
      </header>

      {/* Left Control Rail */}
      <div className="hud-rail hud-element" role="toolbar" aria-label="Engine Controls">
        <button
          id="btn-play"
          className={`btn-rail ${active ? 'active' : ''}`}
          title="Toggle Simulation Execution (Space)"
          onClick={onToggleActive}
        >
          {active ? <Pause size={13} /> : <Play size={13} />}
          <span className="btn-label">{active ? 'RUNNING' : 'PAUSED'}</span>
          <span className="desktop-key">// [SPACE]</span>
        </button>

        <button
          id="btn-seed"
          className="btn-rail"
          title="Generate New Universe Topology (R)"
          onClick={onReseed}
        >
          <RefreshCw size={13} />
          <span className="btn-label">RE-SEED</span>
          <span className="desktop-key">[R]</span>
        </button>

        <button
          id="btn-audio"
          className={`btn-rail ${audioMode !== 'OFF' ? 'active' : ''}`}
          title="Toggle Web Audio Ingestion (M)"
          onClick={onToggleAudio}
        >
          {audioMode === 'MIC' ? <Radio size={13} /> : <Volume2 size={13} />}
          <span className="btn-label">{audioLabel}</span>
          <span className="desktop-key">[M]</span>
        </button>

        <button
          id="btn-auto"
          className={`btn-rail ${autopilot ? 'active' : ''}`}
          title="Toggle Cinematic Choreography (C)"
          onClick={onToggleAutopilot}
        >
          <Eye size={13} />
          <span className="btn-label">AUTO: {autopilot ? 'ON' : 'OFF'}</span>
          <span className="desktop-key">[C]</span>
        </button>

        <button
          id="btn-quality"
          className="btn-rail"
          title="Cycle Computational Particle Density (Q)"
          onClick={onCycleTier}
        >
          <Cpu size={13} />
          <span className="btn-label">TIER: {tier}</span>
          <span className="desktop-key">[Q]</span>
        </button>

        <button
          id="btn-flight"
          className={`btn-rail ${cameraMode === 'PATHWAY_FLIGHT' ? 'active' : ''}`}
          title="Toggle 3D Pathway Cockpit Flight Camera (F)"
          onClick={onToggleCameraMode}
        >
          <Compass size={13} />
          <span className="btn-label">{cameraMode === 'PATHWAY_FLIGHT' ? 'IN FLIGHT' : 'ORBIT CAM'}</span>
          <span className="desktop-key">[F]</span>
        </button>

        <button
          id="btn-diag"
          className={`btn-rail ${diagVisible ? 'active' : ''}`}
          title="Toggle System Telemetry Matrix (D)"
          onClick={onToggleDiag}
        >
          <Activity size={13} />
          <span className="btn-label">TELEMETRY</span>
          <span className="desktop-key">[D]</span>
        </button>
      </div>

      {/* Bottom Distinct Complex System Selector Dock */}
      <footer className="hud-bottom">
        <div className="system-dock-container hud-element">
          <div className="system-dock-header">
            <div className="system-active-tag">
              <Orbit size={11} className="text-[#9baec8]" />
              <span className="text-white font-semibold">SYS {activeSystem.id}: {activeSystem.name}</span>
              <span className="text-[#5e6573]">— {activeSystem.tag}</span>
            </div>
            <div className="seed-badge" id="seed-display">
              0x{seed.toString(16).toUpperCase()}
            </div>
          </div>

          <div className="system-selector-row" id="phase-readout">
            {phases.map((p) => {
              const isSelected = currentPhase === p.id;
              return (
                <button
                  key={p.id}
                  id={`sys-tab-${p.id}`}
                  className={`system-tab ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelectPhase(p.id)}
                  title={`${p.name} - ${p.tag}`}
                >
                  <span className="tab-idx">0{p.id}</span>
                  <span className="tab-name">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </footer>
    </div>
  );
};
