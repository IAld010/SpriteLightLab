import { describe, expect, it } from 'vitest'
import { translate, translateLightName, useLanguageStore } from '../i18n'

describe('i18n', () => {
  it('returns the source Chinese text by default', () => {
    expect(translate('选择素材文件', 'zh-CN')).toBe('选择素材文件')
  })

  it('translates exact and interpolated messages to English', () => {
    expect(translate('选择素材文件', 'en')).toBe('Choose sprite files')
    expect(translate('已导入 {frames} 帧、{actions} 个动作。', 'en', { frames: 4, actions: 2 }))
      .toBe('Imported 4 frames and 2 actions.')
  })

  it('translates already-formatted runtime messages', () => {
    expect(translate('已导入 4 帧、2 个动作。', 'en')).toBe('Imported 4 frames and 2 actions.')
  })

  it('translates common runtime import warnings', () => {
    expect(translate('已忽略 3 个不支持的文件。', 'en')).toBe('Ignored 3 unsupported files.')
    expect(translate('法线图尺寸必须与精灵图完全一致：精灵图 64×64，法线图 32×32。', 'en'))
      .toBe('Color and normal dimensions must match exactly: sprite 64×64, normal 32×32.')
  })

  it('translates default light names without changing custom names', () => {
    expect(translateLightName('主方向光', 'en')).toBe('Main directional light')
    expect(translateLightName('暖色点光', 'en')).toBe('Warm point light')
    expect(translateLightName('点光 3', 'en')).toBe('Point 3')
    expect(translateLightName('My custom light', 'en')).toBe('My custom light')
    expect(translateLightName('暖色点光', 'zh-CN')).toBe('暖色点光')
  })

  it('persists the selected language', () => {
    useLanguageStore.getState().setLanguage('en')
    expect(window.localStorage.getItem('sprite-light-lab-language')).toBe('en')
    expect(useLanguageStore.getState().language).toBe('en')
    useLanguageStore.getState().setLanguage('zh-CN')
  })
})
