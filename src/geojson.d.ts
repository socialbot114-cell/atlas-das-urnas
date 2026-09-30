declare namespace GeoJSON {
  interface FeatureCollection {
    type: "FeatureCollection";
    features: Feature[];
  }
  interface Feature {
    type: "Feature";
    id?: string | number;
    properties: Record<string, unknown> | null;
    geometry: { type: string; coordinates: unknown };
  }
}
