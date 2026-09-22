# frontend · visor del Atlas de Datos

Vite + TypeScript sin framework. Lee un AGF (`?agf=`) y el perfil (`?profile=`); sin backend. `npm run dev` para desarrollo, `npm run build` para `dist/`.
`npm run sync-data` copia `samples/`, `profiles/default.json` y `config/` a `public/data` (convierte los YAML de estándares y cronología a JSON).

Estructura: `src/engine/graph.ts` (motor del prototipo), `src/model.ts` (AGF → nodos y aristas por vista y faceta), `src/app.ts` (orquestación e historial), `src/ui/*` (pestañas), `src/adapters/*` (carga en el navegador), `src/search/*` (búsqueda híbrida, proveedor hash, camino), `src/project.ts` (consolidación y propuestas de relación).
Parámetros de URL: `aud=explorar|experto`, `mode=simple|detalle`, `view=estructura|combinada|tipo`.
