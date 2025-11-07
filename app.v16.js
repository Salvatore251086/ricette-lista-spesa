;(function () {
  const RECIPES_URL = 'assets/json/recipes-it.json'
  const VIDEOS_URL = 'assets/json/video_index.resolved.json'
  const DATA_VERSION = 'v1'

  const elements = {}

  const state = {
    recipes: [],
    videosByKey: {},
    filteredRecipes: [],
    suggestedRecipes: [],
    searchText: '',
    activeTags: new Set(),
    allTags: ['primo', 'secondo', 'dolce', 'veloce', 'light']
  }

  document.addEventListener('DOMContentLoaded', init)

  async function init () {
    cacheDom()
    bindEvents()
    await loadData()
    applyFilters()
    renderAll()
  }

  function cacheDom () {
    elements.searchInput = document.getElementById('search-input')
    elements.tagChips = document.getElementById('tag-chips')
    elements.ingredientsInput = document.getElementById('ingredients-input')
    elements.btnSuggest = document.getElementById('btn-suggest')
    elements.btnCamera = document.getElementById('btn-camera')
    elements.btnRefresh = document.getElementById('btn-refresh-data')
    elements.recipesList = document.getElementById('recipes-list')
    elements.suggestList = document.getElementById('suggest-list')
    elements.recipesCount = document.getElementById('recipes-count')
    elements.suggestCount = document.getElementById('suggest-count')
    elements.recipeTemplate = document.getElementById('recipe-card-template')

    elements.cameraPanel = document.getElementById('camera-panel')
    elements.cameraStream = document.getElementById('camera-stream')
    elements.cameraCanvas = document.getElementById('camera-canvas')
    elements.btnCloseCamera = document.getElementById('btn-close-camera')
    elements.btnCapture = document.getElementById('btn-capture')
    elements.fileUpload = document.getElementById('file-upload')
    elements.ocrOutput = document.getElementById('ocr-output')

    elements.videoModal = document.getElementById('video-modal')
    elements.videoModalBackdrop = document.getElementById('video-modal-backdrop')
    elements.videoModalClose = document.getElementById('video-modal-close')
    elements.videoModalBody = document.getElementById('video-modal-body')
    elements.videoFallbackMsg = document.getElementById('video-fallback-msg')

    elements.openDemo = document.getElementById('open-demo')
  }

  function bindEvents () {
    if (elements.openDemo) {
      elements.openDemo.addEventListener('click', function () {
        const app = document.getElementById('app')
        if (app) app.scrollIntoView({ behavior: 'smooth' })
      })
    }

    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', function () {
        state.searchText = elements.searchInput.value.trim().toLowerCase()
        applyFilters()
        renderRecipes()
      })
    }

    if (elements.tagChips) {
      elements.tagChips.addEventListener('click', onTagClick)
    }

    if (elements.btnSuggest) {
      elements.btnSuggest.addEventListener('click', buildSuggestions)
    }

    if (elements.btnCamera) {
      elements.btnCamera.addEventListener('click', openCameraPanel)
    }

    if (elements.btnCloseCamera) {
      elements.btnCloseCamera.addEventListener('click', closeCameraPanel)
    }

    if (elements.btnCapture) {
      elements.btnCapture.addEventListener('click', captureFrame)
    }

    if (elements.fileUpload) {
      elements.fileUpload.addEventListener('change', handleFileUpload)
    }

    if (elements.btnRefresh) {
      elements.btnRefresh.addEventListener('click', async function () {
        await loadData(true)
        applyFilters()
        renderAll()
      })
    }

    if (elements.videoModalBackdrop) {
      elements.videoModalBackdrop.addEventListener('click', closeVideoModal)
    }

    if (elements.videoModalClose) {
      elements.videoModalClose.addEventListener('click', closeVideoModal)
    }
  }

  async function loadData (force) {
    const recipesUrl = withBust(RECIPES_URL, force)
    const videosUrl = withBust(VIDEOS_URL, force)

    const [recipesRaw, videosRaw] = await Promise.all([
      fetchJsonSafe(recipesUrl, null),
      fetchJsonSafe(videosUrl, [])
    ])

    const recipesData = unwrapRecipes(recipesRaw)

    state.recipes = normalizeRecipes(recipesData)
    state.videosByKey = indexVideos(videosRaw)
    state.filteredRecipes = state.recipes.slice()

    console.log('Caricate ricette:', state.recipes.length)
    console.log('Video indicizzati:', Object.keys(state.videosByKey).length)
  }

  function withBust (url, force) {
    const stamp = force ? Date.now() : DATA_VERSION
    const sep = url.indexOf('?') !== -1 ? '&' : '?'
    return url + sep + 'v=' + stamp
  }

  async function fetchJsonSafe (url, fallback) {
    try {
      const res = await fetch(url)
      if (!res.ok) return fallback
      return await res.json()
    } catch (e) {
      console.log('Errore caricamento', url, e)
      return fallback
    }
  }

  // Adattiamo la struttura di recipes-it.json
  function unwrapRecipes (raw) {
    if (Array.isArray(raw)) return raw

    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.recipes)) return raw.recipes
      if (Array.isArray(raw.data)) return raw.data

      const keys = Object.keys(raw)
      for (let i = 0; i < keys.length; i++) {
        const v = raw[keys[i]]
        if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
          return v
        }
      }
    }

    return []
  }

  function normalizeRecipes (items) {
    if (!Array.isArray(items)) return []
    return items
      .map(function (r, index) {
        const title = String(r.title || r.name || r.recipeTitle || '').trim()
        const slug = r.slug || slugify(title || 'ricetta-' + index)

        const tags = Array.isArray(r.tags)
          ? r.tags
              .map(function (t) { return String(t).toLowerCase().trim() })
              .filter(Boolean)
          : []

        const url = String(
          r.url ||
          r.link ||
          r.href ||
          r.recipeUrl ||
          ''
        ).trim()

        const img = String(r.image || r.thumbnail || '').trim()

        const ingredients = String(
          r.ingredients ||
          r.ingredienti ||
          r.ings ||
          ''
        ).toLowerCase()

        return {
          id: index,
          title: title,
          slug: slug,
          url: url,
          img: img,
          tags: tags,
          ingredients: ingredients
        }
      })
      .filter(function (r) {
        return r.title
      })
  }

  function indexVideos (videos) {
    const map = {}
    if (!Array.isArray(videos)) return map

    videos.forEach(function (v) {
      const title = String(v.title || '').trim()
      const slug = String(v.slug || '').trim()
      const yt = String(v.youtubeId || v.ytId || '').trim()
      const confidence = typeof v.confidence === 'number' ? v.confidence : 0

      if (!yt || confidence < 0.8) return

      const keyFromSlug = slug ? slugify(slug) : ''
      const keyFromTitle = title ? slugify(title) : ''

      if (keyFromSlug && !map[keyFromSlug]) {
        map[keyFromSlug] = {
          youtubeId: yt,
          title: title,
          confidence: confidence
        }
      }

      if (keyFromTitle && !map[keyFromTitle]) {
        map[keyFromTitle] = {
          youtubeId: yt,
          title: title,
          confidence: confidence
        }
      }
    })

    return map
  }

  function findVideoForRecipe (recipe) {
    if (!recipe) return null
    const keys = []

    if (recipe.slug) keys.push(slugify(recipe.slug))
    if (recipe.title) keys.push(slugify(recipe.title))

    const seen = new Set()
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i].trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      const v = state.videosByKey[key]
      if (v && v.youtubeId) return v
    }

    return null
  }

  function onTagClick (e) {
    const btn = e.target
    if (!btn.classList.contains('chip')) return

    const tag = btn.dataset.tag

    if (tag === 'all') {
      state.activeTags.clear()
      updateChipsUI()
      applyFilters()
      renderRecipes()
      return
    }

    if (state.activeTags.has(tag)) {
      state.activeTags.delete(tag)
    } else {
      state.activeTags.add(tag)
    }

    updateChipsUI()
    applyFilters()
    renderRecipes()
  }

  function updateChipsUI () {
    if (!elements.tagChips) return
    const chips = elements.tagChips.querySelectorAll('.chip')
    const hasTags = state.activeTags.size > 0

    chips.forEach(function (chip) {
      const tag = chip.dataset.tag
      if (tag === 'all') {
        chip.classList.toggle('chip-active', !hasTags)
      } else {
        chip.classList.toggle('chip-active', state.activeTags.has(tag))
      }
    })
  }

  function applyFilters () {
    const text = state.searchText
    const activeTags = state.activeTags

    state.filteredRecipes = state.recipes.filter(function (r) {
      if (text) {
        const haystack = (r.title + ' ' + r.ingredients).toLowerCase()
        if (haystack.indexOf(text) === -1) return false
      }

      if (activeTags.size > 0) {
        const ok = Array.from(activeTags).every(function (tag) {
          return r.tags.indexOf(tag) !== -1
        })
        if (!ok) return false
      }

      return true
    })
  }

  function renderAll () {
    renderRecipes()
    renderSuggestions()
  }

  function renderRecipes () {
    if (!elements.recipesList || !elements.recipeTemplate) return

    elements.recipesList.innerHTML = ''

    state.filteredRecipes.forEach(function (recipe) {
      const card = buildRecipeCard(recipe)
      elements.recipesList.appendChild(card)
    })

    if (elements.recipesCount) {
      elements.recipesCount.textContent =
        state.filteredRecipes.length + ' ricette visibili'
    }
  }

  function buildRecipeCard (recipe) {
    const tpl = elements.recipeTemplate.content.cloneNode(true)
    const card = tpl.querySelector('.recipe-card')
    const imgEl = tpl.querySelector('.recipe-img')
    const titleEl = tpl.querySelector('.recipe-title')
    const sourceEl = tpl.querySelector('.recipe-source')
    const tagsEl = tpl.querySelector('.recipe-tags')
    const btnOpen = tpl.querySelector('.btn-open-recipe')
    const btnVideo = tpl.querySelector('.btn-open-video')
    const btnAdd = tpl.querySelector('.btn-add-list')

    titleEl.textContent = recipe.title

    if (recipe.url) {
      sourceEl.textContent = 'Apri fonte'
    } else {
      sourceEl.textContent = ''
    }

    if (recipe.tags && recipe.tags.length > 0) {
      tagsEl.textContent = 'Tag: ' + recipe.tags.join(', ')
    } else {
      tagsEl.textContent = ''
    }

    const video = findVideoForRecipe(recipe)

    if (recipe.img) {
      imgEl.src = recipe.img
    } else {
      imgEl.src = 'assets/icons/icon-192x192.png'
    }
    imgEl.alt = recipe.title
    imgEl.onerror = function () {
      imgEl.src = 'assets/icons/icon-192x192.png'
    }

    if (btnOpen) {
      if (recipe.url) {
        btnOpen.addEventListener('click', function () {
          window.open(recipe.url, '_blank', 'noopener')
        })
      } else {
        btnOpen.textContent = 'Link non disponibile'
        btnOpen.disabled = true
      }
    }

    if (btnVideo) {
      if (video && video.youtubeId) {
        btnVideo.addEventListener('click', function () {
          openVideoModal(video.youtubeId)
        })
      } else {
        btnVideo.textContent = 'Video non disponibile'
        btnVideo.disabled = true
      }
    }

    if (btnAdd) {
      btnAdd.addEventListener('click', function () {
        appendToIngredients(recipe)
      })
    }

    return card
  }

  function appendToIngredients (recipe) {
    if (!elements.ingredientsInput) return
    const current = elements.ingredientsInput.value.trim()
    const line = recipe.title
    elements.ingredientsInput.value = current
      ? current + '\n' + line
      : line
  }

  function buildSuggestions () {
    if (!elements.ingredientsInput) return

    const raw = elements.ingredientsInput.value.toLowerCase()
    const tokens = tokenize(raw)

    if (tokens.length === 0) {
      state.suggestedRecipes = []
      renderSuggestions()
      return
    }

    const scored = state.recipes.map(function (r) {
      return {
        recipe: r,
        score: scoreRecipe(r, tokens)
      }
    })

    scored.sort(function (a, b) {
      return b.score - a.score
    })

    state.suggestedRecipes = scored
      .filter(function (x) { return x.score > 0 })
      .slice(0, 50)
      .map(function (x) { return x.recipe })

    renderSuggestions()
  }

  function tokenize (text) {
    return text
      .split(/[^a-zàèéìòóù0-9]+/i)
      .map(function (t) { return t.trim() })
      .filter(function (t) { return t.length > 2 })
  }

  function scoreRecipe (recipe, tokens) {
    const base = (recipe.ingredients || '').toLowerCase()
    let score = 0
    tokens.forEach(function (t) {
      if (base.indexOf(t) !== -1) score += 1
    })
    return score
  }

  function renderSuggestions () {
    if (!elements.suggestList || !elements.recipeTemplate) return

    elements.suggestList.innerHTML = ''

    state.suggestedRecipes.forEach(function (recipe) {
      const card = buildRecipeCard(recipe)
      elements.suggestList.appendChild(card)
    })

    if (elements.suggestCount) {
      elements.suggestCount.textContent =
        state.suggestedRecipes.length > 0
          ? state.suggestedRecipes.length + ' ricette trovate'
          : 'Nessun suggerimento'
    }
  }

  function openCameraPanel () {
    if (!elements.cameraPanel) return
    elements.cameraPanel.classList.remove('hidden')
    startCamera()
  }

  function closeCameraPanel () {
    if (!elements.cameraPanel) return
    elements.cameraPanel.classList.add('hidden')
    stopCamera()
  }

  async function startCamera () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      elements.ocrOutput.textContent = 'Fotocamera non supportata nel browser'
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      elements.cameraStream.srcObject = stream
      elements.ocrOutput.textContent = 'Inquadra testo e premi Scatta'
    } catch (e) {
      elements.ocrOutput.textContent = 'Accesso fotocamera negato'
    }
  }

  function stopCamera () {
    const video = elements.cameraStream
    if (video && video.srcObject && video.srcObject.getTracks) {
      const tracks = video.srcObject.getTracks()
      tracks.forEach(function (t) { t.stop() })
      video.srcObject = null
    }
  }

  function captureFrame () {
    const video = elements.cameraStream
    const canvas = elements.cameraCanvas
    if (!video || !canvas || !video.videoWidth) {
      elements.ocrOutput.textContent = 'Nessun frame disponibile'
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    elements.ocrOutput.textContent =
      'OCR demo, copia manualmente gli ingredienti riconosciuti'
  }

  function handleFileUpload (e) {
    const file = e.target.files[0]
    if (!file) return
    elements.ocrOutput.textContent =
      'Upload effettuato, leggi e incolla testo ingredienti'
  }

  function openVideoModal (youtubeId) {
    if (!elements.videoModal || !elements.videoModalBody) return

    elements.videoModalBody.innerHTML = ''
    elements.videoFallbackMsg.classList.add('hidden')

    const iframe = document.createElement('iframe')
    iframe.width = '560'
    iframe.height = '315'
    iframe.src =
      'https://www.youtube-nocookie.com/embed/' + youtubeId + '?autoplay=1'
    iframe.title = 'Video ricetta'
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
    iframe.setAttribute('allowfullscreen', 'true')

    let loaded = false

    iframe.onload = function () {
      loaded = true
    }

    iframe.onerror = function () {
      if (!loaded) {
        openVideoInNewTab(youtubeId)
      }
    }

    elements.videoModalBody.appendChild(iframe)
    elements.videoModal.classList.remove('hidden')

    setTimeout(function () {
      if (!loaded) {
        elements.videoFallbackMsg.classList.remove('hidden')
        openVideoInNewTab(youtubeId)
      }
    }, 2000)
  }

  function openVideoInNewTab (youtubeId) {
    const url = 'https://www.youtube.com/watch?v=' + youtubeId
    window.open(url, '_blank', 'noopener')
  }

  function closeVideoModal () {
    if (!elements.videoModal || !elements.videoModalBody) return
    elements.videoModal.classList.add('hidden')
    elements.videoModalBody.innerHTML = ''
    elements.videoFallbackMsg.classList.add('hidden')
  }

  function slugify (str) {
    return String(str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }
})()
