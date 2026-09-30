export type Uf = "DF" | "SP";
export type Theme = "light" | "dark";
export type Metric = "share" | "votos" | "abstencao" | "comparecimento" | "concentracao";
export type MapMode = "regioes" | "calor" | "ambos";
export type AtlasView = "home" | "panorama" | "territorio" | "comparar" | "zonas";

export interface Meta {
  titulo: string;
  eleicao: string;
  turno: number;
  pleito: string;
  extracao: string;
  fonte: string;
  geografias: string[];
  ufs: Uf[];
  geradoEm: string;
  secoes: Record<Uf, number>;
  avisos: string[];
  municipiosSemMalha: string[];
}

export interface Municipio {
  i: number;
  uf: Uf;
  cod: string;
  nome: string;
  ibge: string | null;
  aptos: number;
  comp: number;
  abs: number;
  sec: number;
}

export interface Candidato {
  i: number;
  uf: Uf;
  cargo: string;
  tipo: "nominal" | "legenda" | "branco" | "nulo" | "anulado" | "anulado_sep";
  num: string;
  nome: string;
  partido: string;
  votos: number;
}

export interface Catalog {
  municipios: Municipio[];
  candidatos: Candidato[];
}

export interface VoteFile {
  uf: Record<string, [number, number][]>;
  mun: [number, number, number][];
  zona: [number, number, number, number][];
}

export interface Zona {
  mun: number;
  zona: number;
  aptos: number;
  comp: number;
  abs: number;
  sec: number;
}

export interface Ponto {
  nome: string;
  bairro: string;
  zona: number;
  local: number;
  ra: number | null;
  lat: number | null;
  lon: number | null;
  aptos: number;
  comp: number;
  abs: number;
  secoes: number;
  votos: Record<string, [number, number][]>;
}

export interface RaInfo {
  nome: string;
  roman: string;
  aptos: number;
  comp: number;
  abs: number;
  locais: number;
  secoes: number;
}

export interface DfData {
  ras: RaInfo[];
  pontos: Ponto[];
  cobertura: { locais: number; comCoordenada: number; semRa: number };
  nota: string;
}

export interface RaVotes {
  ras: { votos: Record<string, [number, number][]> }[];
}

export interface SpPoint {
  nome: string;
  bairro: string;
  zona: number;
  local: number;
  lon: number | null;
  lat: number | null;
  mun: number;
  aptos: number;
  comp: number;
  abs: number;
  secoes: number;
  votos: Record<string, [number, number][]>;
}
