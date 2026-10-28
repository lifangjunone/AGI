(() => {
  const adminApp = document.querySelector('[data-admin-app]')
  if (adminApp) {
    const viewTitles = {
      overview: '平台总览',
      users: '账号管理',
      products: '产品访问',
      heat: '产品运营看板',
      audit: '操作审计',
    }
    const views = [...adminApp.querySelectorAll('[data-admin-view]')]
    const navItems = [...adminApp.querySelectorAll('.admin-nav [data-admin-target]')]
    const title = adminApp.querySelector('[data-admin-title]')
    const stateKey = 'lifeyoume.admin.tables'
    let tableState = {}
    try { tableState = JSON.parse(sessionStorage.getItem(stateKey) || '{}') } catch {}
    const saveTableState = () => {
      try { sessionStorage.setItem(stateKey, JSON.stringify(tableState)) } catch {}
    }

    const activateView = () => {
      const requested = window.location.hash.slice(1)
      const active = viewTitles[requested] ? requested : 'overview'
      views.forEach((view) => {
        view.hidden = view.dataset.adminView !== active
      })
      navItems.forEach((item) => {
        const selected = item.dataset.adminTarget === active
        item.classList.toggle('active', selected)
        item.setAttribute('aria-current', selected ? 'page' : 'false')
      })
      if (title) title.textContent = viewTitles[active]
    }

    adminApp.querySelectorAll('[data-admin-table]').forEach((panel) => {
      const tableId = panel.dataset.adminTable
      const rows = [...panel.querySelectorAll('[data-admin-row]')]
      const search = adminApp.querySelector(`[data-admin-search="${tableId}"]`)
      const result = panel.querySelector('[data-admin-result]')
      const pageLabel = panel.querySelector('[data-admin-page]')
      const previous = panel.querySelector('[data-admin-prev]')
      const next = panel.querySelector('[data-admin-next]')
      const pageSize = Number(panel.dataset.pageSize || 7)
      const headers = [...panel.querySelectorAll('thead th')].map((th) => th.textContent)
      rows.forEach((row) => [...row.cells].forEach((cell, index) => {
        cell.dataset.label = headers[index] || ''
      }))
      let page = tableState[tableId]?.page || 0
      if (search) search.value = tableState[tableId]?.search || ''
      const empty = document.createElement('p')
      empty.className = 'admin-empty'
      empty.textContent = '没有匹配记录，请尝试其他关键词。'
      panel.querySelector('.admin-table-wrap')?.append(empty)

      const render = () => {
        const term = (search?.value || '').trim().toLocaleLowerCase()
        const matches = rows.filter((row) =>
          !term || (row.dataset.search || '').toLocaleLowerCase().includes(term)
        )
        const pageCount = Math.max(1, Math.ceil(matches.length / pageSize))
        page = Math.min(page, pageCount - 1)
        const visible = new Set(matches.slice(page * pageSize, (page + 1) * pageSize))
        rows.forEach((row) => {
          row.hidden = !visible.has(row)
        })
        if (result) result.textContent = `共 ${matches.length} 条`
        if (pageLabel) pageLabel.textContent = `${page + 1} / ${pageCount}`
        if (previous) previous.disabled = page === 0
        if (next) next.disabled = page >= pageCount - 1
        empty.hidden = matches.length > 0
        tableState[tableId] = { page, search: search?.value || '' }
        saveTableState()
      }

      search?.addEventListener('input', () => {
        page = 0
        render()
      })
      previous?.addEventListener('click', () => {
        page = Math.max(0, page - 1)
        render()
      })
      next?.addEventListener('click', () => {
        page += 1
        render()
      })
      render()
    })

    // Keep the server-rendered, CSRF-protected forms as the source of truth.
    // Failed saves retain the current page and input rather than opening raw JSON.
    adminApp.querySelectorAll('form[action^="/admin/"]').forEach((form) => {
      if (form.action.endsWith('/logout')) return
      form.addEventListener('submit', async (event) => {
        if (!form.checkValidity()) return
        event.preventDefault()
        if (form.dataset.saving === 'true') return
        form.dataset.saving = 'true'
        const button = form.querySelector('button[type="submit"]')
        const original = button?.textContent
        const feedback = form.querySelector('.form-feedback') || document.createElement('p')
        feedback.className = 'form-feedback'
        feedback.setAttribute('role', 'alert')
        feedback.textContent = ''
        if (!feedback.parentElement) form.append(feedback)
        const data = new URLSearchParams(new FormData(form))
        if (button) { button.disabled = true; button.textContent = '正在保存…' }
        try {
          const response = await fetch(form.action, {
            method: 'POST', body: data, credentials: 'same-origin',
          })
          if (!response.ok) {
            const errors = {
              400: '输入无效，请检查范围与格式后重试。',
              403: '会话或安全凭证已过期，请刷新页面后重试。',
              404: '记录已不存在，请刷新后确认。',
              429: '操作过于频繁，请稍后再试。',
            }
            throw new Error(errors[response.status] || '保存失败，请稍后重试。')
          }
          if (response.redirected && response.url.includes('ok=')) {
            const destination = new URL(response.url)
            destination.hash = form.closest('[data-admin-view]')?.dataset.adminView || 'overview'
            window.location.assign(destination)
          } else {
            throw new Error('登录状态可能已过期，请在新标签页重新登录后重试。')
          }
        } catch (error) {
          feedback.textContent = error.message || '网络连接失败，输入已保留。'
          form.dataset.saving = 'false'
          if (button) { button.disabled = false; button.textContent = original }
        }
      })
    })
    window.addEventListener('hashchange', activateView)
    activateView()
  }

  // Carry only a same-origin catalog path; never trust a return URL as a redirect.
  const returnPath = new URLSearchParams(location.search).get('return')
  if (returnPath) {
    try {
      const destination = new URL(returnPath, location.origin)
      if (destination.origin === location.origin && destination.pathname === '/products') {
        document.querySelectorAll('[data-catalog-back]').forEach((link) => {
          link.href = destination.pathname + destination.search + '#explore'
        })
      }
    } catch { /* Keep the server-rendered default link. */ }
  }

  const grid = document.querySelector('#product-grid')
  if (!grid) return

  const cards = [...grid.querySelectorAll('.product-card')]
  const buttons = [...document.querySelectorAll('[data-category-filter]')]
  const search = document.querySelector('#product-search')
  const count = document.querySelector('#visible-count')
  const empty = document.querySelector('#catalog-empty')
  const availability = document.querySelector('#product-availability')
  const reset = document.querySelector('#catalog-reset')
  let params = new URLSearchParams(window.location.search)
  let requestedScope = params.get('scope')
  let activeCategory = params.get('category') || '全部'
  if (!buttons.some((button) => button.dataset.categoryFilter === activeCategory)) activeCategory = '全部'
  if (search) search.value = params.get('q') || ''
  const showroom = document.body.classList.contains('showroom-page')
  const readAvailability = () => {
    const requested = showroom && requestedScope === 'lab'
      ? 'lab' : params.get('availability') || 'all'
    if (availability) {
      availability.value = [...availability.options].some((option) => option.value === requested)
        ? requested : 'all'
    }
  }
  readAvailability()

  const updateDetailLinks = () => {
    document.querySelectorAll('[data-detail-link]').forEach((link) => {
      const url = new URL(link.href)
      url.searchParams.set('return', '/products' + location.search)
      link.href = url.pathname + url.search
    })
  }
  const apply = (updateUrl = true, push = false) => {
    const term = (search?.value || '').trim().toLocaleLowerCase()
    let visible = 0
    cards.forEach((card) => {
      const matchesCategory = activeCategory === '全部'
        || card.dataset.category === activeCategory
      const matchesScope = requestedScope !== 'lab' || card.dataset.scope === 'lab'
      const matchesSearch = !term
        || (card.dataset.search || '').toLocaleLowerCase().includes(term)
      const matchesEntry = !availability || availability.value === 'all'
        || (availability.value === 'lab' ? card.dataset.scope === 'lab'
          : availability.value === 'open' ? card.dataset.entry === 'true' : card.dataset.entry === 'false')
      const show = matchesCategory && matchesScope && matchesSearch && matchesEntry
      card.hidden = !show
      if (show) visible += 1
    })
    if (count) count.textContent = String(visible)
    if (empty) empty.hidden = visible !== 0
    buttons.forEach((button) => {
      const selected = button.dataset.categoryFilter === activeCategory
      button.classList.toggle('active', selected)
      button.setAttribute('aria-pressed', String(selected))
    })
    if (updateUrl) {
      const url = new URL(window.location.href)
      const values = { category: activeCategory === '全部' ? '' : activeCategory, q: search?.value || '',
        availability: availability?.value === 'all' || availability?.value === 'lab' ? '' : availability?.value,
        scope: showroom ? (availability?.value === 'lab' ? 'lab' : '') : requestedScope }
      Object.entries(values).forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key))
      if (url.href !== location.href) {
        history[push ? 'pushState' : 'replaceState'](null, '', url)
      }
    }
    updateDetailLinks()
  }

  buttons.forEach((button) => {
    const isActive = button.dataset.categoryFilter === activeCategory
    button.classList.toggle('active', isActive)
    button.setAttribute('aria-pressed', String(isActive))
    button.addEventListener('click', () => {
      activeCategory = button.dataset.categoryFilter || '全部'
      buttons.forEach((item) => {
        const active = item === button
        item.classList.toggle('active', active)
        item.setAttribute('aria-pressed', String(active))
      })
      apply(true, true)
    })
  })

  search?.addEventListener('input', () => apply())
  availability?.addEventListener('change', () => {
    if (showroom) requestedScope = null
    apply(true, true)
  })
  const resetFilters = () => {
    activeCategory = '全部'
    requestedScope = null
    if (search) search.value = ''
    if (availability) availability.value = 'all'
    apply(true, true)
    search?.focus()
  }
  reset?.addEventListener('click', resetFilters)
  document.querySelectorAll('[data-reset-filters]').forEach((button) => button.addEventListener('click', resetFilters))
  document.querySelector('#catalog-clear')?.addEventListener('click', () => {
    if (search) search.value = ''
    apply()
    search?.focus()
  })
  window.addEventListener('popstate', () => {
    params = new URLSearchParams(window.location.search)
    activeCategory = params.get('category') || '全部'
    if (!buttons.some((button) => button.dataset.categoryFilter === activeCategory)) activeCategory = '全部'
    requestedScope = params.get('scope')
    if (search) search.value = params.get('q') || ''
    readAvailability()
    apply(false)
  })
  apply()
})()
