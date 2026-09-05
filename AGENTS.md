# Tyche

Original Chinese single-player browser roguelike. Static Vite + TypeScript + Preact application; GitHub Pages at /tyche/. All characters, institutions, medicine, regulations and outcomes are fictional.

- Keep game-visible text in Chinese and in-world. No implementation, design, testing, model, draft or handoff narration in UI, event prose or endings.
- Keep the game engine deterministic and independent of rendering. Commit a choice once; replaying, refreshing or presenting a roll never applies it twice.
- All global tuning values live in src/game/rules.ts and must remain aligned with docs/design/01_核心机制与数值.md.
- Scope evidence and hazards to the actual patient, project or event. Kindness does not inherit another character's crime. Actor knowledge requires a source.
- Support portrait and landscape touch input, keyboard interaction, reduced motion, local saves, and graceful storage/WebGL failure.
- Do not reproduce any comparator game's text, case titles, talent names or assets. Do not include self-harm methods or steps.
- Run npm test, npm run check:content, npm run simulate and npm run build before publishing. Keep fixtures and test-only controls outside player UI.
- Stage this repository only, never the parent writing project. Never commit credentials, local saves, personal paths or generated build output.
