import { AudioMode, AudioRMS } from '../types.ts';

export class AudioReactor {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private micStream: MediaStream | null = null;
  private synthOscA: OscillatorNode | null = null;
  private synthOscB: OscillatorNode | null = null;
  private synthGain: GainNode | null = null;
  private initialized = false;

  init(): boolean {
    if (this.initialized) return true;
    if (typeof window === 'undefined') return false;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return false;

    try {
      this.ctx = new AudioContextClass();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      this.setupSyntheticGenerator();
      this.initialized = true;
      return true;
    } catch (err) {
      console.warn('Failed to initialize AudioContext:', err);
      return false;
    }
  }

  private setupSyntheticGenerator(): void {
    if (!this.ctx || !this.analyser) return;

    this.synthGain = this.ctx.createGain();
    // Subtle volume so it excites FFT analysis cleanly
    this.synthGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    // Deep sub-harmonic drone A1 (55Hz)
    this.synthOscA = this.ctx.createOscillator();
    this.synthOscA.type = 'sine';
    this.synthOscA.frequency.setValueAtTime(55.0, this.ctx.currentTime);

    // Resonant harmonic A2 (110Hz)
    this.synthOscB = this.ctx.createOscillator();
    this.synthOscB.type = 'triangle';
    this.synthOscB.frequency.setValueAtTime(110.0, this.ctx.currentTime);

    this.synthOscA.connect(this.synthGain);
    this.synthOscB.connect(this.synthGain);
    this.synthGain.connect(this.analyser);

    // Note: To prevent unexpected audio blasts on start, we don't connect to ctx.destination
    // unless explicitly enabled, keeping it as an internal driver
    this.synthOscA.start();
    this.synthOscB.start();
  }

  async activateMic(): Promise<boolean> {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    if (!this.ctx || !this.analyser || !navigator.mediaDevices?.getUserMedia) {
      this.fallbackToSynth();
      return false;
    }

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
        video: false,
      });
      const micSource = this.ctx.createMediaStreamSource(this.micStream);
      if (this.synthGain) {
        this.synthGain.disconnect();
      }
      micSource.connect(this.analyser);
      return true;
    } catch (err) {
      console.warn('Microphone access denied or unavailable, reverting to synth:', err);
      this.fallbackToSynth();
      return false;
    }
  }

  fallbackToSynth(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.synthGain && this.analyser) {
      try {
        this.synthGain.connect(this.analyser);
      } catch {
        // Already connected
      }
    }
  }

  mute(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
  }

  destroy(): void {
    this.mute();
    if (this.synthGain) {
      this.synthGain.disconnect();
    }
    if (this.synthOscA) {
      this.synthOscA.stop();
      this.synthOscA.disconnect();
    }
    if (this.synthOscB) {
      this.synthOscB.stop();
      this.synthOscB.disconnect();
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }

  update(
    time: number,
    mode: AudioMode,
    eventPhase: number,
    targetRMS: AudioRMS
  ): void {
    if (!this.initialized || mode === 'OFF' || !this.analyser || !this.dataArray) {
      // Procedural synthetic baseline modulation
      targetRMS.low = 0.05 + 0.03 * Math.sin(time * 0.5);
      targetRMS.mid = 0.04 + 0.02 * Math.cos(time * 0.9);
      targetRMS.high = 0.02 + 0.02 * Math.sin(time * 2.2);
      return;
    }

    // Dynamic synthesizer frequency modulation keyed to simulation tension
    if (mode === 'SYNTH' && this.synthOscA && this.synthOscB && this.ctx) {
      const tension = eventPhase === 2 || eventPhase === 3 ? 1.8 : 1.0;
      this.synthOscA.frequency.setValueAtTime(
        55.0 + Math.sin(time * 0.4) * 15.0 * tension,
        this.ctx.currentTime
      );
      this.synthOscB.frequency.setValueAtTime(
        110.0 + Math.cos(time * 0.7) * 35.0 * tension,
        this.ctx.currentTime
      );
    }

    // FFT Frequency Analysis
    // TypeScript Uint8Array is accepted by getByteFrequencyData
    this.analyser.getByteFrequencyData(this.dataArray as unknown as Uint8Array<ArrayBuffer>);

    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;
    const len = this.dataArray.length;

    // Bass / Sub-bass: bins 0 to 7
    for (let i = 0; i < 8; i++) lowSum += this.dataArray[i];
    // Mid harmonic range: bins 8 to 39
    for (let i = 8; i < 40; i++) midSum += this.dataArray[i];
    // High frequency shimmer: bins 40 to end
    for (let i = 40; i < len; i++) highSum += this.dataArray[i];

    const lowNorm = lowSum / (8 * 255.0);
    const midNorm = midSum / (32 * 255.0);
    const highNorm = highSum / ((len - 40) * 255.0);

    // Smooth exponential integration
    targetRMS.low += (lowNorm - targetRMS.low) * 0.2;
    targetRMS.mid += (midNorm - targetRMS.mid) * 0.2;
    targetRMS.high += (highNorm - targetRMS.high) * 0.2;
  }
}
