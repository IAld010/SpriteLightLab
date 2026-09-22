import { expect, test, type Page } from '@playwright/test'

async function chooseDemo(page: Page) {
  await page.getByTestId('demo-picker-trigger').click()
  await page.getByTestId('demo-menu').locator('.demo-option').first().click()
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
  await page.getByRole('button', { name: '保存' }).click()
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.locator('.save-state')).toHaveText('已保存', { timeout: 10_000 })
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