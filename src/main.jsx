import { createRoot } from 'react-dom/client'
import BowTracker from './BowTracker.jsx'
import './index.css'

window.storage = {
  get: async (k) => {
    const v = localStorage.getItem(k)
    if (v === null) throw new Error('missing')
    return { key: k, value: v }
  },
  set: async (k, v) => (localStorage.setItem(k, v), { key: k, value: v }),
  delete: async (k) => (localStorage.removeItem(k), { key: k, deleted: true }),
  list: async () => ({ keys: Object.keys(localStorage) }),
}

createRoot(document.getElementById('root')).render(<BowTracker />)
