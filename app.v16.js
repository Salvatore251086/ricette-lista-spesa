;(function () {
  const RECIPES_URL = 'assets/json/recipes-it.json'
  const VIDEOS_URL = 'assets/json/video_index.resolved.json'
  const DATA_VERSION = 'v1'

  const TRUSTED_RECIPE_DOMAINS = [
    'www.giallozafferano.it',
    'ricette.giallozafferano.it',
    'www.ilcuoreinpentola.it',
    'www.cucchiaio.it',
    'www.fattoincasadabenedetta.it',
    'www.salepepe.it',
    'www.lacucinaitaliana.it'
  ]

  const elements = {}

  const state = {
    recipes: [],
    videosByKey: {},
    videosList: [],
    filteredRecipes: [],
    suggestedRecipes: [],
    searchText: '',
    activeTags: new Set()
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
        var app = document.getElementById('app')
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
    var recipesUrl = withBust(RECIPES_URL, force)
    var videosUrl = withBust(VIDEOS_URL, force)

    var results = await Promise.all([
      fetchJsonSafe(recipesUrl, null),
      fetchJsonSafe(videosUrl, [])
    ])

    var recipesRaw = results[0]
    var videosRaw = results[1]

    var recipesData = unwrapRecipes(recipesRaw)

    state.recipes = normalizeRecipes(recipesData)

    var videoIndex = indexVideos(videosRaw)
    state.videosByKey = videoIndex.map
    state.videosList = videoIndex.list

    state.recipes.forEach(function (r) {
      autoVerifyRecipe(r)
    })

    state.filteredRecipes = state.recipes.slice()

    console.log('Caricate ricette:', state.recipes.length)
    console.log('Video indicizzati:', state.videosList.length)
  }

  function withBust (url, force) {
    var stamp = force ? Date.now() : DATA_VERSION
    var sep = url.indexOf('?') !== -1 ? '&' : '?'
    return url + sep + 'v=' + stamp
  }

  async function fetchJsonSafe (url, fallback) {
    try {
      var res = await fetch(url)
      if (!res.ok) return fallback
      return await res.json()
    } catch (e) {
      return fallback
    }
  }

  function unwrapRecipes (raw) {
    if (Array.isArray(raw)) return raw

    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.recipes)) return raw.recipes
      if (Array.isArray(raw.data)) return raw.data

      if (raw.recipes && typeof raw.recipes === 'object') {
        return Object.values(raw.recipes)
      }

      if (raw.data && typeof raw.data === 'object') {
        return Object.values(raw.data)
      }

      var keys = Object.keys(raw)

      for (var i = 0; i < keys.length; i++) {
        var v = raw[keys[i]]
        if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
          return v
        }
      }

      for (var j = 0; j < keys.length; j++) {
        var m = raw[keys[j]]
        if (m && typeof m === 'object') {
          var vals = Object.values(m)
          if (vals.length && typeof vals[0] === 'object') {
            return vals
          }
        }
      }
    }

    return []
  }

  function sanitizeImageUrl (raw) {
    if (!raw) return ''
    var s = String(raw).trim()
    if (!s) return ''

    var idx = s.indexOf('http')
    if (idx > 0) {
      s = s.slice(idx)
    }

    if (s.indexOf('place_holder_') === 0) {
      return ''
    }

    if (!/^https?:\/\//i.test(s)) {
      return ''
    }

    return s
  }

  function normalizeRecipes (items) {
    if (!Array.isArray(items)) return []
    return items
      .map(function (r, index) {
        var title = String(r.title || r.name || r.recipeTitle || '').trim()
        var slug = r.slug || slugify(title || 'ricetta-' + index)

        var tags = Array.isArray(r.tags)
          ? r.tags
              .map(function (t) { return String(t).toLowerCase().trim() })
              .filter(Boolean)
          : []

        var url = String(
          r.url ||
          r.link ||
          r.href ||
          r.recipeUrl ||
          ''
        ).trim()

        var img = sanitizeImageUrl(r.image || r.thumbnail || '')

        var ingredients = String(
          r.ingredients ||
          r.ingredienti ||
          r.ings ||
          ''
        ).toLowerCase()

        var directYt = String(
          r.youtubeId ||
          r.youtube_id ||
          r.ytId ||
          r.yt ||
          r.youtube ||
          ''
        ).trim()

        return {
          id: index,
          title: title,
          slug: slug,
          url: url,
          img: img,
          tags: tags,
          ingredients: ingredients,
          youtubeId: directYt,
          linkVerified: false,
          linkStatus: 'missing',
          videoVerified: false,
          videoStatus: 'missing'
        }
      })
      .filter(function (r) {
        return r.title
      })
  }

  function indexVideos (videos) {
    var map = {}
    var list = []
    if (!Array.isArray(videos)) return { map: map, list: list }

    videos.forEach(function (v) {
      var title = String(v.title || '').trim()
      var slug = String(v.slug || '').trim()
      var yt = String(v.youtubeId || v.ytId || v.yt || '').trim()
      var source = String(v.source || '').trim()
      var confidence = typeof v.confidence === 'number' ? v.confidence : 0

      if (!yt || confidence < 0.7) return

      var keySlug = slug ? slugify(slug) : ''
      var keyTitle = title ? slugify(title) : ''
      var key = keySlug || keyTitle
      if (!key) return

      var videoObj = {
        youtubeId: yt,
        title: title,
        key: key,
        source: source,
        confidence: confidence
      }

      if (!map[key] || confidence > map[key].confidence) {
        map[key] = videoObj
      }

      list.push(videoObj)
    })

    return { map: map, list: list }
  }

  function autoVerifyRecipe (recipe) {
    if (recipe.url) {
      var host = getHost(recipe.url)
      if (host && TRUSTED_RECIPE_DOMAINS.indexOf(host) !== -1) {
        recipe.linkVerified = true
        recipe.linkStatus = 'ok'
      } else if (host) {
        recipe.linkVerified = false
        recipe.linkStatus = 'untrusted'
      } else {
        recipe.linkVerified = false
        recipe.linkStatus = 'missing'
      }
    } else {
      recipe.linkVerified = false
      recipe.linkStatus = 'missing'
    }

    var video = findVideoForRecipe(recipe)

    if (video && video.youtubeId) {
      if (video.confidence >= 0.9) {
        recipe.videoVerified = true
        recipe.videoStatus = 'ok'
      } else if (video.confidence >= 0.7) {
        recipe.videoVerified = false
        recipe.videoStatus = 'weak'
      } else {
        recipe.videoVerified = false
        recipe.videoStatus = 'missing'
      }
    } else {
      recipe.videoVerified = false
      recipe.videoStatus = 'missing'
    }
  }

  function getHost (url) {
    try {
      var u = new URL(url)
      return u.host
    } catch (e) {
      return ''
    }
  }

  function findVideoForRecipe (recipe) {
    if (!recipe) return null

    if (recipe.youtubeId) {
      return {
        youtubeId: recipe.youtubeId,
        title: recipe.title || '',
        key: recipe.slug ? slugify(recipe.slug) : '',
        confidence: 1
      }
    }

    var keys = []
    if (recipe.slug) keys.push(slugify(recipe.slug))
    if (recipe.title) keys.push(slugify(recipe.title))

    var seen = {}
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i].trim()
      if (!key || seen[key]) continue
      seen[key] = true
      var exact = state.videosByKey[key]
      if (exact && exact.youtubeId) {
        return exact
      }
    }

    var tKey = recipe.title ? slugify(recipe.title) : ''
    if (!tKey || !state.videosList.length) return null

    var best = null
    var bestScore = 0

    state.videosList.forEach(function (v) {
      var k = v.key
      if (!k) return

      if (k === tKey) {
        var scoreEq = v.confidence + 0.2
        if (scoreEq > bestScore) {
          bestScore = scoreEq
          best = v
        }
        return
      }

      if (k.indexOf(tKey) !== -1 || tKey.indexOf(k) !== -1) {
        var scorePart = v.confidence * 0.9
        if (scorePart > bestScore) {
          bestScore = scorePart
          best = v
        }
      }
    })

    if (best && best.youtubeId && bestScore >= 0.75) {
      return best
    }

    return null
  }

  function onTagClick (e) {
    var btn = e.target
    if (!btn.classList.contains('chip')) return

    var tag = btn.dataset.tag

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
    var chips = elements.tagChips.querySelectorAll('.chip')
    var hasTags = state.activeTags.size > 0

    chips.forEach(function (chip) {
      var tag = chip.dataset.tag
      if (tag === 'all') {
        chip.classList.toggle('chip-active', !hasTags)
      } else {
        chip.classList.toggle('chip-active', state.activeTags.has(tag))
      }
    })
  }

  function applyFilters () {
    var text = state.searchText
    var activeTags = state.activeTags

    state.filteredRecipes = state.recipes.filter(function (r) {
      if (text) {
        var haystack = (r.title + ' ' + r.ingredients).toLowerCase()
        if (haystack.indexOf(text) === -1) return false
      }

      if (activeTags.size > 0) {
        var ok = true
        activeTags.forEach(function (tag) {
          if (r.tags.indexOf(tag) === -1) ok = false
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
      var card = buildRecipeCard(recipe)
      elements.recipesList.appendChild(card)
    })

    if (elements.recipesCount) {
      elements.recipesCount.textContent =
        state.filteredRecipes.length + ' ricette visibili'
    }
  }

  function buildRecipeCard (recipe) {
    var tpl = elements.recipeTemplate.content.cloneNode(true)
    var card = tpl.querySelector('.recipe-card')
    var imgEl = tpl.querySelector('.recipe-img')
    var titleEl = tpl.querySelector('.recipe-title')
    var sourceEl = tpl.querySelector('.recipe-source')
    var tagsEl = tpl.querySelector('.recipe-tags')
    var btnOpen = tpl.querySelector('.btn-open-recipe')
    var btnVideo = tpl.querySelector('.btn-open-video')
    var btnAdd = tpl.querySelector('.btn-add-list')

    titleEl.textContent = recipe.title

    if (recipe.linkStatus === 'ok') {
      sourceEl.textContent = 'Link verificato'
      sourceEl.className = 'recipe-source ok'
    } else if (recipe.linkStatus === 'untrusted') {
      sourceEl.textContent = 'Link da verificare'
      sourceEl.className = 'recipe-source warn'
    } else {
      sourceEl.textContent = 'Link non disponibile'
      sourceEl.className = 'recipe-source off'
    }

    if (recipe.tags && recipe.tags.length > 0) {
      tagsEl.textContent = 'Tag: ' + recipe.tags.join(', ')
    } else {
      tagsEl.textContent = ''
    }

    var video = findVideoForRecipe(recipe)
    var videoLabel = ''
    var videoClass = ''

    if (video && video.youtubeId) {
      if (video.confidence >= 0.9) {
        videoLabel = 'Video verificato'
        videoClass = 'ok'
      } else if (video.confidence >= 0.7) {
        videoLabel = 'Video da verificare'
        videoClass = 'warn'
      }
    } else {
      videoLabel = 'Video non disponibile'
      videoClass = 'off'
    }

    var fallbackImg = 'favicon.ico'

    if (recipe.img) {
      imgEl.src = recipe.img
    } else {
      imgEl.src = fallbackImg
    }

    imgEl.alt = recipe.title
    imgEl.onerror = function () {
      imgEl.onerror = null
      imgEl.src = fallbackImg
    }

    if (btnOpen) {
      if (recipe.url) {
        btnOpen.textContent = 'Apri ricetta'
        btnOpen.addEventListener('click', function () {
          window.open(recipe.url, '_blank', 'noopener')
        })
      } else {
        btnOpen.textContent = 'Link non disponibile'
        btnOpen.disabled = true
      }
    }

    if (btnVideo) {
      btnVideo.textContent = videoLabel
      btnVideo.classList.add(videoClass || 'off')

      if (video && video.youtubeId) {
        btnVideo.disabled = false
        btnVideo.addEventListener('click', function () {
          openVideoModal(video.youtubeId)
        })
      } else {
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
    var current = elements.ingredientsInput.value.trim()
    var line = recipe.title
    elements.ingredientsInput.value = current
      ? current + '\n' + line
      : line
  }

  function buildSuggestions () {
    if (!elements.ingredientsInput) return

    var raw = elements.ingredientsInput.value.toLowerCase()
    var tokens = tokenize(raw)

    if (tokens.length === 0) {
      state.suggestedRecipes = []
      renderSuggestions()
      return
    }

    var scored = state.recipes.map(function (r) {
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
    var base = (recipe.ingredients || '').toLowerCase()
    var score = 0
    tokens.forEach(function (t) {
      if (base.indexOf(t) !== -1) score += 1
    })
    return score
  }

  function renderSuggestions () {
    if (!elements.suggestList || !elements.recipeTemplate) return

    elements.suggestList.innerHTML = ''

    state.suggestedRecipes.forEach(function (recipe) {
      var card = buildRecipeCard(recipe)
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
      var stream = await navigator.mediaDevices.getUserMedia({ video: true })
      elements.cameraStream.srcObject = stream
      elements.ocrOutput.textContent = 'Inquadra testo e premi Scatta'
    } catch (e) {
      elements.ocrOutput.textContent = 'Accesso fotocamera negato'
    }
  }

  function stopCamera () {
    var video = elements.cameraStream
    if (video && video.srcObject && video.srcObject.getTracks) {
      var tracks = video.srcObject.getTracks()
      tracks.forEach(function (t) { t.stop() })
      video.srcObject = null
    }
  }

  function captureFrame () {
    var video = elements.cameraStream
    var canvas = elements.cameraCanvas
    if (!video || !canvas || !video.videoWidth) {
      elements.ocrOutput.textContent = 'Nessun frame disponibile'
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    var ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    elements.ocrOutput.textContent =
      'OCR demo, copia manualmente gli ingredienti riconosciuti'
  }

  function handleFileUpload (e) {
    var file = e.target.files[0]
    if (!file) return
    elements.ocrOutput.textContent =
      'Upload effettuato, leggi e incolla testo ingredienti'
  }

  function openVideoModal (youtubeId) {
    if (!elements.videoModal || !elements.videoModalBody) return

    elements.videoModalBody.innerHTML = ''
    elements.videoFallbackMsg.classList.add('hidden')

    var iframe = document.createElement('iframe')
    iframe.width = '560'
    iframe.height = '315'
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + youtubeId + '?autoplay=1'
    iframe.title = 'Video ricetta'
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
    iframe.setAttribute('allowfullscreen', 'true')

    var loaded = false

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
    var url = 'https://www.youtube.com/watch?v=' + youtubeId
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
