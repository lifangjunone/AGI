package registry

import (
	"github.com/nexora-suite/nexora-runtime/adapters"
	"github.com/nexora-suite/nexora-runtime/adapters/claude"
	"github.com/nexora-suite/nexora-runtime/adapters/codex"
	"github.com/nexora-suite/nexora-runtime/adapters/custom"
	"github.com/nexora-suite/nexora-runtime/adapters/deepseek"
	"github.com/nexora-suite/nexora-runtime/adapters/hermes"
	"github.com/nexora-suite/nexora-runtime/adapters/native"
	"github.com/nexora-suite/nexora-runtime/adapters/openclaw"
	"github.com/nexora-suite/nexora-runtime/adapters/qwenpaw"
	"github.com/nexora-suite/nexora-runtime/adapters/trae"
	"github.com/nexora-suite/nexora-runtime/adapters/workbuddy"
)

type Registry struct {
	ordered []adapters.Adapter
	byID    map[string]adapters.Adapter
}

func New(extra ...adapters.Adapter) *Registry {
	items := []adapters.Adapter{
		native.New(), hermes.New(), openclaw.New(), qwenpaw.New(), workbuddy.New(),
		trae.New(), deepseek.New(), codex.New(), claude.New(), custom.New(),
	}
	items = append(items, extra...)
	result := &Registry{ordered: items, byID: make(map[string]adapters.Adapter, len(items))}
	for _, item := range items {
		result.byID[item.Descriptor().ID] = item
	}
	return result
}

func (r *Registry) Get(id string) (adapters.Adapter, bool) {
	item, ok := r.byID[id]
	return item, ok
}

// Register installs a validated declaration using a generic protocol transport.
// Catalogs are loaded at startup, before the registry is used by requests.
func (r *Registry) Register(item adapters.Adapter) {
	id := item.Descriptor().ID
	for i, existing := range r.ordered {
		if existing.Descriptor().ID == id {
			r.ordered[i] = item
			r.byID[id] = item
			return
		}
	}
	r.ordered = append(r.ordered, item)
	r.byID[id] = item
}

func (r *Registry) Descriptors() []adapters.Descriptor {
	items := make([]adapters.Descriptor, 0, len(r.ordered))
	for _, item := range r.ordered {
		items = append(items, item.Descriptor())
	}
	return items
}
