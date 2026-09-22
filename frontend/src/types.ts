/** Tipos del Atlas Graph Format 1.0 (schemas/agf-1.0.json) y del perfil de visualización. */

export type Status = "proposed" | "validated" | "rejected";
export type Origin = "extracted" | "inferred" | "manual";
export type NodeKind = "project_root" | "source" | "section" | "element" | "vocabulary" | "chunk" | "entity" | "knowledge_object";
export type EdgeKind = "contains" | "coded_with" | "precedes" | "derived_from" | "same_as" | "references" | "mentions" | "relates" | "supports" | "contradicts" | "shares";

export interface AgfSource {
  id: string;
  name: string;
  title?: string;
  sha256?: string;
  facets?: Record<string, string | null>;
  adapter?: string;
  ingested_at?: string;
  status?: Status;
  origin?: string;
  unparsed?: { locator?: Record<string, unknown>; text?: string }[];
  unparsed_count?: number;
  personal_data_guard?: { hits: Record<string, number>; confirmed_by_user: boolean };
}

export interface AgfNode {
  id: string;
  kind: NodeKind;
  name: string;
  source_id?: string;
  parent_id?: string;
  section_id?: string;
  number?: number;
  order?: number;
  description?: string;
  note?: string | null;
  full_name?: string;
  title?: string;
  facets?: Record<string, string | null>;
  facet_origin?: Record<string, Origin>;
  facet_confidence?: Record<string, number>;
  facet_rationale?: Record<string, string>;
  provenance?: { locator?: Record<string, unknown>; excerpt?: string };
  origin?: Origin;
  status?: Status;
  confidence?: number;
  rationale?: string | null;
  value_domain?: string[];
  stats?: Record<string, unknown>;
  native_type?: string;
  nullable?: boolean;
  key?: string;
  cardinality?: string;
  required?: boolean | null;
  adapter?: string;
  [k: string]: unknown;
}

export interface AgfEdge {
  id?: string;
  kind: EdgeKind;
  source: string;
  target: string;
  layer?: string;
  predicate?: string;
  origin?: Origin;
  status?: Status;
  confidence?: number;
  rationale?: string;
  weight?: number;
}

export interface AgfFinding {
  id: string;
  priority: "bloqueante" | "importante" | "menor";
  title: string;
  detail?: string;
  action: string;
  node_ids?: string[];
  status: "open" | "resolved" | "accepted_risk";
  origin?: string;
  rule?: string;
  source_id?: string;
}

export interface Agf {
  agf_version: "1.0";
  project: { id: string; name: string };
  profile?: string;
  sources: AgfSource[];
  nodes: AgfNode[];
  edges: AgfEdge[];
  findings?: AgfFinding[];
  built_at?: string;
}

export interface FacetValueDef {
  label: string;
  plural?: string;
  definition?: string;
  quality_rules?: string[];
  color_dark?: string;
  color_light?: string;
}

export interface FacetDef {
  label: string;
  applies_to?: string[];
  order: string[];
  values: Record<string, FacetValueDef>;
  note?: string;
}

export interface Profile {
  profile: string;
  default_group_by: string;
  facet_order?: string[];
  group_threshold?: number;
  max_colors_per_facet?: number;
  unclassified?: { key: string; label: string; plural?: string; color_dark: string; color_light: string };
  tokens: Record<"dark" | "light", Record<string, string>>;
  fonts: { display: string; body: string; mono: string };
  facets: Record<string, FacetDef>;
  priorities: Record<string, { label: string; def: string }>;
  shapes: Record<string, string>;
  layout: {
    section_anchor_radius: number;
    section_anchor_strength: number;
    facet_ring_radius: number;
    separar: { default: number; min: number; max: number };
    distancia: { default: number; min: number; max: number };
    springs: Record<string, [number, number]>;
    damping: number;
    cooling: number;
    alpha_min: number;
    prewarm_ticks: number;
  };
  labels: { algorithm: string; screen_scale_clamp: [number, number]; section_wrap_chars: number; element_truncate_chars: number; source_wrap_chars?: number };
}

export interface VectorIndex {
  provider: string;
  model: string;
  dim: number;
  project_id?: string;
  ids: string[];
  vectors: number[][];
}
