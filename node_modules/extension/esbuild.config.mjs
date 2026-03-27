import esbuild from "esbuild";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWatch = process.argv.includes("--watch");

const srcDir = path.join(__dirname, "src");
const outDir = path.join(__dirname, "dist");

async function ensureCleanOutDir() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
}

async function copyStaticFiles() {
  const files = ["manifest.json", "popup.html", "options.html", "styles.css"];
  await Promise.all(
    files.map(async (name) => {
      const from = path.join(srcDir, name);
      const to = path.join(outDir, name);
      const content = await fs.readFile(from);
      await fs.writeFile(to, content);
    })
  );
}

await ensureCleanOutDir();
await copyStaticFiles();

const ctx = await esbuild.context({
  entryPoints: [path.join(srcDir, "popup.ts"), path.join(srcDir, "options.ts"), path.join(srcDir, "background.ts")],
  bundle: true,
  outdir: outDir,
  format: "iife",
  target: ["chrome120"],
  sourcemap: true,
  logLevel: "info"
});

if (isWatch) {
  await ctx.watch();
  console.log("Watching extension...");
} else {
  await ctx.rebuild();
  await ctx.dispose();
}

