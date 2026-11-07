// 纯文本里的 **加粗** 标记 → 渲染为高亮（用于结构化字段的非 Markdown 展示位）

export function EmText({
  text,
  boldClass = 'font-semibold text-teal-300'
}: {
  text: string
  boldClass?: string
}): React.JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (
          (p.startsWith('**') && p.endsWith('**') && p.length > 4) ||
          (p.startsWith('__') && p.endsWith('__') && p.length > 4)
        ) {
          return (
            <strong key={i} className={boldClass}>
              {p.slice(2, -2)}
            </strong>
          )
        }
        return <span key={i}>{p.replace(/\*+/g, '').replace(/`+/g, '')}</span>
      })}
    </>
  )
}
