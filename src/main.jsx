import React from 'react'
import ReactDOM from 'react-dom/client'
import FHIRViewer from './App.jsx'

const style = document.createElement('style')
style.textContent = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
`
document.head.appendChild(style)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FHIRViewer />
  </React.StrictMode>,
)
