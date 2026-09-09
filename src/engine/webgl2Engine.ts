import { IRenderEngine, SimulationState } from '../types.ts';
import { WEBGL2_FS_CODE, WEBGL2_VS_CODE } from '../shaders/webglShaders.ts';
import { generateWebGL2Particles } from './particleGenerators.ts';
import { getPathwayPoint, getPathwayTangent, getPathwayFrame } from './pathwayMath.ts';

export class WebGL2FallbackEngine implements IRenderEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buffer: WebGLBuffer | null = null;
  private particleCount = 32768;
  private pData: Float32Array | null = null;

  private locs: {
    viewProj: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    dt: WebGLUniformLocation | null;
    audio: WebGLUniformLocation | null;
    cursor: WebGLUniformLocation | null;
    systemId: WebGLUniformLocation | null;
    renderScale: WebGLUniformLocation | null;
  } = {
    viewProj: null,
    time: null,
    dt: null,
    audio: null,
    cursor: null,
    systemId: null,
    renderScale: null,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  initialize(state?: SimulationState): boolean {
    this.gl = this.canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });

    const gl = this.gl;
    if (!gl) return false;

    if (state) {
      this.particleCount = Math.min(state.particleCount, 32768);
    }

    const createShader = (type: number, src: string): WebGLShader | null => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('WebGL2 shader error:', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = createShader(gl.VERTEX_SHADER, WEBGL2_VS_CODE);
    const fs = createShader(gl.FRAGMENT_SHADER, WEBGL2_FS_CODE);
    if (!vs || !fs) return false;

    this.program = gl.createProgram();
    if (!this.program) return false;

    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('WebGL2 link error:', gl.getProgramInfoLog(this.program));
      return false;
    }

    const sysId = state?.eventPhase ?? 0;
    const seed = state?.seed ?? 1337;
    const pData = generateWebGL2Particles(this.particleCount, sysId, seed);
    this.pData = pData;

    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buffer) gl.deleteBuffer(this.buffer);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, pData, gl.DYNAMIC_DRAW);

    // Stride = 12 * 4 = 48 bytes
    // location 0: vec3 aPos
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0);

    // location 1: vec3 aVel
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 48, 16);

    // location 2: vec4 aProps (age, life, energy, seed)
    // In pData: [3]=age, [7]=life, [8]=seed, [9]=energy
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 48, 32);

    gl.bindVertexArray(null);

    this.locs = {
      viewProj: gl.getUniformLocation(this.program, 'uViewProj'),
      time: gl.getUniformLocation(this.program, 'uTime'),
      dt: gl.getUniformLocation(this.program, 'uDt'),
      audio: gl.getUniformLocation(this.program, 'uAudio'),
      cursor: gl.getUniformLocation(this.program, 'uCursor'),
      systemId: gl.getUniformLocation(this.program, 'uSystemId'),
      renderScale: gl.getUniformLocation(this.program, 'uRenderScale'),
    };

    return true;
  }

  resize(): void {
    if (!this.gl) return;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  reconfigureSystem(systemId: number, state: SimulationState): void {
    const gl = this.gl;
    if (!gl || !this.buffer) return;

    this.pData = generateWebGL2Particles(this.particleCount, systemId, state.seed);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pData);
  }

  render(
    camMatrix: Float32Array,
    _camPos: [number, number, number],
    state: SimulationState
  ): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.vao || !this.pData) return;

    const pData = this.pData;
    const dt = Math.min(state.dt, 0.04);
    const count = this.particleCount;
    const sys = Math.round(state.eventPhase);

    let seed = state.seed;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      const idx = i * 12;
      let px = pData[idx + 0];
      let py = pData[idx + 1];
      let pz = pData[idx + 2];
      let age = pData[idx + 3] + dt;
      let vx = pData[idx + 4];
      let vy = pData[idx + 5];
      let vz = pData[idx + 6];
      let life = pData[idx + 7];

      const dist = Math.sqrt(px * px + py * py + pz * pz);

      // Re-spawn expired particles using the active system's exact initial morphology
      if (age > life || dist > 8.0 || isNaN(px)) {
        age = 0.0;
        life = 3.5 + 4.0 * lcg();
        const r1 = lcg();
        const r2 = lcg();
        const r3 = lcg();

        if (sys === 0) {
          // Quantum
          const theta = r1 * Math.PI * 2;
          const phi = Math.acos(2 * r2 - 1);
          const rOrb = 0.8 + 1.6 * r3;
          const sh = Math.abs(Math.cos(phi) * Math.sin(theta * 2.0)) * 0.8 + 0.4;
          px = rOrb * sh * Math.sin(phi) * Math.cos(theta);
          py = rOrb * sh * Math.sin(phi) * Math.sin(theta);
          pz = rOrb * sh * Math.cos(phi);
          vx = 0; vy = 0; vz = 0;
        } else if (sys === 1) {
          // Kerr Disk
          if (r1 < 0.82) {
            const diskR = 0.45 + 2.8 * (r2 * r2);
            const ang = r3 * Math.PI * 2;
            px = Math.cos(ang) * diskR;
            py = (lcg() - 0.5) * 0.04;
            pz = Math.sin(ang) * diskR;
            const spd = 3.6 / Math.sqrt(diskR);
            vx = -Math.sin(ang) * spd;
            vy = 0;
            vz = Math.cos(ang) * spd;
          } else {
            const jetSign = r2 > 0.5 ? 1.0 : -1.0;
            const jetY = (0.2 + 3.0 * r3) * jetSign;
            const jetR = 0.07 * (1.0 + Math.abs(jetY) * 0.25);
            const ang = r1 * Math.PI * 2;
            px = Math.cos(ang) * jetR;
            py = jetY;
            pz = Math.sin(ang) * jetR;
            vx = 0;
            vy = jetSign * 18.0;
            vz = 0;
          }
        } else if (sys === 2) {
          // Neural
          const hub = Math.floor(r1 * 8) % 8;
          const hx = Math.sin(hub * 2.399) * 2.0;
          const hy = Math.cos(hub * 1.571) * 1.4;
          const hz = Math.sin(hub * 3.141) * 2.0;
          px = hx + (lcg() - 0.5) * 0.15;
          py = hy + (lcg() - 0.5) * 0.15;
          pz = hz + (lcg() - 0.5) * 0.15;
          const nextH = (hub + 1 + Math.floor(r2 * 3)) % 8;
          const nx = Math.sin(nextH * 2.399) * 2.0;
          const ny = Math.cos(nextH * 1.571) * 1.4;
          const nz = Math.sin(nextH * 3.141) * 2.0;
          const d = Math.hypot(nx - hx, ny - hy, nz - hz) || 1.0;
          vx = ((nx - hx) / d) * 4.5;
          vy = ((ny - hy) / d) * 4.5;
          vz = ((nz - hz) / d) * 4.5;
        } else if (sys === 3) {
          // Supernova
          const theta = r1 * Math.PI * 2;
          const phi = Math.acos(2 * r2 - 1);
          const dirX = Math.sin(phi) * Math.cos(theta);
          const dirY = Math.sin(phi) * Math.sin(theta);
          const dirZ = Math.cos(phi);
          const r = 0.05 + 0.15 * r3;
          px = dirX * r; py = dirY * r; pz = dirZ * r;
          const spd = 6.0 + 8.0 * lcg() + state.audioRMS.low * 6.0;
          vx = dirX * spd; vy = dirY * spd; vz = dirZ * spd;
        } else if (sys === 4) {
          // 3D Hyperspace Pathway
          const sParam = r1 * Math.PI * 2;
          const frame = getPathwayFrame(sParam);
          const isRing = r2 < 0.22;
          if (isRing) {
            const ringStation = Math.floor(r1 * 8) * (Math.PI / 4);
            const ringFrame = getPathwayFrame(ringStation);
            const tubeR = 0.44 + (lcg() - 0.5) * 0.05;
            const theta = r3 * Math.PI * 2;
            px = ringFrame.center[0] + tubeR * (Math.cos(theta) * ringFrame.normal[0] + Math.sin(theta) * ringFrame.binormal[0]);
            py = ringFrame.center[1] + tubeR * (Math.cos(theta) * ringFrame.normal[1] + Math.sin(theta) * ringFrame.binormal[1]);
            pz = ringFrame.center[2] + tubeR * (Math.cos(theta) * ringFrame.normal[2] + Math.sin(theta) * ringFrame.binormal[2]);
            vx = ringFrame.tangent[0] * 1.4 + (-Math.sin(theta) * ringFrame.normal[0] + Math.cos(theta) * ringFrame.binormal[0]) * 7.5;
            vy = ringFrame.tangent[1] * 1.4 + (-Math.sin(theta) * ringFrame.normal[1] + Math.cos(theta) * ringFrame.binormal[1]) * 7.5;
            vz = ringFrame.tangent[2] * 1.4 + (-Math.sin(theta) * ringFrame.normal[2] + Math.cos(theta) * ringFrame.binormal[2]) * 7.5;
          } else {
            const tubeR = 0.08 + 0.32 * Math.sqrt(r2);
            const theta = r3 * Math.PI * 2;
            px = frame.center[0] + tubeR * (Math.cos(theta) * frame.normal[0] + Math.sin(theta) * frame.binormal[0]);
            py = frame.center[1] + tubeR * (Math.cos(theta) * frame.normal[1] + Math.sin(theta) * frame.binormal[1]);
            pz = frame.center[2] + tubeR * (Math.cos(theta) * frame.normal[2] + Math.sin(theta) * frame.binormal[2]);
            const fwdSpeed = 8.5 + 5.5 * lcg();
            vx = frame.tangent[0] * fwdSpeed + (-Math.sin(theta) * frame.normal[0] + Math.cos(theta) * frame.binormal[0]) * 3.0;
            vy = frame.tangent[1] * fwdSpeed + (-Math.sin(theta) * frame.normal[1] + Math.cos(theta) * frame.binormal[1]) * 3.0;
            vz = frame.tangent[2] * fwdSpeed + (-Math.sin(theta) * frame.normal[2] + Math.cos(theta) * frame.binormal[2]) * 3.0;
          }
        } else {
          // Cyclone
          const hNorm = r1;
          py = -2.5 + 5.0 * hNorm;
          const fR = 0.25 + 2.8 * (hNorm * hNorm);
          const ang = r2 * Math.PI * 2;
          px = Math.cos(ang) * fR;
          pz = Math.sin(ang) * fR;
          const spd = 4.0 + 6.0 * (1.0 - hNorm);
          vx = -Math.sin(ang) * spd;
          vy = 4.0 + 5.0 * (1.0 - hNorm * 0.5);
          vz = Math.cos(ang) * spd;
        }
      }

      // Physics integration per system
      let fx = 0.0;
      let fy = 0.0;
      let fz = 0.0;
      let drag = 0.98;

      if (sys === 0) {
        // Quantum
        const r = Math.max(dist, 0.01);
        const theta = Math.atan2(Math.hypot(px, pz), py);
        const phi = Math.atan2(pz, px);
        const psi = Math.sin(theta * 2.0) * Math.cos(phi * 2.0) * Math.sin(r * 4.5 - state.time * 2.5);
        const gx = Math.cos(phi) * psi;
        const gy = Math.sin(theta * 2.0) * Math.cos(state.time * 1.5);
        const gz = Math.sin(phi) * psi;
        vx += (gx * 4.5 - px * (r - 1.8) * 3.0 - vx) * dt * 8.0;
        vy += (gy * 4.5 - py * (r - 1.8) * 3.0 - vy) * dt * 8.0;
        vz += (gz * 4.5 - pz * (r - 1.8) * 3.0 - vz) * dt * 8.0;
        drag = 1.0;
        if (lcg() < 0.004) {
          px = -px + (lcg() - 0.5) * 0.3;
          py = -py + (lcg() - 0.5) * 0.3;
          pz = -pz + (lcg() - 0.5) * 0.3;
          vx = -vx * 0.5; vy = -vy * 0.5; vz = -vz * 0.5;
        }
      } else if (sys === 1) {
        // Kerr Disk
        const rPlane = Math.max(Math.hypot(px, pz), 0.01);
        if (Math.abs(py) > 0.25 && rPlane < 0.6) {
          const jetSign = Math.sign(py + 0.0001);
          fx = -px * 12.0 - pz * 10.0;
          fy = jetSign * 35.0;
          fz = -pz * 12.0 + px * 10.0;
          drag = 0.96;
          if (Math.abs(py) > 4.2) {
            const ang = lcg() * Math.PI * 2;
            px = Math.cos(ang) * 2.8;
            py = 0;
            pz = Math.sin(ang) * 2.8;
            vx = -Math.sin(ang) * 2.0;
            vy = 0;
            vz = Math.cos(ang) * 2.0;
          }
        } else {
          if (rPlane < 0.38) {
            py = Math.sign(py + 0.001) * 0.3;
            vx = 0; vy = Math.sign(py) * 20.0; vz = 0;
          } else {
            const vK = 3.6 / Math.sqrt(rPlane);
            fx = (-pz / rPlane) * vK * 2.4 - (px / (rPlane * rPlane + 0.05)) * 2.0;
            fy = -py * 25.0;
            fz = (px / rPlane) * vK * 2.4 - (pz / (rPlane * rPlane + 0.05)) * 2.0;
            drag = 0.985;
          }
        }
      } else if (sys === 2) {
        // Neural
        let nearestHub = [0, 0, 0];
        let minDist = 999.0;
        let nIdx = 0;
        for (let h = 0; h < 8; h++) {
          const hx = Math.sin(h * 2.399) * 2.0;
          const hy = Math.cos(h * 1.571) * 1.4;
          const hz = Math.sin(h * 3.141) * 2.0;
          const d = Math.hypot(hx - px, hy - py, hz - pz);
          if (d < minDist) { minDist = d; nearestHub = [hx, hy, hz]; nIdx = h; }
        }
        if (minDist < 0.25) {
          const nextH = (nIdx + 1 + Math.floor(lcg() * 3)) % 8;
          const nx = Math.sin(nextH * 2.399) * 2.0;
          const ny = Math.cos(nextH * 1.571) * 1.4;
          const nz = Math.sin(nextH * 3.141) * 2.0;
          let dx = nx - px; let dy = ny - py; let dz = nz - pz;
          if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= Math.abs(dz)) {
            dx = Math.sign(dx); dy = 0; dz = 0;
          } else if (Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) >= Math.abs(dz)) {
            dx = 0; dy = Math.sign(dy); dz = 0;
          } else {
            dx = 0; dy = 0; dz = Math.sign(dz);
          }
          vx = dx * 5.5; vy = dy * 5.5; vz = dz * 5.5;
        }
        drag = 1.0;
      } else if (sys === 3) {
        // Supernova
        const r = Math.max(dist, 0.01);
        const bx = px / r; const by = py / r; const bz = pz / r;
        const shockR = 0.2 + (age / life) * 3.5;
        if (r < shockR) {
          const bForce = 12.0 / (r + 0.2) + state.audioRMS.low * 8.0;
          fx = bx * bForce; fy = by * bForce; fz = bz * bForce;
          drag = 0.96;
        } else {
          fx = -bx * 15.0; fy = -by * 15.0; fz = -bz * 15.0;
          drag = 0.88;
        }
      } else if (sys === 4) {
        // 3D Hyperspace Pathway: Geodesic Guidance & Relativistic Magnetic Confinement
        let sApprox = Math.atan2(pz, px) * 0.5;
        if (sApprox < 0.0) sApprox += Math.PI;

        let bestS = sApprox;
        let minD2 = 999.0;
        for (let step = -2; step <= 2; step++) {
          const testS = sApprox + step * 0.15;
          const cPt = getPathwayPoint(testS);
          const d2 = (px - cPt[0]) ** 2 + (py - cPt[1]) ** 2 + (pz - cPt[2]) ** 2;
          if (d2 < minD2) {
            minD2 = d2;
            bestS = testS;
          }
        }

        const center = getPathwayPoint(bestS);
        const tangent = getPathwayTangent(bestS);
        const toX = px - center[0];
        const toY = py - center[1];
        const toZ = pz - center[2];
        const dotT = toX * tangent[0] + toY * tangent[1] + toZ * tangent[2];
        const perpX = toX - tangent[0] * dotT;
        const perpY = toY - tangent[1] * dotT;
        const perpZ = toZ - tangent[2] * dotT;
        const rPerp = Math.hypot(perpX, perpY, perpZ);
        const pLen = Math.max(rPerp, 0.001);
        const dirX = perpX / pLen;
        const dirY = perpY / pLen;
        const dirZ = perpZ / pLen;

        const targetR = 0.28 + 0.12 * Math.cos(bestS * 6.0);
        const rConf = (rPerp - targetR) * 32.0;

        // Helical swirl = cross(tangent, perpDir) * 6.5
        const swirlX = (tangent[1] * dirZ - tangent[2] * dirY) * 6.5;
        const swirlY = (tangent[2] * dirX - tangent[0] * dirZ) * 6.5;
        const swirlZ = (tangent[0] * dirY - tangent[1] * dirX) * 6.5;

        // Relativistic forward acceleration
        const fwd = 15.0 + state.audioRMS.low * 14.0;

        // Gate boost
        const gatePhase = (bestS * (8.0 / (Math.PI * 2))) % 1.0;
        const isBoost = gatePhase < 0.08 || gatePhase > 0.92;
        const boost = isBoost ? 28.0 : 0.0;

        fx = -dirX * rConf + swirlX + tangent[0] * (fwd + boost);
        fy = -dirY * rConf + swirlY + tangent[1] * (fwd + boost);
        fz = -dirZ * rConf + swirlZ + tangent[2] * (fwd + boost);
        drag = 0.985;
      } else {
        // Cyclone
        const rPlane = Math.max(Math.hypot(px, pz), 0.05);
        const tx = -pz / rPlane; const tz = px / rPlane;
        const ix = -px / rPlane; const iz = -pz / rPlane;
        const up = Math.max(0, (2.0 - rPlane) / 1.8) * (9.0 + state.audioRMS.mid * 6.0);
        const spin = 6.0 + 8.0 / (rPlane * 0.7 + 0.3);
        if (py > 2.0) {
          fx = tx * spin * 0.5 + px * 3.5;
          fy = -3.0;
          fz = tz * spin * 0.5 + pz * 3.5;
          drag = 0.94;
        } else {
          fx = tx * spin + ix * 4.0;
          fy = up;
          fz = tz * spin + iz * 4.0;
          drag = 0.97;
        }
      }

      // Cursor tractor force
      if (state.cursor.down) {
        const mx = state.cursor.ndcX * 3.2 - px;
        const my = -state.cursor.ndcY * 3.2 - py;
        const md = Math.hypot(mx, Math.hypot(my, pz));
        if (md < 3.5) {
          const mPull = (3.5 - md) * state.cursor.force * 5.0;
          fx += (mx / (md + 0.001)) * mPull;
          fy += (my / (md + 0.001)) * mPull;
          fz += (-pz / (md + 0.001)) * mPull;
        }
      }

      // Audio Bass Reactivity
      if (state.audioRMS.low > 0.08) {
        const r = Math.max(dist, 0.1);
        const pulse = state.audioRMS.low * Math.sin(r * 8.0 - state.time * 6.0) * 1.5;
        fx += (px / r) * pulse;
        fy += (py / r) * pulse;
        fz += (pz / r) * pulse;
      }

      vx = (vx + fx * dt) * drag;
      vy = (vy + fy * dt) * drag;
      vz = (vz + fz * dt) * drag;

      px += vx * dt;
      py += vy * dt;
      pz += vz * dt;

      pData[idx + 0] = px;
      pData[idx + 1] = py;
      pData[idx + 2] = pz;
      pData[idx + 3] = age;
      pData[idx + 4] = vx;
      pData[idx + 5] = vy;
      pData[idx + 6] = vz;
      pData[idx + 7] = life;
      // energy in index 9
      pData[idx + 9] = Math.min(1.0, Math.hypot(vx, vy, vz) * 0.15 + state.audioRMS.low * 0.4);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, pData);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.003, 0.003, 0.005, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive splatting

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locs.viewProj, false, camMatrix);
    gl.uniform1f(this.locs.time, state.time);
    gl.uniform1f(this.locs.dt, state.dt);
    gl.uniform4f(
      this.locs.audio,
      state.audioRMS.low,
      state.audioRMS.mid,
      state.audioRMS.high,
      0.0
    );
    gl.uniform4f(
      this.locs.cursor,
      state.cursor.ndcX,
      state.cursor.ndcY,
      state.cursor.force,
      state.cursor.down ? 1.0 : 0.0
    );
    if (this.locs.systemId) gl.uniform1f(this.locs.systemId, state.eventPhase);
    const densityRatio = this.particleCount / 16384;
    const rScale = 1.0 / Math.pow(Math.max(1, densityRatio), 0.38);
    if (this.locs.renderScale) gl.uniform1f(this.locs.renderScale, rScale);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.particleCount);
    gl.bindVertexArray(null);
  }

  destroy(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.program) gl.deleteProgram(this.program);
  }
}
