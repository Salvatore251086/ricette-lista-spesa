const yearEl = document.getElementById('year')
if (yearEl) yearEl.textContent = new Date().getFullYear()

const btn = document.getElementById('installBtn')
let deferredPrompt = null
if (btn) btn.disabled = true

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferredPrompt = e
  if (btn) btn.disabled = false
})

if (btn) {
  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    btn.disabled = true
  })
}

window.addEventListener('appinstalled', () => {
  if (btn) {
    btn.textContent = 'Installata'
    btn.disabled = true
  }
})

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
  })
}
