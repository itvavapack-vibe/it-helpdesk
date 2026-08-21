import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import CenterPortal from './components/CenterPortal.jsx'
import { CENTER_PATH, isCenterPath, isSecretaryPath } from './config/appPaths.js'
import './index.css'

const SecretaryApp = lazy(() => import('./secretary/SecretaryApp.jsx'))

const showCenter = isCenterPath(window.location.pathname, window.location.search)
const showSecretary = isSecretaryPath(window.location.pathname)

if (window.location.pathname === '/' && !window.location.search) {
    window.history.replaceState({}, document.title, CENTER_PATH)
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {showCenter ? <CenterPortal /> : showSecretary ? (
            <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm font-semibold text-slate-500">กำลังโหลด Secretary Center...</div>}>
                <SecretaryApp />
            </Suspense>
        ) : <App />}
    </React.StrictMode>
)
