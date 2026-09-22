import { expect, test, type Page } from '@playwright/test'

async function chooseDemo(page: Page, index = 0) {
  await page.getByTestId('demo-picker-trigger').click()
  await page.getByTestId('demo-menu').locator('.demo-option').nth(index).click()
}

test('project editor copies the source layer, hides it and restores a cel after reload', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page)
  const previewBefore = await page.locator('.preview-canvas-host canvas').screenshot()
  await page.getByTestId('open-project-editor').click()

  await expect(page.locator('.project-editor-root')).toBeVisible()
  await expect(page.locator('.drawing-display-canvas')).toBeVisible()
  await expect(page.locator('.refinement-layer-panel')).toContainText('源图层')
  await expect(page.locator('.refinement-layer-panel')).toContainText('只读')
  await expect(page.locator('.aseprite-titlebar')).toHaveCount(0)
  await expect(page.locator('.aseprite-menu-labels')).toHaveCount(0)
  await expect(page.locator('.editor-bottom-bar')).toContainText('保存')
  await expect(page.locator('.editor-bottom-bar')).toContainText('返回预览')
  await expect(page.locator('.compact-frame-cell')).not.toHaveCount(0)

  await page.getByTestId('copy-source-layer').click()
  await expect(page.locator('.refinement-layer-row:not(.source-layer)')).toHaveCount(1)
  await page.getByTestId('toggle-source-layer').click()
  await expect(page.getByTestId('toggle-source-layer')).toHaveText('○')

  await page.locator('.color-editor-row input[type="color"]').fill('#ff00ff')
  const canvas = page.locator('.drawing-display-canvas')
  const drawingBefore = await canvas.screenshot()
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  const startX = bounds.x + bounds.width * 0.42
  const startY = bounds.y + bounds.height * 0.42
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 12, startY + 12, { steps: 4 })
  await page.mouse.up()
  await page.mouse.move(5, 5)
  const drawingAfter = await canvas.screenshot()
  expect(drawingAfter.equals(drawingBefore)).toBe(false)

  await expect(page.locator('.compact-frame-cell').first().locator('.compact-frame-head .is-refined')).toHaveText('●')
  await page.getByTestId('editor-save-button').click()
  await expect(page.locator('.save-state')).toHaveText('已保存', { timeout: 10_000 })
  await expect(page.locator('.notice')).toContainText('项目已保存。')
  const redPixelCount = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('sprite-light-lab', 4)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const assets = await new Promise<Array<{ blob: Blob }>>((resolve, reject) => {
      const request = db.transaction('refinementAssets').objectStore('refinementAssets').getAll()
      request.onsuccess = () => resolve(request.result as Array<{ blob: Blob }>)
      request.onerror = () => reject(request.error)
    })
    let count = 0
    for (const asset of assets) {
      const bitmap = await createImageBitmap(asset.blob)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')!
      context.drawImage(bitmap, 0, 0)
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] > 220 && data[index + 1] < 40 && data[index + 2] > 220 && data[index + 3] > 0) count += 1
      }
      bitmap.close()
    }
    db.close()
    return count
  })
  expect(redPixelCount).toBeGreaterThan(0)

  const secondFrame = page.locator('.compact-frame-cell').nth(1)
  await secondFrame.click()
  await expect(secondFrame).toHaveClass(/is-active/)
  await page.locator('.compact-frame-cell').first().click()
  await expect(page.locator('.compact-frame-cell').first().locator('.compact-frame-head .is-refined')).toHaveText('●')

  await page.getByRole('button', { name: '返回预览' }).click()
  await expect(page.locator('.preview-canvas-host')).toBeVisible()
  await page.waitForTimeout(500)
  const previewAfter = await page.locator('.preview-canvas-host canvas').screenshot()
  expect(previewAfter.equals(previewBefore)).toBe(false)
  const sourceOnly = page.getByTestId('source-only-preview')
  await expect(sourceOnly).toBeVisible()
  await sourceOnly.check()
  await page.waitForTimeout(300)
  const sourceOnlyPreview = await page.locator('.preview-canvas-host canvas').screenshot()
  expect(sourceOnlyPreview.equals(previewBefore)).toBe(true)
  await sourceOnly.uncheck()
  await page.waitForTimeout(300)
  await page.reload()
  await page.getByTestId('open-project-editor').click()
  await expect(page.locator('.compact-frame-cell').first().locator('.compact-frame-head .is-refined')).toHaveText('●')
  await expect(page.getByTestId('toggle-source-layer')).toHaveText('○')
})

test('project editor provides dense panels, pixel grid, zoom and playback controls', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page)
  await page.getByTestId('open-project-editor').click()

  await page.getByRole('button', { name: '新建' }).click()
  await expect(page.locator('.refinement-layer-row:not(.source-layer)')).toHaveCount(1)
  await page.locator('.refinement-layer-row:not(.source-layer)').first().locator('.icon-action').first().click()
  await expect(page.locator('.refinement-layer-row:not(.source-layer)').first().locator('.icon-action').first()).toHaveText('○')

  await page.getByRole('button', { name: '洋葱皮' }).click()
  await page.getByRole('button', { name: '像素网格' }).click()
  const grid = page.getByTestId('drawing-grid')
  await expect(grid).toBeVisible()
  await expect(grid).toHaveCSS('background-image', /linear-gradient/)
  const gridSize = await grid.evaluate((node) => {
    const style = getComputedStyle(node)
    return { width: node.clientWidth, height: node.clientHeight, backgroundSize: style.backgroundSize }
  })
  expect(gridSize.width).toBeGreaterThan(0)
  expect(gridSize.height).toBeGreaterThan(0)
  expect(gridSize.backgroundSize).toContain('px')

  const zoomSlider = page.getByTestId('drawing-zoom-slider')
  await zoomSlider.fill('16')
  await expect(page.getByTestId('drawing-zoom-value')).toHaveText('1600%')
  expect((await grid.evaluate((node) => node.clientWidth))).toBeGreaterThan(96)

  const activeBefore = await page.locator('.compact-frame-cell.is-active .compact-frame-head span').first().textContent()
  const play = page.getByTestId('editor-play-toggle')
  await expect(play).toHaveAttribute('aria-label', '播放')
  await play.click()
  await expect(play).toHaveAttribute('aria-label', '暂停')
  await page.waitForTimeout(350)
  await play.click()
  const activeAfter = await page.locator('.compact-frame-cell.is-active .compact-frame-head span').first().textContent()
  expect(activeAfter).not.toBe(activeBefore)
})

test('project editor switches language without returning to the preview toolbar', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page)
  await page.getByTestId('open-project-editor').click()

  await expect(page.getByRole('button', { name: '铅笔' })).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByRole('button', { name: 'Pencil' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Back to preview' })).toBeVisible()
  await expect(page.locator('.refinement-layer-panel')).toContainText('Source layer')

  await page.getByRole('button', { name: '中文' }).click()
  await expect(page.getByRole('button', { name: '铅笔' })).toBeVisible()
  await expect(page.locator('.refinement-layer-panel')).toContainText('源图层')
})

test('pencil eraser bucket and selection constrain pixels to the selected area', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page)
  await page.getByTestId('open-project-editor').click()
  await page.getByRole('button', { name: '新建' }).click()
  await page.locator('.color-editor-row input[type="color"]').fill('#ff00ff')

  const canvas = page.locator('.drawing-display-canvas')
  const before = await canvas.screenshot()
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('drawing canvas missing')

  await page.locator('[data-tool="select"]').click()
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.35)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.55, { steps: 5 })
  await page.mouse.up()
  const selectionActions = page.getByTestId('selection-actions')
  await expect(selectionActions).toBeVisible()
  const selectionText = await selectionActions.locator('span').textContent()
  const match = selectionText?.match(/(\d+),(\d+) · (\d+)×(\d+)/)
  if (!match) throw new Error('selection bounds missing')
  const selection = { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]) }

  await page.locator('[data-tool="pencil"]').click()
  await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.45)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.45, { steps: 8 })
  await page.mouse.up()
  await page.mouse.move(5, 5)
  const outsideMagenta = await canvas.evaluate((node, rect) => {
    const target = node as HTMLCanvasElement
    const context = target.getContext('2d')!
    const data = context.getImageData(0, 0, target.width, target.height).data
    let count = 0
    for (let y = 0; y < target.height; y += 1) {
      for (let x = 0; x < target.width; x += 1) {
        if (x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height) continue
        const offset = (y * target.width + x) * 4
        if (data[offset] > 220 && data[offset + 1] < 40 && data[offset + 2] > 220 && data[offset + 3] > 0) count += 1
      }
    }
    return count
  }, selection)
  expect(outsideMagenta).toBe(0)

  await page.getByRole('button', { name: '删除选区' }).click()
  const afterSelectionDelete = await canvas.screenshot()
  expect(afterSelectionDelete.equals(before)).toBe(true)

  const drawStroke = async () => {
    const x = bounds.x + bounds.width * 0.38
    const y = bounds.y + bounds.height * 0.38
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 14, y + 10, { steps: 5 })
    await page.mouse.up()
    await page.mouse.move(5, 5)
  }
  await page.locator('[data-tool="pencil"]').click()
  await drawStroke()
  await page.locator('[data-tool="eraser"]').click()
  await drawStroke()
  const afterEraser = await canvas.screenshot()
  expect(afterEraser.equals(before)).toBe(true)

  await page.locator('[data-tool="bucket"]').click()
  await page.mouse.click(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5)
  await page.mouse.move(5, 5)
  const afterBucket = await canvas.screenshot()
  expect(afterBucket.equals(before)).toBe(false)

  await page.getByRole('button', { name: '删除图层' }).click()
  await expect(page.locator('.refinement-layer-row:not(.source-layer)')).toHaveCount(0)
})
test('frame events are integrated into the left frame inspector and camera shake plays', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page)
  await page.getByRole('button', { name: '帧', exact: true }).click()
  const framePanel = page.locator('.inspector-panel')
  await expect(framePanel.locator('.frame-event-panel')).toBeVisible()

  await framePanel.getByRole('button', { name: '摄像机抖动' }).click()
  const inspector = framePanel.locator('.frame-event-panel-inspector')
  await expect(inspector).toBeVisible()
  await inspector.getByLabel('强度').fill('1')
  await inspector.getByLabel('持续时间').fill('1200')
  await expect(framePanel.locator('.frame-event-list-item')).toHaveCount(1)

  const play = page.getByRole('button', { name: '播放', exact: true })
  await play.click()
  await expect(page.locator('.preview-canvas-host')).toHaveAttribute('style', /transform:/)
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.locator('.preview-canvas-host')).not.toHaveAttribute('style', /transform:/)
  await page.waitForTimeout(900)
  await page.reload()
  await page.getByRole('button', { name: '帧', exact: true }).click()
  await expect(page.locator('.frame-event-list-item')).toHaveCount(1)
})

test('switching projects preserves refinement and frame event data', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page, 0)
  await page.getByTestId('open-project-editor').click()
  await page.getByTestId('copy-source-layer').click()
  await page.getByTestId('toggle-source-layer').click()
  await page.locator('.color-editor-row input[type="color"]').fill('#00ffff')

  const canvas = page.locator('.drawing-display-canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('drawing canvas missing')
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + bounds.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.5, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: '返回预览' }).click()

  await page.getByRole('button', { name: '帧', exact: true }).click()
  await page.getByRole('button', { name: '摄像机抖动' }).click()
  await expect(page.locator('.frame-event-list-item')).toHaveCount(1)

  await page.getByTestId('open-project-library').click()
  await chooseDemo(page, 1)
  await page.waitForTimeout(900)
  await page.getByTestId('open-project-library').click()
  const previousProject = page.locator('.project-card:not(.is-active)').first()
  await expect(previousProject).toBeVisible()
  await previousProject.getByRole('button', { name: '打开项目' }).click()

  await page.getByTestId('open-project-editor').click()
  await expect(page.locator('.compact-frame-cell').first().locator('.compact-frame-head .is-refined')).toHaveText('●')
  await expect(page.getByTestId('toggle-source-layer')).toHaveText('○')
  await page.getByRole('button', { name: '返回预览' }).click()
  await page.getByRole('button', { name: '帧', exact: true }).click()
  await expect(page.locator('.frame-event-list-item')).toHaveCount(1)
})