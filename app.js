const btn = document.getElementById('installBtn')
let deferredPrompt = null

btn.disabled = true

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferredPrompt = e
  btn.disabled = false
})

btn.addEventListener('click', async () => {
  if (!deferredPrompt) return
  deferredPrompt.prompt()
  await deferredPrompt.userChoice
  deferredPrompt = null
  btn.disabled = true
})

window.addEventListener('appinstalled', () => {
  btn.textContent = 'Installata'
  btn.disabled = true
})
