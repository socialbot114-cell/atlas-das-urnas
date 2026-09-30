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
  await expect(page.locator(".reading")).toContainText("Taguatinga");
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
