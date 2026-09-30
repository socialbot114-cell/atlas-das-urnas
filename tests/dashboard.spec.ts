import { expect, test } from "@playwright/test";

test("carrega os indicadores, alterna UF e tema e pesquisa município", async ({ page }) => {
  const pageErrors: string[] = [];
  const workerErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Worker failed to load")) workerErrors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atlas das Urnas" })).toBeVisible();
  await expect(page.getByText("2.206.996", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Regiões administrativas" })).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  expect((await page.request.get("/maplibre-gl-worker.mjs")).ok()).toBeTruthy();

  await page.getByRole("button", { name: "São Paulo" }).click();
  await expect(page.getByText(/São Paulo: Jair Bolsonaro lidera presidente/)).toBeVisible();
  await expect(page.getByText("12.239.989")).toBeVisible();

  await page.getByRole("button", { name: "Escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const search = page.getByPlaceholder("Candidato, município, RA, zona ou local");
  await search.fill("Mogi Mirim");
  await page.getByRole("button", { name: /Mogi Mirim/ }).first().click();
  await expect(page.getByText(/Mogi Mirim:/)).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(workerErrors).toEqual([]);
});

test("pesquisa zona e RA e abre o modal de microdados da zona", async ({ page }) => {
  await page.goto("/");
  const search = page.getByPlaceholder("Candidato, município, RA, zona ou local");
  await search.fill("Zona 15");
  await page.getByRole("button", { name: /Zona 15/ }).first().click();
  const dialog = page.getByRole("dialog", { name: /Zona 15/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Resultado na zona")).toBeVisible();
  await expect(dialog.getByRole("columnheader", { name: "Votos" })).toBeVisible();
  await dialog.getByPlaceholder("Pesquisar candidato ou partido").fill("Lula");
  await expect(dialog.getByText("Lula", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Jair Bolsonaro", { exact: true })).toHaveCount(0);

  await dialog.getByRole("tab", { name: "Locais de votação" }).click();
  await expect(dialog.getByRole("columnheader", { name: "Local de votação" })).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar detalhes da zona" }).click();

  await search.fill("RA Taguatinga");
  await page.getByRole("button", { name: /Taguatinga/ }).first().click();
  await expect(page.locator(".context-bar")).toContainText("Taguatinga");
});

test("layout mobile não ultrapassa a largura da tela", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atlas das Urnas" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test("vistas compartilham filtros, comparação e URL podem ser restauradas", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("navigation", { name: "Vistas do atlas" }).getByRole("button", { name: /Território/ }).click();
  await expect(page.getByRole("heading", { name: "Do maior para o menor" })).toBeVisible();
  await page.getByRole("button", { name: /Taguatinga.*aptos/ }).first().click();
  await expect(page.locator(".reading")).toContainText("Taguatinga");
  await expect(page).toHaveURL(/vista=territorio.*ra=/);

  await page.getByRole("navigation", { name: "Vistas do atlas" }).getByRole("button", { name: /Comparar/ }).click();
  await expect(page.getByRole("heading", { name: "Dois candidatos, lado a lado." })).toBeVisible();
  await expect(page.locator(".comparison-card")).toHaveCount(2);
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: "Dois candidatos, lado a lado." })).toBeVisible();
  await expect(page.locator(".context-bar")).toContainText("Taguatinga");
  expect(errors).toEqual([]);
});

test("zona de SP é selecionada por município e funciona no mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "São Paulo" }).click();
  await page.getByRole("navigation", { name: "Vistas do atlas" }).getByRole("button", { name: /Zonas e locais/ }).click();
  await page.getByLabel("Escolha um município de São Paulo").selectOption({ label: "São Paulo" });
  await expect(page.getByRole("heading", { name: "Zonas eleitorais" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zonas com maior abstenção" })).toBeVisible();
  await expect(page.locator(".zone-row").first()).toContainText("Zona");
  await page.locator(".zone-row .zone-open").first().click();
  await expect(page.getByRole("dialog", { name: /Zona/ })).toBeVisible();
  await page.getByRole("dialog").getByRole("tab", { name: "Locais de votação" }).click();
  await expect(page.getByRole("dialog").getByRole("columnheader", { name: "Local de votação" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test("não apresenta votos parciais por local como resultado completo", async ({ page }) => {
  await page.goto("/?vista=zonas");
  await page.getByLabel("Cargo").selectOption("Deputado Federal");
  const search = page.getByPlaceholder("Candidato, município, RA, zona ou local");
  await search.fill("RA Taguatinga");
  await page.getByRole("button", { name: /Taguatinga/ }).first().click();
  await expect(page.getByText(/O cruzamento RA × zona para este cargo/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zonas eleitorais" })).toHaveCount(0);
  await page.getByRole("button", { name: /Recorte:.*ver tudo/ }).click();
  await expect(page.getByRole("heading", { name: "Zonas eleitorais" })).toBeVisible();
  await page.locator(".zone-row .zone-open").first().click();
  await expect(page.getByRole("dialog").getByText(/resultado de candidatos está consolidado para a zona/)).toBeVisible();
});
