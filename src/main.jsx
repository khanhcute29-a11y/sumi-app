import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import '../design-system/styles.css'
import './App.css'
import './mobile-shell.css'
import './order-flow.css'
import './order-overview.css'
import './brand-assets.css'
import './interaction-feedback.css'
import './workforce.css'
import './finance-requests.css'
import './company-feed.css'
import './pinned-announcement.css'
import './bottom-nav-five.css'
import { newId } from './lib/ids'

// Android browsers opened over the local HTTP address expose crypto but not
// randomUUID. Keep every mobile workflow operational during staging tests.
if (globalThis.crypto && !globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: newId, configurable: true })
}

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
