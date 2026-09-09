import { IRenderEngine, SimulationState } from '../types.ts';
import { WGSL_POST_CODE, WGSL_RENDER_CODE, WGSL_SIM_CODE } from '../shaders/wgsl.ts';
import { generateWebGPUParticles } from './particleGenerators.ts';

export class WebGPUEngine implements IRenderEngine {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private presentationFormat: GPUTextureFormat;

  private simPipeline!: GPUComputePipeline;
  private renderPipeline!: GPURenderPipeline;
  private postPipeline!: GPURenderPipeline;

  private particleBuffers: GPUBuffer[] = [];
  private simUniformBuffer!: GPUBuffer;
  private renderUniformBuffer!: GPUBuffer;
  private postUniformBuffer!: GPUBuffer;

  private simBindGroups: GPUBindGroup[] = [];
  private renderBindGroups: GPUBindGroup[] = [];
  private postBindGroup!: GPUBindGroup;

  private hdrTexture: GPUTexture | null = null;
  private hdrTextureView: GPUTextureView | null = null;
  private linearSampler!: GPUSampler;

  private pingPongStep = 0;
  private lastState: SimulationState | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat
  ) {
    this.canvas = canvas;
    this.device = device;
    this.ctx = context;
    this.presentationFormat = format;
  }

  async initialize(state?: SimulationState): Promise<boolean> {
    if (state) {
      this.lastState = state;
    }
    const curState = state || this.lastState;
    if (!curState) return false;

    const device = this.device;

    // 1. Particle Storage Buffers
    const pCount = curState.particleCount;
    const particleByteSize = 64; // 16 floats * 4 bytes
    const totalBufferSize = pCount * particleByteSize;

    const initialData = generateWebGPUParticles(pCount, curState.eventPhase, curState.seed);

    // Free previous buffers if re-initializing (e.g. tier/seed change)
    for (const buf of this.particleBuffers) {
      buf.destroy();
    }
    this.particleBuffers = [];

    for (let i = 0; i < 2; i++) {
      this.particleBuffers[i] = device.createBuffer({
        size: totalBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
      });
      device.queue.writeBuffer(this.particleBuffers[i], 0, initialData);
    }

    // 2. Uniform Buffers
    if (!this.simUniformBuffer) {
      this.simUniformBuffer = device.createBuffer({
        size: 160,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    if (!this.renderUniformBuffer) {
      this.renderUniformBuffer = device.createBuffer({
        size: 160,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    if (!this.postUniformBuffer) {
      this.postUniformBuffer = device.createBuffer({
        size: 48,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
    }

    // 3. Compile Shaders
    const simModule = device.createShaderModule({ code: WGSL_SIM_CODE });
    const renderModule = device.createShaderModule({ code: WGSL_RENDER_CODE });
    const postModule = device.createShaderModule({ code: WGSL_POST_CODE });

    // 4. Compute Pipeline
    this.simPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: simModule, entryPoint: 'cs_main' },
    });

    // Compute Bind Groups (Ping-Pong 0 and 1)
    for (let i = 0; i < 2; i++) {
      this.simBindGroups[i] = device.createBindGroup({
        layout: this.simPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.simUniformBuffer } },
          { binding: 1, resource: { buffer: this.particleBuffers[i] } },
          { binding: 2, resource: { buffer: this.particleBuffers[1 - i] } },
        ],
      });
    }

    // 5. Render Pipeline (Splatting ribbons into RGBA16Float HDR target)
    this.renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: renderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: renderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: 'rgba16float',
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'none',
      },
    });

    // Render Bind Groups
    for (let i = 0; i < 2; i++) {
      this.renderBindGroups[i] = device.createBindGroup({
        layout: this.renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.renderUniformBuffer } },
          { binding: 1, resource: { buffer: this.particleBuffers[i] } },
        ],
      });
    }

    // 6. Linear Sampler & Post Pipeline
    if (!this.linearSampler) {
      this.linearSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
      });
    }

    this.postPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: postModule,
        entryPoint: 'vs_quad',
      },
      fragment: {
        module: postModule,
        entryPoint: 'fs_post',
        targets: [{ format: this.presentationFormat }],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.recreateHdrTarget();
    return true;
  }

  recreateHdrTarget(): void {
    if (this.hdrTexture) {
      this.hdrTexture.destroy();
    }
    const width = Math.max(1, this.canvas.width);
    const height = Math.max(1, this.canvas.height);

    this.hdrTexture = this.device.createTexture({
      size: [width, height],
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.hdrTextureView = this.hdrTexture.createView();

    this.postBindGroup = this.device.createBindGroup({
      layout: this.postPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.postUniformBuffer } },
        { binding: 1, resource: this.hdrTextureView },
        { binding: 2, resource: this.linearSampler },
      ],
    });
  }

  resize(): void {
    this.recreateHdrTarget();
  }

  reconfigureSystem(systemId: number, state: SimulationState): void {
    if (this.particleBuffers.length < 2) return;
    const data = generateWebGPUParticles(state.particleCount, systemId, state.seed);
    this.device.queue.writeBuffer(this.particleBuffers[0], 0, data);
    this.device.queue.writeBuffer(this.particleBuffers[1], 0, data);
  }

  render(
    camMatrix: Float32Array,
    camPos: [number, number, number],
    state: SimulationState
  ): void {
    if (this.canvas.width <= 0 || this.canvas.height <= 0) return;
    const device = this.device;
    const currentReadIdx = this.pingPongStep % 2;
    const currentWriteIdx = (this.pingPongStep + 1) % 2;

    try {
      // 1. Update Simulation Uniforms
      const simUni = new ArrayBuffer(160);
      const sf = new Float32Array(simUni);
      const su = new Uint32Array(simUni);

      sf[0] = state.time;
      sf[1] = state.dt;
      su[2] = state.particleCount;
      su[3] = state.seed;

      // cursor: ndcX, ndcY, force, active
      sf[4] = state.cursor.ndcX;
      sf[5] = state.cursor.ndcY;
      sf[6] = state.cursor.force;
      sf[7] = state.cursor.down ? 1.0 : 0.0;

      // audio: low, mid, high, pad
      sf[8] = state.audioRMS.low;
      sf[9] = state.audioRMS.mid;
      sf[10] = state.audioRMS.high;
      sf[11] = 0.0;

      // phaseParam: phaseId, tension, bloom, unused
      sf[12] = state.eventPhase;
      sf[13] = state.eventPhase === 3 ? 2.5 : 0.8;
      sf[14] = state.eventPhase === 3 ? 1.9 : 1.25;
      sf[15] = 0.0;

      // camPos
      sf[16] = camPos[0];
      sf[17] = camPos[1];
      sf[18] = camPos[2];
      sf[19] = 1.0;

      device.queue.writeBuffer(this.simUniformBuffer, 0, simUni);

      // 2. Update Render Uniforms with photometric energy conservation
      const densityRatio = state.particleCount / 16384;
      const renderScale = 1.0 / Math.pow(Math.max(1, densityRatio), 0.42);
      const exposureComp = 1.0 / Math.pow(Math.max(1, densityRatio), 0.32);

      const rendUni = new ArrayBuffer(160);
      const rf = new Float32Array(rendUni);
      rf.set(camMatrix, 0); // 0-15: viewProj
      rf[16] = camPos[0]; // 16-19: camPos
      rf[17] = camPos[1];
      rf[18] = camPos[2];
      rf[19] = 1.0;
      rf[20] = this.canvas.width; // 20-21: viewportSize
      rf[21] = this.canvas.height;
      rf[22] = state.time;
      rf[23] = (state.eventPhase === 3 ? 1.3 : 1.0) * exposureComp; // exposure
      rf[24] = state.eventPhase; // systemId for color
      rf[25] = renderScale; // renderScale

      device.queue.writeBuffer(this.renderUniformBuffer, 0, rendUni);

      // 3. Update Post Uniforms: Higher tiers get enhanced anamorphic stretch and spectral dispersion
      const isUltra = state.tier === 'ULTRA';
      const isHigh = state.tier === 'HIGH' || isUltra;
      const postUni = new Float32Array([
        this.canvas.width,
        this.canvas.height,
        state.time,
        state.eventPhase === 3 ? 1.6 : (isUltra ? 1.35 : 1.15), // bloom intensity
        1.0, // exposure
        isHigh ? 2.8 : 1.8, // horizontal anamorphic stretch
        isUltra ? 0.0055 : (isHigh ? 0.0035 : 0.0018), // chromatic dispersion
        0.85, // vignette
      ]);
      device.queue.writeBuffer(this.postUniformBuffer, 0, postUni);

      // Command Recording
      const commandEncoder = device.createCommandEncoder();

      // Pass A: Compute Simulation Step
      const computePass = commandEncoder.beginComputePass();
      computePass.setPipeline(this.simPipeline);
      computePass.setBindGroup(0, this.simBindGroups[currentReadIdx]);
      const workgroups = Math.ceil(state.particleCount / 256);
      computePass.dispatchWorkgroups(workgroups);
      computePass.end();

      if (!this.hdrTextureView) return;

      // Pass B: Accumulate Particle Splats into HDR Texture
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.hdrTextureView,
            clearValue: { r: 0.003, g: 0.003, b: 0.005, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      renderPass.setPipeline(this.renderPipeline);
      renderPass.setBindGroup(0, this.renderBindGroups[currentWriteIdx]);
      // 6 vertices per ribbon quad, instanced per particle
      renderPass.draw(6, state.particleCount, 0, 0);
      renderPass.end();

      // Presentation Swapchain target
      const currentTexture = this.ctx.getCurrentTexture();
      if (!currentTexture) return;
      const swapchainView = currentTexture.createView();

      // Pass C: Fullscreen Anamorphic Lens Post-Process to SwapChain
      const postPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: swapchainView,
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      postPass.setPipeline(this.postPipeline);
      postPass.setBindGroup(0, this.postBindGroup);
      postPass.draw(3, 1, 0, 0); // Fullscreen triangle
      postPass.end();

      device.queue.submit([commandEncoder.finish()]);
      this.pingPongStep++;
    } catch (frameErr) {
      // Gracefully catch any transient surface/frame hiccup during display changes
      console.warn('Frame render bypass:', frameErr);
    }
  }

  destroy(): void {
    for (const buf of this.particleBuffers) {
      buf.destroy();
    }
    this.particleBuffers = [];
    if (this.simUniformBuffer) this.simUniformBuffer.destroy();
    if (this.renderUniformBuffer) this.renderUniformBuffer.destroy();
    if (this.postUniformBuffer) this.postUniformBuffer.destroy();
    if (this.hdrTexture) this.hdrTexture.destroy();
  }
}
