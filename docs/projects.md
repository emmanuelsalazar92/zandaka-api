# Proyectos · ZA-115

Proyectos agrupa trabajo por propósito. El ciclo de vida guarda metadatos de proyecto; los vínculos con transacciones llegan en ZA-116. La lista predeterminada incluye activos y finalizados. Archivar mueve el proyecto a otra vista y conserva la fecha de cierre. Restaurar conserva el estado anterior. Reabrir borra la fecha de cierre actual y permite editar.

La API monta GET/POST /api/projects, GET/PATCH /api/projects/:id y POST /api/projects/:id/finalize, /reopen, /archive y /restore. GET de colección toma view=visible|archived y page (20 por página), con orden por última modificación e ID. El título admite 1 a 120 caracteres tras recortar espacios. Los IDs de proyecto se generan en la API y los timestamps son UTC. PATCH y las transiciones exigen expectedRevision. Una mutación correcta incrementa revision; 409 indica revisión obsoleta o transición inválida. POST de creación admite requestId UUID opcional para repetir el mismo intento; misma clave y título devuelve el proyecto ya creado, misma clave y otro título devuelve 409.

En el entorno de perfil único, el propietario de Proyectos lo fija la API con ZANDAKA_PROJECT_OWNER_ID (1 por defecto), igual al perfil de la instalación. Las peticiones no admiten un userId del navegador y un ID ajeno devuelve 404. El aislamiento entre filas no autentica a los visitantes del entorno. Mantener la API detrás del acceso de red autorizado existente.

La tabla project se instala de forma aditiva y explícita. Sin ella el endpoint devuelve FEATURE_NOT_READY (503), mientras el resto de la API sigue disponible. No ejecutar el instalador en una copia de auditoría ni contra producción como parte de testing. Ver [despliegue y reversión](deploy-testing.md).

La prueba HTTP usa una SQLite sintética temporal. Cubre preparación idempotente, perfil ajeno, validación, paginación, reintento de creación, revisión concurrente y transiciones, y compara el libro antes/después. Reproducir con node --test -r ts-node/register tests/projects.test.ts.
