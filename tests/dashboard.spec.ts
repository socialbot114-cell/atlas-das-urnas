import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  if (!testInfo.title.startsWith("onboarding:")) {
    await page.addInitScript(() => window.localStorage.setItem("atlas-intro-cinema-v1", "complete"));
  }
});

test("carrega os indicadores, alterna UF e tema e pesquisa município", async ({ page }) => {
  const pageErrors: string[] = [];
  const workerErrors: string[] = [];
  const spPointRequests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => { if (request.url().includes("/data/sp-pontos.json")) spPointRequests.push(request.url()); });
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Worker failed to load")) workerErrors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Atlas das Urnas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /O voto tem um território/ })).toBeVisible();
  await expect(page.getByText("2.206.996", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Vistas do atlas" }).getByRole("button", { name: /Território/ }).click();
  await expect(page.getByRole("heading", { name: "Regiões administrativas" })).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  expect((await page.request.get("/maplibre-gl-worker.mjs")).ok()).toBeTruthy();

  await page.getByRole("button", { name: "São Paulo" }).click();
  await expect(page.getByText(/São Paulo: Jair Bolsonaro lidera presidente/)).toBeVisible();
  await expect.poll(() => spPointRequests.length).toBeGreaterThan(0);
  expect(spPointRequests).toHaveLength(1);
  await page.getByRole("navigation", { name: "Vistas do atlas" }).getByRole("button", { name: /Análise/ }).click();
  await expect(page.getByRole("cell", { name: "12.239.989", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Ativar tema escuro" }).click();
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
  await expect(dialog.locator(".zone-results-table").getByText("Jair Bolsonaro", { exact: true })).toHaveCount(0);

  await dialog.getByRole("tab", { name: "Locais de votação" }).click();
  await expect(dialog.getByRole("columnheader", { name: "Local de votação" })).toBeVisible();
  await expect(dialog.locator(".local-candidate-row").nth(0)).toBeVisible();
  await expect(dialog.locator(".local-candidate-row").nth(1)).toBeVisible();
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
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Zonas" }).click();
  await page.getByRole("button", { name: /Município.*Escolha sua cidade/ }).click();
  await page.getByLabel("Buscar município de São Paulo").fill("São Paulo");
  await page.getByRole("dialog", { name: "Escolher município" }).getByRole("button", { name: /São Paulo.*eleitores/ }).first().click();
  await expect(page.locator(".zone-browser")).toBeVisible();
  await expect(page.getByText("Ver distribuição da abstenção")).toBeVisible();
  const zoneCard = page.locator(".zone-card").first();
  await expect(zoneCard).toContainText("Zona");
  await expect(zoneCard.locator(".zone-card-leader-share b")).toHaveText(/\d+[,.]\d+%/);
  await expect(zoneCard.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "100");
  await expect(zoneCard.locator(".zone-card-denominator")).toContainText("votos nominais");
  await zoneCard.click();
  await expect(page.getByRole("dialog", { name: /Zona/ })).toBeVisible();
  await expect(page.locator(".mobile-tabbar")).toBeHidden();
  await page.getByRole("dialog").getByRole("tab", { name: "Locais de votação" }).click();
  await expect(page.getByRole("dialog").getByRole("columnheader", { name: "Local de votação" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  await page.getByRole("dialog").getByRole("button", { name: "Fechar detalhes da zona" }).click();
  await expect(page.locator(".mobile-tabbar")).toBeVisible();
});

test("não apresenta votos parciais por local como resultado completo", async ({ page }) => {
  await page.goto("/?vista=zonas");
  await page.locator(".toolbar").getByLabel("Cargo").selectOption("Deputado Federal");
  const search = page.getByPlaceholder("Candidato, município, RA, zona ou local");
  await search.fill("RA Taguatinga");
  await page.getByRole("button", { name: /Taguatinga/ }).first().click();
  await expect(page.getByText(/O cruzamento RA × zona para este cargo/)).toBeVisible();
  await expect(page.locator(".zone-card")).toHaveCount(0);
  await page.getByRole("button", { name: /Recorte:.*ver tudo/ }).click();
  await expect(page.locator(".zone-browser")).toBeVisible();
  await page.getByRole("group", { name: "Exibição das zonas" }).getByRole("button", { name: "Tabela" }).click();
  await page.locator(".desktop-zone-table .zone-open").first().click();
  await expect(page.getByRole("dialog").getByText(/resultado de candidatos está consolidado para a zona/)).toBeVisible();
});

test("mobile oferece navegação fixa, ajustes recolhíveis e respeita área segura", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tabbar = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(tabbar).toBeVisible();
  await expect(tabbar.getByRole("button", { name: "Início" })).toHaveAttribute("aria-current", "page");
  await tabbar.getByRole("button", { name: "Mapa" }).click();
  await page.locator(".mobile-options summary").click();
  await expect(page.getByLabel("Indicador do mapa")).toBeVisible();
  await page.getByLabel("Indicador do mapa").selectOption("abstencao");
  await expect(page.locator(".mobile-options-current")).toContainText("Abstenção");
  await tabbar.getByRole("button", { name: "Comparar" }).click();
  await expect(page.getByRole("heading", { name: "Dois candidatos, lado a lado." })).toBeVisible();
  await expect(page.getByLabel("Indicador do mapa")).toBeHidden();
  await expect(page.locator(".mobile-tabbar")).toHaveCSS("position", "fixed");
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth, bottom: getComputedStyle(document.body).paddingBottom }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.bottom).toContain("76px");
  expect((await page.request.get("/manifest.webmanifest")).ok()).toBeTruthy();
});

test("layouts compactos não criam rolagem horizontal nas cinco vistas", async ({ page }) => {
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Navegação principal" });
    for (const label of ["Início", "Mapa", "Comparar", "Zonas", "Análise"]) {
      await nav.getByRole("button", { name: label }).click();
      await expect(nav.getByRole("button", { name: label })).toHaveAttribute("aria-current", "page");
      const result = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
      expect(result.page, `width ${width}, view ${label}`).toBeLessThanOrEqual(result.viewport);
    }
  }
});

test("home encaminha para mapa, comparação, zonas e mantém a análise completa", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /O voto tem um território/ })).toBeVisible();
  await page.getByRole("button", { name: /Explore o território/ }).click();
  await expect(page.getByRole("heading", { name: "Do maior para o menor" })).toBeVisible();
  await page.getByRole("navigation", { name: "Vistas do atlas" }).getByRole("button", { name: /Início/ }).click();
  await page.getByRole("button", { name: /Compare candidatos/ }).click();
  await expect(page).toHaveURL(/vista=comparar/);
  await page.getByRole("navigation", { name: "Vistas do atlas" }).getByRole("button", { name: /Início/ }).click();
  await page.getByRole("button", { name: /Encontre uma zona/ }).click();
  await expect(page.locator(".zone-browser")).toBeVisible();
  await page.getByRole("navigation", { name: "Vistas do atlas" }).getByRole("button", { name: /Início/ }).click();
  await page.getByRole("button", { name: /Abra a análise completa/ }).click();
  await expect(page).toHaveURL(/vista=panorama/);
  await expect(page.getByRole("heading", { name: "Quem recebeu votos" })).toBeVisible();
});

test("navegação mobile mantém voltar/avançar e leva cada vista ao topo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("button", { name: "Mapa" }).click();
  await expect(page).toHaveURL(/vista=territorio/);
  await page.evaluate(() => window.scrollTo(0, 1100));
  await nav.getByRole("button", { name: "Comparar" }).click();
  await expect(page.getByRole("heading", { name: "Dois candidatos, lado a lado." })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.goBack();
  await expect(nav.getByRole("button", { name: "Mapa" })).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(nav.getByRole("button", { name: "Comparar" })).toHaveAttribute("aria-current", "page");
});

test("busca mobile abre folha nativa, encontra candidato e aplica o filtro", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /Buscar candidatos, cidades, zonas/ }).click();
  const sheet = page.getByRole("dialog", { name: "Buscar no Atlas" });
  const input = sheet.getByLabel("Buscar candidato, município, região administrativa ou zona");
  await expect(input).toBeFocused();
  await input.fill("Lula");
  await sheet.getByRole("button", { name: /Lula.*Presidente/ }).first().click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/candidato=/);
  await expect(page.locator(".home-leader-name")).toContainText("Lula");
});

test("toque no mapa seleciona uma região e abre as zonas correspondentes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?vista=territorio");
  await page.locator(".maplibregl-canvas").waitFor();
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("df-ra.geojson")))).toBe(true);
  await expect(page.locator(".map-loading")).toHaveCount(0);
  const mapSize = await page.locator(".maplibregl-canvas").boundingBox();
  expect(mapSize).not.toBeNull();
  await page.locator(".maplibregl-canvas").click({ position: { x: mapSize!.width * .36, y: mapSize!.height * .46 } });
  await expect(page.locator(".map-selection-card")).toBeVisible();
  const selectedArea = await page.locator(".map-selection-card strong").innerText();
  await page.locator(".map-selection-card").getByRole("button", { name: /Ver zonas/ }).click();
  await expect(page.locator(".zone-browser")).toBeVisible();
  await expect(page.locator(".zone-browser h2")).toContainText(selectedArea);
  await expect(page.locator(".zone-card").first()).toBeVisible();
});

test("troca de cargo bloqueia resultados antigos até concluir o novo carregamento", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.route("**/data/votos-deputado-federal.json", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.locator(".mobile-options summary").click();
  await page.locator(".mobile-options-panel").getByLabel("Cargo").selectOption("Deputado Federal");
  await expect(page.locator(".app-transition-layer")).toBeVisible();
  await expect(page.locator(".app-transition-layer")).toContainText("deputado federal");
  await expect(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Análise" })).toBeEnabled();
  await expect(page.locator(".app-transition-layer")).toHaveCount(0, { timeout: 10000 });
  await expect(page.locator(".mobile-options-current")).toContainText("Deputado Federal");
});

test("mobile pesquisa todo o ranking e preserva votos e percentual ao selecionar", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/?vista=panorama&uf=SP&cargo=Deputado%20Estadual");
  const search = page.getByLabel("Pesquisar no ranking de candidatos");
  await search.fill("PL");
  const card = page.locator(".candidate-data-card").first();
  await expect(card).toBeVisible();
  const name = await card.locator(".candidate-data-name strong").innerText();
  const share = await card.locator(".candidate-data-value b").innerText();
  const votes = await card.locator(".candidate-data-value small").innerText();
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/candidato=/);
  await expect(card.locator(".candidate-data-name strong")).toHaveText(name);
  await expect(card.locator(".candidate-data-value b")).toHaveText(share);
  await expect(card.locator(".candidate-data-value small")).toHaveText(votes);
  await search.fill("candidatura inexistente xyz");
  await expect(page.getByText("Nenhuma candidatura encontrada.", { exact: false })).toBeVisible();
});

test("exporta microdados filtrados da zona e preserva posição original no ranking", async ({ page }) => {
  await page.goto("/?vista=zonas&zona=15");
  const dialog = page.getByRole("dialog", { name: "Zona 15" });
  await dialog.getByPlaceholder("Pesquisar candidato ou partido").fill("Lula");
  await expect(dialog.locator(".zone-results-table tbody tr")).toHaveCount(1);
  const rank = await dialog.locator(".zone-rank").innerText();
  expect(Number(rank)).toBeGreaterThan(1);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exportar microdados CSV ↗" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("DF-zona-15-Presidente-resultado.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain("percentual_nominais");
  expect(csv).toContain('"Lula"');
  expect(csv).not.toContain("Jair Bolsonaro");
  await dialog.getByRole("tab", { name: "Locais de votação" }).click();
  await expect(dialog.getByRole("heading", { name: "Fonte, cobertura e percentuais" })).toBeVisible();
});

test("onboarding: oferece entrada direta para os microdados", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const intro = page.frameLocator(".cinema-intro-frame");
  await expect(intro.locator("html")).toHaveAttribute("data-cinema-ready", "true");
  await intro.getByRole("slider", { name: "Progresso da introdução" }).press("End");
  await intro.getByRole("link", { name: /Encontre uma zona/ }).click();
  await expect(page).toHaveURL(/vista=zonas/);
  await expect(page.locator(".zone-card").first()).toBeVisible();
});

test("comparação mobile pesquisa listas de candidatos grandes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?vista=comparar&uf=SP&cargo=Deputado%20Estadual");
  await expect(page.getByRole("heading", { name: "Dois candidatos, lado a lado." })).toBeVisible();
  await page.locator(".mobile-comparison-pickers button").first().click();
  const sheet = page.getByRole("dialog", { name: "Primeiro candidato" });
  await sheet.getByLabel("Buscar candidato por nome, partido ou número").fill("PL");
  const firstResult = sheet.locator(".candidate-results > button").first();
  const selectedName = await firstResult.locator("strong").innerText();
  await firstResult.click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".comparison-card.first h3")).toHaveText(selectedName);
  const size = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
  expect(size[1]).toBeLessThanOrEqual(size[0]);
});

test("onboarding: apresenta dados, explica a ferramenta e pode ser revisto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const intro = page.frameLocator(".cinema-intro-frame");
  await expect(intro.locator("html")).toHaveAttribute("data-cinema-ready", "true");
  await expect(intro.getByRole("heading", { name: "Do boletim por seção a uma visão do território." })).toBeVisible();
  await intro.locator("#stage").evaluate((stage) => window.scrollTo(0, (stage as HTMLElement).offsetTop + (stage.clientHeight - innerHeight) * .5));
  await expect(intro.locator("#stage .cap.on h2")).toHaveText("E o território aparece.");
  await intro.locator("#micro").evaluate((micro) => window.scrollTo(0, (micro as HTMLElement).offsetTop + (micro.clientHeight - innerHeight) * .95));
  await expect(intro.locator("#micro .cap.on h2")).toHaveText("E na seção, o boletim de urna.");
  await expect(intro.locator("#k2")).toHaveClass(/on/);
  await intro.getByRole("slider", { name: "Progresso da introdução" }).press("End");
  await intro.getByRole("link", { name: "Abrir o Atlas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Atlas das Urnas" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("atlas-intro-cinema-v1"))).toBe("complete");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Atlas das Urnas" })).toBeVisible();
  await expect(page.locator(".cinema-intro-shell")).toHaveCount(0);
  await page.locator(".mobile-options summary").click();
  await page.getByRole("button", { name: "Como usar o Atlas" }).click();
  await expect(page.locator(".cinema-intro-shell")).toBeVisible();
  await expect(intro.locator("html")).toHaveAttribute("data-cinema-ready", "true");
  await expect(intro.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
});

test("onboarding: pode ser pulado sem impedir o acesso ao painel", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cinema-intro-shell")).toBeVisible();
  await page.frameLocator(".cinema-intro-frame").getByRole("link", { name: "Pular introdução" }).click();
  await expect(page.getByRole("heading", { name: "Atlas das Urnas" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("atlas-intro-cinema-v1"))).toBe("complete");
});

test("onboarding: links de análises compartilhadas abrem direto na vista pedida", async ({ page }) => {
  await page.goto("/?vista=territorio&ra=2");
  await expect(page.locator(".cinema-intro-shell")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Do maior para o menor" })).toBeVisible();
});

test("onboarding: continua funcionando se o navegador bloquear armazenamento local", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
  });
  await page.goto("/");
  await expect(page.locator(".cinema-intro-shell")).toBeVisible();
  await page.frameLocator(".cinema-intro-frame").getByRole("link", { name: "Pular introdução" }).click();
  await expect(page.getByRole("heading", { name: "Atlas das Urnas" })).toBeVisible();
});

test("onboarding: a tela inicial cabe em iPhones compactos sem rolagem lateral", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await expect(page.locator(".cinema-intro-shell")).toBeVisible();
  const intro = page.frameLocator(".cinema-intro-frame");
  await expect(intro.locator("html")).toHaveAttribute("data-cinema-ready", "true");
  await expect(intro.getByRole("link", { name: "Pular introdução" })).toBeInViewport();
  const child = page.frame({ url: /\/intro\/cinema\.html/ })!;
  for (const phase of [0, .25, .55, .8, 1]) {
    await child.evaluate((phase) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * phase), phase);
    const inner = await child.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    expect(inner.document).toBeLessThanOrEqual(inner.viewport);
  }
  await intro.getByRole("link", { name: "Abrir o Atlas", exact: true }).scrollIntoViewIfNeeded();
  await expect(intro.getByRole("link", { name: "Abrir o Atlas", exact: true })).toBeInViewport();
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

test("Swetrix inicializa pageviews da SPA e recebe eventos sem termos pesquisados", async ({ page }) => {
  await page.route("https://swetrix.org/swetrix.js", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: `window.__swetrixEvents=[];window.swetrix={init:(id,options)=>window.__swetrixConfig={id,options},trackViews:options=>window.__swetrixViews=options,track:event=>window.__swetrixEvents.push(event)};`,
  }));
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => Boolean(window.__swetrixConfig && window.__swetrixViews))).toBe(true);
  await page.getByRole("button", { name: /Compare candidatos/ }).click();
  const search = page.getByPlaceholder("Candidato, município, RA, zona ou local");
  await search.fill("Lula");
  await page.getByRole("button", { name: /Lula.*Presidente/ }).first().click();
  const tracking = await page.evaluate(() => ({ config: window.__swetrixConfig, views: window.__swetrixViews, events: window.__swetrixEvents }));
  expect(tracking.config.id).toBe("SHQpMQlC6hpN");
  expect(tracking.config.options.apiURL).toBe("https://blogs-swetrix-frontend.rwezkp.easypanel.host/backend/v1/log");
  expect(tracking.config.options.respectDNT).toBeUndefined();
  expect(tracking.views.search).toEqual(["vista"]);
  expect(await page.evaluate(() => { const cb = window.__swetrixViews.callback; return [cb({ pg: "/" }).pg, cb({ pg: "/?vista=zonas" }).pg]; })).toEqual(["/atlas-2022", "/atlas-2022/?vista=zonas"]);
  expect(tracking.events.map((event) => event.ev)).toEqual(expect.arrayContaining(["home_shortcut_clicked", "navigation_view_selected", "search_opened", "search_result_selected"]));
  expect(tracking.events.every((event) => event.meta?.app === "atlas-2022")).toBe(true);
  expect(JSON.stringify(tracking.events)).not.toContain("Lula");
});

test("comparação inverte os candidatos sem alterar votos, base ou diferença", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?vista=comparar");
  const first = page.locator(".comparison-card.first");
  const second = page.locator(".comparison-card.second");
  const firstName = await first.locator("h3").innerText();
  const secondName = await second.locator("h3").innerText();
  const firstShare = await first.locator(":scope > strong").innerText();
  const secondVotes = await second.locator(".candidate-votes-line b").innerText();
  const difference = await page.locator(".comparison-difference strong").innerText();
  const base = await page.locator(".comparison-distribution .data-provenance").innerText();
  await page.getByRole("button", { name: "Inverter candidatos" }).click();
  await expect(first.locator("h3")).toHaveText(secondName);
  await expect(second.locator("h3")).toHaveText(firstName);
  await expect(second.locator(":scope > strong")).toHaveText(firstShare);
  await expect(first.locator(".candidate-votes-line b")).toHaveText(secondVotes);
  await expect(page.locator(".comparison-difference strong")).toHaveText(difference);
  await expect(page.locator(".comparison-distribution .data-provenance")).toHaveText(base);
  await page.reload();
  await expect(first.locator("h3")).toHaveText(secondName);
  await expect(second.locator("h3")).toHaveText(firstName);
});

test("comparação territorial respeita o recorte e abre as zonas da mesma área", async ({ page }) => {
  await page.goto("/?vista=comparar&ra=2");
  await expect(page.locator(".territory-duel")).toHaveCount(1);
  const territory = await page.locator(".territory-duel-heading > strong").innerText();
  await page.getByRole("button", { name: `Explorar zonas de ${territory}` }).click();
  await expect(page).toHaveURL(/vista=zonas.*ra=2/);
  await expect(page.locator(".zone-browser h2")).toHaveText(territory);
  await expect(page.locator(".zone-card").first()).toBeVisible();
});

test("zona por zona mantém a aba de locais e permite ordenar por seções", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/?vista=zonas");
  const opener = page.locator(".zone-card").first();
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Zona anterior" })).toBeDisabled();
  await dialog.getByRole("tab", { name: "Locais de votação" }).click();
  await dialog.getByLabel("Ordenar locais").selectOption("sections");
  const counts = await dialog.locator('.zone-locations-wrap td[data-label="Seções"]').allTextContents();
  const numbers = counts.map((count) => Number(count.replace(/\D/g, "")));
  expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
  await dialog.getByRole("button", { name: "Próxima zona" }).click();
  await expect(dialog.getByRole("heading", { name: "Zona 2", exact: true })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Locais de votação" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByLabel("Ordenar locais")).toHaveValue("sections");
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth, modal: document.querySelector(".zone-modal")!.scrollWidth, available: document.querySelector(".zone-modal")!.clientWidth }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.modal).toBeLessThanOrEqual(dimensions.available);
  await dialog.getByRole("button", { name: "Zona anterior" }).click();
  await expect(dialog.getByRole("heading", { name: "Zona 1", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar detalhes da zona" }).click();
  await expect(opener).toBeFocused();
});

test("fichas e tabela de zonas preservam o mesmo resultado filtrado", async ({ page }) => {
  await page.goto("/?vista=zonas");
  await page.getByLabel("Pesquisar zonas por número, região ou liderança").fill("Taguatinga");
  const cards = await page.locator(".zone-card-title > strong").allTextContents();
  expect(cards.length).toBeGreaterThan(0);
  await page.getByRole("group", { name: "Exibição das zonas" }).getByRole("button", { name: "Tabela" }).click();
  const cells = await page.locator(".desktop-zone-table .zone-open").allTextContents();
  expect(cells.map((cell) => cell.replace("ver detalhes ↗", ""))).toEqual(cards);
  await page.getByRole("group", { name: "Exibição das zonas" }).getByRole("button", { name: "Fichas" }).click();
  await expect(page.locator(".zone-card").first()).toBeVisible();
});

test("movimento reduzido mantém os dados imediatos e desliga animações dos cards", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?vista=comparar");
  await expect(page.locator(".comparison-card.first > strong")).toHaveText("51,7%");
  await expect(page.locator(".candidate-share-track i").first()).toHaveCSS("animation-name", "none");
  await page.getByRole("navigation", { name: "Vistas do atlas" }).getByRole("button", { name: /Zonas e locais/ }).click();
  await page.locator(".zone-card").first().click();
  await expect(page.locator(".zone-modal")).toHaveCSS("animation-name", "none");
});

test("comparação de SP adia os microdados locais até abrir as zonas", async ({ page }) => {
  const localRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("sp-pontos.json")) localRequests.push(request.url()); });
  await page.goto("/?vista=comparar&uf=SP");
  await expect(page.locator(".comparison-card.first > strong")).toBeVisible();
  await expect(page.locator(".territory-duel").first()).toBeVisible();
  expect(localRequests).toHaveLength(0);
  await page.getByLabel("Pesquisar território").fill("Campinas");
  await page.getByRole("button", { name: "Explorar zonas de Campinas", exact: true }).click();
  await expect(page.locator(".zone-card").first()).toBeVisible();
  expect(localRequests).toHaveLength(1);
});

test("onboarding: arraste por toque percorre a introdução e termina no sistema", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    const intro = page.frameLocator(".cinema-intro-frame");
    await expect(intro.locator("html")).toHaveAttribute("data-cinema-ready", "true");
    const track = await intro.getByRole("slider").boundingBox();
    expect(track).not.toBeNull();
    const cdp = await context.newCDPSession(page);
    const point = (fraction: number) => [{ x: track!.x + track!.width / 2, y: track!.y + track!.height * fraction }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(.05) });
    for (let step = 1; step <= 12; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(.05 + step / 12 * .9) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => Number(await intro.getByRole("slider").getAttribute("aria-valuenow"))).toBeGreaterThan(90);
    await intro.getByRole("link", { name: "Abrir o Atlas", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Atlas das Urnas", exact: true })).toBeVisible();
    await expect(page.locator(".cinema-intro-frame")).toHaveCount(0);
    expect(context.pages()).toHaveLength(1);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("onboarding: ponteiro e rolagem movem o parallax do original", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const intro = page.frameLocator(".cinema-intro-frame");
  await expect(intro.locator("html")).toHaveAttribute("data-cinema-ready", "true");
  const strip = intro.locator(".strip").first();
  await expect(strip).not.toHaveCSS("transform", "none");
  const before = await strip.evaluate((node) => (node as HTMLElement).style.transform);
  await page.mouse.move(1100, 300);
  await expect.poll(() => strip.evaluate((node) => (node as HTMLElement).style.transform)).not.toBe(before);
  await page.mouse.wheel(0, 240);
  await expect.poll(() => intro.locator(".hero-in").evaluate((node) => (node as HTMLElement).style.transform)).not.toBe("translate3d(0px, 0px, 0px)");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

for (const [label, view] of [["Explore o território", "territorio"], ["Compare candidatos", "comparar"], ["Abra a análise completa", "panorama"]]) {
  test(`onboarding: atalho final abre ${view} na mesma aba`, async ({ page }) => {
    await page.goto("/");
    const intro = page.frameLocator(".cinema-intro-frame");
    await expect(intro.locator("html")).toHaveAttribute("data-cinema-ready", "true");
    await intro.getByRole("slider").press("End");
    await intro.getByRole("link", { name: new RegExp(label) }).click();
    await expect(page).toHaveURL(new RegExp(`vista=${view}`));
    await expect(page.locator(".cinema-intro-shell")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Atlas das Urnas", exact: true })).toBeVisible();
  });
}

test("onboarding: busca final abre a busca funcional do Atlas", async ({ page }) => {
  await page.goto("/");
  const intro = page.frameLocator(".cinema-intro-frame");
  await expect(intro.locator("html")).toHaveAttribute("data-cinema-ready", "true");
  await intro.getByRole("slider").press("End");
  await intro.getByRole("link", { name: /Buscar .* no Atlas/ }).click();
  const search = page.getByRole("dialog", { name: "Buscar no Atlas" });
  await expect(search).toBeVisible();
  await search.getByRole("textbox").fill("Lula");
  await search.getByRole("button", { name: /Lula.*Presidente/ }).first().click();
  await expect(page.locator(".home-leader-name")).toHaveText("Lula");
});

test("onboarding: movimento reduzido preserva o percurso e a entrada no Atlas", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const intro = page.frameLocator(".cinema-intro-frame");
  await expect(intro.locator("html")).toHaveAttribute("data-cinema-ready", "true");
  await expect(intro.locator(".w > span").first()).toHaveCSS("animation-name", "none");
  await expect(intro.locator(".strip > span").first()).toHaveCSS("animation-name", "none");
  await intro.getByRole("slider").press("End");
  await expect(intro.getByRole("slider")).toHaveAttribute("aria-valuenow", "100");
  await intro.getByRole("link", { name: "Abrir o Atlas", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Atlas das Urnas", exact: true })).toBeVisible();
});
