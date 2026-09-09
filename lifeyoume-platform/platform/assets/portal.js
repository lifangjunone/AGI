(() => {
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
