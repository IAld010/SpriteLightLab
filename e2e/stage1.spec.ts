import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

test('stage 1 imports the demo, groups clips and supports frame interaction', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.preview-placeholder')).toBeVisible()

  await page.locator('.button-ghost').first().click()
  await expect(page.locator('.action-item')).toHaveCount(2)
  await expect(page.locator('.frame-item')).toHaveCount(4)

  const secondFrame = page.locator('.frame-item').nth(1)
  await secondFrame.click()
  await expect(secondFrame).toHaveClass(/is-active/)

  await page.locator('.toolbar-settings .segmented button').nth(1).click()
  await expect(page.locator('.canvas-corner-label')).toContainText('%')
  await page.locator('.toolbar-settings .segmented button').nth(0).click()

  await page.locator('.action-item').nth(1).click()
  await expect(page.locator('.frame-item')).toHaveCount(6)

  await page.locator('.inspector-tabs-four button').nth(2).click()
  await page.locator('.inspector-content .field select').first().selectOption({ index: 1 })
  await expect(page.locator('.notice')).toBeVisible()

  const outputDirectory =
    process.env.STAGE1_OUTPUT_DIR ?? path.join(process.cwd(), 'test-results')
  await mkdir(outputDirectory, { recursive: true })
  await page.screenshot({
    path: path.join(outputDirectory, 'sprite-light-lab-final.png'),
    fullPage: true,
  })
})

test('WebGPU backend initializes when the environment exposes it', async ({ page }) => {
  const rendererMessages: string[] = []
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      rendererMessages.push(message.text())
    }
  })
  await page.goto('/')
  const supported = await page.evaluate(() => Boolean((navigator as Navigator & { gpu?: unknown }).gpu))
  test.skip(!supported, 'Current Edge environment does not expose WebGPU.')

  await page.locator('.button-ghost').first().click()
  await page.locator('.toolbar-settings select').selectOption('webgpu')
  await expect(page.locator('.renderer-error')).toHaveCount(0)
  const before = await page.locator('canvas').screenshot()
  await page.locator('.swatch-row input[type="color"]').first().fill('#ff00aa')
  await page.waitForTimeout(250)
  const after = await page.locator('canvas').screenshot()
  expect(Buffer.compare(before, after)).not.toBe(0)
  const outputDirectory = process.env.STAGE1_OUTPUT_DIR ?? path.join(process.cwd(), 'test-results')
  await mkdir(outputDirectory, { recursive: true })
  await page.screenshot({ path: path.join(outputDirectory, 'sprite-light-lab-webgpu.png'), fullPage: true })
  await page.locator('.inspector-tabs-four button').nth(3).click()
  await expect(page.locator('.project-panel .key-value-list strong').filter({ hasText: 'WebGPU' })).toBeVisible()
  expect(rendererMessages.filter((message) => /WGSL|shader|WebGPU error|Validation Error/i.test(message))).toEqual([])
})

test('palette, lighting and ZIP project pack work together', async ({ page }) => {
  await page.goto('/')
  await page.locator('.button-ghost').first().click()
  await expect(page.locator('.swatch-row')).toHaveCount(12)

  const before = await page.locator('canvas').screenshot()
  await page.locator('.swatch-row input[type="color"]').first().fill('#00ffff')
  await page.waitForTimeout(300)
  const after = await page.locator('canvas').screenshot()
  expect(Buffer.compare(before, after)).not.toBe(0)

  await page.locator('.inspector-tabs-four button').nth(1).click()
  await page.locator('.lighting-panel input[type="range"]').first().fill('1.35')
  await expect(page.locator('.renderer-error')).toHaveCount(0)

  await page.locator('.inspector-tabs-four button').nth(3).click()
  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.project-panel .export-stack button').nth(0).click(),
  ])
  const pngBytes = await readFile((await pngDownload.path())!)
  expect(pngBytes.length).toBeGreaterThan(100)
  expect([...pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.project-panel .export-stack button').nth(4).click(),
  ])
  const zipPath = await download.path()
  expect(zipPath).toBeTruthy()
  await page.locator('.project-panel input[type="file"]').setInputFiles(zipPath!)
  await page.locator('.inspector-tabs-four button').nth(0).click()
  await expect(page.locator('.swatch-row')).toHaveCount(12)
  await expect(page.locator('.swatch-row input[type="color"]').first()).toHaveValue('#00ffff')
  await expect(page.locator('.renderer-error')).toHaveCount(0)
  const outputDirectory = process.env.STAGE1_OUTPUT_DIR ?? path.join(process.cwd(), 'test-results')
  await mkdir(outputDirectory, { recursive: true })
  await page.screenshot({ path: path.join(outputDirectory, 'sprite-light-lab-palette-light.png'), fullPage: true })
})

test('PWA starts offline after the first successful visit', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('.brand-block strong')).toHaveText('Sprite Light Lab')
  await context.setOffline(false)
})
test('full color mode exposes color rules and global adjustments', async ({ page }) => {
  await page.goto('/')
  await page.locator('.button-ghost').nth(1).click()
  await expect(page.locator('.mode-fullcolor')).toBeVisible()
  await expect(page.locator('.color-rule')).toHaveCount(0)
  await page.locator('.palette-panel .section-title-row .mini-button').first().click()
  await expect(page.locator('.color-rule')).toHaveCount(1)
  const before = await page.locator('canvas').screenshot()
  await page.locator('.color-rule input[type="color"]').nth(1).fill('#00ff99')
  await page.locator('.color-rule input[type="range"]').fill('0.3')
  await page.waitForTimeout(250)
  const after = await page.locator('canvas').screenshot()
  expect(Buffer.compare(before, after)).not.toBe(0)
  await expect(page.locator('.renderer-error')).toHaveCount(0)
  const outputDirectory = process.env.STAGE1_OUTPUT_DIR ?? path.join(process.cwd(), 'test-results')
  await mkdir(outputDirectory, { recursive: true })
  await page.screenshot({ path: path.join(outputDirectory, 'sprite-light-lab-fullcolor.png'), fullPage: true })
})

test('bundled Defold diffuse/normal sample imports as one 16-frame walk clip', async ({ page }) => {
  await page.goto('/')
  await page.locator('.button-ghost').nth(2).click()
  await expect(page.locator('.action-item')).toHaveCount(1)
  await expect(page.locator('.action-item')).toContainText('bopz_walk')
  await expect(page.locator('.frame-item')).toHaveCount(16)
  await expect(page.locator('.pair-dot.pair-missing, .pair-dot.pair-mismatch')).toHaveCount(0)
  await expect(page.locator('.renderer-error')).toHaveCount(0)
})

async function importAlignmentFixture(page: Page, colorFile: string, normalFile: string) {
  const fixtureRoot = path.join(process.cwd(), 'e2e', 'fixtures', 'alignment')
  await page.locator('.toolbar input[type="file"]').nth(1).setInputFiles([
    path.join(fixtureRoot, colorFile),
    path.join(fixtureRoot, normalFile),
  ])
  await expect(page.locator('.frame-item')).toHaveCount(1)
}

async function configureDirectionalLight(page: Page, direction: number) {
  await page.locator('.inspector-tabs-four button').nth(1).click()
  await page.locator('.lighting-panel .color-setting-row input[type="range"]').first().fill('0')
  const toggles = page.locator('.light-list input[type="checkbox"]')
  if ((await toggles.count()) > 1) {
    await toggles.nth(1).uncheck()
  }
  await page.locator('.light-main').first().click()
  await page.locator('.light-editor .color-setting-row input[type="range"]').first().fill('1.5')
  await page.locator('.light-editor .range-field input[type="range"]').last().fill(String(direction))
  await page.waitForTimeout(150)
}

async function measureLightBoundary(page: Page) {
  return page.locator('.preview-canvas-host canvas').evaluate(async (canvas) => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const output = document.createElement('canvas')
    output.width = canvas.width
    output.height = canvas.height
    const context = output.getContext('2d')!
    context.drawImage(canvas, 0, 0)
    const pixels = context.getImageData(0, 0, output.width, output.height).data
    const columns: number[] = []
    const rows: number[] = []
    let minX = output.width
    let maxX = -1
    let minY = output.height
    let maxY = -1

    for (let y = 0; y < output.height; y += 1) {
      let sum = 0
      let count = 0
      for (let x = 0; x < output.width; x += 1) {
        const index = (y * output.width + x) * 4
        if (pixels[index + 3] > 8) {
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
          sum += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]
          count += 1
        }
      }
      rows.push(count > 0 ? sum / count : -1)
    }

    for (let x = 0; x < output.width; x += 1) {
      let sum = 0
      let count = 0
      for (let y = 0; y < output.height; y += 1) {
        const index = (y * output.width + x) * 4
        if (pixels[index + 3] > 8) {
          sum += 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2]
          count += 1
        }
      }
      columns.push(count > 0 ? sum / count : -1)
    }

    let jumpX = -1
    let jumpY = -1
    let maxJumpX = 0
    let maxJumpY = 0
    for (let x = minX + 1; x <= maxX; x += 1) {
      if (columns[x] < 0 || columns[x - 1] < 0) continue
      const jump = Math.abs(columns[x] - columns[x - 1])
      if (jump > maxJumpX) {
        maxJumpX = jump
        jumpX = x
      }
    }
    for (let y = minY + 1; y <= maxY; y += 1) {
      if (rows[y] < 0 || rows[y - 1] < 0) continue
      const jump = Math.abs(rows[y] - rows[y - 1])
      if (jump > maxJumpY) {
        maxJumpY = jump
        jumpY = y
      }
    }

    return {
      boundaryX: (minX + maxX) / 2,
      boundaryY: (minY + maxY) / 2,
      jumpX,
      jumpY,
      maxJumpX,
      maxJumpY,
    }
  })
}

test('normal map sampling stays aligned with the sprite in both axes', async ({ page }) => {
  await page.goto('/')
  await importAlignmentFixture(page, 'horizontal.png', 'horizontal_n.png')
  await configureDirectionalLight(page, 0)
  const horizontal = await measureLightBoundary(page)
  expect(horizontal.maxJumpX).toBeGreaterThan(20)
  expect(Math.abs(horizontal.jumpX - horizontal.boundaryX)).toBeLessThanOrEqual(2.5)

  await importAlignmentFixture(page, 'vertical.png', 'vertical_n.png')
  await configureDirectionalLight(page, 90)
  const vertical = await measureLightBoundary(page)
  expect(vertical.maxJumpY).toBeGreaterThan(20)
  expect(Math.abs(vertical.jumpY - vertical.boundaryY)).toBeLessThanOrEqual(2.5)
})

async function measureVisibleBounds(page: Page) {
  return page.locator('.preview-canvas-host canvas').evaluate(async (canvas) => {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const output = document.createElement('canvas')
    output.width = canvas.width
    output.height = canvas.height
    const context = output.getContext('2d')!
    context.drawImage(canvas, 0, 0)
    const pixels = context.getImageData(0, 0, output.width, output.height).data
    let minX = output.width
    let maxX = -1
    let minY = output.height
    let maxY = -1
    for (let y = 0; y < output.height; y += 1) {
      for (let x = 0; x < output.width; x += 1) {
        if (pixels[(y * output.width + x) * 4 + 3] > 8) {
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
      }
    }
    return {
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      canvasCenterX: output.width / 2,
      canvasCenterY: output.height / 2,
    }
  })
}

test('zoomed viewport can pan and return to center', async ({ page }) => {
  await page.goto('/')
  await importAlignmentFixture(page, 'horizontal.png', 'horizontal_n.png')
  await page.locator('.zoom-control input[type="range"]').fill('1.2')
  const host = page.locator('.preview-canvas-host')
  const bounds = await host.boundingBox()
  if (!bounds) throw new Error('Preview host not found')
  const before = await measureVisibleBounds(page)
  await page.mouse.move(bounds.x + 80, bounds.y + bounds.height - 100)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 180, bounds.y + bounds.height - 40, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  const panned = await measureVisibleBounds(page)
  expect(Math.abs(panned.centerX - before.centerX) + Math.abs(panned.centerY - before.centerY)).toBeGreaterThan(20)
  await page.locator('.transport-button').nth(3).click()
  await page.waitForTimeout(150)
  const centered = await measureVisibleBounds(page)
  expect(Math.abs(centered.centerX - centered.canvasCenterX)).toBeLessThan(5)
  expect(Math.abs(centered.centerY - centered.canvasCenterY)).toBeLessThan(5)
})
