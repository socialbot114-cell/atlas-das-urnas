#!/usr/bin/env python3
"""Testes de consistência para os agregados publicados no painel."""

import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "public" / "data"


def load(name):
    return json.loads((DATA / name).read_text())


def expect(actual, expected, label):
    if actual != expected:
        raise AssertionError(f"{label}: esperado {expected}, obtido {actual}")
    print(f"OK {label}: {actual}")


def candidate(catalog, uf, cargo, name):
    return next(item for item in catalog["candidatos"] if item["uf"] == uf and item["cargo"] == cargo and item["nome"] == name and item["tipo"] == "nominal")


def main():
    meta = load("meta.json")
    catalog = load("catalog.json")
    df = load("df.json")
    sp_geo = load("sp-mun.geojson")
    df_geo = load("df-ra.geojson")
    df_ra_votes = load("df-ra-votos.json")
    presidential = load("votos-presidente.json")

    expect(len([item for item in catalog["municipios"] if item["uf"] == "SP"]), 645, "municípios SP")
    expect(len(sp_geo["features"]), 645, "polígonos municipais SP")
    expect(len(df["ras"]), 33, "RAs na malha IPE/DF 2019")
    expect(len(df_geo["features"]), 33, "polígonos RA")
    expect(df["cobertura"]["semRa"], 0, "locais DF sem vínculo de RA")
    expect(df["cobertura"]["locais"], 617, "locais de votação DF")
    expect(df["cobertura"]["comCoordenada"], 611, "locais DF com coordenadas")
    expect(len([item for item in df["pontos"] if item["lat"] is None and item["ra"] is not None]), 6, "locais sem coordenadas preservados nos microdados")
    expect(meta["secoes"]["SP"], 101073, "seções SP")
    expect(meta["secoes"]["DF"], 6748, "seções DF")
    expect(meta["municipiosSemMalha"], [], "municípios SP sem código IBGE")

    votes_by_candidate = {item[0]: item[1] for item in presidential["uf"]["SP"]}
    lula = candidate(catalog, "SP", "Presidente", "LULA")
    bolsonaro = candidate(catalog, "SP", "Presidente", "JAIR BOLSONARO")
    expect(votes_by_candidate[lula["i"]], 10490032, "votos de Lula para presidente em SP")
    expect(votes_by_candidate[bolsonaro["i"]], 12239989, "votos de Bolsonaro para presidente em SP")
    governor = {item[0]: item[1] for item in load("votos-governador.json")["uf"]["SP"]}
    sp_tarcisio = candidate(catalog, "SP", "Governador", "TARCÍSIO")
    expect(governor[sp_tarcisio["i"]], 9881995, "votos de Tarcísio para governador em SP")
    df_governor = {item[0]: item[1] for item in load("votos-governador.json")["uf"]["DF"]}
    df_ibaneis = candidate(catalog, "DF", "Governador", "IBANEIS ROCHA")
    expect(df_governor[df_ibaneis["i"]], 832633, "votos de Ibaneis para governador no DF")

    sao_paulo = next(item for item in catalog["municipios"] if item["uf"] == "SP" and item["nome"] == "SÃO PAULO")
    lula_city = sum(votes for mun, cand, votes in presidential["mun"] if mun == sao_paulo["i"] and cand == lula["i"])
    expect(lula_city, 3276512, "votos de Lula no município de São Paulo")
    sp_points = load("sp-pontos.json")
    if not sp_points or not all({"nome", "bairro", "zona", "local", "secoes"}.issubset(item) for item in sp_points):
        raise AssertionError("Metadados de zona/local ausentes nos pontos de SP")
    print(f"OK microdados geográficos de SP: {len(sp_points):,} locais identificados por zona/local")
    df_geo_votes = [pair for region in df_ra_votes["ras"] for pairs in region["votos"].values() for pair in pairs]
    if not df_geo_votes:
        raise AssertionError("Não há resultados agregados por RA")
    for region in df["ras"]:
        if region["aptos"] and region["secoes"] <= 0:
            raise AssertionError(f"RA sem seções associadas: {region['nome']}")
    expect(sum(region["secoes"] for region in df["ras"]), meta["secoes"]["DF"], "seções atribuídas às RAs")
    df_municipality = next(item for item in catalog["municipios"] if item["uf"] == "DF")
    expect(sum(region["aptos"] for region in df["ras"]), df_municipality["aptos"], "aptos agregados por RA")
    ra_president = {}
    for region in df_ra_votes["ras"]:
        for candidate_id, votes in region["votos"].get("Presidente", []):
            ra_president[candidate_id] = ra_president.get(candidate_id, 0) + votes
    df_president = {candidate_id: votes for candidate_id, votes in load("votos-presidente.json")["uf"]["DF"]}
    for candidate_id, votes in df_president.items():
        expect(ra_president.get(candidate_id, 0), votes, f"votos presidenciais DF por RA · candidato {candidate_id}")
    print(f"OK resultados agregados por RA: {len(df_geo_votes):,} pares cargo/votável/RA")
    print(f"OK linhas de origem: {meta['linhas']['DF'] + meta['linhas']['SP']:,}")


if __name__ == "__main__":
    main()
