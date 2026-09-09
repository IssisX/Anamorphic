export const WGSL_SIM_CODE = `
struct SimUniforms {
  time: f32,
  dt: f32,
  particleCount: u32,
  seed: u32,
  cursor: vec4<f32>,     // x: ndcX, y: ndcY, z: force, w: down (1.0 or 0.0)
  audio: vec4<f32>,      // x: low, y: mid, z: high, w: 0.0
  phaseParam: vec4<f32>, // x: systemId (0..5), y: tension, z: bloom, w: 0.0
  camPos: vec4<f32>,     // xyz: camPos, w: 1.0
};

struct Particle {
  pos: vec4<f32>,   // xyz: position, w: age
  vel: vec4<f32>,   // xyz: velocity, w: life
  prev: vec4<f32>,  // xyz: origin/aux, w: phase
  props: vec4<f32>, // x: seed, y: energy, z: density, w: stateId
};

@group(0) @binding(0) var<uniform> u: SimUniforms;
@group(0) @binding(1) var<storage, read> pIn: array<Particle>;
@group(0) @binding(2) var<storage, read_write> pOut: array<Particle>;

// Fast pseudo-random hash functions
fn hash11(p: f32) -> f32 {
    var p2 = fract(p * 0.1031);
    p2 *= p2 + 33.33;
    p2 *= p2 + p2;
    return fract(p2);
}

fn hash31(p: f32) -> vec3<f32> {
    var p3 = fract(vec3<f32>(p) * vec3<f32>(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
}

fn getPathwayPointWGSL(s: f32) -> vec3<f32> {
    let rMajor = 2.2 + 0.65 * cos(3.0 * s);
    return vec3<f32>(
        rMajor * cos(2.0 * s),
        1.35 * sin(3.0 * s),
        rMajor * sin(2.0 * s)
    );
}

fn getPathwayTangentWGSL(s: f32) -> vec3<f32> {
    let ds = 0.008;
    let p1 = getPathwayPointWGSL(s - ds);
    let p2 = getPathwayPointWGSL(s + ds);
    return normalize(p2 - p1);
}

@compute @workgroup_size(256)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= u.particleCount) { return; }

    var p = pIn[idx];
    var pos = p.pos.xyz;
    var age = p.pos.w + u.dt;
    var vel = p.vel.xyz;
    var life = p.vel.w;
    var aux = p.prev.xyz;
    let seed = p.props.x + f32(u.seed) * 0.001;

    let sys = round(u.phaseParam.x);
    let dt = clamp(u.dt, 0.001, 0.04);

    // Dynamic life expiration or system mismatch re-spawn
    let systemMismatch = abs(p.prev.w - sys) > 0.5;
    if (age > life || systemMismatch) {
        age = 0.0;
        life = 3.5 + 4.0 * hash11(f32(idx) * 1.37 + u.time);
        p.prev.w = sys;

        let r1 = hash11(f32(idx) * 7.13 + u.time * 0.1);
        let r2 = hash11(f32(idx) * 13.71 + u.time * 0.2);
        let r3 = hash11(f32(idx) * 29.33 + u.time * 0.3);

        if (sys == 0.0) {
            // Quantum Chrysalis: Lobes of atomic orbitals
            let theta = r1 * 6.28318;
            let phi = acos(2.0 * r2 - 1.0);
            let orbitalR = 0.8 + 1.6 * r3;
            // Modulate radius by spherical harmonic shape
            let shape = abs(cos(phi) * sin(theta * 2.0)) * 0.8 + 0.4;
            pos = vec3<f32>(
                sin(phi) * cos(theta),
                sin(phi) * sin(theta),
                cos(phi)
            ) * orbitalR * shape;
            vel = vec3<f32>(0.0);
        } else if (sys == 1.0) {
            // Kerr Accretion Disk: Flat disk + narrow polar jets
            if (r1 < 0.82) {
                // Disk
                let diskRadius = 0.45 + 2.8 * (r2 * r2);
                let angle = r3 * 6.28318;
                pos = vec3<f32>(cos(angle) * diskRadius, (hash11(r1 * 40.0) - 0.5) * 0.06, sin(angle) * diskRadius);
                let orbSpeed = 3.5 / sqrt(diskRadius);
                vel = vec3<f32>(-sin(angle), 0.0, cos(angle)) * orbSpeed;
            } else {
                // Collimated Polar Jets
                let jetSign = select(-1.0, 1.0, r2 > 0.5);
                let jetY = (0.2 + 3.0 * r3) * jetSign;
                let jetRadius = 0.08 * (1.0 + abs(jetY) * 0.3);
                let angle = r1 * 6.28318;
                pos = vec3<f32>(cos(angle) * jetRadius, jetY, sin(angle) * jetRadius);
                vel = vec3<f32>(0.0, jetSign * 18.0, 0.0);
            }
        } else if (sys == 2.0) {
            // Neural Connectome: Hub nodes and straight axon lines
            let hubIndex = u32(r1 * 8.0) % 8u;
            let fh = f32(hubIndex);
            let hubPos = vec3<f32>(
                sin(fh * 2.399) * 2.0,
                cos(fh * 1.571) * 1.4,
                sin(fh * 3.141) * 2.0
            );
            pos = hubPos + (hash31(f32(idx) * 3.1) - 0.5) * 0.2;
            let targetHubIdx = (hubIndex + 1u + u32(r2 * 3.0)) % 8u;
            let fth = f32(targetHubIdx);
            let nextHub = vec3<f32>(
                sin(fth * 2.399) * 2.0,
                cos(fth * 1.571) * 1.4,
                sin(fth * 3.141) * 2.0
            );
            vel = normalize(nextHub - hubPos) * 4.0;
        } else if (sys == 3.0) {
            // Supernova Blast: Ultra-dense blast core bursting outward
            let rn = hash31(f32(idx) * 9.1 + u.time) * 2.0 - 1.0;
            let dir = normalize(rn + vec3<f32>(0.001));
            pos = dir * (0.05 + 0.15 * r1);
            vel = dir * (6.0 + 8.0 * r2 + u.audio.x * 6.0);
        } else if (sys == 4.0) {
            // 3D Hyperspace Pathway: Re-spawn inside relativistic wormhole corridor or transit ring
            let sParam = r1 * 6.28318;
            let center = getPathwayPointWGSL(sParam);
            let tangent = getPathwayTangentWGSL(sParam);
            
            var guide = vec3<f32>(0.0, 1.0, 0.0);
            if (abs(tangent.y) > 0.9) { guide = vec3<f32>(0.0, 0.0, 1.0); }
            let normal = normalize(cross(tangent, guide));
            let binormal = cross(tangent, normal);

            let isRing = r2 < 0.22;
            if (isRing) {
                let ringStation = floor(r1 * 8.0) * (6.28318 / 8.0);
                let rCenter = getPathwayPointWGSL(ringStation);
                let rTangent = getPathwayTangentWGSL(ringStation);
                var rGuide = vec3<f32>(0.0, 1.0, 0.0);
                if (abs(rTangent.y) > 0.9) { rGuide = vec3<f32>(0.0, 0.0, 1.0); }
                let rNormal = normalize(cross(rTangent, rGuide));
                let rBinormal = cross(rTangent, rNormal);
                let ringRadius = 0.44;
                let theta = r3 * 6.28318;
                pos = rCenter + ringRadius * (cos(theta) * rNormal + sin(theta) * rBinormal);
                vel = rTangent * 1.5 + (-sin(theta) * rNormal + cos(theta) * rBinormal) * 7.5;
            } else {
                let tubeRadius = 0.08 + 0.32 * sqrt(r2);
                let theta = r3 * 6.28318;
                pos = center + tubeRadius * (cos(theta) * normal + sin(theta) * binormal);
                vel = tangent * (8.5 + 5.5 * r2) + (-sin(theta) * normal + cos(theta) * binormal) * 3.0;
            }
        } else {
            // Tornadic Cyclone: Vertical funnel vortex
            let heightNorm = r1; // 0 (ground) to 1 (anvil)
            let y = -2.5 + 5.0 * heightNorm;
            let funnelR = 0.25 + 2.8 * (heightNorm * heightNorm);
            let angle = r2 * 6.28318;
            pos = vec3<f32>(cos(angle) * funnelR, y, sin(angle) * funnelR);
            let tangential = vec3<f32>(-sin(angle), 0.0, cos(angle)) * (4.0 + 6.0 * (1.0 - heightNorm));
            vel = tangential + vec3<f32>(0.0, 4.0 + 5.0 * (1.0 - heightNorm * 0.5), 0.0);
        }
    }

    // -------------------------------------------------------------
    // RADICALLY ISOLATED PHYSICS & INTEGRATION PER SYSTEM
    // -------------------------------------------------------------
    var force = vec3<f32>(0.0);
    var drag = 0.98;

    if (sys == 0.0) {
        // Quantum Chrysalis: Standing-wave quantum phase gradient
        let r = max(length(pos), 0.01);
        let theta = atan2(length(pos.xz), pos.y);
        let phi = atan2(pos.z, pos.x);

        // Nodal surface equation of harmonic electron orbital
        let psi = sin(theta * 2.0) * cos(phi * 2.0) * sin(r * 4.5 - u.time * 2.5);
        let grad = vec3<f32>(
            cos(phi) * psi,
            sin(theta * 2.0) * cos(u.time * 1.5),
            sin(phi) * psi
        );
        // Direct phase field tracking
        vel = mix(vel, grad * 4.5 - pos * (r - 1.8) * 3.0, dt * 8.0);
        drag = 1.0;

        // Stochastic Quantum Tunneling (instant jump to opposing lobe)
        if (hash11(seed + u.time * 10.0) < 0.004) {
            pos = -pos + (hash31(seed * 2.0 + u.time) - 0.5) * 0.3;
            vel = -vel * 0.5;
        }
    } else if (sys == 1.0) {
        // Kerr Accretion Disk & Relativistic Polar Jets
        let rPlane = max(length(pos.xz), 0.01);
        if (abs(pos.y) > 0.25 && rPlane < 0.6) {
            // Relativistic Jet Stream
            let jetSign = sign(pos.y + 0.0001);
            let pinch = -pos.xz * 12.0;
            let spin = vec2<f32>(-pos.z, pos.x) * 10.0;
            force = vec3<f32>(pinch.x + spin.x, jetSign * 35.0, pinch.y + spin.y);
            drag = 0.96;
            if (abs(pos.y) > 4.2) {
                // Loop back to outer disk boundary
                let ang = hash11(seed + u.time) * 6.28318;
                pos = vec3<f32>(cos(ang) * 2.8, 0.0, sin(ang) * 2.8);
                vel = vec3<f32>(-sin(ang), 0.0, cos(ang)) * 2.0;
            }
        } else {
            // Accretion Disk Orbital Physics
            if (rPlane < 0.38) {
                // Event horizon capture -> launch into jet
                pos.y = sign(pos.y + 0.001) * 0.3;
                vel = vec3<f32>(0.0, sign(pos.y) * 20.0, 0.0);
            } else {
                let vKepler = 3.6 / sqrt(rPlane);
                let tangent = vec3<f32>(-pos.z, 0.0, pos.x) / rPlane;
                let inwardGravity = -vec3<f32>(pos.x, 0.0, pos.z) / (rPlane * rPlane + 0.05);
                let verticalPinch = -vec3<f32>(0.0, pos.y * 25.0, 0.0);
                force = tangent * vKepler * 2.4 + inwardGravity * 2.0 + verticalPinch;
                drag = 0.985;
            }
        }
    } else if (sys == 2.0) {
        // Neural Connectome: Grid-snapped Synaptic Axon Pulses
        var nearestHub = vec3<f32>(0.0);
        var minDist = 999.0;
        var nIdx = 0u;
        for (var h = 0u; h < 8u; h = h + 1u) {
            let fh = f32(h);
            let hPos = vec3<f32>(
                sin(fh * 2.399) * 2.0,
                cos(fh * 1.571) * 1.4,
                sin(fh * 3.141) * 2.0
            );
            let d = length(hPos - pos);
            if (d < minDist) { minDist = d; nearestHub = hPos; nIdx = h; }
        }

        if (minDist < 0.25) {
            // Reached synaptic hub -> fire to next connected hub with sharp orthogonal vector
            let nextH = (nIdx + 1u + u32(hash11(seed + u.time) * 3.0)) % 8u;
            let fth = f32(nextH);
            let nextPos = vec3<f32>(
                sin(fth * 2.399) * 2.0,
                cos(fth * 1.571) * 1.4,
                sin(fth * 3.141) * 2.0
            );
            var dir = normalize(nextPos - pos);
            // Snap to 3D cardinal grid axes
            if (abs(dir.x) >= abs(dir.y) && abs(dir.x) >= abs(dir.z)) {
                dir = vec3<f32>(sign(dir.x), 0.0, 0.0);
            } else if (abs(dir.y) >= abs(dir.x) && abs(dir.y) >= abs(dir.z)) {
                dir = vec3<f32>(0.0, sign(dir.y), 0.0);
            } else {
                dir = vec3<f32>(0.0, 0.0, sign(dir.z));
            }
            vel = dir * 5.5;
        }
        drag = 1.0;
    } else if (sys == 3.0) {
        // Supernova Blast: Sedov-Taylor Spherical Blast Wave
        let r = max(length(pos), 0.01);
        let blastDir = pos / r;
        // Shock front expands over life
        let shockR = 0.2 + (age / life) * 3.5;
        if (r < shockR) {
            // Inside blast wave: accelerating outward
            force = blastDir * (12.0 / (r + 0.2) + u.audio.x * 8.0);
            drag = 0.96;
        } else {
            // Impacting interstellar medium: intense deceleration and Rayleigh-Taylor turbulence
            let tangentCurl = cross(blastDir, vec3<f32>(0.0, 1.0, 0.0));
            force = -blastDir * 15.0 + tangentCurl * 8.0 * sin(r * 10.0 + u.time * 5.0);
            drag = 0.88;
        }
    } else if (sys == 4.0) {
        // 3D Hyperspace Pathway: Geodesic Guidance & Relativistic Magnetic Confinement
        var sApprox = atan2(pos.z, pos.x) * 0.5;
        if (sApprox < 0.0) { sApprox += 3.14159; }
        
        var bestS = sApprox;
        var minD2 = 999.0;
        for (var step = -2; step <= 2; step++) {
            let testS = sApprox + f32(step) * 0.15;
            let cPt = getPathwayPointWGSL(testS);
            let d2 = dot(pos - cPt, pos - cPt);
            if (d2 < minD2) {
                minD2 = d2;
                bestS = testS;
            }
        }

        let center = getPathwayPointWGSL(bestS);
        let tangent = getPathwayTangentWGSL(bestS);
        let toParticle = pos - center;
        let perpDist = toParticle - tangent * dot(toParticle, tangent);
        let rPerp = length(perpDist);
        let perpDir = select(vec3<f32>(0.0, 1.0, 0.0), perpDist / max(rPerp, 0.001), rPerp > 0.001);

        // Strong magnetic containment to tubular manifold
        let targetR = 0.28 + 0.12 * cos(bestS * 6.0);
        let radialConfinement = -perpDir * (rPerp - targetR) * 32.0;

        // Helical corkscrew magnetic swirl
        let swirl = cross(tangent, perpDir) * 6.5;

        // Relativistic forward acceleration along 3D pathway
        let fwdAccel = tangent * (15.0 + u.audio.x * 14.0);

        // Transit gate energy boost at periodic intervals along the pathway
        let gatePhase = fract(bestS * (8.0 / 6.28318));
        let gateBoost = select(vec3<f32>(0.0), tangent * 28.0, gatePhase < 0.08 || gatePhase > 0.92);

        force = radialConfinement + swirl + fwdAccel + gateBoost;
        drag = 0.985;
    } else {
        // Tornadic Cyclone: Convergent Inflow + Eyewall Updraft + Anvil Cloud Outflow
        let rPlane = max(length(pos.xz), 0.05);
        let tangent = vec3<f32>(-pos.z, 0.0, pos.x) / rPlane;
        let inward = -vec3<f32>(pos.x, 0.0, pos.z) / rPlane;

        // Eyewall updraft: strongest near center at mid/high elevations
        let eyewallUp = smoothstep(2.0, 0.2, rPlane) * (9.0 + u.audio.y * 6.0);
        let spinSpeed = (6.0 + 8.0 / (rPlane * 0.7 + 0.3));

        if (pos.y > 2.0) {
            // Anvil cloud top: centrifugal outflow
            let outward = vec3<f32>(pos.x, 0.0, pos.z) * 3.5;
            force = tangent * spinSpeed * 0.5 + outward - vec3<f32>(0.0, 3.0, 0.0);
            drag = 0.94;
        } else {
            // Cyclone funnel
            force = tangent * spinSpeed + inward * 4.0 + vec3<f32>(0.0, eyewallUp, 0.0);
            drag = 0.97;
        }
    }

    // Interactive Force Tractor Beam
    if (u.cursor.w > 0.5) {
        let mouseRayX = u.cursor.x * 4.0;
        let mouseRayY = -u.cursor.y * 4.0;
        let cPos = u.camPos.xyz;
        let toTarget = normalize(vec3<f32>(mouseRayX, mouseRayY, 0.0) - cPos);
        let tHit = max(-cPos.z / (toTarget.z + 0.001), 2.0);
        let mWorld = cPos + toTarget * tHit;

        let toMouse = mWorld - pos;
        let distM = length(toMouse);
        if (distM < 4.0) {
            let mPull = normalize(toMouse + 0.001) * u.cursor.z * (4.0 - distM) * 7.5;
            vel += mPull * dt;
        }
    }

    // Audio Bass Reactivity
    if (u.audio.x > 0.08) {
        let r = max(length(pos), 0.1);
        vel += (pos / r) * u.audio.x * sin(r * 8.0 - u.time * 6.0) * 1.5;
    }

    // Integration
    vel = (vel + force * dt) * drag;
    pos += vel * dt;

    // Safety boundary reflection
    let bound = 8.0;
    if (abs(pos.x) > bound) { pos.x = -sign(pos.x) * (bound - 0.1); }
    if (abs(pos.y) > bound) { pos.y = -sign(pos.y) * (bound - 0.1); }
    if (abs(pos.z) > bound) { pos.z = -sign(pos.z) * (bound - 0.1); }

    let energy = clamp(length(vel) * 0.15 + u.audio.x * 0.4, 0.0, 1.0);

    // Store updated particle state
    p.pos = vec4<f32>(pos, age);
    p.vel = vec4<f32>(vel, life);
    p.props.y = energy;
    pOut[idx] = p;
}
`;

export const WGSL_RENDER_CODE = `
struct RenderUniforms {
  viewProj: mat4x4<f32>,
  camPos: vec4<f32>,
  viewportSize: vec2<f32>,
  time: f32,
  exposure: f32,
  systemId: f32,
  renderScale: f32,
};

struct Particle {
  pos: vec4<f32>,
  vel: vec4<f32>,
  prev: vec4<f32>,
  props: vec4<f32>,
};

@group(0) @binding(0) var<uniform> ru: RenderUniforms;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct VertexOutput {
  @builtin(position) clipPos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) systemId: f32,
  @location(3) energy: f32,
  @location(4) seed: f32,
};

const quadVerts = array<vec2<f32>, 6>(
  vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
  vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
);

fn getSystemPalette(sysId: f32, energy: f32, speed: f32, seed: f32) -> vec4<f32> {
    var cBase = vec3<f32>(0.0);
    var cPeak = vec3<f32>(0.0);

    if (sysId == 0.0) {
        // Quantum Chrysalis: Deep cyan into resonant ultraviolet magenta
        cBase = vec3<f32>(0.05, 0.85, 1.0);
        cPeak = vec3<f32>(0.95, 0.15, 0.9);
    } else if (sysId == 1.0) {
        // Kerr Accretion: Blinding relativistic orange into incandescent white
        cBase = vec3<f32>(1.0, 0.35, 0.05);
        cPeak = vec3<f32>(1.0, 0.95, 0.85);
    } else if (sysId == 2.0) {
        // Neural Connectome: Laser synaptic green into bio-luminescent gold
        cBase = vec3<f32>(0.1, 1.0, 0.35);
        cPeak = vec3<f32>(0.9, 1.0, 0.85);
    } else if (sysId == 3.0) {
        // Supernova: Incandescent core yellow into blistering crimson
        cBase = vec3<f32>(1.0, 0.1, 0.05);
        cPeak = vec3<f32>(1.0, 0.85, 0.15);
    } else if (sysId == 4.0) {
        // 3D Hyperspace Pathway: Hyper-luminescent electric cyan/cobalt conduit into incandescent magenta transit rings
        cBase = vec3<f32>(0.05, 0.72, 1.0);
        cPeak = vec3<f32>(1.0, 0.22, 0.95);
    } else {
        // Cyclone: Polar arctic teal into storm gray-white
        cBase = vec3<f32>(0.15, 0.55, 0.95);
        cPeak = vec3<f32>(0.65, 0.95, 0.9);
    }

    let mixFactor = clamp(energy * 0.8 + speed * 0.04 + fract(seed * 7.17) * 0.2, 0.0, 1.0);
    let col = mix(cBase, cPeak, mixFactor);
    return vec4<f32>(col * (1.6 + energy * 1.5), 1.0);
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VertexOutput {
    let p = particles[ii];
    let pos = p.pos.xyz;
    let age = p.pos.w;
    let vel = p.vel.xyz;
    let life = p.vel.w;
    let energy = p.props.y;
    let seed = p.props.x;

    let speed = length(vel);
    let corner = quadVerts[vi];

    let toCam = normalize(ru.camPos.xyz - pos);
    let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), toCam));
    let up = cross(toCam, right);

    var worldPos = vec3<f32>(0.0);
    var uvOut = corner;

    let sys = round(ru.systemId);
    let sizeNoise = 0.7 + 0.6 * fract(seed * 31.7);

    // RADICALLY DISTINCT GEOMETRIC MESH PRIMITIVES PER SYSTEM
    if (sys == 0.0) {
        // Quantum: Volumetric soft spherical probability lobes
        let radius = (0.07 + energy * 0.09) * sizeNoise * ru.renderScale;
        worldPos = pos + right * corner.x * radius + up * corner.y * radius;
    } else if (sys == 1.0) {
        // Kerr: Razor-thin relativistic plasma needles stretched along velocity vector
        let forward = select(vec3<f32>(0.0, 1.0, 0.0), vel / speed, speed > 0.001);
        let side = normalize(cross(forward, toCam));
        let stretch = clamp(speed * 0.07, 0.03, 1.4) * ru.renderScale;
        let t = corner.y * 0.5 + 0.5;
        let pLine = mix(pos - forward * stretch, pos + forward * (stretch * 0.2), t);
        let thickness = 0.0035 * sizeNoise * ru.renderScale;
        worldPos = pLine + side * corner.x * thickness;
    } else if (sys == 2.0) {
        // Neural: Sharp 4-pointed diamond spark nodes
        let radius = (0.028 + energy * 0.04) * sizeNoise * ru.renderScale;
        worldPos = pos + right * corner.x * radius + up * corner.y * radius;
    } else if (sys == 3.0) {
        // Supernova: Chaotic fractured shrapnel geometry
        let radius = (0.045 + energy * 0.07) * sizeNoise * ru.renderScale;
        let rx = fract(seed * 17.3) * 0.8 - 0.4;
        let ry = fract(seed * 23.7) * 0.8 - 0.4;
        let distort = corner + vec2<f32>(rx, ry) * (corner.x * corner.y);
        worldPos = pos + right * distort.x * radius + up * distort.y * radius;
        uvOut = distort;
    } else if (sys == 4.0) {
        // 3D Hyperspace Pathway: Relativistic streaks and transit ring flares
        let forward = select(vec3<f32>(0.0, 0.0, 1.0), vel / speed, speed > 0.001);
        let side = normalize(cross(forward, toCam));
        let stretch = clamp(speed * 0.065, 0.03, 0.45) * ru.renderScale;
        let t = corner.y * 0.5 + 0.5;
        let pLine = mix(pos - forward * stretch, pos + forward * (stretch * 0.2), t);
        let thickness = 0.0045 * sizeNoise * ru.renderScale;
        worldPos = pLine + side * corner.x * thickness;
    } else {
        // Cyclone: Swirling asymmetric particulate dust chunks
        let rot = seed * 6.28 + ru.time * 5.0 * sign(fract(seed * 1.7) - 0.5);
        let s = sin(rot); let c = cos(rot);
        let rCorner = vec2<f32>(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
        let radius = (0.065 + energy * 0.08) * sizeNoise * ru.renderScale;
        worldPos = pos + right * rCorner.x * radius + up * rCorner.y * radius;
        uvOut = rCorner;
    }

    var out: VertexOutput;
    out.clipPos = ru.viewProj * vec4<f32>(worldPos, 1.0);
    out.uv = uvOut;

    let lifeFade = smoothstep(0.0, 0.15, age / life) * smoothstep(1.0, 0.85, age / life);
    let camDist = length(ru.camPos.xyz - pos);
    let depthFog = exp(-camDist * 0.065);
    out.color = getSystemPalette(ru.systemId, energy, speed, seed) * lifeFade * ru.exposure * depthFog;
    out.systemId = ru.systemId;
    out.energy = energy;
    out.seed = seed;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let sys = round(in.systemId);
    let uDist = in.uv.x;
    let vDist = in.uv.y;
    let r2 = uDist * uDist + vDist * vDist;
    let r = sqrt(r2);

    var profile = 0.0;

    if (sys == 0.0) {
        // Quantum: Volumetric Gaussian cloud
        profile = exp(-r2 * 5.5) * 0.65;
    } else if (sys == 1.0) {
        // Kerr: Razor relativistic needle
        let crossP = exp(-abs(uDist) * 18.0);
        let longP = clamp(1.0 - vDist * vDist, 0.0, 1.0);
        profile = crossP * longP;
    } else if (sys == 2.0) {
        // Neural: Four-pointed diamond spark with cross flare
        let core = exp(-r2 * 28.0);
        let flareX = exp(-abs(uDist) * 22.0) * clamp(1.0 - abs(vDist), 0.0, 1.0);
        let flareY = exp(-abs(vDist) * 22.0) * clamp(1.0 - abs(uDist), 0.0, 1.0);
        profile = core + (flareX + flareY) * 0.75;
    } else if (sys == 3.0) {
        // Supernova: Jagged polygonal shrapnel
        let angle = atan2(vDist, uDist);
        let boundary = 0.5 + 0.3 * sin(angle * 5.0 + in.seed * 11.0);
        profile = select(0.0, 1.0, r < boundary) * exp(-r2 * 2.2);
    } else if (sys == 4.0) {
        // 3D Hyperspace Pathway: Hyper-drive velocity needle & ring flare
        let streak = exp(-abs(uDist) * 16.0) * clamp(1.0 - vDist * vDist, 0.0, 1.0);
        let core = exp(-r2 * 28.0) * 1.4;
        profile = max(streak, core);
    } else {
        // Cyclone: Granular turbulent dust noise
        let noise = fract(sin(dot(in.uv + in.seed, vec2<f32>(12.9898, 78.233))) * 43758.5453);
        profile = exp(-r2 * 4.5) * (0.25 + 0.75 * noise);
    }

    if (profile < 0.015) {
        discard;
    }

    return in.color * profile;
}
`;

export const WGSL_POST_CODE = `
struct PostUniforms {
  screenSize: vec2<f32>,
  time: f32,
  bloomIntensity: f32,
  exposure: f32,
  anamorphicStretch: f32,
  chromaticDispersion: f32,
  vignette: f32,
};

@group(0) @binding(0) var<uniform> pu: PostUniforms;
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@vertex
fn vs_quad(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
    let uv = vec2<f32>(f32((vi << 1u) & 2u), f32(vi & 2u));
    return vec4<f32>(uv * 2.0 - 1.0, 0.0, 1.0);
}

@fragment
fn fs_post(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = pos.xy / pu.screenSize;
    let distFromCenter = distance(uv, vec2<f32>(0.5, 0.5));

    // Base sample
    let baseColor = textureSampleLevel(sceneTex, samp, uv, 0.0).rgb;

    // Horizontal anamorphic bloom streak
    var streak = vec3<f32>(0.0);
    for (var i = -4; i <= 4; i++) {
        let offset = f32(i) * 0.012 * pu.anamorphicStretch;
        let weight = 1.0 - abs(f32(i)) / 5.0;
        streak += textureSampleLevel(sceneTex, samp, vec2<f32>(uv.x + offset, uv.y), 0.0).rgb * weight;
    }
    streak /= 5.0;

    // Chromatic dispersion
    let shift = normalize(uv - 0.5) * pu.chromaticDispersion * distFromCenter;
    let r = textureSampleLevel(sceneTex, samp, uv + shift, 0.0).r;
    let g = textureSampleLevel(sceneTex, samp, uv, 0.0).g;
    let b = textureSampleLevel(sceneTex, samp, uv - shift, 0.0).b;
    let dispersed = vec3<f32>(r, g, b);

    var finalColor = mix(dispersed, streak + dispersed, pu.bloomIntensity);

    // Subtle film grain
    let grain = fract(sin(dot(uv + pu.time, vec2<f32>(12.9898, 78.233))) * 43758.5453);
    finalColor += (grain - 0.5) * 0.03;

    // Vignette
    let vig = smoothstep(1.15, 0.25, distFromCenter * pu.vignette);
    finalColor *= vig;

    // ACES Film Tone Mapping
    let a = 2.51;
    let b_c = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    let ex = finalColor * pu.exposure;
    let mapped = clamp((ex * (a * ex + b_c)) / (ex * (c * ex + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));

    return vec4<f32>(mapped, 1.0);
}
`;
