(() => {
  const adminApp = document.querySelector('[data-admin-app]')
  if (adminApp) {
    const viewTitles = {
      overview: '平台总览',
      users: '账号管理',
      products: '产品登录',
      audit: '操作审计',
    }
    const views = [...adminApp.querySelectorAll('[data-admin-view]')]
    const navItems = [...adminApp.querySelectorAll('.admin-nav [data-admin-target]')]
    const title = adminApp.querySelector('[data-admin-title]')

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
      let page = 0

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

    window.addEventListener('hashchange', activateView)
    activateView()
  }

  const grid = document.querySelector('#product-grid')
  if (!grid) return

  const cards = [...grid.querySelectorAll('.product-card')]
  const buttons = [...document.querySelectorAll('[data-category-filter]')]
  const search = document.querySelector('#product-search')
  const count = document.querySelector('#visible-count')
  const empty = document.querySelector('#catalog-empty')
  const params = new URLSearchParams(window.location.search)
  const requestedCategory = params.get('category')
  const requestedScope = params.get('scope')
  let activeCategory = requestedCategory || '全部'

  const apply = () => {
    const term = (search?.value || '').trim().toLocaleLowerCase()
    let visible = 0
    cards.forEach((card) => {
      const matchesCategory = activeCategory === '全部'
        || card.dataset.category === activeCategory
      const matchesScope = requestedScope !== 'lab' || card.dataset.scope === 'lab'
      const matchesSearch = !term
        || (card.dataset.search || '').toLocaleLowerCase().includes(term)
      const show = matchesCategory && matchesScope && matchesSearch
      card.hidden = !show
      if (show) visible += 1
    })
    if (count) count.textContent = String(visible)
    if (empty) empty.hidden = visible !== 0
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
      apply()
    })
  })

  search?.addEventListener('input', apply)
  apply()
})()
