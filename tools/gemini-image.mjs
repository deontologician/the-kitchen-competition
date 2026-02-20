#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

// ── Auth ────────────────────────────────────────────────────────────────────

const CREDENTIALS_PATH = "/run/agenix/gemini-oauth-client";
const TOKEN_PATH = join(homedir(), ".local/share/wallpaper-gen/token.json");

async function getAccessToken() {
  const credRaw = await readFile(CREDENTIALS_PATH, "utf-8");
  const cred = JSON.parse(credRaw).installed;

  const tokenRaw = await readFile(TOKEN_PATH, "utf-8");
  const { refresh_token } = JSON.parse(tokenRaw);

  const res = await fetch(cred.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cred.client_id,
      client_secret: cred.client_secret,
      refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

// ── Gemini API ──────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "gemini-2.5-flash-image";

const GAME_STYLE = [
  "16-bit pixel art style, clean pixel outlines, limited color palette,",
  "accurate natural colors, charming and expressive, no anti-aliasing, crisp edges.",
  "For a kitchen restaurant competition game.",
].join(" ");

function applyStyle(prompt, raw) {
  return raw ? prompt : `${GAME_STYLE} ${prompt}`;
}

function fixExtension(filePath, actualExt) {
  const knownExts = [".png", ".jpg", ".jpeg", ".webp"];
  const current = knownExts.find((e) => filePath.toLowerCase().endsWith(e));
  if (current && current !== actualExt) {
    const fixed = filePath.slice(0, -current.length) + actualExt;
    console.error(`Note: model returned ${actualExt}, writing to ${fixed} instead of ${filePath}`);
    return fixed;
  }
  return filePath;
}

function detectMimeType(base64) {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

async function removeBackground(filePath) {
  // Use ImageMagick to flood-fill corners with transparency, then trim.
  // For pixel art with a solid/checkerboard background this works well:
  // 1. Convert to RGBA
  // 2. Flood-fill from all four corners with transparency (fuzz handles near-white/checkerboard)
  // 3. Flatten any remaining checkerboard artifacts
  console.error("Removing background with ImageMagick...");
  await execFileAsync("magick", [
    filePath,
    "-alpha", "set",
    "-fuzz", "15%",
    "-fill", "none",
    "-draw", "color 0,0 floodfill",
    "-draw", "color 0,%[fx:h-1] floodfill",
    "-draw", "color %[fx:w-1],0 floodfill",
    "-draw", "color %[fx:w-1],%[fx:h-1] floodfill",
    filePath,
  ]);
  console.error("Background removed.");
}

async function callGemini({ accessToken, model, prompt, imageBase64, aspectRatio }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const parts = [];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: detectMimeType(imageBase64), data: imageBase64 } });
  }
  parts.push({ text: prompt });

  const generationConfig = { responseModalities: ["image", "text"] };
  if (aspectRatio) {
    generationConfig.imageConfig = { aspectRatio };
  }

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errBody}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error("No candidates in response");
  }

  const imagePart = candidate.content?.parts?.find((p) => p.inlineData);
  if (!imagePart) {
    const textPart = candidate.content?.parts?.find((p) => p.text);
    const explanation = textPart ? textPart.text : JSON.stringify(candidate);
    throw new Error(`No image in response. Model said: ${explanation}`);
  }

  const mimeType = imagePart.inlineData.mimeType;
  const ext = mimeType === "image/png" ? ".png" : ".jpg";
  return { buffer: Buffer.from(imagePart.inlineData.data, "base64"), mimeType, ext };
}

// ── Commands ────────────────────────────────────────────────────────────────

async function generateCmd(args) {
  const { values } = parseArgs({
    args,
    options: {
      prompt: { type: "string" },
      output: { type: "string" },
      aspect: { type: "string" },
      model: { type: "string", default: DEFAULT_MODEL },
      raw: { type: "boolean", default: false },
      transparent: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (!values.prompt) throw new Error("--prompt is required");
  if (!values.output) throw new Error("--output is required");

  const promptSuffix = values.transparent ? " The background must be a single solid bright magenta (#FF00FF) color, with no other magenta anywhere in the image." : "";
  const styledPrompt = applyStyle(values.prompt + promptSuffix, values.raw);
  console.error(`Generating image with model ${values.model}...`);
  const accessToken = await getAccessToken();

  const result = await callGemini({
    accessToken,
    model: values.model,
    prompt: styledPrompt,
    aspectRatio: values.aspect,
  });

  const outPath = values.transparent
    ? fixExtension(values.output, ".png")
    : fixExtension(values.output, result.ext);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, result.buffer);
  console.error(`Wrote ${outPath} (${result.buffer.length} bytes, ${result.mimeType})`);

  if (values.transparent) {
    await removeBackground(outPath);
  }
}

async function editCmd(args) {
  const { values } = parseArgs({
    args,
    options: {
      prompt: { type: "string" },
      input: { type: "string" },
      output: { type: "string" },
      aspect: { type: "string" },
      model: { type: "string", default: DEFAULT_MODEL },
      raw: { type: "boolean", default: false },
      transparent: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (!values.prompt) throw new Error("--prompt is required");
  if (!values.input) throw new Error("--input is required");
  if (!values.output) throw new Error("--output is required");

  const promptSuffix = values.transparent ? " The background must be a single solid bright magenta (#FF00FF) color, with no other magenta anywhere in the image." : "";
  const styledPrompt = applyStyle(values.prompt + promptSuffix, values.raw);
  console.error(`Editing image with model ${values.model}...`);
  const accessToken = await getAccessToken();

  const inputBuffer = await readFile(values.input);
  const imageBase64 = inputBuffer.toString("base64");

  const result = await callGemini({
    accessToken,
    model: values.model,
    prompt: styledPrompt,
    imageBase64,
    aspectRatio: values.aspect,
  });

  const outPath = values.transparent
    ? fixExtension(values.output, ".png")
    : fixExtension(values.output, result.ext);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, result.buffer);
  console.error(`Wrote ${outPath} (${result.buffer.length} bytes, ${result.mimeType})`);

  if (values.transparent) {
    await removeBackground(outPath);
  }
}

async function animateCmd(args) {
  const { values } = parseArgs({
    args,
    options: {
      prompt: { type: "string" },
      "edit-prompt": { type: "string" },
      "output-dir": { type: "string" },
      frames: { type: "string", default: "4" },
      prefix: { type: "string", default: "frame" },
      aspect: { type: "string" },
      model: { type: "string", default: DEFAULT_MODEL },
      raw: { type: "boolean", default: false },
      transparent: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (!values.prompt) throw new Error("--prompt is required");
  if (!values["edit-prompt"]) throw new Error("--edit-prompt is required");
  if (!values["output-dir"]) throw new Error("--output-dir is required");

  const frameCount = parseInt(values.frames, 10);
  if (isNaN(frameCount) || frameCount < 2 || frameCount > 10) {
    throw new Error("--frames must be between 2 and 10");
  }

  const accessToken = await getAccessToken();
  await mkdir(values["output-dir"], { recursive: true });

  const pad = (n) => String(n).padStart(3, "0");
  const promptSuffix = values.transparent ? " The background must be a single solid bright magenta (#FF00FF) color, with no other magenta anywhere in the image." : "";

  // Frame 1: generate from text prompt
  const styledPrompt = applyStyle(values.prompt + promptSuffix, values.raw);
  const styledEditPrompt = applyStyle(values["edit-prompt"] + promptSuffix, values.raw);
  console.error(`Generating frame 1/${frameCount} with model ${values.model}...`);
  let prevResult = await callGemini({
    accessToken,
    model: values.model,
    prompt: `${styledPrompt} (frame 1 of ${frameCount})`,
    aspectRatio: values.aspect,
  });

  const frameExt = values.transparent ? ".png" : prevResult.ext;
  const frame1Path = join(values["output-dir"], `${values.prefix}-${pad(1)}${frameExt}`);
  await writeFile(frame1Path, prevResult.buffer);
  console.error(`Wrote ${frame1Path} (${prevResult.buffer.length} bytes, ${prevResult.mimeType})`);
  if (values.transparent) await removeBackground(frame1Path);

  // Frames 2..N: edit previous frame
  for (let i = 2; i <= frameCount; i++) {
    console.error(`Generating frame ${i}/${frameCount}...`);
    const editPrompt = `${styledEditPrompt} (frame ${i} of ${frameCount})`;

    // Re-read the previous frame (may have been modified by removeBackground)
    const prevBuffer = await readFile(
      join(values["output-dir"], `${values.prefix}-${pad(i - 1)}${frameExt}`)
    );

    prevResult = await callGemini({
      accessToken,
      model: values.model,
      prompt: editPrompt,
      imageBase64: prevBuffer.toString("base64"),
      aspectRatio: values.aspect,
    });

    const framePath = join(values["output-dir"], `${values.prefix}-${pad(i)}${frameExt}`);
    await writeFile(framePath, prevResult.buffer);
    console.error(`Wrote ${framePath} (${prevResult.buffer.length} bytes, ${prevResult.mimeType})`);
    if (values.transparent) await removeBackground(framePath);
  }

  console.error(`Animation complete: ${frameCount} frames in ${values["output-dir"]}`);
}

// ── Main ────────────────────────────────────────────────────────────────────

const COMMANDS = { generate: generateCmd, edit: editCmd, animate: animateCmd };

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || !COMMANDS[command]) {
    console.error(`Usage: gemini-image.mjs <command> [options]

Commands:
  generate  Generate a new image from a text prompt
  edit      Edit an existing image with a text prompt
  animate   Generate animation frames (sequential edits)

Examples:
  generate --prompt "pixel art chef, 64x64" --output chef.png
  edit --prompt "add a hat" --input chef.png --output chef-hat.png
  animate --prompt "chef stirring" --edit-prompt "next frame" --output-dir frames --frames 4

Common flags:
  --aspect       Aspect ratio (omit for model default)
  --model        Gemini model (default: "${DEFAULT_MODEL}")
  --prefix       Animation frame prefix (default: "frame")
  --raw          Skip the built-in game style prefix
  --transparent  Remove background (requires ImageMagick)
`);
    process.exit(command ? 1 : 0);
  }

  await COMMANDS[command](rest);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
