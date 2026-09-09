import React from 'react';
import { EngineDiagnostics } from '../types.ts';

interface DiagnosticsPanelProps {
  visible: boolean;
  onClose: () => void;
  diagnostics: EngineDiagnostics;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  visible,
  onClose,
  diagnostics,
}) => {
  if (!visible) return null;

  return (
    <div id="diag-panel" role="dialog" aria-label="System Telemetry">
      <div
        style={{
          fontWeight: 700,
          borderBottom: '1px solid #fff',
          paddingBottom: '4px',
          marginBottom: '4px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>SYSTEM TELEMETRY</span>
        <span
          id="btn-close-diag"
          style={{ cursor: 'pointer', color: 'var(--alert)' }}
          onClick={onClose}
        >
          [X]
        </span>
      </div>
      <div className="diag-row">
        <span>GPU BACKEND</span>
        <span className="diag-val" id="d-backend">
          {diagnostics.backend}
        </span>
      </div>
      <div className="diag-row">
        <span>AGENT DENSITY</span>
        <span className="diag-val" id="d-particles">
          {diagnostics.particleCount.toLocaleString()}
        </span>
      </div>
      <div className="diag-row">
        <span>FRAME DURATION</span>
        <span className="diag-val" id="d-frametime">
          {diagnostics.frametimeMs.toFixed(1)} ms
        </span>
      </div>
      <div className="diag-row">
        <span>RENDER CADENCE</span>
        <span className="diag-val" id="d-fps">
          {Math.round(diagnostics.fps)} FPS
        </span>
      </div>
      <div className="diag-row">
        <span>QUALITY STRATUM</span>
        <span className="diag-val" id="d-tier">
          {diagnostics.tier}
        </span>
      </div>
      <div className="diag-row">
        <span>DYNAMIC PHASE</span>
        <span className="diag-val" id="d-phase">
          {diagnostics.phaseName}
        </span>
      </div>
      <div className="diag-row">
        <span>ENERGY ENTROPY</span>
        <span className="diag-val" id="d-energy">
          {diagnostics.energyEntropy.toFixed(2)}
        </span>
      </div>
      <div className="diag-row">
        <span>AUDIO SPECTRAL RMS</span>
        <span className="diag-val" id="d-audio">
          {diagnostics.audioRMS.toFixed(3)}
        </span>
      </div>
      <div className="diag-row">
        <span>NATIVE RESOLUTION</span>
        <span className="diag-val" id="d-res">
          {diagnostics.resolution}
        </span>
      </div>
    </div>
  );
};
