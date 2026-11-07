// 文本语言判断（主进程路由 + 渲染进程徽章共用，避免两处逻辑漂移）

/** 中文是否为该文本的主语言：按中日韩字符与拉丁字母的数量占比判断。
 *  英文段落里夹杂个别中文注释（如 "animation (动画制作)"）不算中文。 */
export function isZhContent(text: string): boolean {
  let cjk = 0
  let latin = 0
  for (const ch of text) {
    if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch)) cjk++
    else if (/[A-Za-z]/.test(ch)) latin++
  }
  return cjk > latin
}
