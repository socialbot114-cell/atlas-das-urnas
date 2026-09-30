# Atlas das Urnas · Eleições 2022

Dashboard de exploração dos boletins de urna do primeiro turno de 2022 para o Distrito Federal e São Paulo. Aplicação estática em React + TypeScript + Vite, com dados agregados do TSE, busca textual, gráficos interativos e mapas.

A navegação oferece **Início**, **Análise**, **Território**, **Comparar** e **Zonas e locais**. A Home é a porta de entrada com atalhos; a vista Análise preserva o painel completo. UF, cargo e recorte são compartilhados entre vistas e codificados na URL para que uma análise possa ser aberta diretamente. A busca aceita `RA Taguatinga` e `Zona 15` (em SP, a zona é identificada junto do município). Em cada local disponível, o detalhe da zona mostra os dois candidatos mais votados, seus votos e sua participação nos votos nominais do local.

O painel é otimizado para celular, oferece navegação fixa inferior e pode ser adicionado à tela inicial pelo menu de compartilhamento do navegador; o manifesto define o nome, o ícone e o modo de abertura do app.

Na primeira visita, uma introdução apresenta o recorte eleitoral, as fontes, os resultados agregados e os principais caminhos de exploração. É possível pular a apresentação, revê-la depois pela opção **Como usar o Atlas** nos filtros móveis ou pela Ajuda no desktop, e links compartilhados para uma vista específica abrem diretamente essa análise.

Na vista Comparar, os candidatos são apresentados em votos nominais e participação; diferenças de participação são expressas em pontos percentuais. No mapa, a escala de votos absolutos é numérica. Os locais de SP têm votação completa por candidato no arquivo público somente para presidente; no DF, para presidente, governador e senador. Para os demais cargos, o calor representa comparecimento ou abstenção e a legenda informa isso. Os resultados agregados por zona e território continuam disponíveis para todos os cargos.

## Executar localmente

Requer Node.js 20+ e Python 3.10+.

```bash
npm ci
npm run dev
```

## Processar novamente os microdados

Os arquivos brutos ficam na pasta `raw/` do diretório pai e não são versionados. O pipeline lê os ZIPs diretamente, sem extrair os CSVs gigantes:

```bash
python3 scripts/process_bu.py
python3 scripts/finalize_data.py
npm run test:data
```

São necessários estes arquivos locais:

- `../dados_SP_1turno_2022.zip` e `../dados_DF_1turno_2022.zip` — boletins de urna do TSE.
- `../raw/eleitorado_local_votacao_2022.zip` — TSE, eleitorado por local de votação, que fornece endereços e coordenadas.
- `../raw/geojs-35-mun.json` — malha municipal de SP usada para a visualização.
- `../raw/ra_df.json` — limites das RAs, camada de 2019 do IPE/DF.

Os dados processados, simplificados e necessários ao site ficam em `public/data/` (cerca de 9 MB). Não publique nem comite os arquivos brutos compactados.

## Testes e build

```bash
npm run test:data
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

O teste de dados confere as quantidades esperadas de municípios e seções, referências de totalização presidencial e estadual, vínculos geográficos e cobertura das RAs.

## Escopo e interpretação

- O boletim é resultado final por seção; a votação não é uma série temporal.
- Comparecimento, abstenção e eleitorado são contados uma vez por seção, e não uma vez por candidato.
- Percentuais de candidatos são calculados sobre votos nominais válidos; votos de legenda, brancos e nulos aparecem em categorias separadas.
- A votação proporcional informa votos, não cadeiras conquistadas.
- O mapa de SP usa limites municipais do IBGE; o mapa do DF usa 33 polígonos da camada de 2019 do IPE/DF. Algumas RAs existentes hoje foram criadas depois dessa edição. A RA dos locais é determinada pela coordenada oficial do local de votação; seis locais sem coordenada válida foram vinculados por endereço oficial, e essa metodologia está descrita nos metadados.
- O mapa agrega resultados geográficos e não permite inferir escolhas individuais.

## Fontes

- TSE — boletins de urna WEB (SP e DF), extração de 5 de outubro de 2022.
- TSE — eleitorado por local de votação 2022.
- IBGE / [`geodata-br`](https://github.com/tbrugz/geodata-br) — malha de municípios de São Paulo.
- IPE/DF — Limite das Regiões Administrativas do Distrito Federal em 2019.
- [OpenStreetMap](https://www.openstreetmap.org/copyright) — mapa-base cartográfico, carregado pela aplicação.

Os dados eleitorais do TSE têm licença Creative Commons Atribuição. Consulte as condições das camadas geográficas junto aos respectivos provedores.

## Deploy Vercel

Framework preset: Vite · Build: `npm run build` · Output: `dist`. Os artefatos são arquivos JSON estáticos, sem necessidade de servidor ou variáveis secretas.

O build também publica os dois módulos worker necessários ao MapLibre para que o mapa interativo funcione em produção.

O projeto está conectado ao repositório privado do GitHub; novos commits em `main` disparam uma implantação de produção na Vercel.
