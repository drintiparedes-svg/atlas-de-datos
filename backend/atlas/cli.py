"""CLI del Atlas de Datos.

  atlas ingest ARCHIVO... -o salida.agf.json      documentos → AGF (una fuente por archivo; varias → proyecto)
  atlas project A.agf.json B.agf.json -o P.agf.json  consolidar fuentes en un proyecto y proponer relaciones
  atlas embed  X.agf.json [--provider hash|st|ollama]  índice de vectores lateral (X.vectors.json)
  atlas relate X.agf.json                          propuestas same_as / relates (in place)
  atlas search X.agf.json "consulta"               búsqueda híbrida
  atlas path   X.agf.json ID_A ID_B                camino más corto explicado
  atlas inventory X.agf.json                       métricas «qué tiene la base»
  atlas validate X.agf.json                        validar contra el esquema
  atlas export-memory X.agf.json -o DIR            memory.jsonl + fichas markdown
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import PROFILE_PATH, agf as A, guard, memory, project as P, relations, search as S
from .adapters import parse_file
from .embeddings import get_provider
from .embeddings.index import build_index, load_index, save_index


def _load(p: str) -> dict:
    return json.loads(Path(p).read_text(encoding="utf-8"))


def _save(agf: dict, p: str) -> None:
    Path(p).parent.mkdir(parents=True, exist_ok=True)
    Path(p).write_text(json.dumps(agf, ensure_ascii=False, indent=1), encoding="utf-8")


def _profile() -> dict:
    return json.loads(PROFILE_PATH.read_text(encoding="utf-8"))


def raw_text(path: Path, doc) -> str:
    if path.suffix.lower() == ".docx":
        import docx
        return "\n".join(p.text for p in docx.Document(str(path)).paragraphs)
    if path.suffix.lower() in (".xlsx",):
        return "\n".join(" ".join(e.name for e in s.elements) for s in doc.sections)
    try:
        return path.read_text(encoding="utf-8", errors="replace")[:2_000_000]
    except OSError:
        return ""


def cmd_ingest(a):
    outs = []
    for f in a.files:
        path = Path(f)
        doc = parse_file(path)
        rep = guard.scan_text(raw_text(path, doc))
        if rep.blocked and not a.allow_personal_data:
            print(f"[{path.name}] {rep.summary()} Detalle: {rep.samples}", file=sys.stderr)
            print("Use --allow-personal-data solo si confirmó que el documento no contiene datos de pacientes.", file=sys.stderr)
            return 2
        g = A.build(doc, project_id=a.project_id, project_name=a.project_name, root_name=a.root_name,
                    timeline=None if a.timeline == "none" else a.timeline)
        g["sources"][0]["personal_data_guard"] = {"hits": rep.hits, "confirmed_by_user": bool(rep.blocked)}
        outs.append(g)
        s = doc.summary()
        print(f"[{path.name}] {doc.adapter}: {s['sections_top']} secciones, {s['subsections']} subsecciones, {s['elements']} elementos, {s['unparsed']} sin clasificar, {len(g['findings'])} hallazgos", file=sys.stderr)
    if len(outs) == 1:
        g = outs[0]
    else:
        g = P.merge(outs, a.project_id or "prj_" + Path(a.output).stem.replace(".agf", ""), a.project_name or Path(a.output).stem)
    if a.relate:
        prov = get_provider(a.provider)
        idx = build_index(g, prov, _profile()) if prov else None
        g["edges"] += relations.propose(g, idx)
        P.add_shares(g)
        if idx:
            save_index(idx, a.output)
    A.validate(g)
    _save(g, a.output)
    print(json.dumps(A.stats(g), ensure_ascii=False, indent=1))
    return 0


def cmd_project(a):
    srcs = [_load(f) for f in a.files]
    g = P.merge(srcs, a.project_id or "prj_" + Path(a.output).stem.replace(".agf", ""), a.name)
    if not a.no_relate:
        prov = get_provider(a.provider)
        idx = build_index(g, prov, _profile()) if prov else None
        g["edges"] += relations.propose(g, idx, same_as_threshold=a.same_as_threshold)
        n = P.add_shares(g)
        if idx:
            save_index(idx, a.output)
        print(f"{sum(1 for e in g['edges'] if e['kind']=='same_as')} same_as, {sum(1 for e in g['edges'] if e['kind']=='relates')} relates, {n} shares (todas proposed)", file=sys.stderr)
    A.validate(g)
    _save(g, a.output)
    print(json.dumps(P.inventory(g)["totals"], ensure_ascii=False))
    return 0


def cmd_embed(a):
    g = _load(a.file)
    prov = get_provider(a.provider)
    if not prov:
        print("proveedor apagado", file=sys.stderr); return 1
    idx = build_index(g, prov, _profile())
    out = save_index(idx, a.file)
    print(f"{len(idx['ids'])} vectores ({prov.name} · {prov.model} · {idx['dim']} dim) → {out}")
    return 0


def cmd_relate(a):
    g = _load(a.file)
    idx = load_index(a.file)
    if idx is None and a.provider != "off":
        prov = get_provider(a.provider)
        idx = build_index(g, prov, _profile()) if prov else None
        if idx:
            save_index(idx, a.file)
    new = relations.propose(g, idx, same_as_threshold=a.same_as_threshold)
    g["edges"] += new
    n = P.add_shares(g)
    A.validate(g)
    _save(g, a.output or a.file)
    print(f"{len(new)} propuestas nuevas ({sum(1 for e in new if e['kind']=='same_as')} same_as, {sum(1 for e in new if e['kind']=='relates')} relates), {n} shares")
    return 0


def cmd_search(a):
    g = _load(a.file)
    idx = load_index(a.file)
    qvec = None
    if idx:
        prov = get_provider(a.provider or idx.get("provider"))
        if prov and prov.name == idx.get("provider"):
            qvec = prov.embed_one(a.query, "query")
    for r in S.search(g, a.query, idx, qvec, k=a.k):
        print(f"{r['score']:.2f}  {r['kind']:<10} {r['name']}   ({r['id']}; léxico {r['lexical']:.2f}, semántico {r['semantic']:.2f})")
    return 0


def cmd_path(a):
    g = _load(a.file)
    names = {n["id"]: n["name"] for n in g["nodes"]}
    path = S.shortest_path(g, a.a, a.b)
    if not path:
        print("sin camino"); return 1
    for step in path:
        e = step["edge"]
        print(f"{names[step['from']]}  --{e['kind']}{'/' + e['predicate'] if e.get('predicate') else ''} ({e.get('status', 'validated')})-->  {names[step['to']]}")
    return 0


def cmd_inventory(a):
    print(json.dumps(P.inventory(_load(a.file), _profile()), ensure_ascii=False, indent=1)); return 0


def cmd_validate(a):
    A.validate(_load(a.file)); print("AGF válido"); return 0


def cmd_stats(a):
    print(json.dumps(A.stats(_load(a.file)), ensure_ascii=False, indent=1)); return 0


def cmd_export_memory(a):
    r = memory.export(_load(a.file), a.output, _profile(), include_proposed=a.include_proposed)
    print(json.dumps(r, ensure_ascii=False)); return 0


def main(argv=None):
    p = argparse.ArgumentParser(prog="atlas", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd", required=True)
    s = sp.add_parser("ingest"); s.add_argument("files", nargs="+"); s.add_argument("-o", "--output", required=True)
    s.add_argument("--project-id"); s.add_argument("--project-name"); s.add_argument("--root-name")
    s.add_argument("--timeline", default="oncologia"); s.add_argument("--allow-personal-data", action="store_true")
    s.add_argument("--relate", action="store_true"); s.add_argument("--provider", default=None); s.set_defaults(fn=cmd_ingest)
    s = sp.add_parser("project"); s.add_argument("files", nargs="+"); s.add_argument("-o", "--output", required=True)
    s.add_argument("--name", required=True); s.add_argument("--project-id"); s.add_argument("--provider", default=None)
    s.add_argument("--no-relate", action="store_true"); s.add_argument("--same-as-threshold", type=float, default=0.85); s.set_defaults(fn=cmd_project)
    s = sp.add_parser("embed"); s.add_argument("file"); s.add_argument("--provider", default=None); s.set_defaults(fn=cmd_embed)
    s = sp.add_parser("relate"); s.add_argument("file"); s.add_argument("-o", "--output"); s.add_argument("--provider", default=None)
    s.add_argument("--same-as-threshold", type=float, default=0.85); s.set_defaults(fn=cmd_relate)
    s = sp.add_parser("search"); s.add_argument("file"); s.add_argument("query"); s.add_argument("-k", type=int, default=10); s.add_argument("--provider", default=None); s.set_defaults(fn=cmd_search)
    s = sp.add_parser("path"); s.add_argument("file"); s.add_argument("a"); s.add_argument("b"); s.set_defaults(fn=cmd_path)
    s = sp.add_parser("inventory"); s.add_argument("file"); s.set_defaults(fn=cmd_inventory)
    s = sp.add_parser("validate"); s.add_argument("file"); s.set_defaults(fn=cmd_validate)
    s = sp.add_parser("stats"); s.add_argument("file"); s.set_defaults(fn=cmd_stats)
    s = sp.add_parser("export-memory"); s.add_argument("file"); s.add_argument("-o", "--output", required=True)
    s.add_argument("--include-proposed", action="store_true"); s.set_defaults(fn=cmd_export_memory)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
