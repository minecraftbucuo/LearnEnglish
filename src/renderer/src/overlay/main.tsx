import { createRoot } from 'react-dom/client'
import App from './App'
import '../common.css'
import { initTheme } from '../utils'

initTheme()

// 覆盖层页面必须全透明，才能透出活屏幕（common.css 给 body 设了不透明背景，这里覆盖掉）
document.documentElement.style.background = 'transparent'
document.body.style.background = 'transparent'
const root = document.getElementById('root')!
root.style.background = 'transparent'

createRoot(root).render(<App />)
