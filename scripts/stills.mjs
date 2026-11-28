// Render QA stills: node scripts-stills.mjs <composition> <outDir> <frames...>
import { bundle } from "@remotion/bundler";
import fs from "node:fs";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
const [comp = "PaperPlane4x5", outDir = "out/qa", ...framesArg] = process.argv.slice(2);
const frames = framesArg.length ? framesArg.map(Number) : [15, 90, 170, 200, 230, 265, 300, 340, 355];
fs.mkdirSync(outDir, { recursive: true });
const BX = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const envVariables = {};
if (process.env.REMOTION_NOFX) envVariables.REMOTION_NOFX = "1";
if (process.env.REMOTION_FX !== undefined) envVariables.REMOTION_FX = process.env.REMOTION_FX;
const tag = process.env.TAG ?? "";
const composition = await selectComposition({ serveUrl, id: comp, browserExecutable: BX, chromiumOptions: { gl: "swangle" }, envVariables });
for (const frame of frames) {
  const t = Date.now();
  await renderStill({ serveUrl, composition, frame, output: path.join(outDir, `${comp}${tag}-f${String(frame).padStart(3, "0")}.png`), browserExecutable: BX, chromiumOptions: { gl: "swangle" }, envVariables, imageFormat: "png" });
  console.log("frame", frame, Date.now() - t, "ms");
}
