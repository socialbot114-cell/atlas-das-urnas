#!/usr/bin/env python3
"""Completa o vínculo municipal e a votação por Região Administrativa."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path

from process_bu import OUT, ZIPS, classify, load_places, load_regions, to_int

ALIASES = {
    "EMBU DAS ARTES": "3515004",
    "FLORÍNEA": "3516101",
    "MOGI MIRIM": "3530805",
}
MANUAL_RA = {
    ("15", "1643"): "Taguatinga",
    ("15", "1651"): "Águas Claras",
    ("16", "1627"): "Brazlândia",
    ("17", "1430"): "Gama",
    ("21", "1317"): "Recanto das Emas",
    ("9", "1414"): "SIA",
}


def main() -> None:
    catalog_path = OUT / "catalog.json"
    catalog = json.loads(catalog_path.read_text())
    for item in catalog["municipios"]:
        if item["nome"] in ALIASES:
            item["ibge"] = ALIASES[item["nome"]]
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")))

    regions = load_regions()
    places = load_places(regions)
    lookup = {
        (item["cargo"], item["tipo"], item["num"], item["nome"], item["partido"]): item["i"]
        for item in catalog["candidatos"]
        if item["uf"] == "DF"
    }
    ra_votes: list[dict[str, dict[str, int]]] = [defaultdict(lambda: defaultdict(int)) for _ in regions]
    manual_turn = defaultdict(lambda: [0, 0, 0, 0, 0])
    seen_sections: set[tuple] = set()
    seen_manual_places: set[tuple] = set()
    missing = []
    with zipfile.ZipFile(ZIPS["DF"]) as archive:
        name = next(item for item in archive.namelist() if item.endswith(".csv"))
        handle = io.TextIOWrapper(archive.open(name), encoding="latin1", newline="")
        reader = csv.DictReader(handle, delimiter=";")
        for row in reader:
            place = places.get(("DF", row["NR_ZONA"], row["NR_LOCAL_VOTACAO"]))
            ra = place["ra"] if place else None
            if ra is None:
                manual = MANUAL_RA.get((row["NR_ZONA"], row["NR_LOCAL_VOTACAO"]))
                ra = next((index for index, region in enumerate(regions) if region["nome"] == manual), None)
            if ra is None:
                missing.append((row["NR_ZONA"], row["NR_LOCAL_VOTACAO"], place["bairro"] if place else "", place["nome"] if place else ""))
                continue
            section = (row["NR_ZONA"], row["NR_SECAO"])
            if (row["NR_ZONA"], row["NR_LOCAL_VOTACAO"]) in MANUAL_RA and section not in seen_sections:
                seen_sections.add(section)
                bucket = manual_turn[ra]
                bucket[0] += to_int(row["QT_APTOS"])
                bucket[1] += to_int(row["QT_COMPARECIMENTO"])
                bucket[2] += to_int(row["QT_ABSTENCOES"])
                bucket[3] += 1
                place_key = (row["NR_ZONA"], row["NR_LOCAL_VOTACAO"])
                if place_key not in seen_manual_places:
                    seen_manual_places.add(place_key)
                    bucket[4] += 1
            votos = int(row["QT_VOTOS"]) if row["QT_VOTOS"].lstrip("-").isdigit() and int(row["QT_VOTOS"]) > 0 else 0
            if votos <= 0:
                continue
            tipo = classify(row["DS_TIPO_VOTAVEL"], row["NR_VOTAVEL"], row["NM_VOTAVEL"])
            partido = row["SG_PARTIDO"].strip()
            if partido in {"#NULO#", "#NE#", "-1"}:
                partido = ""
            ident = (row["DS_CARGO_PERGUNTA"], tipo, row["NR_VOTAVEL"], " ".join(row["NM_VOTAVEL"].split()), partido)
            cand = lookup.get(ident)
            if cand is None:
                continue
            ra_votes[ra][row["DS_CARGO_PERGUNTA"]][cand] += votos

    payload = {
        "ras": [
            {"votos": {cargo: sorted(([cand, votos] for cand, votos in pairs.items()), key=lambda item: -item[1]) for cargo, pairs in bucket.items()}}
            for bucket in ra_votes
        ]
    }
    (OUT / "df-ra-votos.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    meta_path = OUT / "meta.json"
    meta = json.loads(meta_path.read_text())
    meta["municipiosSemMalha"] = [item["nome"] for item in catalog["municipios"] if item["uf"] == "SP" and not item["ibge"]]
    meta["vinculosManuais"] = ALIASES
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")))
    df_path = OUT / "df.json"
    df = json.loads(df_path.read_text())
    names = [region["nome"] for region in regions]
    for index, values in manual_turn.items():
        df["ras"][index]["aptos"] += values[0]
        df["ras"][index]["comp"] += values[1]
        df["ras"][index]["abs"] += values[2]
        df["ras"][index]["secoes"] += values[3]
        df["ras"][index]["locais"] += values[4]
    df["cobertura"]["semRa"] = 0
    df["cobertura"]["atribuidosPorEndereco"] = len(MANUAL_RA)
    df["nota"] += " Seis locais sem coordenada válida foram atribuídos pelo endereço oficial: Taguatinga, Águas Claras, Brazlândia, Gama, Recanto das Emas e SIA."
    df_path.write_text(json.dumps(df, ensure_ascii=False, separators=(",", ":")))
    print("sem malha", meta["municipiosSemMalha"])
    print("locais sem RA", len({item[:2] for item in missing}))
    for item in sorted(set(missing))[:12]:
        print(" ", item)
    print("df-ra-votos", (OUT / "df-ra-votos.json").stat().st_size)


if __name__ == "__main__":
    main()
