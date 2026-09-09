import { getPathwayFrame } from './pathwayMath.ts';

// Deterministic particle morphology generators for 6 radically distinct systems

export function generateWebGPUParticles(
  count: number,
  systemId: number,
  seed: number
): Float32Array {
  const data = new Float32Array(count * 16);
  let s = seed;
  const lcg = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const sys = Math.round(systemId);

  for (let i = 0; i < count; i++) {
    const idx = i * 16;
    const r1 = lcg();
    const r2 = lcg();
    const r3 = lcg();

    let px = 0;
    let py = 0;
    let pz = 0;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    const life = 3.5 + 4.5 * lcg();
    const age = lcg() * life * 0.8;

    if (sys === 0) {
      // System 0: QUANTUM CHRYSALIS (Wave orbital probability lobes)
      const theta = r1 * Math.PI * 2;
      const phi = Math.acos(2 * r2 - 1);
      const orbitalR = 0.8 + 1.6 * r3;
      const shape = Math.abs(Math.cos(phi) * Math.sin(theta * 2.0)) * 0.8 + 0.4;
      const r = orbitalR * shape;
      px = r * Math.sin(phi) * Math.cos(theta);
      py = r * Math.sin(phi) * Math.sin(theta);
      pz = r * Math.cos(phi);
      vx = (lcg() - 0.5) * 0.1;
      vy = (lcg() - 0.5) * 0.1;
      vz = (lcg() - 0.5) * 0.1;
    } else if (sys === 1) {
      // System 1: KERR ACCRETION DISK & RELATIVISTIC JETS
      if (r1 < 0.82) {
        // Flat Keplerian disk
        const diskR = 0.45 + 2.8 * (r2 * r2);
        const ang = r3 * Math.PI * 2;
        px = Math.cos(ang) * diskR;
        py = (lcg() - 0.5) * 0.05;
        pz = Math.sin(ang) * diskR;
        const orbSpd = 3.6 / Math.sqrt(diskR);
        vx = -Math.sin(ang) * orbSpd;
        vy = (lcg() - 0.5) * 0.05;
        vz = Math.cos(ang) * orbSpd;
      } else {
        // Collimated polar jets
        const jetSign = r2 > 0.5 ? 1.0 : -1.0;
        const jetY = (0.2 + 3.2 * r3) * jetSign;
        const jetR = 0.07 * (1.0 + Math.abs(jetY) * 0.25);
        const ang = r1 * Math.PI * 2;
        px = Math.cos(ang) * jetR;
        py = jetY;
        pz = Math.sin(ang) * jetR;
        vx = -Math.sin(ang) * 1.5;
        vy = jetSign * 18.0;
        vz = Math.cos(ang) * 1.5;
      }
    } else if (sys === 2) {
      // System 2: NEURAL CONNECTOME (Synaptic hubs & linear axon routes)
      const hubIdx = Math.floor(r1 * 8) % 8;
      const hx = Math.sin(hubIdx * 2.399) * 2.0;
      const hy = Math.cos(hubIdx * 1.571) * 1.4;
      const hz = Math.sin(hubIdx * 3.141) * 2.0;

      const targetHub = (hubIdx + 1 + Math.floor(r2 * 3)) % 8;
      const tx = Math.sin(targetHub * 2.399) * 2.0;
      const ty = Math.cos(targetHub * 1.571) * 1.4;
      const tz = Math.sin(targetHub * 3.141) * 2.0;

      // Distribute along connecting axon bridge
      const frac = r3;
      px = hx + (tx - hx) * frac + (lcg() - 0.5) * 0.06;
      py = hy + (ty - hy) * frac + (lcg() - 0.5) * 0.06;
      pz = hz + (tz - hz) * frac + (lcg() - 0.5) * 0.06;

      const d = Math.hypot(tx - hx, ty - hy, tz - hz) || 1.0;
      vx = ((tx - hx) / d) * 4.5;
      vy = ((ty - hy) / d) * 4.5;
      vz = ((tz - hz) / d) * 4.5;
    } else if (sys === 3) {
      // System 3: SUPERNOVA BLAST (Dense central core bursting outward)
      const theta = r1 * Math.PI * 2;
      const phi = Math.acos(2 * r2 - 1);
      const blastDirX = Math.sin(phi) * Math.cos(theta);
      const blastDirY = Math.sin(phi) * Math.sin(theta);
      const blastDirZ = Math.cos(phi);

      const r = 0.08 + 0.35 * r3;
      px = blastDirX * r;
      py = blastDirY * r;
      pz = blastDirZ * r;

      const speed = 7.0 + 8.0 * lcg();
      vx = blastDirX * speed;
      vy = blastDirY * speed;
      vz = blastDirZ * speed;
    } else if (sys === 4) {
      // System 4: 3D HYPERSPACE PATHWAY (Relativistic Wormhole Geodesic Conduit)
      const sPos = r1 * Math.PI * 2;
      const frame = getPathwayFrame(sPos);
      const isRing = r2 < 0.22;

      if (isRing) {
        // Toroidal Transit Accelerator Ring
        const ringStation = Math.floor(r1 * 8) * (Math.PI / 4);
        const ringFrame = getPathwayFrame(ringStation);
        const tubeR = 0.44 + (lcg() - 0.5) * 0.05;
        const theta = r3 * Math.PI * 2;
        px = ringFrame.center[0] + tubeR * (Math.cos(theta) * ringFrame.normal[0] + Math.sin(theta) * ringFrame.binormal[0]);
        py = ringFrame.center[1] + tubeR * (Math.cos(theta) * ringFrame.normal[1] + Math.sin(theta) * ringFrame.binormal[1]);
        pz = ringFrame.center[2] + tubeR * (Math.cos(theta) * ringFrame.normal[2] + Math.sin(theta) * ringFrame.binormal[2]);
        const fwdSpeed = 1.4;
        const swirlSpeed = 7.5;
        vx = ringFrame.tangent[0] * fwdSpeed + (-Math.sin(theta) * ringFrame.normal[0] + Math.cos(theta) * ringFrame.binormal[0]) * swirlSpeed;
        vy = ringFrame.tangent[1] * fwdSpeed + (-Math.sin(theta) * ringFrame.normal[1] + Math.cos(theta) * ringFrame.binormal[1]) * swirlSpeed;
        vz = ringFrame.tangent[2] * fwdSpeed + (-Math.sin(theta) * ringFrame.normal[2] + Math.cos(theta) * ringFrame.binormal[2]) * swirlSpeed;
      } else {
        // High-velocity interior matter stream and helical wall boundary
        const tubeR = 0.08 + 0.32 * Math.sqrt(r2);
        const theta = r3 * Math.PI * 2;
        px = frame.center[0] + tubeR * (Math.cos(theta) * frame.normal[0] + Math.sin(theta) * frame.binormal[0]);
        py = frame.center[1] + tubeR * (Math.cos(theta) * frame.normal[1] + Math.sin(theta) * frame.binormal[1]);
        pz = frame.center[2] + tubeR * (Math.cos(theta) * frame.normal[2] + Math.sin(theta) * frame.binormal[2]);
        const fwdSpeed = 8.5 + 5.5 * lcg();
        const swirlSpeed = 3.0;
        vx = frame.tangent[0] * fwdSpeed + (-Math.sin(theta) * frame.normal[0] + Math.cos(theta) * frame.binormal[0]) * swirlSpeed;
        vy = frame.tangent[1] * fwdSpeed + (-Math.sin(theta) * frame.normal[1] + Math.cos(theta) * frame.binormal[1]) * swirlSpeed;
        vz = frame.tangent[2] * fwdSpeed + (-Math.sin(theta) * frame.normal[2] + Math.cos(theta) * frame.binormal[2]) * swirlSpeed;
      }
    } else {
      // System 5: TORNADIC CYCLONE (Vertical funnel vortex)
      const heightNorm = r1; // 0 = ground, 1 = anvil
      py = -2.5 + 5.0 * heightNorm;
      const funnelR = 0.25 + 2.8 * (heightNorm * heightNorm);
      const ang = r2 * Math.PI * 2;
      px = Math.cos(ang) * funnelR;
      pz = Math.sin(ang) * funnelR;

      const spinSpd = 4.5 + 6.5 * (1.0 - heightNorm);
      vx = -Math.sin(ang) * spinSpd;
      vy = 4.0 + 5.0 * (1.0 - heightNorm * 0.5);
      vz = Math.cos(ang) * spinSpd;
    }

    // Position (xyz) and age (w)
    data[idx + 0] = px;
    data[idx + 1] = py;
    data[idx + 2] = pz;
    data[idx + 3] = age;

    // Velocity (xyz) and lifetime (w)
    data[idx + 4] = vx;
    data[idx + 5] = vy;
    data[idx + 6] = vz;
    data[idx + 7] = life;

    // PrevPos / aux (xyz) and phase (w = current sysId)
    data[idx + 8] = px;
    data[idx + 9] = py;
    data[idx + 10] = pz;
    data[idx + 11] = sys; // matches p.prev.w in WGSL to prevent immediate reset

    // Props: seed, energy, density, stateId
    data[idx + 12] = lcg();
    data[idx + 13] = 0.4;
    data[idx + 14] = 0.5;
    data[idx + 15] = 1.0;
  }

  return data;
}

export function generateWebGL2Particles(
  count: number,
  systemId: number,
  seed: number
): Float32Array {
  // Stride 12 floats: pos(4), vel(4), props(4)
  const data = new Float32Array(count * 12);
  let s = seed;
  const lcg = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const sys = Math.round(systemId);

  for (let i = 0; i < count; i++) {
    const idx = i * 12;
    const r1 = lcg();
    const r2 = lcg();
    const r3 = lcg();

    let px = 0;
    let py = 0;
    let pz = 0;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    const life = 3.5 + 4.5 * lcg();
    const age = lcg() * life * 0.8;

    if (sys === 0) {
      // Quantum
      const theta = r1 * Math.PI * 2;
      const phi = Math.acos(2 * r2 - 1);
      const orbitalR = 0.8 + 1.6 * r3;
      const shape = Math.abs(Math.cos(phi) * Math.sin(theta * 2.0)) * 0.8 + 0.4;
      const r = orbitalR * shape;
      px = r * Math.sin(phi) * Math.cos(theta);
      py = r * Math.sin(phi) * Math.sin(theta);
      pz = r * Math.cos(phi);
      vx = (lcg() - 0.5) * 0.1;
      vy = (lcg() - 0.5) * 0.1;
      vz = (lcg() - 0.5) * 0.1;
    } else if (sys === 1) {
      // Kerr Disk
      if (r1 < 0.82) {
        const diskR = 0.45 + 2.8 * (r2 * r2);
        const ang = r3 * Math.PI * 2;
        px = Math.cos(ang) * diskR;
        py = (lcg() - 0.5) * 0.05;
        pz = Math.sin(ang) * diskR;
        const orbSpd = 3.6 / Math.sqrt(diskR);
        vx = -Math.sin(ang) * orbSpd;
        vy = (lcg() - 0.5) * 0.05;
        vz = Math.cos(ang) * orbSpd;
      } else {
        const jetSign = r2 > 0.5 ? 1.0 : -1.0;
        const jetY = (0.2 + 3.2 * r3) * jetSign;
        const jetR = 0.07 * (1.0 + Math.abs(jetY) * 0.25);
        const ang = r1 * Math.PI * 2;
        px = Math.cos(ang) * jetR;
        py = jetY;
        pz = Math.sin(ang) * jetR;
        vx = -Math.sin(ang) * 1.5;
        vy = jetSign * 18.0;
        vz = Math.cos(ang) * 1.5;
      }
    } else if (sys === 2) {
      // Neural Connectome
      const hubIdx = Math.floor(r1 * 8) % 8;
      const hx = Math.sin(hubIdx * 2.399) * 2.0;
      const hy = Math.cos(hubIdx * 1.571) * 1.4;
      const hz = Math.sin(hubIdx * 3.141) * 2.0;

      const targetHub = (hubIdx + 1 + Math.floor(r2 * 3)) % 8;
      const tx = Math.sin(targetHub * 2.399) * 2.0;
      const ty = Math.cos(targetHub * 1.571) * 1.4;
      const tz = Math.sin(targetHub * 3.141) * 2.0;

      const frac = r3;
      px = hx + (tx - hx) * frac + (lcg() - 0.5) * 0.06;
      py = hy + (ty - hy) * frac + (lcg() - 0.5) * 0.06;
      pz = hz + (tz - hz) * frac + (lcg() - 0.5) * 0.06;

      const d = Math.hypot(tx - hx, ty - hy, tz - hz) || 1.0;
      vx = ((tx - hx) / d) * 4.5;
      vy = ((ty - hy) / d) * 4.5;
      vz = ((tz - hz) / d) * 4.5;
    } else if (sys === 3) {
      // Supernova
      const theta = r1 * Math.PI * 2;
      const phi = Math.acos(2 * r2 - 1);
      const blastDirX = Math.sin(phi) * Math.cos(theta);
      const blastDirY = Math.sin(phi) * Math.sin(theta);
      const blastDirZ = Math.cos(phi);

      const r = 0.08 + 0.35 * r3;
      px = blastDirX * r;
      py = blastDirY * r;
      pz = blastDirZ * r;

      const speed = 7.0 + 8.0 * lcg();
      vx = blastDirX * speed;
      vy = blastDirY * speed;
      vz = blastDirZ * speed;
    } else if (sys === 4) {
      // System 4: 3D HYPERSPACE PATHWAY (Relativistic Wormhole Geodesic Conduit)
      const sPos = r1 * Math.PI * 2;
      const frame = getPathwayFrame(sPos);
      const isRing = r2 < 0.22;

      if (isRing) {
        const ringStation = Math.floor(r1 * 8) * (Math.PI / 4);
        const ringFrame = getPathwayFrame(ringStation);
        const tubeR = 0.44 + (lcg() - 0.5) * 0.05;
        const theta = r3 * Math.PI * 2;
        px = ringFrame.center[0] + tubeR * (Math.cos(theta) * ringFrame.normal[0] + Math.sin(theta) * ringFrame.binormal[0]);
        py = ringFrame.center[1] + tubeR * (Math.cos(theta) * ringFrame.normal[1] + Math.sin(theta) * ringFrame.binormal[1]);
        pz = ringFrame.center[2] + tubeR * (Math.cos(theta) * ringFrame.normal[2] + Math.sin(theta) * ringFrame.binormal[2]);
        const fwdSpeed = 1.4;
        const swirlSpeed = 7.5;
        vx = ringFrame.tangent[0] * fwdSpeed + (-Math.sin(theta) * ringFrame.normal[0] + Math.cos(theta) * ringFrame.binormal[0]) * swirlSpeed;
        vy = ringFrame.tangent[1] * fwdSpeed + (-Math.sin(theta) * ringFrame.normal[1] + Math.cos(theta) * ringFrame.binormal[1]) * swirlSpeed;
        vz = ringFrame.tangent[2] * fwdSpeed + (-Math.sin(theta) * ringFrame.normal[2] + Math.cos(theta) * ringFrame.binormal[2]) * swirlSpeed;
      } else {
        const tubeR = 0.08 + 0.32 * Math.sqrt(r2);
        const theta = r3 * Math.PI * 2;
        px = frame.center[0] + tubeR * (Math.cos(theta) * frame.normal[0] + Math.sin(theta) * frame.binormal[0]);
        py = frame.center[1] + tubeR * (Math.cos(theta) * frame.normal[1] + Math.sin(theta) * frame.binormal[1]);
        pz = frame.center[2] + tubeR * (Math.cos(theta) * frame.normal[2] + Math.sin(theta) * frame.binormal[2]);
        const fwdSpeed = 8.5 + 5.5 * lcg();
        const swirlSpeed = 3.0;
        vx = frame.tangent[0] * fwdSpeed + (-Math.sin(theta) * frame.normal[0] + Math.cos(theta) * frame.binormal[0]) * swirlSpeed;
        vy = frame.tangent[1] * fwdSpeed + (-Math.sin(theta) * frame.normal[1] + Math.cos(theta) * frame.binormal[1]) * swirlSpeed;
        vz = frame.tangent[2] * fwdSpeed + (-Math.sin(theta) * frame.normal[2] + Math.cos(theta) * frame.binormal[2]) * swirlSpeed;
      }
    } else {
      // Cyclone
      const heightNorm = r1;
      py = -2.5 + 5.0 * heightNorm;
      const funnelR = 0.25 + 2.8 * (heightNorm * heightNorm);
      const ang = r2 * Math.PI * 2;
      px = Math.cos(ang) * funnelR;
      pz = Math.sin(ang) * funnelR;

      const spinSpd = 4.5 + 6.5 * (1.0 - heightNorm);
      vx = -Math.sin(ang) * spinSpd;
      vy = 4.0 + 5.0 * (1.0 - heightNorm * 0.5);
      vz = Math.cos(ang) * spinSpd;
    }

    // Pos xyz, age
    data[idx + 0] = px;
    data[idx + 1] = py;
    data[idx + 2] = pz;
    data[idx + 3] = age;

    // Vel xyz, life
    data[idx + 4] = vx;
    data[idx + 5] = vy;
    data[idx + 6] = vz;
    data[idx + 7] = life;

    // Props: seed, energy, density, stateId
    data[idx + 8] = lcg();
    data[idx + 9] = 0.4;
    data[idx + 10] = 0.5;
    data[idx + 11] = sys;
  }

  return data;
}
