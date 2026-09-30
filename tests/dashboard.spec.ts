import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  if (!testInfo.title.startsWith("onboarding:")) {
    await page.addInitScript(() => window.localStorage.setItem("atlas-intro-v1", "complete"));
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
  await expect(page.getByText("12.239.989")).toBeVisible();

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
  await expect(dialog.getByText("Jair Bolsonaro", { exact: true })).toHaveCount(0);

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

test("layouts compactos não criam rolagem horizontal nas quatro vistas", async ({ page }) => {
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Navegação principal" });
    for (const label of ["Início", "Mapa", "Comparar", "Zonas"]) {
      await nav.getByRole("button", { name: label }).click();
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
  await page.locator(".maplibregl-canvas").click({ position: { x: 82, y: 72 } });
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
  await expect(page.locator(".app-transition-layer")).toHaveCount(0, { timeout: 10000 });
  await expect(page.locator(".mobile-options-current")).toContainText("Deputado Federal");
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
  await expect(page.getByRole("heading", { name: "Veja a eleição para além do resultado final." })).toBeVisible();
  await expect(page.getByText("Distrito Federal", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Do boletim por seção a uma visão do território." })).toBeVisible();
  await page.getByRole("button", { name: /Entenda os dados, a tecnologia e os percentuais/ }).click();
  const dataSheet = page.getByRole("dialog", { name: "Entenda os dados" });
  await expect(dataSheet.getByText(/sem registros que identifiquem a escolha de cada eleitor/)).toBeVisible();
  await expect(dataSheet.getByText(/MapLibre/)).toBeVisible();
  await dataSheet.getByRole("button", { name: "Entendi" }).click();
  await expect(page.getByRole("button", { name: "Continuar" })).toBeInViewport();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: "Escolha uma pergunta. O Atlas mostra o caminho." })).toBeVisible();
  await expect(page.getByText(/Busque um candidato, partido, município, RA ou zona/)).toBeVisible();
  await page.getByRole("button", { name: "Explorar o Atlas" }).click();
  await expect(page.getByRole("heading", { name: "Atlas das Urnas" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("atlas-intro-v1"))).toBe("complete");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Atlas das Urnas" })).toBeVisible();
  await expect(page.locator(".welcome-screen")).toHaveCount(0);
  await page.locator(".mobile-options summary").click();
  await page.getByRole("button", { name: "Como usar o Atlas" }).click();
  await expect(page.locator(".welcome-screen")).toBeVisible();
});

test("onboarding: pode ser pulado sem impedir o acesso ao painel", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".welcome-screen")).toBeVisible();
  await page.getByRole("button", { name: /Pular introdução/ }).click();
  await expect(page.getByRole("heading", { name: "Atlas das Urnas" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("atlas-intro-v1"))).toBe("complete");
});

test("onboarding: links de análises compartilhadas abrem direto na vista pedida", async ({ page }) => {
  await page.goto("/?vista=territorio&ra=2");
  await expect(page.locator(".welcome-screen")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Do maior para o menor" })).toBeVisible();
});

test("onboarding: continua funcionando se o navegador bloquear armazenamento local", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
  });
  await page.goto("/");
  await expect(page.locator(".welcome-screen")).toBeVisible();
  await page.getByRole("button", { name: /Pular introdução/ }).click();
  await expect(page.getByRole("heading", { name: "Atlas das Urnas" })).toBeVisible();
});

test("onboarding: a tela inicial cabe em iPhones compactos sem rolagem lateral", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await expect(page.locator(".welcome-screen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar" })).toBeInViewport();
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
  expect(tracking.config.options.respectDNT).toBe(true);
  expect(tracking.views.search).toEqual(["vista"]);
  expect(tracking.events.map((event) => event.ev)).toEqual(expect.arrayContaining(["home_shortcut_clicked", "navigation_view_selected", "search_opened", "search_result_selected"]));
  expect(JSON.stringify(tracking.events)).not.toContain("Lula");
});
