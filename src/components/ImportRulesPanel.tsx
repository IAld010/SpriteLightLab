interface ImportRulesPanelProps {
  colorSize?: { width: number; height: number }
  normalSize?: { width: number; height: number }
}

export function ImportRulesPanel({ colorSize, normalSize }: ImportRulesPanelProps) {
  const sizeMatches =
    !colorSize ||
    !normalSize ||
    (colorSize.width === normalSize.width && colorSize.height === normalSize.height)

  return (
    <section className="import-rules-panel">
      <div className="eyebrow">导入规则</div>
      <h3>自动匹配命名规则</h3>
      <div className="rule-example">
        <code>walk_0001.png</code>
        <span>↔</span>
        <code>walk_0001_n.png</code>
      </div>
      <div className="rule-example">
        <code>walk_diffuse_001.png</code>
        <span>↔</span>
        <code>walk_normal_001.png</code>
      </div>
      <p>
        颜色图和法线图需要有相同的动作名与帧编号。支持 <code>_n</code>、<code>_normal</code>、
        <code>_diffuse</code>、<code>_albedo</code>、<code>_color</code> 和 <code>_col</code>。
      </p>

      <div className={`size-rule ${sizeMatches ? 'is-valid' : 'is-error'}`}>
        <strong>尺寸必须完全一致</strong>
        <p>
          当前渲染器按相同像素坐标采样，颜色图和法线图不能缩放适配。图集模式还必须保持相同的裁剪矩形。
        </p>
        <div className="size-comparison">
          <span>精灵图：{colorSize ? `${colorSize.width}×${colorSize.height}` : '未选择'}</span>
          <span>法线图：{normalSize ? `${normalSize.width}×${normalSize.height}` : '可选 / 未选择'}</span>
        </div>
      </div>

      <div className="grid-rule">
        <strong>网格切图规则</strong>
        <p>
          颜色网格和法线网格必须拥有相同宽高，并使用相同的帧宽、帧高、行列、边距和间距。文件名称不参与网格配对。
        </p>
      </div>
    </section>
  )
}