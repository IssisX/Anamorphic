export const WEBGL2_VS_CODE = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aVel;
layout(location = 2) in vec4 aProps;

uniform mat4 uViewProj;
uniform float uTime;
uniform float uSystemId;
uniform float uRenderScale;

out vec4 vColor;
out float vSys;
out float vEnergy;
out float vSeed;
out vec2 vDir; // Velocity aligned direction for stretching points

vec4 getSystemColor(float sysId, float energy, float speed, float seed) {
    vec3 c1 = vec3(0.0);
    vec3 c2 = vec3(0.0);
    
    if (sysId == 0.0) { 
        c1 = vec3(0.1, 0.8, 1.0); c2 = vec3(0.9, 0.1, 0.8);
    } else if (sysId == 1.0) { 
        c1 = vec3(1.0, 0.3, 0.05); c2 = vec3(1.0, 0.9, 0.7);
    } else if (sysId == 2.0) { 
        c1 = vec3(0.1, 1.0, 0.3); c2 = vec3(0.8, 1.0, 0.9);
    } else if (sysId == 3.0) { 
        c1 = vec3(1.0, 0.1, 0.1); c2 = vec3(1.0, 0.8, 0.1);
    } else if (sysId == 4.0) { 
        c1 = vec3(0.05, 0.72, 1.0); c2 = vec3(1.0, 0.22, 0.95);
    } else { 
        c1 = vec3(0.1, 0.4, 0.9); c2 = vec3(0.4, 0.9, 0.8);
    }
    
    float mixVal = clamp(energy + (speed * 0.05) + fract(seed*7.1)*0.3, 0.0, 1.0);
    return vec4(mix(c1, c2, mixVal) * (1.5 + energy), 1.0);
}

void main() {
    float age = aProps.x;
    float life = aProps.y;
    float energy = aProps.z;
    float seed = aProps.w;
    float speed = length(aVel);
    
    vec4 clipPos = uViewProj * vec4(aPos, 1.0);
    gl_Position = clipPos;
    
    // Calculate point size differently per system
    float widthVar = 0.6 + 0.6 * fract(seed * 29.3);
    float size = 0.0;
    float sys = floor(uSystemId + 0.5);

    if (sys == 0.0) { size = (30.0 + energy * 40.0) * widthVar; }
    else if (sys == 1.0) { size = (80.0 + speed * 15.0) * widthVar; }
    else if (sys == 2.0) { size = (15.0 + energy * 20.0) * widthVar; }
    else if (sys == 3.0) { size = (20.0 + energy * 30.0) * widthVar; }
    else if (sys == 4.0) { size = (35.0 + speed * 12.0) * widthVar; }
    else { size = (25.0 + energy * 35.0) * widthVar; }

    // Perspective point scaling
    gl_PointSize = max(2.0, (size * uRenderScale) / max(0.1, clipPos.w));
    
    // Screen-space velocity vector for streak alignment
    vec4 clipNext = uViewProj * vec4(aPos + aVel * 0.02, 1.0);
    vec2 dir = (clipNext.xy / max(clipNext.w, 0.01)) - (clipPos.xy / max(clipPos.w, 0.01));
    if (length(dir) > 0.0) { dir = normalize(dir); } else { dir = vec2(1.0, 0.0); }
    vDir = dir;
    
    float alpha = smoothstep(0.0, 0.2, age/life) * smoothstep(1.0, 0.8, age/life);
    float camDist = length(aPos);
    float depthFog = exp(-camDist * 0.065);
    vColor = getSystemColor(uSystemId, energy, speed, seed) * alpha * depthFog;
    
    vSys = uSystemId;
    vEnergy = energy;
    vSeed = seed;
}
`;

export const WEBGL2_FS_CODE = `#version 300 es
precision highp float;

in vec4 vColor;
in float vSys;
in float vEnergy;
in float vSeed;
in vec2 vDir;

out vec4 fragColor;

void main() {
    float sys = floor(vSys + 0.5);
    vec2 coord = gl_PointCoord - vec2(0.5);
    
    // Rotate coordinate system to align with velocity for directional effects
    mat2 rot = mat2(vDir.x, -vDir.y, vDir.y, vDir.x);
    vec2 alignCoord = rot * coord;

    float r2 = dot(coord, coord);
    float r = sqrt(r2);
    float profile = 0.0;

    // Radically distinct fallback render styles per system
    if (sys == 0.0) {
        // Quantum cloud
        profile = exp(-r2 * 6.0) * 0.6;
    } 
    else if (sys == 1.0) {
        // Kerr Plasma Needle (directional stretch)
        profile = exp(-abs(alignCoord.x) * 20.0) * max(1.0 - abs(alignCoord.y)*2.0, 0.0);
    } 
    else if (sys == 2.0) {
        // Neural Spark
        float core = exp(-r2 * 25.0);
        float spikeX = exp(-abs(coord.x) * 20.0) * max(1.0 - abs(coord.y)*2.0, 0.0);
        float spikeY = exp(-abs(coord.y) * 20.0) * max(1.0 - abs(coord.x)*2.0, 0.0);
        profile = core + (spikeX + spikeY) * 0.8;
    } 
    else if (sys == 3.0) {
        // Supernova Shrapnel
        float angle = atan(coord.y, coord.x);
        float radius = 0.3 + 0.2 * sin(angle * 4.0 + vSeed * 10.0);
        if (r < radius) profile = exp(-r2 * 2.0);
    } 
    else if (sys == 4.0) {
        // 3D Hyperspace Pathway: Hyper-drive velocity needle & ring flare
        float streak = exp(-abs(alignCoord.x) * 16.0) * max(1.0 - abs(alignCoord.y) * 2.0, 0.0);
        float core = exp(-r2 * 28.0) * 1.5;
        profile = max(streak, core);
    } 
    else {
        // Cyclone Dust
        float noise = fract(sin(dot(coord + vSeed, vec2(12.9898, 78.233))) * 43758.5453);
        profile = exp(-r2 * 5.0) * (0.3 + 0.7 * noise);
    }

    if (profile < 0.02) discard;

    fragColor = vColor * profile;
}
`;

export const WEBGL2_POST_VS_CODE = `#version 300 es
out vec2 vUv;
void main() {
    float x = float((gl_VertexID & 1) << 2);
    float y = float((gl_VertexID & 2) << 1);
    vUv = vec2(x * 0.5, y * 0.5);
    gl_Position = vec4(x - 1.0, y - 1.0, 0.0, 1.0);
}
`;

export const WEBGL2_POST_FS_CODE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSceneTex;
uniform vec2 uScreenSize;
uniform float uTime;
out vec4 fragColor;

void main() {
    vec3 color = texture(uSceneTex, vUv).rgb;
    
    // ACES Tone mapping (simplified)
    float a = 2.51; float b = 0.03; float c = 2.43; float d = 0.59; float e = 0.14;
    vec3 mapped = clamp((color*(a*color+b))/(color*(c*color+d)+e), 0.0, 1.0);
    
    // Subtle vignette
    float dist = distance(vUv, vec2(0.5));
    mapped *= smoothstep(1.0, 0.2, dist * 0.85);

    fragColor = vec4(mapped, 1.0);
}
`;
