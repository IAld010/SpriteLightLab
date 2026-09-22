import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

async function chooseDemo(page: Page, index: 0 | 1 | 2) {
  await page.getByTestId('demo-picker-trigger').click()
  const menu = page.getByTestId('demo-menu')
  await expect(menu).toBeVisible()
  await menu.locator('.demo-option').nth(index).click()
}

test('toolbar opens the import guide dialog without a project-library banner', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('import-guide-summary')).toHaveCount(0)

  await page.getByTestId('open-import-guide').click()
  const dialog = page.getByTestId('import-guide-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('walk_0001_n.png')
  await expect(dialog).toContainText('project.json')
  await expect(dialog).toContainText('assets/')
  await expect(dialog.locator('.import-guide-step')).toHaveCount(3)
  await expect(dialog.locator('.import-guide-step-index')).toHaveText(['01', '02', '03'])
  await expect(dialog.locator('.import-guide-dialog-body')).toHaveCSS('grid-template-columns', /1fr|[0-9]+px/)
  await dialog.locator('header .mini-button').click()
  await expect(dialog).toHaveCount(0)
})

test('toolbar removes branding and orders project actions by workflow', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.toolbar .brand-block')).toHaveCount(0)
  const actionLabels = await page.locator('.toolbar-actions').evaluate((toolbar) =>
    Array.from(toolbar.children)
      .filter((element) => element.matches('button, .demo-picker'))
      .map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim()),
  )

  expect(actionLabels.slice(0, 4)).toEqual([
    '选择素材文件',
    '大图裁切',
    '导入项目包',
    '示例项目 ▾',
  ])
  expect(actionLabels[4]).toMatch(/^项目库/)
  expect(actionLabels[5]).toBe('? 导入说明')
})

test('demo picker exposes three example projects', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('demo-picker-trigger').click()
  const options = page.getByTestId('demo-menu').locator('.demo-option')
  await expect(options).toHaveCount(3)
  await expect(options.nth(0)).toContainText('\u666e\u901a\u6f14\u793a')
  await expect(options.nth(1)).toContainText('\u5168\u5f69\u6f14\u793a')
  await expect(options.nth(2)).toContainText('Defold')
})

test('language switch updates the toolbar without breaking its layout', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('button', { name: 'Choose sprite files' })).toBeVisible()

  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    const layout = await page.locator('.toolbar').evaluate((toolbar) => {
      const actions = toolbar.querySelector('.toolbar-actions')!.getBoundingClientRect()
      const settings = toolbar.querySelector('.toolbar-settings')!.getBoundingClientRect()
      return {
        scrollWidth: toolbar.scrollWidth,
        clientWidth: toolbar.clientWidth,
        actionsRight: actions.right,
        settingsLeft: settings.left,
      }
    })
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1)
    expect(layout.actionsRight).toBeLessThanOrEqual(layout.settingsLeft + 1)
  }

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('button', { name: 'Choose sprite files' })).toBeVisible()

  await page.locator('.language-switch button').first().click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(page.getByRole('button', { name: 'Choose sprite files' })).toHaveCount(0)
})

test('English localization covers workspace pages without horizontal overflow', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.getByText('Local projects', { exact: true })).toBeVisible()
  await expect(page.getByText('Sprite projects', { exact: true })).toBeVisible()
  await expect(page.getByText('No saved projects yet', { exact: true })).toBeVisible()

  await chooseDemo(page, 0)
  const tabs = page.locator('.inspector-tabs-five button')
  await expect(tabs.nth(0)).toHaveText('Palette')
  await expect(tabs.nth(1)).toHaveText('Lighting')
  await expect(tabs.nth(2)).toHaveText('Frames')
  await expect(tabs.nth(3)).toHaveText('Project')
  await expect(tabs.nth(4)).toHaveText('Anchor')
  await tabs.nth(1).click()
  const lightingPanel = page.locator('.lighting-panel')
  await expect(lightingPanel).toContainText('Main directional light')
  const addLightButtons = page.locator('.add-light-row .mini-button')
  await addLightButtons.nth(1).click()
  await addLightButtons.nth(2).click()
  await expect(page.locator('.light-list')).toContainText('Point 3')
  await expect(page.locator('.light-list')).toContainText('Spot 4')

  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport)
    const pageLayout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      toolbarWidth: document.querySelector('.toolbar')!.scrollWidth,
      toolbarClientWidth: document.querySelector('.toolbar')!.clientWidth,
    }))
    expect(pageLayout.documentWidth).toBeLessThanOrEqual(pageLayout.viewportWidth + 1)
    expect(pageLayout.toolbarWidth).toBeLessThanOrEqual(pageLayout.toolbarClientWidth + 1)
  }

  const panels = [
    { tab: 0, selector: '.palette-panel', text: 'Palette Swap' },
    { tab: 1, selector: '.lighting-panel', text: 'Normal lighting lab' },
    { tab: 2, selector: '.frame-navigator-section', text: 'Frame navigator' },
    { tab: 3, selector: '.project-panel', text: 'Render options' },
    { tab: 4, selector: '.anchor-panel', text: 'Anchor calibration' },
  ]
  for (const panel of panels) {
    await tabs.nth(panel.tab).click()
    const panelRoot = page.locator(panel.selector)
    await expect(panelRoot).toContainText(panel.text)
    const layout = await panelRoot.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1)
  }

  await page.setViewportSize({ width: 1280, height: 720 })
  for (const panel of panels) {
    await tabs.nth(panel.tab).click()
    const layout = await page.locator(panel.selector).evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1)
  }

  await page.getByTestId('open-import-guide').click()
  const guide = page.getByTestId('import-guide-dialog')
  await expect(guide).toContainText('Import guide')
  expect(await guide.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await guide.getByRole('button', { name: 'Close' }).click()

  await page.getByTestId('open-grid-import').click()
  const gridDialog = page.getByTestId('grid-import-dialog')
  await expect(gridDialog).toContainText('Fixed-grid slicing')
  expect(await gridDialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await gridDialog.getByRole('button', { name: 'Close' }).click()
})

test('stage 1 imports the demo, groups clips and supports frame interaction', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('project-library')).toBeVisible()
  await expect(page.locator('.project-card')).toHaveCount(0)

  await chooseDemo(page, 0)
  await expect(page.locator('.action-panel')).toHaveCount(0)
  await expect(page.locator('.workspace > .inspector-panel')).toHaveCount(1)
  expect(await page.locator('.workspace > *').evaluateAll((elements) => elements.map((element) => element.className))).toEqual(['panel inspector-panel', 'center-workspace'])
  await expect(page.locator('.project-panel .action-item')).toHaveCount(2)
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(4)
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(4)
  await expect(page.locator('.timeline-frame-cell').first()).toContainText('125ms')
  await expect(page.locator('.timeline-frame-cell img').first()).toBeVisible()

  const timelineFrames = page.locator('.timeline-frame-cell')
  const secondFrame = timelineFrames.nth(1)
  await secondFrame.click()
  await expect(secondFrame).toHaveClass(/is-active/)
  await expect(page.locator('.timeline-frame-cell').nth(1)).toHaveClass(/is-active/)

  await timelineFrames.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(timelineFrames.nth(1)).toHaveClass(/is-active/)

  await page.locator('.toolbar-settings .segmented button').nth(1).click()
  await expect(page.locator('.canvas-corner-label')).toContainText('%')
  await page.locator('.toolbar-settings .segmented button').nth(0).click()

  await page.locator('.action-item').nth(1).click()
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(6)
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(6)

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

test('bottom frame cells reorder and stay synchronized with the frame navigator', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page, 0)

  await page.locator('.inspector-tabs-five button').nth(2).click()
  const rightFrames = page.locator('.frame-item .frame-name')
  await expect(rightFrames).toHaveCount(4)
  const before = await rightFrames.evaluateAll((elements) => elements.map((element) => element.textContent ?? ''))
  const timelineFrames = page.locator('.timeline-frame-cell')
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await timelineFrames.first().dispatchEvent('dragstart', { dataTransfer })
  await timelineFrames.first().dispatchEvent('dragenter', { dataTransfer })
  await expect(page.locator('.drop-overlay')).toHaveCount(0)
  await timelineFrames.nth(2).dispatchEvent('dragover', { dataTransfer })
  await timelineFrames.nth(2).dispatchEvent('drop', { dataTransfer })
  await timelineFrames.first().dispatchEvent('dragend', { dataTransfer })

  await expect(rightFrames).toHaveText([before[1], before[2], before[0], before[3]])
  await expect(page.locator('.timeline-frame-cell').nth(2)).toHaveClass(/is-active/)

  const outputDirectory = process.env.STAGE1_OUTPUT_DIR ?? path.join(process.cwd(), 'test-results')
  await mkdir(outputDirectory, { recursive: true })
  await page.screenshot({
    path: path.join(outputDirectory, 'sprite-light-lab-right-frame-navigator.png'),
    fullPage: true,
  })
})
test('curve editor edits multi-key timing and restores it after reload', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page, 0)

  const durationCells = page.locator('.timeline-frame-duration')
  const before = await durationCells.allTextContents()

  await page.locator('.curve-editor-toggle').click()
  const drawer = page.locator('.curve-editor-drawer')
  await expect(drawer).toBeVisible()
  const textTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', 'selected curve text')
    return transfer
  })
  await drawer.dispatchEvent('dragenter', { dataTransfer: textTransfer })
  await expect(page.locator('.drop-overlay')).toHaveCount(0)
  await expect(drawer.locator('.curve-main-path')).toHaveAttribute('d', /^M/)
  await expect(drawer.locator('.curve-keyframe')).toHaveCount(2)

  await drawer.locator('.curve-select-field select').selectOption('ease-in-out')
  await expect(drawer.locator('.curve-keyframe')).toHaveCount(3)
  await expect.poll(async () => {
    const values = await durationCells.allTextContents()
    return values.reduce((sum, value) => sum + Number.parseFloat(value), 0)
  }).toBeCloseTo(500, 0)
  await expect.poll(async () => (await durationCells.allTextContents()).join('|')).not.toBe(before.join('|'))

  await drawer.locator('.curve-graph').dblclick({ position: { x: 320, y: 84 } })
  await expect(drawer.locator('.curve-keyframe')).toHaveCount(4)
  const timeInput = drawer.locator('.curve-number-field input').nth(0)
  const timeBefore = Number(await timeInput.inputValue())
  const activeKeyframe = drawer.locator('.curve-keyframe.is-active')
  const keyframeBounds = await activeKeyframe.boundingBox()
  expect(keyframeBounds).not.toBeNull()
  await page.mouse.move(keyframeBounds!.x + keyframeBounds!.width / 2, keyframeBounds!.y + keyframeBounds!.height / 2)
  await page.mouse.down()
  await page.mouse.move(keyframeBounds!.x + keyframeBounds!.width / 2 + 22, keyframeBounds!.y + keyframeBounds!.height / 2)
  await page.mouse.up()
  await expect.poll(async () => Number(await timeInput.inputValue())).not.toBe(timeBefore)

  const tangentInput = drawer.locator('.curve-number-field input').nth(2)
  const tangentBefore = Number(await tangentInput.inputValue())
  const tangentHandle = drawer.locator('.curve-tangent-handle.is-active').first()
  const tangentBounds = await tangentHandle.boundingBox()
  expect(tangentBounds).not.toBeNull()
  await page.mouse.move(tangentBounds!.x + tangentBounds!.width / 2, tangentBounds!.y + tangentBounds!.height / 2)
  await page.mouse.down()
  await page.mouse.move(tangentBounds!.x + tangentBounds!.width / 2, tangentBounds!.y + tangentBounds!.height / 2 + 18)
  await page.mouse.up()
  await expect.poll(async () => Number(await tangentInput.inputValue())).not.toBe(tangentBefore)

  const speedInput = drawer.locator('.curve-number-field input').nth(1)
  await speedInput.fill('2.5')
  await expect(speedInput).toHaveValue('2.5')

  const outputDirectory = process.env.STAGE1_OUTPUT_DIR ?? path.join(process.cwd(), 'test-results')
  await mkdir(outputDirectory, { recursive: true })
  await page.screenshot({
    path: path.join(outputDirectory, 'sprite-light-lab-curve-editor.png'),
    fullPage: true,
  })

  await page.waitForTimeout(900)
  await page.reload()
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(4)
  await page.locator('.curve-editor-toggle').click()
  await expect(page.locator('.curve-keyframe')).toHaveCount(4)
  const restoredKeyframes = page.locator('.curve-keyframe')
  const restoredSpeedInput = page.locator('.curve-number-field input').nth(1)
  let foundEditedKeyframe = false
  for (let index = 0; index < 4; index += 1) {
    await restoredKeyframes.nth(index).click()
    if ((await restoredSpeedInput.inputValue()) === '2.5') {
      foundEditedKeyframe = true
      break
    }
  }
  expect(foundEditedKeyframe).toBe(true)
})

test('drop overlay only accepts external file drags', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page, 0)
  const appShell = page.locator('.app-shell')
  await expect(appShell).toHaveCSS('user-select', 'none')
  await expect(page.locator('.toolbar-settings select').first()).toHaveCSS('user-select', 'text')

  const textTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', 'selected UI text')
    return transfer
  })
  await appShell.dispatchEvent('dragenter', { dataTransfer: textTransfer })
  await expect(page.locator('.drop-overlay')).toHaveCount(0)

  const fileTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['png'], 'external.png', { type: 'image/png' }))
    return transfer
  })
  await appShell.dispatchEvent('dragenter', { dataTransfer: fileTransfer })
  await expect(page.locator('.drop-overlay')).toBeVisible()
  await appShell.dispatchEvent('dragleave', { dataTransfer: fileTransfer })
  await expect(page.locator('.drop-overlay')).toHaveCount(0)
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

  await chooseDemo(page, 0)
  await page.locator('.inspector-tabs-four button').nth(0).click()
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
  await chooseDemo(page, 0)
  await page.locator('.inspector-tabs-four button').nth(0).click()
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

test('palette name input can be cleared before committing a new name', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page, 0)
  await page.locator('.inspector-tabs-five button').nth(0).click()
  const input = page.locator('.palette-name-input')
  await input.fill('')
  await expect(input).toHaveValue('')
  await input.fill('Custom Palette')
  await input.press('Enter')
  await expect(input).toHaveValue('Custom Palette')

  await input.fill('')
  await input.press('Enter')
  await expect(input).toHaveValue('Custom Palette')
})

test('palette picker uses the in-app menu for mouse and keyboard selection', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page, 0)
  await page.locator('.inspector-tabs-four button').nth(0).click()

  await page.locator('.palette-toolbar .mini-button').first().click()
  const trigger = page.getByTestId('palette-picker-trigger')
  await expect(trigger).toContainText('配色 2')

  await trigger.click()
  const menu = page.getByTestId('palette-picker-menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('option')).toHaveCount(2)
  await menu.getByRole('option', { name: '默认' }).click()
  await expect(menu).toHaveCount(0)
  await expect(trigger).toContainText('默认')

  await trigger.press('ArrowDown')
  await expect(menu).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(menu.getByRole('option', { name: '配色 2' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toHaveCount(0)
  await expect(trigger).toContainText('配色 2')
})

test('PWA starts offline after the first successful visit', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('open-grid-import')).toBeVisible()
  await context.setOffline(false)
})
test('full color mode exposes color rules and global adjustments', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page, 1)
  await page.locator('.inspector-tabs-four button').nth(0).click()
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
  await chooseDemo(page, 2)
  await expect(page.locator('.action-item')).toHaveCount(1)
  await expect(page.locator('.action-item')).toContainText('bopz_walk')
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(16)
  await expect(page.locator('.pair-dot.pair-missing, .pair-dot.pair-mismatch')).toHaveCount(0)
  await expect(page.locator('.renderer-error')).toHaveCount(0)
})

async function importAlignmentFixture(page: Page, colorFile: string, normalFile: string) {
  const fixtureRoot = path.join(process.cwd(), 'e2e', 'fixtures', 'alignment')
  await page.locator('.toolbar input[type="file"]').nth(1).setInputFiles([
    path.join(fixtureRoot, colorFile),
    path.join(fixtureRoot, normalFile),
  ])
  await expect(page.getByTestId('manual-match-page')).toBeVisible()
  await expect(page.locator('.matching-column')).toHaveCount(1)
  await page.getByTestId('confirm-manual-match').click()
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(1)
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
    const canvasElement = canvas as HTMLCanvasElement
    const output = document.createElement('canvas')
    output.width = canvasElement.width
    output.height = canvasElement.height
    const context = output.getContext('2d')!
    context.drawImage(canvasElement, 0, 0)
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
    const canvasElement = canvas as HTMLCanvasElement
    const output = document.createElement('canvas')
    output.width = canvasElement.width
    output.height = canvasElement.height
    const context = output.getContext('2d')!
    context.drawImage(canvasElement, 0, 0)
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

async function measurePositionedLightAlignment(page: Page, type: 'point' | 'spot') {
  const handleSelector = `.light-position-${type} .light-handle`
  return page.locator('.preview-canvas-host').evaluate(async (host, selector) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const canvas = host.querySelector('canvas')!
    const handle = host.parentElement!.querySelector(selector) as HTMLElement
    const output = document.createElement('canvas')
    output.width = canvas.width
    output.height = canvas.height
    const context = output.getContext('2d')!
    context.drawImage(canvas, 0, 0)
    const pixels = context.getImageData(0, 0, output.width, output.height).data
    const luminances = new Float32Array(output.width * output.height)
    let maximum = -1
    for (let y = 0; y < output.height; y += 1) {
      for (let x = 0; x < output.width; x += 1) {
        const offset = y * output.width + x
        const index = offset * 4
        const luminance = pixels[index + 3] < 8 ? -1 : pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
        luminances[offset] = luminance
        maximum = Math.max(maximum, luminance)
      }
    }
    let sumX = 0
    let sumY = 0
    let count = 0
    for (let y = 0; y < output.height; y += 1) {
      for (let x = 0; x < output.width; x += 1) {
        if (luminances[y * output.width + x] >= maximum - 0.05) {
          sumX += x
          sumY += y
          count += 1
        }
      }
    }
    const hostBounds = host.getBoundingClientRect()
    const handleBounds = handle.getBoundingClientRect()
    const scaleX = canvas.width / hostBounds.width
    const scaleY = canvas.height / hostBounds.height
    return {
      centroidX: sumX / count,
      centroidY: sumY / count,
      handleX: (handleBounds.left + handleBounds.width / 2 - hostBounds.left) * scaleX,
      handleY: (handleBounds.top + handleBounds.height / 2 - hostBounds.top) * scaleY,
    }
  }, handleSelector)
}

test('project library saves, switches, renames and removes projects', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('project-library')).toBeVisible()

  await chooseDemo(page, 0)
  await expect(page.locator('.action-panel')).toHaveCount(0)
  await expect(page.locator('.workspace > .inspector-panel')).toHaveCount(1)
  expect(await page.locator('.workspace > *').evaluateAll((elements) => elements.map((element) => element.className))).toEqual(['panel inspector-panel', 'center-workspace'])
  await expect(page.locator('.project-panel .action-item')).toHaveCount(2)
  await page.waitForTimeout(900)
  await page.getByTestId('open-project-library').click()
  await expect(page.locator('.project-card')).toHaveCount(1)

  await page.locator('.project-card').first().getByRole('button', { name: '重命名' }).click()
  const renameDialog = page.getByRole('dialog', { name: '重命名项目' })
  await renameDialog.locator('input').fill('项目 A')
  await renameDialog.getByRole('button', { name: '保存名称' }).click()
  await expect(page.locator('.project-card').first()).toContainText('项目 A')

  await chooseDemo(page, 1)
  await expect(page.getByTestId('project-library')).toHaveCount(0)
  await page.waitForTimeout(900)
  await page.getByTestId('open-project-library').click()
  await expect(page.locator('.project-card')).toHaveCount(2)
  await expect(page.locator('.project-card.is-active')).toHaveCount(1)

  const projectA = page.locator('.project-card').filter({ hasText: '项目 A' })
  await projectA.getByRole('button', { name: '打开项目' }).click()
  await expect(page.getByTestId('project-library')).toHaveCount(0)
  await expect(page.locator('.action-item')).toHaveCount(2)

  await page.getByTestId('open-project-library').click()
  await expect(page.locator('.project-card').filter({ hasText: '项目 A' })).toHaveClass(/is-active/)
  await page.locator('.project-card').filter({ hasText: '项目 A' }).getByRole('button', { name: '移除' }).click()
  await expect(page.getByRole('dialog', { name: /移除.*项目 A/ })).toBeVisible()
  await page.getByRole('button', { name: '确认移除' }).click()
  await expect(page.getByTestId('project-library')).toHaveCount(0)

  await page.getByTestId('open-project-library').click()
  await expect(page.locator('.project-card')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.action-item')).toHaveCount(1)
  await page.getByTestId('open-project-library').click()
  await expect(page.locator('.project-card')).toHaveCount(1)
})

test('legacy single-workspace data migrates once and can be removed permanently', async ({ page }) => {
  await page.goto('/manifest.webmanifest')
  await page.evaluate(async () => {
    const pngBytes = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl8n8sAAAAASUVORK5CYII='),
      (character) => character.charCodeAt(0),
    )
    const file = new File([pngBytes], 'legacy_0001.png', {
      type: 'image/png',
      lastModified: 1,
    })
    const document = {
      version: 1,
      projectName: '旧版单工作区',
      createdAt: '2026-01-01T00:00:00.000Z',
      sourceMode: 'frames',
      sourceName: 'legacy_0001.png',
      assets: [{ path: 'legacy_0001.png', name: 'legacy_0001.png', kind: 'image' }],
      frames: [
        {
          id: 'frame:legacy',
          name: 'legacy_0001',
          source: { id: 'source:legacy', name: 'legacy_0001.png', imageId: 'legacy' },
          pairingStatus: 'missing',
        },
      ],
      animations: [
        { id: 'clip:legacy', name: 'legacy', frameIds: ['frame:legacy'], fps: 8, loop: true },
      ],
      normalPairing: [{ frameId: 'frame:legacy' }],
      paletteSources: ['#ff0000'],
      paletteMode: 'indexed',
      palettePresets: [
        {
          id: 'palette:legacy',
          name: '默认',
          entries: [{ source: '#ff0000', target: '#ff0000' }],
          rules: [],
          adjustments: {
            hue: 0,
            saturation: 1,
            lightness: 0,
            contrast: 1,
            tint: '#ffffff',
            tintStrength: 0,
          },
        },
      ],
      activePaletteId: 'palette:legacy',
      lighting: {
        ambientColor: '#ffffff',
        ambientIntensity: 0.34,
        lights: [],
      },
      renderPreferences: {
        lightingEnabled: true,
        normalStrength: 1,
        flipGreen: false,
        specularEnabled: false,
        specularStrength: 0.35,
        pixelPerfect: true,
      },
      settings: {
        backend: 'webgl',
        textureMode: 'color',
        background: 'checker',
        zoom: 1,
        panX: 0,
        panY: 0,
      },
    }

    const request = indexedDB.open('sprite-light-lab', 2)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('workspace', { keyPath: 'id' })
      request.result.createObjectStore('directory', { keyPath: 'id' })
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = db.transaction('workspace', 'readwrite')
    transaction.objectStore('workspace').put({
      id: 'last',
      document,
      files: [file],
      savedAt: '2026-01-01T00:00:00.000Z',
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  })

  await page.goto('/')
  await expect(page.locator('.action-item')).toHaveCount(1)
  await page.getByTestId('open-project-library').click()
  await expect(page.locator('.project-card')).toHaveCount(1)
  await expect(page.locator('.project-card')).toContainText('旧版单工作区')

  await page.locator('.project-card').getByRole('button', { name: '移除' }).click()
  await page.getByRole('button', { name: '确认移除' }).click()
  await expect(page.locator('.project-card')).toHaveCount(0)

  await page.reload()
  await expect(page.getByTestId('project-library')).toBeVisible()
  await expect(page.locator('.project-card')).toHaveCount(0)
})

test('specular strength changes the rendered lighting output', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page, 0)
  await expect(page.locator('.action-panel')).toHaveCount(0)
  await expect(page.locator('.workspace > .inspector-panel')).toHaveCount(1)
  expect(await page.locator('.workspace > *').evaluateAll((elements) => elements.map((element) => element.className))).toEqual(['panel inspector-panel', 'center-workspace'])
  await expect(page.locator('.project-panel .action-item')).toHaveCount(2)

  await page.locator('.inspector-tabs-four button').nth(1).click()
  const canvas = page.locator('.preview-canvas-host canvas')
  await expect(canvas).toBeVisible()
  const before = await canvas.screenshot()

  await page.locator('.lighting-panel .range-grid input[type="range"]').nth(1).fill('1')
  await page.waitForTimeout(300)
  const after = await canvas.screenshot()

  expect(Buffer.compare(before, after)).not.toBe(0)

  const outputDirectory = process.env.STAGE1_OUTPUT_DIR ?? path.join(process.cwd(), 'test-results')
  await mkdir(outputDirectory, { recursive: true })
  await page.screenshot({
    path: path.join(outputDirectory, 'sprite-light-lab-directional-lighting.png'),
    fullPage: true,
  })
})

test('point and spot canvas handles can be hidden without disabling their lights', async ({ page }) => {
  await page.goto('/')
  await chooseDemo(page, 0)
  await page.locator('.inspector-tabs-four button').nth(1).click()

  const lightRows = page.locator('.light-row')
  await lightRows.nth(1).locator('.light-main').click()
  const pointToggle = page.getByRole('checkbox', { name: '显示 暖色点光 画布手柄' })
  await expect(page.locator('.light-position-point .light-handle')).toBeVisible()
  await expect(lightRows.nth(1).locator('input[type="checkbox"]')).toBeChecked()
  await pointToggle.uncheck()
  await expect(page.locator('.light-position-point .light-handle')).toHaveCount(0)
  await expect(lightRows.nth(1).locator('input[type="checkbox"]')).toBeChecked()
  await pointToggle.check()
  await expect(page.locator('.light-position-point .light-handle')).toBeVisible()

  await page.locator('.add-light-row .mini-button').nth(2).click()
  await lightRows.nth(2).locator('.light-main').click()
  const spotToggle = page.getByRole('checkbox', { name: '显示 聚光 3 画布手柄' })
  await expect(page.locator('.light-position-spot .light-handle')).toBeVisible()
  await spotToggle.uncheck()
  await expect(page.locator('.light-position-spot .light-handle')).toHaveCount(0)
  await expect(page.locator('.light-position-point .light-handle')).toBeVisible()
})

test.describe('high-density light coordinate alignment', () => {
  test.use({ deviceScaleFactor: 1.5 })

  test('point and spot lights use the checkerboard handle as their exact emission origin', async ({ page }) => {
  await page.goto('/')
  const generated = await page.evaluate(() => {
    const make = (r: number, g: number, b: number) => {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const context = canvas.getContext('2d')!
      context.fillStyle = `rgb(${r},${g},${b})`
      context.fillRect(0, 0, 128, 128)
      return canvas.toDataURL('image/png').split(',')[1]
    }
    return { color: make(255, 255, 255), normal: make(128, 128, 255) }
  })

  await page.locator('.toolbar input[type="file"]').nth(1).setInputFiles([
    { name: 'light-color.png', mimeType: 'image/png', buffer: Buffer.from(generated.color, 'base64') },
    { name: 'light-color_n.png', mimeType: 'image/png', buffer: Buffer.from(generated.normal, 'base64') },
  ])
  await page.getByTestId('confirm-manual-match').click()
  await page.locator('.inspector-tabs-four button').nth(1).click()

  const lightRows = page.locator('.light-row')
  await lightRows.nth(0).locator('input[type="checkbox"]').uncheck()
  await lightRows.nth(1).locator('.light-main').click()
  let ranges = page.locator('.light-editor .range-field input[type="range"]')
  await ranges.nth(0).fill('0.62')
  await ranges.nth(1).fill('0.7')
  await ranges.nth(2).fill('1')
  await ranges.nth(3).fill('20')
  await page.locator('.light-editor .color-setting-row input[type="range"]').first().fill('0.35')
  await page.waitForTimeout(350)

  const pointAlignment = await measurePositionedLightAlignment(page, 'point')

  expect(Math.abs(pointAlignment.centroidX - pointAlignment.handleX)).toBeLessThan(2)
  expect(Math.abs(pointAlignment.centroidY - pointAlignment.handleY)).toBeLessThan(2)

  await page.locator('.zoom-control input[type="range"]').fill('2')
  const host = page.locator('.preview-canvas-host')
  const bounds = await host.boundingBox()
  if (!bounds) throw new Error('Preview host not found')
  await page.mouse.move(bounds.x + 100, bounds.y + bounds.height - 100)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 200, bounds.y + bounds.height - 50, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(350)

  const cameraAlignedPoint = await measurePositionedLightAlignment(page, 'point')
  expect(Math.abs(cameraAlignedPoint.centroidX - cameraAlignedPoint.handleX)).toBeLessThan(2)
  expect(Math.abs(cameraAlignedPoint.centroidY - cameraAlignedPoint.handleY)).toBeLessThan(2)

  await page.locator('.add-light-row .mini-button').nth(2).click()
  await lightRows.nth(1).locator('input[type="checkbox"]').uncheck()
  await lightRows.nth(2).locator('.light-main').click()
  ranges = page.locator('.light-editor .range-field input[type="range"]')
  await ranges.nth(0).fill('0')
  await ranges.nth(1).fill('0.62')
  await ranges.nth(2).fill('0.7')
  await ranges.nth(3).fill('1')
  await ranges.nth(4).fill('20')
  await ranges.nth(5).fill('60')
  await ranges.nth(6).fill('0')
  await page.locator('.light-editor .color-setting-row input[type="range"]').first().fill('0.35')
  await page.waitForTimeout(350)

  const spotAlignment = await measurePositionedLightAlignment(page, 'spot')
  expect(Math.abs(spotAlignment.centroidX - spotAlignment.handleX)).toBeLessThan(2)
  expect(Math.abs(spotAlignment.centroidY - spotAlignment.handleY)).toBeLessThan(2)

  const coneBias = await page.locator('.preview-canvas-host').evaluate(async (host) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const canvas = host.querySelector('canvas')!
    const output = document.createElement('canvas')
    output.width = canvas.width
    output.height = canvas.height
    const context = output.getContext('2d')!
    context.drawImage(canvas, 0, 0)
    const pixels = context.getImageData(0, 0, output.width, output.height).data
    let left = 0
    let right = 0
    let leftCount = 0
    let rightCount = 0
    for (let y = 0; y < output.height; y += 1) {
      for (let x = 0; x < output.width; x += 1) {
        const index = (y * output.width + x) * 4
        if (pixels[index + 3] < 8) continue
        const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
        if (x < output.width / 2) {
          left += luminance
          leftCount += 1
        } else {
          right += luminance
          rightCount += 1
        }
      }
    }
    return { left: left / Math.max(1, leftCount), right: right / Math.max(1, rightCount) }
  })

  expect(coneBias.right).toBeGreaterThan(coneBias.left)
  const outputDirectory = process.env.STAGE1_OUTPUT_DIR ?? path.join(process.cwd(), 'test-results')
  await mkdir(outputDirectory, { recursive: true })
  await page.screenshot({
    path: path.join(outputDirectory, 'sprite-light-lab-point-spot.png'),
    fullPage: true,
  })
  })
})
test('anchor calibration aligns 64x64, 64x128 and 128x128 frames at one scale', async ({ page }) => {
  await page.goto('/')
  const generated = await page.evaluate(() => {
    const make = (width: number, height: number, color: string) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')!
      context.fillStyle = color
      context.fillRect(0, 0, width, height)
      return canvas.toDataURL('image/png').split(',')[1]
    }
    return {
      idle: make(64, 64, 'rgb(255,255,255)'),
      idleNormal: make(64, 64, 'rgb(128,128,255)'),
      tall: make(64, 128, 'rgb(255,210,210)'),
      tallNormal: make(64, 128, 'rgb(128,128,255)'),
      wide: make(128, 128, 'rgb(190,220,255)'),
      wideNormal: make(128, 128, 'rgb(128,128,255)'),
    }
  })

  await page.locator('.toolbar input[type="file"]').nth(1).setInputFiles([
    { name: 'hero_0001.png', mimeType: 'image/png', buffer: Buffer.from(generated.idle, 'base64') },
    { name: 'hero_0001_n.png', mimeType: 'image/png', buffer: Buffer.from(generated.idleNormal, 'base64') },
    { name: 'hero_0002.png', mimeType: 'image/png', buffer: Buffer.from(generated.tall, 'base64') },
    { name: 'hero_0002_n.png', mimeType: 'image/png', buffer: Buffer.from(generated.tallNormal, 'base64') },
    { name: 'hero_0003.png', mimeType: 'image/png', buffer: Buffer.from(generated.wide, 'base64') },
    { name: 'hero_0003_n.png', mimeType: 'image/png', buffer: Buffer.from(generated.wideNormal, 'base64') },
  ])
  await expect(page.locator('.matching-column')).toHaveCount(3)
  await page.getByTestId('confirm-manual-match').click()
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(3)
  await expect(page.locator('.action-item')).toHaveCount(1)

  await page.locator('.inspector-tabs-five button').nth(4).click()
  await page.getByTestId('anchor-calibration-panel').getByRole('button').first().click()
  await expect(page.getByTestId('anchor-calibration-overlay')).toBeVisible()
  await expect(page.getByTestId('anchor-pixel-grid')).toBeVisible()

  const inputs = page.locator('.anchor-number-grid input')
  await expect(inputs.nth(0)).toHaveValue('32')
  await expect(inputs.nth(1)).toHaveValue('64')
  await expect(page.locator('.anchor-layout-summary')).toContainText('128')

  const fixedSurface = page.getByTestId('anchor-calibration-surface')
  const fixedSurfaceBefore = await fixedSurface.boundingBox()
  await inputs.nth(0).fill('10.5')
  await expect(page.getByTestId('anchor-crosshair-y')).toHaveCSS('left', '84px')
  await fixedSurface.click({ position: { x: 84, y: 84 } })
  await expect(inputs.nth(0)).toHaveValue('10.5')
  await expect(inputs.nth(1)).toHaveValue('10.5')
  const fixedSurfaceAfter = await fixedSurface.boundingBox()
  expect(fixedSurfaceAfter).toEqual(fixedSurfaceBefore)
  const zoomSlider = page.locator('.anchor-zoom-slider input[type="range"]')
  await zoomSlider.fill('4')
  await expect(page.getByTestId('anchor-pixel-grid')).toHaveCount(0)
  await zoomSlider.fill('8')
  await expect(page.getByTestId('anchor-pixel-grid')).toBeVisible()
  await zoomSlider.fill('24')
  await page.waitForTimeout(100)
  const centeredViewport = await page.locator('.anchor-calibration-viewport').boundingBox()
  const centeredSurface = await page.getByTestId('anchor-calibration-surface').boundingBox()
  expect(centeredViewport).not.toBeNull()
  expect(centeredSurface).not.toBeNull()
  expect(
    Math.abs(
      centeredSurface!.x + centeredSurface!.width / 2 -
        (centeredViewport!.x + centeredViewport!.width / 2),
    ),
  ).toBeLessThanOrEqual(2)
  expect(
    Math.abs(
      centeredSurface!.y + centeredSurface!.height / 2 -
        (centeredViewport!.y + centeredViewport!.height / 2),
    ),
  ).toBeLessThanOrEqual(2)
  await zoomSlider.fill('8')
  await inputs.nth(0).fill('32')
  await inputs.nth(1).fill('64')

  await page.getByTestId('anchor-frame-select').selectOption({ index: 1 })
  await expect(inputs.nth(0)).toHaveValue('32')
  await expect(inputs.nth(1)).toHaveValue('128')

  await page.getByTestId('anchor-frame-select').selectOption({ index: 2 })
  await expect(inputs.nth(0)).toHaveValue('64')
  await expect(inputs.nth(1)).toHaveValue('128')
  const wideSurface = await page.getByTestId('anchor-calibration-surface').boundingBox()
  expect(wideSurface?.width).toBe(1024)
  expect(wideSurface?.height).toBe(1024)

  await page.locator('.anchor-panel .section-title-row .mini-button').first().click()
  await expect(page.getByTestId('anchor-calibration-overlay')).toHaveCount(0)

  const measureCanvasBounds = () => page.locator('.preview-canvas-host canvas').evaluate(async (canvas) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const canvasElement = canvas as HTMLCanvasElement
    const output = document.createElement('canvas')
    output.width = canvasElement.width
    output.height = canvasElement.height
    const context = output.getContext('2d')!
    context.drawImage(canvasElement, 0, 0)
    const pixels = context.getImageData(0, 0, output.width, output.height).data
    let minX = output.width
    let minY = output.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < output.height; y += 1) {
      for (let x = 0; x < output.width; x += 1) {
        if (pixels[(y * output.width + x) * 4 + 3] > 8) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
      }
    }
    return { width: maxX - minX + 1, height: maxY - minY + 1, bottom: maxY }
  })

  await page.locator('.timeline-frame-cell').nth(0).click()
  await page.waitForTimeout(250)
  const idleBounds = await measureCanvasBounds()
  await page.locator('.timeline-frame-cell').nth(1).click()
  await page.waitForTimeout(250)
  const tallBounds = await measureCanvasBounds()
  await page.locator('.timeline-frame-cell').nth(2).click()
  await page.waitForTimeout(250)
  const wideBounds = await measureCanvasBounds()

  expect(Math.abs(tallBounds.width - idleBounds.width)).toBeLessThanOrEqual(2)
  expect(Math.abs(tallBounds.height - idleBounds.height * 2)).toBeLessThanOrEqual(2)
  expect(Math.abs(wideBounds.width - tallBounds.width * 2)).toBeLessThanOrEqual(2)
  expect(Math.abs(wideBounds.height - tallBounds.height)).toBeLessThanOrEqual(2)
  expect(Math.abs(wideBounds.bottom - tallBounds.bottom)).toBeLessThanOrEqual(2)

  await page.waitForTimeout(900)
  await page.reload()
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(3)
  await page.locator('.inspector-tabs-five button').nth(4).click()
  await expect(page.locator('.anchor-number-grid input').nth(0)).toHaveValue('32')
  await expect(page.locator('.anchor-number-grid input').nth(1)).toHaveValue('64')
})

test('non-grid region import auto-detects and supports manual rectangle editing', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('open-grid-import').click()
  await page.locator('.grid-import-mode-switch button').nth(1).click()

  const generated = await page.evaluate(() => {
    const make = (normal: boolean) => {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const context = canvas.getContext('2d')!
      if (normal) {
        context.fillStyle = 'rgb(128,128,255)'
        context.fillRect(0, 0, 128, 128)
      } else {
        context.fillStyle = 'rgb(255,80,80)'
        context.fillRect(10, 10, 20, 30)
        context.fillRect(60, 20, 30, 50)
      }
      return canvas.toDataURL('image/png').split(',')[1]
    }
    return { color: make(false), normal: make(true) }
  })

  const inputs = page.locator('.grid-import-dialog input[type="file"]')
  await inputs.nth(0).setInputFiles({
    name: 'sheet_color.png',
    mimeType: 'image/png',
    buffer: Buffer.from(generated.color, 'base64'),
  })
  await inputs.nth(1).setInputFiles({
    name: 'sheet_normal.png',
    mimeType: 'image/png',
    buffer: Buffer.from(generated.normal, 'base64'),
  })

  const regionImage = page.locator('.region-editor-canvas img')
  await expect(regionImage).toBeVisible()
  await expect.poll(() => regionImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(page.locator('.region-editor-box')).toHaveCount(2)
  await expect(page.locator('.region-list-item')).toHaveCount(2)
  await expect(page.locator('.grid-preview-heading').first()).toContainText('128×128 · 2 帧 · 法线图同步区域')
  await expect(page.locator('.warning-card.warning-error')).toHaveCount(0)

  const firstRegion = page.locator('.region-editor-box').first()
  const bounds = await firstRegion.boundingBox()
  expect(bounds).not.toBeNull()
  const xInput = page.locator('.region-number-grid input').nth(0)
  const xBefore = Number(await xInput.inputValue())
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 12, bounds!.y + bounds!.height / 2)
  await page.mouse.up()
  await expect.poll(async () => Number(await xInput.inputValue())).toBeGreaterThan(xBefore)

  await page.locator('.region-action-grid button').nth(0).click()
  await expect(page.locator('.region-editor-box')).toHaveCount(3)
  await page.locator('.region-list-item').first().click()
  await page.locator('.region-action-grid button').nth(2).click()
  await expect(page.locator('.region-editor-box')).toHaveCount(2)

  await xInput.fill('9999')
  await expect(xInput).toHaveValue('127')
  await expect(page.locator('.region-number-grid input').nth(2)).toHaveValue('1')

  await page.locator('.grid-import-footer .button-primary').click()
  await expect(page.getByTestId('grid-import-dialog')).toHaveCount(0)
  await expect(page.locator('.notice')).toContainText('区域导入完成：2 帧、1 个动作。')
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(2)
  await expect(page.locator('.action-item')).toHaveCount(1)
  await page.waitForTimeout(900)
  await page.reload()
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(2)
  await expect(page.locator('.action-item')).toHaveCount(1)
})

test('grid import uses the shared vibrancy surface system in both modes', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('open-grid-import').click()
  const dialog = page.getByTestId('grid-import-dialog')

  const gridStyles = await dialog.evaluate(() => {
    const style = (selector: string) => getComputedStyle(document.querySelector(selector)!)
    return {
      dialogRadius: style('.grid-import-dialog').borderRadius,
      headerBackground: style('.grid-import-header').backgroundColor,
      settingsBackground: style('.grid-import-settings').backgroundColor,
      previewBackground: style('.grid-import-preview').backgroundColor,
      cardBackground: style('.grid-preview-card').backgroundColor,
      canvasBackgroundImage: style('.grid-preview-canvas').backgroundImage,
      canvasBackgroundSize: style('.grid-preview-canvas').backgroundSize,
    }
  })
  expect(gridStyles.dialogRadius).toBe('16px')
  expect(gridStyles.headerBackground).toBe('rgba(28, 28, 30, 0.92)')
  expect(gridStyles.settingsBackground).toBe('rgba(28, 28, 30, 0.88)')
  expect(gridStyles.previewBackground).toBe('rgb(28, 28, 30)')
  expect(gridStyles.cardBackground).toBe('rgba(44, 44, 46, 0.94)')
  expect(gridStyles.canvasBackgroundImage).toContain('url(')
  expect(gridStyles.canvasBackgroundSize).toBe('16px 16px')

  await dialog.locator('input[type="file"]').nth(0).setInputFiles(
    path.join(process.cwd(), 'e2e', 'fixtures', 'alignment', 'horizontal.png'),
  )
  await dialog.locator('.grid-import-mode-switch button').nth(1).click()
  const region = dialog.locator('.region-import-workspace')
  await expect(region).toBeVisible()
  await expect(region.locator('.region-editor-canvas')).toBeVisible()
  const regionStyles = await region.evaluate((root) => ({
    workspace: getComputedStyle(root).backgroundColor,
    editor: getComputedStyle(root.querySelector('.region-import-editor')!).backgroundColor,
    canvasImage: getComputedStyle(root.querySelector('.region-editor-canvas')!).backgroundImage,
    canvasSize: getComputedStyle(root.querySelector('.region-editor-canvas')!).backgroundSize,
  }))
  expect(regionStyles.workspace).toBe('rgb(44, 44, 46)')
  expect(regionStyles.editor).toBe('rgb(28, 28, 30)')
  expect(regionStyles.canvasImage).toContain('url(')
  expect(regionStyles.canvasSize).toBe('16px 16px')
})

test('grid import slices aligned sheets and explains naming and size rules', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('open-grid-import').click()
  const dialog = page.getByTestId('grid-import-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('walk_0001.png')
  await expect(dialog).toContainText('walk_0001_n.png')
  await expect(dialog).toContainText('尺寸必须完全一致')

  const fileInputs = dialog.locator('input[type="file"]')
  await fileInputs.nth(0).setInputFiles(
    path.join(process.cwd(), 'e2e', 'fixtures', 'alignment', 'horizontal.png'),
  )
  await fileInputs.nth(1).setInputFiles(
    path.join(process.cwd(), 'e2e', 'fixtures', 'alignment', 'horizontal_n.png'),
  )

  await dialog.getByLabel('帧宽').fill('32')
  await dialog.getByLabel('帧高').fill('32')
  await dialog.getByLabel('列数').fill('2')
  await dialog.getByLabel('行数').fill('2')

  await expect(dialog.locator('.grid-preview-color .grid-cell-overlay')).toHaveCount(4)
  await expect(dialog.locator('.grid-preview-normal .grid-cell-overlay')).toHaveCount(4)
  await dialog.getByRole('button', { name: /确认导入 4 帧/ }).click()

  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(4)
  await expect(page.locator('.action-item')).toHaveCount(1)
  await page.waitForTimeout(900)
  await page.reload()
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(4)
  await expect(page.locator('.action-item')).toHaveCount(1)
})

test('grid import blocks color and normal sheets with different dimensions', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('open-grid-import').click()
  const dialog = page.getByTestId('grid-import-dialog')
  const fileInputs = dialog.locator('input[type="file"]')
  await fileInputs.nth(0).setInputFiles(
    path.join(process.cwd(), 'e2e', 'fixtures', 'alignment', 'horizontal.png'),
  )
  await fileInputs.nth(1).setInputFiles(
    path.join(process.cwd(), 'src', 'assets', 'hero.png'),
  )

  await expect(dialog.getByText(/法线图尺寸必须与精灵图完全一致/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: /确认导入/ })).toBeDisabled()
})

test('manual matching page pairs images with different names by drag and drop', async ({ page }) => {
  await page.goto('/')
  const fixtureRoot = path.join(process.cwd(), 'e2e', 'fixtures', 'alignment')
  await page.locator('.toolbar input[type="file"]').nth(1).setInputFiles([
    path.join(fixtureRoot, 'horizontal.png'),
    path.join(fixtureRoot, 'vertical_n.png'),
  ])

  const pageRoot = page.getByTestId('manual-match-page')
  await expect(pageRoot).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()
  await expect(pageRoot).toContainText('Confirm sprite and normal pairing')
  await expect(pageRoot).toContainText('Add pairing column')
  await page.locator('.language-switch button').first().click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  await expect(pageRoot).not.toContainText('Confirm sprite and normal pairing')
  await expect(pageRoot).toContainText('walk_0001.png')
  await expect(pageRoot).toContainText('尺寸必须完全一致')
  await expect(page.locator('.matching-column')).toHaveCount(0)

  await page.getByRole('button', { name: '添加匹配列' }).click()
  const row = page.locator('.matching-column').first()
  const sourceSlot = row.locator('[data-drop-kind="source"]')
  const normalSlot = row.locator('[data-drop-kind="normal"]')

  const sourceItem = page.locator('[data-match-kind="source"]')
  const normalItem = page.locator('[data-match-kind="normal"]')
  const sourceTransfer = await page.evaluateHandle(() => new DataTransfer())
  await sourceItem.dispatchEvent('dragstart', { dataTransfer: sourceTransfer })
  await sourceSlot.dispatchEvent('dragover', { dataTransfer: sourceTransfer })
  await sourceSlot.dispatchEvent('drop', { dataTransfer: sourceTransfer })
  const normalTransfer = await page.evaluateHandle(() => new DataTransfer())
  await normalItem.dispatchEvent('dragstart', { dataTransfer: normalTransfer })
  await normalSlot.dispatchEvent('dragover', { dataTransfer: normalTransfer })
  await normalSlot.dispatchEvent('drop', { dataTransfer: normalTransfer })

  await expect(sourceSlot).toContainText('horizontal')
  await expect(normalSlot).toContainText('vertical_n')
  await sourceSlot.locator('.match-thumbnail-source').dblclick()
  await expect(page.getByTestId('image-zoom-dialog')).toBeVisible()
  await expect(page.getByTestId('image-zoom-dialog')).toContainText('horizontal')
  const zoomImage = page.getByTestId('image-zoom-dialog').locator('img')
  await expect(zoomImage).toBeVisible()
  await expect.poll(() => zoomImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('image-zoom-dialog')).toHaveCount(0)
  await page.getByTestId('confirm-manual-match').click()

  await expect(page.getByTestId('manual-match-page')).toHaveCount(0)
  await expect(page.locator('.timeline-frame-cell')).toHaveCount(1)
  await page.locator('.inspector-tabs-four button').nth(2).click()
  await expect(page.locator('.inspector-content .field select').first()).not.toHaveValue('')
})
