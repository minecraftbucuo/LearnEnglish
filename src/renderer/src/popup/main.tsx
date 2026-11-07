import { createRoot } from 'react-dom/client'
import App from './App'
import '../common.css'
import { initTheme } from '../utils'

initTheme()
createRoot(document.getElementById('root')!).render(<App />)
