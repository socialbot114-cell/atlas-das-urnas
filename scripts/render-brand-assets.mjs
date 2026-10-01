import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const publicDir = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("app-icon.svg", publicDir), "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>body{margin:0;background:#18242b}svg{display:block;width:100%;height:100%}</style>${svg}`);
    const name = size === 180 ? "apple-touch-icon.png" : `app-icon-${size}.png`;
    await page.screenshot({ path: fileURLToPath(new URL(name, publicDir)) });
  }
  const font = async (name) => (await readFile(new URL(`fonts/${name}-latin-variable.woff2`, publicDir))).toString("base64");
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<style>
    @font-face{font-family:Fraunces;src:url(data:font/woff2;base64,${await font("fraunces")});font-weight:100 900}
    @font-face{font-family:Outfit;src:url(data:font/woff2;base64,${await font("outfit")});font-weight:100 900}
    *{box-sizing:border-box}body{margin:0;background:#f6f4ef;color:#18242b;font-family:Outfit;padding:56px 66px;height:630px}
    header{display:flex;align-items:center;gap:15px;font-size:24px;font-weight:500}header svg{width:46px;height:46px}
    .kicker{margin-top:65px;color:#906745;font-size:15px;letter-spacing:3px}h1{font:550 84px/1.02 Fraunces;margin:18px 0 24px;letter-spacing:-3px}h1 span{color:#286f73}
    p{font-size:23px;color:#58666b;max-width:800px;line-height:1.5}footer{border-top:1px solid #dce1dc;padding-top:20px;margin-top:38px;color:#58666b;font-size:15px;letter-spacing:1px}
  </style><header>${svg}Atlas das Urnas</header><div class="kicker">TERRITÓRIO · MICRODADOS · CONTEXTO</div><h1>O voto tem<br><span>um território.</span></h1><p>Resultados oficiais de 2022, da visão territorial<br>às zonas e aos locais de votação.</p><footer>DISTRITO FEDERAL + SÃO PAULO &nbsp; / &nbsp; 1º TURNO · DADOS DO TSE</footer>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: fileURLToPath(new URL("og.png", publicDir)) });
  console.log("Generated application icons and 1200×630 sharing image.");
} finally { await browser.close(); }
