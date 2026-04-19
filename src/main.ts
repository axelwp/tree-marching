import './style.css'
import shaderSource from './shaders/raymarch.wgsl?raw' 
import {type Branch, packBranches, generateTree} from './sdf/tree'

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
console.log(canvas)

let az = 0, el = 0, dist = 3
let dragging = false
canvas.addEventListener('mousedown', () => {dragging = true})
window.addEventListener('mouseup', () => {dragging = false})
window.addEventListener('mousemove', (e) => {
  if(!dragging) return
  az -= e.movementX * 0.005
  el += e.movementY * 0.005
  el = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, el))
})
canvas.addEventListener('wheel', (e) => {
  dist = Math.max(1, dist + e.deltaY * 0.01)
  e.preventDefault()
})
const {device, context, pipeline, uniformBuffer, bindGroup} = await init(canvas)

function frame(t: number) {
  device.queue.writeBuffer(uniformBuffer, 0, new Float32Array([t / 1000, 0, canvas.width, canvas.height, az, el, dist]))
  render(device, context, pipeline, uniformBuffer, bindGroup)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

async function init(canvas:HTMLCanvasElement){
  if(!navigator.gpu)
    throw new Error("GPU not found");

  const adapter = await navigator.gpu.requestAdapter()
  if(!adapter)
    throw new Error("Adapter not found")

  const device = await adapter.requestDevice()
  const uniformBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST})

  const branches = generateTree({depth:3, trunkLength: 2, trunkRadius: 0.25, lengthRatio: 0.45, radiusRatio: 0.55, tiltAngle: Math.PI / 4, childrenPerNode: 3, growthDuration: 1.5})
  const branchData = packBranches(branches)

  const storageBuffer = device.createBuffer({
    size: branchData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  })
  device.queue.writeBuffer(storageBuffer, 0, branchData.buffer as ArrayBuffer)
  

  const context = canvas.getContext('webgpu') as GPUCanvasContext

  const format = navigator.gpu.getPreferredCanvasFormat()

  context.configure({device, format: format, alphaMode: 'premultiplied'})

  canvas.width = canvas.clientWidth * devicePixelRatio
  canvas.height = canvas.clientHeight * devicePixelRatio

  const module = device.createShaderModule({code: shaderSource})
  const pipeline = device.createRenderPipeline({layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format }]}, primitive: {topology: 'triangle-list' } })

  const bindGroup = device.createBindGroup({layout: pipeline.getBindGroupLayout(0), 
    entries: [
      { binding: 0, resource: {buffer: uniformBuffer} },
      { binding: 1, resource: {buffer: storageBuffer} },
    ],
  })

  return{ device, context, pipeline, uniformBuffer, storageBuffer, bindGroup }
}

function render(device: GPUDevice, context:GPUCanvasContext, pipeline:GPURenderPipeline, uniformBuffer:GPUBuffer, bindGroup: GPUBindGroup){
  const encoder = device.createCommandEncoder()
  const pass = encoder.beginRenderPass({ colorAttachments: [{view: context.getCurrentTexture().createView(), clearValue: {r: 0.1, g: 0.2, b: 0.3, a: 1}, loadOp: 'clear', storeOp: 'store'}] })

  pass.setPipeline(pipeline)
  
  pass.setBindGroup(0, bindGroup)

  pass.draw(3)

  pass.end()
  device.queue.submit([encoder.finish()])
}

