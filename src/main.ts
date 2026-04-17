import './style.css'

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
console.log(canvas)
const {device, context} = await init(canvas)
render(device, context)

async function init(canvas:HTMLCanvasElement){
  if(!navigator.gpu)
    throw new Error("GPU not found");

  const adapter = await navigator.gpu.requestAdapter()
  if(!adapter)
    throw new Error("Adapter not found")

  const device = await adapter.requestDevice()

  const context = canvas.getContext('webgpu') as GPUCanvasContext

  context.configure({device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode: 'premultiplied'})

  canvas.width = canvas.clientWidth * devicePixelRatio
  canvas.height = canvas.clientHeight * devicePixelRatio

  return{ device, context }
}

function render(device: GPUDevice, context:GPUCanvasContext){
  const encoder = device.createCommandEncoder()
  const pass = encoder.beginRenderPass({ colorAttachments: [{view: context.getCurrentTexture().createView(), clearValue: {r: 0.1, g: 0.2, b: 0.3, a: 1}, loadOp: 'clear', storeOp: 'store'}] })
  pass.end()
  device.queue.submit([encoder.finish()])
}