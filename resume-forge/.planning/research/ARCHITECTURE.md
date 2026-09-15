# Architecture Research

```text
React workbench
  ├─ Resume document state
  ├─ JD keyword analysis
  ├─ Evidence bullet analysis
  ├─ A4 semantic preview
  └─ HTML export
       │
       └─ localStorage persistence
```

The document model is independent from React so scoring and export remain testable. UI updates one normalized resume object; analysis functions derive all scores without persisting duplicate state. The exported document escapes user text and contains no scripts.

Build order: data model -> analysis -> editor -> preview/export -> responsive and browser verification.
