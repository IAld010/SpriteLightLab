import { useEffect } from 'react'

export function ImportGuideDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="dialog-backdrop import-guide-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="import-guide-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-guide-title"
        data-testid="import-guide-dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <div className="eyebrow">Import Guide</div>
            <h2 id="import-guide-title">导入说明</h2>
            <p>规则按用途分为自动匹配、网格切图和项目包三种。</p>
          </div>
          <button type="button" className="mini-button" onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="import-guide-dialog-body">
          <section>
            <h3>1. 自动匹配</h3>
            <p>适合逐帧 PNG 和带 JSON 的图集。系统会从颜色文件名推导动作名与帧号，再寻找对应法线文件。</p>
            <div className="rule-example">
              <code>walk_0001.png</code><span>↔</span><code>walk_0001_n.png</code>
            </div>
            <div className="rule-example">
              <code>walk_diffuse_001.png</code><span>↔</span><code>walk_normal_001.png</code>
            </div>
            <ul>
              <li>颜色图和法线图的动作名、帧编号必须对应。</li>
              <li>支持 <code>_n</code>、<code>_normal</code>、<code>_diffuse</code>、<code>_albedo</code>、<code>_color</code>、<code>_col</code>。</li>
              <li>颜色图和法线图尺寸必须完全一致，不能靠缩放适配。</li>
              <li>图集模式必须保持相同布局和裁剪矩形。</li>
            </ul>
          </section>

          <section>
            <h3>2. 大图网格切图</h3>
            <p>适合一张包含多帧的大图。颜色大图与法线大图必须拥有相同结构。</p>
            <ul>
              <li>两张源图宽高必须一致。</li>
              <li>帧宽、帧高、列数、行数必须一致。</li>
              <li>左/上边距以及水平/垂直间距必须一致。</li>
              <li>网格导入不依赖文件名，但切片顺序必须相同。</li>
            </ul>
          </section>

          <section>
            <h3>3. 项目包导入</h3>
            <p>项目包用于恢复项目设置、帧配对、色板、光照和锚点信息。</p>
            <ul>
              <li>推荐导入本工具导出的 ZIP 项目包。</li>
              <li>ZIP 内至少需要 <code>project.json</code>，素材位于 <code>assets/</code>。</li>
              <li>自包含 JSON 包含内嵌素材，可以直接恢复完整项目。</li>
              <li>轻量 JSON 不包含图片数据，需要先导入相同素材，再应用项目配置。</li>
              <li>不要重命名或删除 ZIP 内的 project.json 和 assets 文件。</li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  )
}
