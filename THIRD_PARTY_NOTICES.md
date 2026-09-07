# Third-party notices

Tyche original source, scenario text, and included generated artwork are offered under the repository MIT license. Third-party software keeps its own license.

- Preact: MIT, copyright Preact developers. https://github.com/preactjs/preact
- Three.js: MIT, copyright three.js authors. https://github.com/mrdoob/three.js
- Vite, TypeScript, Vitest and the build toolchain retain their upstream licenses. They are used for development and bundling.
- Biome and Playwright are development-only tools and retain their upstream licenses. Neither their runtimes nor browser binaries are shipped with the game.
- The production app uses system fonts. No third-party font service or analytics script is loaded.
- `public/art/` contains original AI-generated illustrations. No commercial game's characters, textures, screenshots, logos or audio are bundled.
- `public/audio/voice/` contains dialogue generated offline with Qwen3-TTS CustomVoice preset voices and original character directions. No reference recordings of real people or commercial characters are used. The [upstream Qwen3-TTS model](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice) is licensed under Apache-2.0; its model weights are not bundled or relicensed by this repository.
- `public/audio/music/` contains original, deterministic programmatically composed music. The composition source is included in `scripts/compose-score.py`; no sampled third-party music is included. These original music assets and dialogue scripts are offered under the repository MIT license.
- Offline speech transcription uses Qwen3-ASR for quality checks. Its weights and the local MLX Audio / FFmpeg production runtime are not shipped with the browser game and retain their upstream licenses.
- `public/audio/pilot/` contains local Qwen3-TTS voice auditions made with the same preset-voice workflow. Auditions, the quality-control manifest and voice files absent from the current playback index are excluded from the published site; their local files are retained.

The MIT license texts for bundled Preact and Three.js are included in `public/licenses/` and shipped with the site.
