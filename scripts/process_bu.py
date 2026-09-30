#!/usr/bin/env python3
"""Agrega os boletins de urna de 2022 (DF e SP) para o painel estático."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import sys
import time
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

csv.field_size_limit(sys.maxsize)

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
RAW = BASE / "raw"
OUT = ROOT / "public" / "data"
ZIPS = {
    "SP": BASE / "dados_SP_1turno_2022.zip",
    "DF": BASE / "dados_DF_1turno_2022.zip",
}

MAJOR = {"Presidente", "Governador", "Senador"}
KEEP_MUN_MIN = {"nominal": 1, "legenda": 1, "branco": 1, "nulo": 1, "anulado": 1, "anulado_sep": 1}
MANUAL_RA = {
    ("15", "1643"): "Taguatinga",
    ("15", "1651"): "Águas Claras",
    ("16", "1627"): "Brazlândia",
    ("17", "1430"): "Gama",
    ("21", "1317"): "Recanto das Emas",
    ("9", "1414"): "SIA",
}


def fold(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(text.upper().replace("-", " ").replace("/", " ").split())


def clean_ra(name: str) -> str:
    return " ".join((name or "").split()).replace(" /", "/").replace("/", " / ")


def to_int(value: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return number if number > 0 else 0


def classify(tipo: str, numero: str, nome: str) -> str:
    label = fold(nome)
    kind = fold(tipo)
    if numero == "95" or "BRANCO" in label:
        return "branco"
    if numero == "96" or "NULO" in label:
        return "nulo"
    if numero == "97" or "SEPARAD" in label:
        return "anulado_sep"
    if numero == "98" or "ANULAD" in label:
        return "anulado"
    if "LEGENDA" in kind:
        return "legenda"
    return "nominal"


def point_in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    j = len(ring) - 1
    for i, point in enumerate(ring):
        xi, yi = point[0], point[1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y):
            denom = (yj - yi) or 1e-15
            if x < (xj - xi) * (y - yi) / denom + xi:
                inside = not inside
        j = i
    return inside


def point_in_polygon(x: float, y: float, polygon: list) -> bool:
    if not polygon or not point_in_ring(x, y, polygon[0]):
        return False
    return all(not point_in_ring(x, y, hole) for hole in polygon[1:])


def bbox(geometry: dict) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []

    def walk(node):
        if node and isinstance(node[0], (int, float)):
            xs.append(node[0])
            ys.append(node[1])
            return
        for child in node:
            walk(child)

    walk(geometry["coordinates"])
    return min(xs), min(ys), max(xs), max(ys)


def locate(lon: float, lat: float, regions: list[dict]) -> int | None:
    for index, region in enumerate(regions):
        minx, miny, maxx, maxy = region["bbox"]
        if lon < minx or lon > maxx or lat < miny or lat > maxy:
            continue
        geometry = region["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        if any(point_in_polygon(lon, lat, polygon) for polygon in polygons):
            return index
    return None


def simplify(node, tolerance=0.0012):
    if isinstance(node, list) and node and isinstance(node[0], (int, float)):
        return [round(node[0], 5), round(node[1], 5)]
    if not isinstance(node, list):
        return node
    if node and isinstance(node[0], list) and node[0] and isinstance(node[0][0], (int, float)):
        kept = [simplify(node[0])]
        for point in node[1:]:
            current = simplify(point)
            if abs(current[0] - kept[-1][0]) + abs(current[1] - kept[-1][1]) >= tolerance:
                kept.append(current)
        if len(kept) < 4:
            return [simplify(point) for point in node]
        if kept[-1] != kept[0]:
            kept.append(kept[0])
        return kept
    return [simplify(child, tolerance) for child in node]


def load_regions() -> list[dict]:
    source = json.loads((RAW / "ra_df.json").read_text())
    regions = []
    features = []
    for feature in source["features"]:
        name = clean_ra(feature["properties"]["ra"])
        roman = feature["properties"].get("num_ra") or ""
        geometry = {"type": feature["geometry"]["type"], "coordinates": simplify(feature["geometry"]["coordinates"])}
        region = {
            "nome": name,
            "roman": roman,
            "geometry": feature["geometry"],
            "bbox": bbox(feature["geometry"]),
        }
        regions.append(region)
        features.append({
            "type": "Feature",
            "id": len(features),
            "properties": {"id": len(features), "nome": name, "roman": roman},
            "geometry": geometry,
        })
    (OUT / "df-ra.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")))
    return regions


def load_sp_geo() -> dict[str, str]:
    source = json.loads((RAW / "geojs-35-mun.json").read_text())
    lookup = {}
    features = []
    for feature in source["features"]:
        ibge = str(feature["properties"]["id"])
        name = feature["properties"]["name"]
        lookup[fold(name)] = ibge
        features.append({
            "type": "Feature",
            "id": ibge,
            "properties": {"id": ibge, "nome": name},
            "geometry": {"type": feature["geometry"]["type"], "coordinates": simplify(feature["geometry"]["coordinates"], 0.002)},
        })
    (OUT / "sp-mun.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")))
    aliases = {
        "MOGI MIRIM": "MOGI MIRIM",
        "FLORINEA": "FLORINEA",
        "SAO LUIZ DO PARAITINGA": "SAO LUIS DO PARAITINGA",
        "GRAO PARA": "GRAO PARA",
    }
    for source_name, target_name in aliases.items():
        if target_name in lookup:
            lookup[source_name] = lookup[target_name]
    return lookup


def load_places(regions: list[dict]) -> dict[tuple, dict]:
    path = RAW / "eleitorado_local_votacao_2022.zip"
    places = {}
    with zipfile.ZipFile(path) as archive:
        name = next(item for item in archive.namelist() if item.endswith(".csv"))
        handle = io.TextIOWrapper(archive.open(name), encoding="latin1", newline="")
        reader = csv.DictReader(handle, delimiter=";")
        for row in reader:
            uf = row["SG_UF"]
            if uf not in ("DF", "SP"):
                continue
            key = (uf, row["NR_ZONA"], row["NR_LOCAL_VOTACAO"])
            if key in places:
                continue
            try:
                lat = float(row["NR_LATITUDE"].replace(",", "."))
                lon = float(row["NR_LONGITUDE"].replace(",", "."))
            except ValueError:
                lat = lon = None
            if lat is not None and not (-35 < lat < 6 and -75 < lon < -30):
                lat = lon = None
            ra = locate(lon, lat, regions) if uf == "DF" and lat is not None else None
            if uf == "DF" and ra is None:
                manual_name = MANUAL_RA.get((row["NR_ZONA"], row["NR_LOCAL_VOTACAO"]))
                ra = next((index for index, region in enumerate(regions) if region["nome"] == manual_name), None)
            places[key] = {
                "nome": row["NM_LOCAL_VOTACAO"],
                "bairro": row["NM_BAIRRO"],
                "lat": lat,
                "lon": lon,
                "ra": ra,
            }
    return places


def stream_votes(uf: str, places: dict, mun_index: dict, sections: dict, votes: dict, local_votes: dict, stats: dict):
    path = ZIPS[uf]
    started = time.time()
    rows = 0
    with zipfile.ZipFile(path) as archive:
        name = next(item for item in archive.namelist() if item.endswith(".csv"))
        handle = io.TextIOWrapper(archive.open(name), encoding="latin1", newline="")
        reader = csv.reader(handle, delimiter=";")
        header = next(reader)
        idx = {column: position for position, column in enumerate(header)}
        for row in reader:
            rows += 1
            if rows % 1_000_000 == 0:
                print(f"  {uf}: {rows:,} linhas em {time.time() - started:.0f}s", flush=True)
            cargo = row[idx["DS_CARGO_PERGUNTA"]]
            mun_code = row[idx["CD_MUNICIPIO"]]
            mun_name = row[idx["NM_MUNICIPIO"]]
            zona = row[idx["NR_ZONA"]]
            secao = row[idx["NR_SECAO"]]
            local = row[idx["NR_LOCAL_VOTACAO"]]
            mun_key = (uf, mun_code)
            if mun_key not in mun_index:
                mun_index[mun_key] = {"uf": uf, "cod": mun_code, "nome": mun_name}
            section_key = (uf, mun_code, zona, secao)
            aptos = to_int(row[idx["QT_APTOS"]])
            comp = to_int(row[idx["QT_COMPARECIMENTO"]])
            abst = to_int(row[idx["QT_ABSTENCOES"]])
            if section_key not in sections:
                sections[section_key] = (aptos, comp, abst, local)
            quantidade = to_int(row[idx["QT_VOTOS"]])
            if quantidade <= 0:
                continue
            tipo = classify(row[idx["DS_TIPO_VOTAVEL"]], row[idx["NR_VOTAVEL"]], row[idx["NM_VOTAVEL"]])
            nome = " ".join(row[idx["NM_VOTAVEL"]].split())
            partido = row[idx["SG_PARTIDO"]].strip()
            if partido in {"#NULO#", "#NE#", "-1"}:
                partido = ""
            numero = row[idx["NR_VOTAVEL"]]
            vote_key = (uf, mun_code, cargo, tipo, numero, nome, partido)
            votes[vote_key] = votes.get(vote_key, 0) + quantidade
            zone_key = (uf, mun_code, zona, cargo, tipo, numero, nome, partido)
            zone_store = stats.setdefault("zonas", {})
            zone_store[zone_key] = zone_store.get(zone_key, 0) + quantidade
            if uf == "DF" or cargo == "Presidente":
                local_key = (uf, mun_code, zona, local, cargo, tipo, numero, nome, partido)
                local_votes[local_key] = local_votes.get(local_key, 0) + quantidade
            stats["votos"] += quantidade
    stats["linhas"] = rows
    print(f"  {uf}: concluído, {rows:,} linhas em {time.time() - started:.0f}s", flush=True)


def dump(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    started = time.time()
    print("Carregando limites e locais…", flush=True)
    regions = load_regions()
    sp_lookup = load_sp_geo()
    places = load_places(regions)
    print(f"  locais DF/SP: {len(places):,}", flush=True)
    probe = places.get(("DF", "1", "1015"))
    if not probe or probe["ra"] is None or regions[probe["ra"]]["nome"] != "Plano Piloto":
        raise SystemExit(f"Falha no cruzamento geográfico da Asa Sul: {probe}")

    mun_index: dict = {}
    sections: dict = {}
    votes: dict = {}
    local_votes: dict = {}
    stats = {"DF": {"votos": 0}, "SP": {"votos": 0}}
    for uf in ("DF", "SP"):
        print(f"Lendo boletim {uf}…", flush=True)
        stream_votes(uf, places, mun_index, sections, votes, local_votes, stats[uf])

    municipios = []
    mun_ids = {}
    for key, item in sorted(mun_index.items(), key=lambda pair: (pair[0][0], fold(pair[1]["nome"]))):
        ibge = sp_lookup.get(fold(item["nome"])) if item["uf"] == "SP" else "5300108"
        record = {**item, "i": len(municipios), "ibge": ibge}
        municipios.append(record)
        mun_ids[key] = record["i"]
    unmatched = [item["nome"] for item in municipios if item["uf"] == "SP" and not item["ibge"]]

    turnout = {item["i"]: [0, 0, 0, 0] for item in municipios}
    zonas = defaultdict(lambda: [0, 0, 0, 0])
    locais = defaultdict(lambda: [0, 0, 0, 0])
    for (uf, cod, zona, secao), (aptos, comp, abst, local) in sections.items():
        mid = mun_ids[(uf, cod)]
        bucket = turnout[mid]
        bucket[0] += aptos
        bucket[1] += comp
        bucket[2] += abst
        bucket[3] += 1
        zone = zonas[(mid, int(zona))]
        zone[0] += aptos
        zone[1] += comp
        zone[2] += abst
        zone[3] += 1
        place = locais[(uf, cod, zona, local)]
        place[0] += aptos
        place[1] += comp
        place[2] += abst
        place[3] += 1

    cand_votes = defaultdict(int)
    mun_votes = defaultdict(int)
    zone_votes = defaultdict(int)
    for (uf, cod, cargo, tipo, numero, nome, partido), quantidade in votes.items():
        ident = (uf, cargo, tipo, numero, nome, partido)
        cand_votes[ident] += quantidade
        mid = mun_ids[(uf, cod)]
        mun_votes[(mid, ident)] += quantidade
    for uf in ("DF", "SP"):
        for (vote_uf, cod, zona, cargo, tipo, numero, nome, partido), quantidade in stats[uf].get("zonas", {}).items():
            ident = (vote_uf, cargo, tipo, numero, nome, partido)
            zone_votes[(mun_ids[(vote_uf, cod)], int(zona), ident)] += quantidade

    candidatos = []
    cand_ids = {}
    for ident, total in sorted(cand_votes.items(), key=lambda pair: (pair[0][0], pair[0][1], -pair[1], pair[0][4])):
        uf, cargo, tipo, numero, nome, partido = ident
        record = {
            "i": len(candidatos),
            "uf": uf,
            "cargo": cargo,
            "tipo": tipo,
            "num": numero,
            "nome": nome,
            "partido": partido,
            "votos": total,
        }
        candidatos.append(record)
        cand_ids[ident] = record["i"]

    by_cargo = defaultdict(lambda: {"uf": defaultdict(list), "mun": [], "zona": []})
    for (mid, ident), quantidade in mun_votes.items():
        uf, cargo = ident[0], ident[1]
        if cargo not in MAJOR and quantidade < 5:
            continue
        by_cargo[cargo]["mun"].append([mid, cand_ids[ident], quantidade])
    for ident, total in cand_votes.items():
        by_cargo[ident[1]]["uf"][ident[0]].append([cand_ids[ident], total])
    for (mid, zona, ident), quantidade in zone_votes.items():
        if ident[1] not in MAJOR and quantidade < 5:
            continue
        by_cargo[ident[1]]["zona"].append([mid, zona, cand_ids[ident], quantidade])

    for cargo, payload in by_cargo.items():
        slug = fold(cargo).lower().replace(" ", "-")
        dump(OUT / f"votos-{slug}.json", {"uf": payload["uf"], "mun": payload["mun"], "zona": payload["zona"]})

    mun_out = []
    for item in municipios:
        aptos, comp, abst, sec = turnout[item["i"]]
        mun_out.append({**item, "aptos": aptos, "comp": comp, "abs": abst, "sec": sec})

    ra_stats = [{**{"nome": region["nome"], "roman": region["roman"]}, "aptos": 0, "comp": 0, "abs": 0, "locais": 0, "secoes": 0} for region in regions]
    pontos = []
    sem_ra = 0
    for (uf, cod, zona, local), values in sorted(locais.items()):
        place = places.get((uf, zona, local))
        if uf != "DF":
            continue
        ra = place["ra"] if place else None
        if ra is None:
            sem_ra += 1
        else:
            ra_stats[ra]["aptos"] += values[0]
            ra_stats[ra]["comp"] += values[1]
            ra_stats[ra]["abs"] += values[2]
            ra_stats[ra]["locais"] += 1
            ra_stats[ra]["secoes"] += values[3]
        if not place:
            continue
        pontos.append({
            "nome": place["nome"],
            "bairro": place["bairro"],
            "zona": int(zona),
            "local": int(local),
            "ra": ra,
            "lat": round(place["lat"], 5) if place["lat"] is not None else None,
            "lon": round(place["lon"], 5) if place["lon"] is not None else None,
            "aptos": values[0],
            "comp": values[1],
            "abs": values[2],
            "secoes": values[3],
        })

    df_local_votes = defaultdict(lambda: defaultdict(list))
    for (uf, cod, zona, local, cargo, tipo, numero, nome, partido), quantidade in local_votes.items():
        if uf != "DF":
            continue
        ident = (uf, cargo, tipo, numero, nome, partido)
        df_local_votes[(zona, local)][cargo].append([cand_ids[ident], quantidade])
    for point in pontos:
        grouped = df_local_votes.get((str(point["zona"]), str(point["local"])), {})
        point["votos"] = {
            cargo: (sorted(pairs, key=lambda item: -item[1])[:8] if cargo not in MAJOR else pairs)
            for cargo, pairs in grouped.items()
        }

    sp_pontos_by_key = {}
    for (uf, cod, zona, local), values in locais.items():
        if uf != "SP":
            continue
        place = places.get((uf, zona, local))
        if not place:
            continue
        sp_pontos_by_key[(cod, zona, local)] = {
            "nome": place["nome"],
            "bairro": place["bairro"],
            "zona": int(zona),
            "local": int(local),
            "lon": round(place["lon"], 5) if place["lon"] is not None else None,
            "lat": round(place["lat"], 5) if place["lat"] is not None else None,
            "mun": mun_ids[(uf, cod)],
            "aptos": values[0],
            "comp": values[1],
            "abs": values[2],
            "secoes": values[3],
            "votos": defaultdict(list),
        }
    for (uf, cod, zona, local, cargo, tipo, numero, nome, partido), quantidade in local_votes.items():
        if uf != "SP":
            continue
        candidate_id = cand_ids.get((uf, cargo, tipo, numero, nome, partido))
        point = sp_pontos_by_key.get((cod, zona, local))
        if point is not None and candidate_id is not None:
            point["votos"][cargo].append([candidate_id, quantidade])
    sp_pontos = [{**point, "votos": dict(point["votos"])} for point in sp_pontos_by_key.values()]

    dump(OUT / "catalog.json", {"municipios": mun_out, "candidatos": candidatos})
    dump(OUT / "zonas.json", [{"mun": mid, "zona": zona, "aptos": values[0], "comp": values[1], "abs": values[2], "sec": values[3]} for (mid, zona), values in sorted(zonas.items())])
    dump(OUT / "df.json", {
        "ras": ra_stats,
        "pontos": pontos,
        "cobertura": {"locais": sum(1 for key in locais if key[0] == "DF"), "comCoordenada": sum(1 for point in pontos if point["lat"] is not None), "semRa": sem_ra},
        "nota": "Regiões Administrativas do Limite RA 2019 (IPE/DF). Locais atribuídos pela coordenada oficial do TSE. RAs criadas depois de 2019 permanecem no polígono de origem.",
    })
    dump(OUT / "sp-pontos.json", sp_pontos)
    meta = {
        "titulo": "Atlas das Urnas",
        "eleicao": "Eleições Gerais 2022",
        "turno": 1,
        "pleito": "02/10/2022",
        "extracao": "05/10/2022",
        "fonte": "Tribunal Superior Eleitoral — Boletim de Urna WEB e eleitorado por local de votação",
        "geografias": [
            "Malha municipal de São Paulo (IBGE, via geodata-br)",
            "Limite das Regiões Administrativas 2019 (IPE/DF)",
        ],
        "ufs": ["DF", "SP"],
        "geradoEm": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "checksums": {path.name: checksum(path) for path in ZIPS.values()},
        "linhas": {uf: stats[uf]["linhas"] for uf in stats},
        "secoes": {uf: sum(1 for key in sections if key[0] == uf) for uf in ("DF", "SP")},
        "municipiosSemMalha": unmatched,
        "avisos": [
            "Os percentuais de candidatos nominais excluem brancos, nulos e votos de legenda.",
            "Comparecimento e abstenção são contados uma vez por seção, não por linha de voto.",
            "O mapa não representa escolha individual de eleitores.",
            "Cargos proporcionais mostram votação, não cadeiras conquistadas.",
        ],
    }
    dump(OUT / "meta.json", meta)
    report = {
        "tempoSegundos": round(time.time() - started, 1),
        "municipios": len(mun_out),
        "candidatos": len(candidatos),
        "semMalha": unmatched,
        "dfSemRa": sem_ra,
        "arquivos": {path.name: path.stat().st_size for path in OUT.iterdir()},
    }
    dump(OUT / "validacao.json", report)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
