import type { ReactNode } from 'react'
import { useRefinementStore, type DrawingTool } from '../store/refinementStore'
import { useI18n } from '../i18n'

interface ToolDefinition {
  tool: DrawingTool
  label: string
  shortcut?: string
  icon: ReactNode
}

const icon = (children: ReactNode) => <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>

const TOOLS: ToolDefinition[] = [
  { tool: 'pencil', label: '铅笔', shortcut: 'B', icon: icon(<path d="M4 20l3.6-.8L19 7.8a2.2 2.2 0 0 0-3.1-3.1L4.5 16.1 4 20zm10.4-14.3l3.1 3.1" />) },
  { tool: 'eraser', label: '橡皮擦', shortcut: 'E', icon: icon(<><path d="M4.5 15.8l7.4-7.4a2 2 0 0 1 2.8 0l3.1 3.1a2 2 0 0 1 0 2.8l-5.1 5.1H7.6l-3.1-3.1a2 2 0 0 1 0-3.5z" /><path d="M10.5 20l4.8-4.8" /></>) },
  { tool: 'bucket', label: '油漆桶', shortcut: 'G', icon: icon(<><path d="M5 12l7-7 7 7-7 7-7-7z" /><path d="M8 9l3-3" /><path d="M5 13c0 2-2 2.5-2 4.5A2 2 0 0 0 6 19" /></>) },
  { tool: 'eyedropper', label: '吸管', shortcut: 'I', icon: icon(<><path d="M4 20l2.2-2.2" /><path d="M6 18l7.3-7.3" /><path d="M12.2 9.8l2-2 2-2a2.1 2.1 0 0 1 3 3l-4 4" /><path d="M11.2 10.8l3 3" /></>) },
  { tool: 'line', label: '直线', shortcut: 'L', icon: icon(<path d="M4 20L20 4" />) },
  { tool: 'rectangle', label: '矩形', icon: icon(<rect x="4" y="5" width="16" height="14" rx="1" />) },
  { tool: 'ellipse', label: '椭圆', icon: icon(<ellipse cx="12" cy="12" rx="8" ry="6" />) },
  { tool: 'select', label: '矩形选区', shortcut: 'M', icon: icon(<rect x="4" y="5" width="16" height="14" rx="1" strokeDasharray="3 2" />) },
  { tool: 'move', label: '移动选区', icon: icon(<><path d="M12 3v18M3 12h18" /><path d="M12 3l-2 2m2-2l2 2M21 12l-2-2m2 2l-2 2M12 21l-2-2m2 2l2-2M3 12l2-2m-2 2l2 2" /></>) },
  { tool: 'hand', label: '平移画布', shortcut: 'Space', icon: icon(<path d="M7.5 12V6.5a1.5 1.5 0 0 1 3 0V10m0-4.5a1.5 1.5 0 0 1 3 0V10m0-3.5a1.5 1.5 0 0 1 3 0V11m0-2.5a1.5 1.5 0 0 1 3 0V15c0 3.3-2.7 6-6 6h-1.2a6 6 0 0 1-4.4-2.1l-3.1-3.8a1.6 1.6 0 0 1 2.4-2.1L9 14.5" />) },
]

export function DrawingToolRail() {
  const { t } = useI18n()
  const tool = useRefinementStore((state) => state.tool)
  const setTool = useRefinementStore((state) => state.setTool)

  return (
    <nav className="drawing-tool-rail" aria-label={t('绘图工具')}>
      {TOOLS.map((item) => (
        <button
          key={item.tool}
          type="button"
          className={`drawing-tool-button ${tool === item.tool ? 'is-active' : ''}`}
          aria-label={t(item.label)}
          aria-pressed={tool === item.tool}
          title={item.shortcut ? `${t(item.label)} (${item.shortcut})` : t(item.label)}
          data-tool={item.tool}
          onClick={() => setTool(item.tool)}
        >
          {item.icon}
        </button>
      ))}
    </nav>
  )
}
