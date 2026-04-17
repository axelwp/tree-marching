import './style.css'
import shaderSource from './shaders/raymarch.wgsl?raw' 

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
console.log(canvas)
const {device, context, pipeline} = await init(canvas)
render(device, context, pipeline)

async function init(canvas:HTMLCanvasElement){
  if(!navigator.gpu)
    throw new Error("GPU not found");

  const adapter = await navigator.gpu.requestAdapter()
  if(!adapter)
    throw new Error("Adapter not found")

  const device = await adapter.requestDevice()

  const context = canvas.getContext('webgpu') as GPUCanvasContext

  const format = navigator.gpu.getPreferredCanvasFormat()

  context.configure({device, format: format, alphaMode: 'premultiplied'})

  canvas.width = canvas.clientWidth * devicePixelRatio
  canvas.height = canvas.clientHeight * devicePixelRatio

  const module = device.createShaderModule({code: shaderSource})
  const pipeline = device.createRenderPipeline({layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: 'fs', targets: [{ format }]}, primitive: {topology: 'triangle-list' } })

  return{ device, context, pipeline }
}

function render(device: GPUDevice, context:GPUCanvasContext, pipeline:GPURenderPipeline){
  const encoder = device.createCommandEncoder()
  const pass = encoder.beginRenderPass({ colorAttachments: [{view: context.getCurrentTexture().createView(), clearValue: {r: 0.1, g: 0.2, b: 0.3, a: 1}, loadOp: 'clear', storeOp: 'store'}] })

  pass.setPipeline(pipeline)
  pass.draw(3)

  pass.end()
  device.queue.submit([encoder.finish()])
}