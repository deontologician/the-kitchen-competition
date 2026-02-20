# Asset Generation (Gemini Image Tool)

Uses Google Gemini API via OAuth tokens shared with the `wallpaper-gen` app.

```bash
# Generate a new image
npm run img:generate -- --prompt "pixel art chef, 64x64, transparent bg" --output public/assets/chef.png

# Edit an existing image
npm run img:edit -- --prompt "add a chef hat" --input public/assets/chef.png --output public/assets/chef-hat.png

# Generate animation frames
npm run img:animate -- --prompt "chef stirring, frame 1 of 4" \
  --edit-prompt "next frame of stirring animation" \
  --output-dir public/assets/chef-stir --frames 4
```

**Flags:** `--aspect` (aspect ratio, omit for model default), `--model` (default `gemini-2.5-flash-image`; alt: `gemini-3-pro-image-preview`, `gemini-2.0-flash-exp-image-generation`), `--prefix` (animation frame prefix, default `frame`), `--raw` (skip the built-in game style prefix), `--transparent` (remove background via ImageMagick flood-fill, outputs RGBA PNG)

**Style:** All prompts are automatically prefixed with a 16-bit pixel art style directive for visual consistency. Use `--raw` to bypass this for non-game assets.

**Transparency:** Use `--transparent` for game sprites. Requires `imagemagick` (in `shell.nix`). The model generates a solid-color background, then ImageMagick flood-fills from corners to produce real alpha. Default model is `gemini-2.5-flash-image` (returns PNG; `gemini-3-pro-image-preview` returns JPEG, which is lossy).
