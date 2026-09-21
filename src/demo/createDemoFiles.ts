const FRAME_SIZE = 96

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(`无法生成演示文件 ${name}`))
        return
      }
      resolve(new File([blob], name, { type: 'image/png', lastModified: 1 }))
    }, 'image/png')
  })
}

function drawFrame(canvas: HTMLCanvasElement, action: 'idle' | 'walk', frame: number): void {
  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  context.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE)
  context.imageSmoothingEnabled = false
  const bob = action === 'idle' ? [0, -1, 0, 1][frame % 4] : [0, -1, 0, -2][frame % 4]
  const stride = action === 'walk' ? [-3, -1, 3, 1][frame % 4] : 0
  const x = 48 + Math.round(stride / 2)
  const y = 48 + bob

  context.fillStyle = '#101523'
  context.fillRect(x - 17, y - 25, 34, 16)
  context.fillStyle = '#24314f'
  context.fillRect(x - 14, y - 28, 28, 17)
  context.fillStyle = '#6a7ca8'
  context.fillRect(x - 10, y - 30, 20, 12)
  context.fillStyle = '#e3b56f'
  context.fillRect(x - 12, y - 22, 24, 5)

  context.fillStyle = '#b8404f'
  context.fillRect(x - 17, y - 13, 34, 28)
  context.fillStyle = '#e35d5d'
  context.fillRect(x - 12, y - 11, 24, 23)
  context.fillStyle = '#f0c98b'
  context.fillRect(x - 5, y - 8, 10, 12)
  context.fillStyle = '#2d3755'
  context.fillRect(x - 15, y - 8, 4, 18)
  context.fillRect(x + 11, y - 8, 4, 18)

  context.fillStyle = '#202942'
  const leftFoot = action === 'walk' ? Math.round(stride) : 0
  const rightFoot = action === 'walk' ? -Math.round(stride) : 0
  context.fillRect(x - 15 + leftFoot, y + 15, 12, 8)
  context.fillRect(x + 3 + rightFoot, y + 15, 12, 8)

  context.fillStyle = '#8b5cf6'
  context.fillRect(x + 14, y - 18, 4, 31)
  context.fillStyle = '#e5e7eb'
  context.fillRect(x + 15, y - 26, 2, 10)

  if ((frame + (action === 'walk' ? 1 : 0)) % 2 === 0) {
    context.fillStyle = '#f8e7a3'
    context.fillRect(x + 7, y - 24, 3, 3)
  }
}

function drawNormalFrame(canvas: HTMLCanvasElement, action: 'idle' | 'walk', frame: number): void {
  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  context.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE)
  context.imageSmoothingEnabled = false
  const centerX = 47 + (action === 'walk' ? [0, -1, 1, 0][frame % 4] : 0)
  const centerY = 44
  const colors = ['#7f7fff', '#887cff', '#9279ff', '#9c76ff', '#a673ff', '#b070ff', '#ba6dff', '#c46aff']
  for (let index = colors.length - 1; index >= 0; index -= 1) {
    context.fillStyle = colors[index]
    const radius = 21 - index * 2
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2)
  }
  context.fillStyle = '#80ff80'
  context.fillRect(centerX - 8, centerY - 24, 16, 6)
  context.fillStyle = '#8080ff'
  context.fillRect(centerX - 20, centerY - 5, 5, 20)
  context.fillStyle = '#ff8080'
  context.fillRect(centerX + 15, centerY - 5, 5, 20)
}

async function makePair(action: 'idle' | 'walk', frame: number): Promise<File[]> {
  const colorCanvas = document.createElement('canvas')
  colorCanvas.width = FRAME_SIZE
  colorCanvas.height = FRAME_SIZE
  drawFrame(colorCanvas, action, frame)

  const normalCanvas = document.createElement('canvas')
  normalCanvas.width = FRAME_SIZE
  normalCanvas.height = FRAME_SIZE
  drawNormalFrame(normalCanvas, action, frame)

  const sequence = String(frame + 1).padStart(4, '0')
  return Promise.all([
    canvasToFile(colorCanvas, `${action}_${sequence}.png`),
    canvasToFile(normalCanvas, `${action}_${sequence}_n.png`),
  ])
}

export async function createDemoFiles(): Promise<File[]> {
  const groups = await Promise.all([
    ...Array.from({ length: 4 }, (_value, index) => makePair('idle', index)),
    ...Array.from({ length: 6 }, (_value, index) => makePair('walk', index)),
  ])
  return groups.flat()
}
function drawFullColorFrame(canvas: HTMLCanvasElement, frame: number): void {
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE)
  context.imageSmoothingEnabled = true
  const offset = [0, -1, 0, 1][frame % 4]
  const gradient = context.createRadialGradient(40, 34 + offset, 5, 48, 48 + offset, 38)
  gradient.addColorStop(0, '#fff2a8')
  gradient.addColorStop(0.28, '#ffb36b')
  gradient.addColorStop(0.62, '#d95c7a')
  gradient.addColorStop(1, '#453a8f')
  context.fillStyle = gradient
  context.beginPath()
  context.arc(48, 48 + offset, 31, 0, Math.PI * 2)
  context.fill()
  context.globalAlpha = 0.35
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.arc(36, 32 + offset, 9, 0, Math.PI * 2)
  context.fill()
  context.globalAlpha = 1
}

function drawFullColorNormal(canvas: HTMLCanvasElement, frame: number): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const offset = [0, -1, 0, 1][frame % 4]
  context.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE)
  const gradient = context.createRadialGradient(35, 32 + offset, 2, 48, 48 + offset, 34)
  gradient.addColorStop(0, 'rgb(255,170,210)')
  gradient.addColorStop(0.45, 'rgb(178,128,255)')
  gradient.addColorStop(1, 'rgb(75,75,255)')
  context.fillStyle = gradient
  context.beginPath()
  context.arc(48, 48 + offset, 31, 0, Math.PI * 2)
  context.fill()
}

export async function createFullColorDemoFiles(): Promise<File[]> {
  const files: File[] = []
  for (let frame = 0; frame < 4; frame += 1) {
    const colorCanvas = document.createElement('canvas')
    colorCanvas.width = FRAME_SIZE
    colorCanvas.height = FRAME_SIZE
    drawFullColorFrame(colorCanvas, frame)
    const normalCanvas = document.createElement('canvas')
    normalCanvas.width = FRAME_SIZE
    normalCanvas.height = FRAME_SIZE
    drawFullColorNormal(normalCanvas, frame)
    const sequence = String(frame + 1).padStart(4, '0')
    files.push(await canvasToFile(colorCanvas, `gradient_${sequence}.png`))
    files.push(await canvasToFile(normalCanvas, `gradient_${sequence}_n.png`))
  }
  return files
}
