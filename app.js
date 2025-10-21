// Aggiorna anno footer
document.getElementById('year').textContent = new Date().getFullYear()

// Install prompt PWA
let deferredInstall
const installBtn = document.getElementById('installBtn')

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferredInstall = e
  if (installBtn) installBtn.disabled = false
})

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredInstall) return
    installBtn.disabled = true
    const choice = await deferredInstall.prompt()
    deferredInstall = null
  })
}

// Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
  })
}
