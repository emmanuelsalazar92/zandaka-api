# ZA-137 · Ruta hacia TypeScript 7

La evaluación se hizo con Node 26.13.1 y TypeScript 7.0.2 en un directorio aislado. La línea de integración permanece en TypeScript 5.9.3 mientras se resuelven las dependencias de la API del compilador. Se conservan las comprobaciones de compilación, tipos, lint y pruebas.

| Comprobación                                                         | Resultado                                                                                                                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web con `tsc` 7.0.2 y su configuración actual                        | Pasó la comprobación de tipos sin emitir archivos.                                                                                                                                      |
| API con `tsc` 7.0.2 y su configuración actual                        | `TS5108` porque `moduleResolution: "node"` corresponde al modo retirado `node10`.                                                                                                       |
| API con `--module nodenext --moduleResolution nodenext` en la prueba | Compiló en un directorio temporal y el código emitido respondió `200` en `GET /api/health` con SQLite sintética.                                                                        |
| `ts-node` 10.9.2 con TypeScript 7.0.2                                | Falla antes de ejecutar el programa al acceder a `ts.sys.fileExists`. Afecta pruebas, desarrollo y scripts de preparación de DB de la API.                                              |
| `@typescript-eslint/parser` 8.74.0                                   | Su peer estable exige TypeScript `>=4.8.4 <6.1.0`. Las versiones actuales de ambos repositorios limitan el rango a `<6.0.0`.                                                            |
| Next 16.4.6 y Vitest 5.1.2                                           | El chequeo CLI aislado de Web valida el código fuente. Queda pendiente validar el build completo de Next, el flujo de tipos generados y Vitest con el árbol de dependencias definitivo. |

## Orden de implementación en staging

1. **Preparar módulos de API.** Probar `NodeNext` primero con TypeScript clásico. Confirmar que la salida sigue siendo ejecutable por el punto de entrada actual de Docker. Probar el arranque, OpenAPI, carga de SQLite y generación de PDF. Conservar `strict`, mapas y declaraciones. Verificar scripts de preparación solo sobre una base sintética.
2. **Validar la vía clásica de TypeScript 6.** Alinear primero los parsers y plugins de ESLint con una versión que admita TypeScript 6, incluidos los que trae el preset de Next. Coordinarlo con ZA-138. Comprobar `npm ci`, build, tipos, lint y pruebas sin forzar peers. Verificar también `ts-node` y sus scripts antes de promover TypeScript 6.
3. **Adoptar TypeScript 7 cuando estén resueltos los consumidores de su API.** Elegir entre mantener un compilador clásico compatible para las herramientas que aún llaman a la API, o migrarlas a alternativas compatibles. Para una transición con dos compiladores, usar la estrategia de alias descrita por Microsoft y configurar explícitamente cuál usa Next y cuál usa ESLint. Medir el beneficio antes de introducir esa configuración de forma permanente.
4. **Gate de entrega.** Ambos repositorios deben pasar instalación limpia, tipos, build, lint y pruebas en Node 26. Comprobar desarrollo y scripts operativos, y arrancar la imagen API compilada para ambas plataformas de publicación. Registrar evidencia con datos sintéticos. El éxito del CLI aislado acredita tipos y emit, pero todavía falta validar la cadena completa.

[Guía de adopción de TypeScript 7](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) · [Soporte de versiones de typescript-eslint](https://typescript-eslint.io/users/dependency-versions/)
