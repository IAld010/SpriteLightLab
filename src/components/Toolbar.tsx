import { useRef } from 'react'
import { APP_VERSION } from '../version'
import { parseProjectDocument } from '../domain/projectDocument'
import { importPortableJson, importProjectZip } from '../services/projectIO'
import { saveDirectoryHandle } from '../services/projectPersistence'
import { useEditorStore } from '../store/editorStore'
import type { BackendPreference } from '../domain/types'

interface ToolbarProps {
  onPickFiles: (files: File[]) => void
}

const directoryPicker = (window as Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}).showDirectoryPicker

async function readDirectory(directory: FileSystemDirectoryHandle): Promise<File[]> {
  const files: File[] = []
  for await (const entry of directory.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile()
      Object.defineProperty(file, 'webkitRelativePath', {
        configurable: true,
        value: `${directory.name}/${entry.name}`,
      })
      files.push(file)
    } else {
      files.push(...(await readDirectory(entry)))
    }
  }
  return files
}

export function Toolbar({ onPickFiles }: ToolbarProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const projectInput = useRef<HTMLInputElement>(null)
  const backend = useEditorStore((state) => state.settings.backend)
  const textureMode = useEditorStore((state) => state.settings.textureMode)
  const isImporting = useEditorStore((state) => state.isImporting)
  const importProjectFiles = useEditorStore((state) => state.importProjectFiles)
  const applyProjectDocument = useEditorStore((state) => state.applyProjectDocument)
  const setNotice = useEditorStore((state) => state.setNotice)
  const loadDemo = useEditorStore((state) => state.loadDemo)
  const loadFullColorDemo = useEditorStore((state) => state.loadFullColorDemo)
  const loadDefoldSample = useEditorStore((state) => state.loadDefoldSample)
  const setBackend = useEditorStore((state) => state.setBackend)
  const setTextureMode = useEditorStore((state) => state.setTextureMode)

  const handleDirectory = async () => {
    if (!directoryPicker) {
      fileInput.current?.click()
      return
    }
    try {
      const directory = await directoryPicker()
      await saveDirectoryHandle(directory)
      onPickFiles(await readDirectory(directory))
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        fileInput.current?.click()
      }
    }
  }

  return (
    <header className="toolbar">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          SL
        </div>
        <div>
          <strong>Sprite Light Lab</strong>
          <span>本地精灵整合与预览工作台 · v{APP_VERSION}</span>
        </div>
      </div>

      <div className="toolbar-actions">
        <button className="button button-primary" type="button" onClick={handleDirectory}>
          <span className="button-icon">⌂</span>
          打开本地目录
        </button>
        <button
          className="button"
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={isImporting}
        >
          选择素材文件
        </button>
        <button className="button button-ghost" type="button" onClick={() => void loadDemo()}>
          载入演示
        </button>
        <button className="button button-ghost" type="button" onClick={() => void loadFullColorDemo()}>
          {'\u5168\u5f69\u6f14\u793a'}
        </button>
        <button className="button button-ghost" type="button" onClick={() => void loadDefoldSample()}>
          {'Defold \u793a\u4f8b'}
        </button>
        <button className="button" type="button" onClick={() => projectInput.current?.click()}>

          {'\u5bfc\u5165\u9879\u76ee\u5305'}
        </button>
        <input
          ref={projectInput}
          className="visually-hidden"
          type="file"
          accept=".zip,.json,application/zip,application/json"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            setNotice({ tone: 'info', message: '\u6b63\u5728\u5bfc\u5165\u9879\u76ee\u5305\u2026' })
            try {
              if (file.name.toLowerCase().endsWith('.zip')) {
                const portable = await importProjectZip(await file.arrayBuffer())
                await importProjectFiles(portable.files, portable.document)
              } else {
                const content = await file.text()
                const parsed = JSON.parse(content) as { format?: string }
                if (parsed.format === 'sprite-light-lab-portable') {
                  const portable = importPortableJson(content)
                  if (portable.files.length > 0) {
                    await importProjectFiles(portable.files, portable.document)
                  } else {
                    applyProjectDocument(portable.document)
                  }
                } else {
                  applyProjectDocument(parseProjectDocument(content))
                }
              }
            } catch (error) {
              console.error(error)
              setNotice({
                tone: 'error',
                message: error instanceof Error ? error.message : '\u9879\u76ee\u5305\u5bfc\u5165\u5931\u8d25\u3002',
              })
            }
          }}
        />
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept=".png,.json,image/png,application/json"
          multiple
          onChange={(event) => {
            onPickFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </div>

      <div className="toolbar-settings">
        <label className="compact-control">
          <span>渲染后端</span>
          <select
            value={backend}
            onChange={(event) => setBackend(event.target.value as BackendPreference)}
          >
            <option value="webgl">WebGL2</option>
            <option value="webgpu">WebGPU</option>
          </select>
        </label>
        <div className="segmented" aria-label="预览纹理">
          <button
            type="button"
            className={textureMode === 'color' ? 'is-active' : ''}
            onClick={() => setTextureMode('color')}
          >
            颜色图
          </button>
          <button
            type="button"
            className={textureMode === 'normal' ? 'is-active' : ''}
            onClick={() => setTextureMode('normal')}
          >
            法线图
          </button>
        </div>
      </div>
    </header>
  )
}