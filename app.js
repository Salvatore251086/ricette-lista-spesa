document.addEventListener('DOMContentLoaded', () => {
  const imgs = document.querySelectorAll('img[loading="lazy"][data-src]')
  const swap = (img) => { img.src = img.dataset.src }

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          swap(e.target)
          io.unobserve(e.target)
        }
      })
    })
    imgs.forEach((img) => io.observe(img))
  } else {
    imgs.forEach((img) => swap(img))
  }
})
