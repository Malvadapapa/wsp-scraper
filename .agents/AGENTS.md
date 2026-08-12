# Workspace Rules — Clean & Modular Architecture

Reglas para mantener el código de `wsp-scraper` mantenible, escalable y fácil de compartir. El bot corre 24/7, lee un grupo de WhatsApp con Baileys y escribe en Google Sheets vía API directa, así que además de arquitectura limpia priorizamos **resiliencia** e **integridad de datos**.

## 1. Modular Design & File Limits
- **Single Responsibility**: cada archivo tiene un propósito único (parsing, integración con Sheets, listener en vivo, procesamiento de historial `.txt`, etc.).
- **Max File Length**: ningún archivo debe superar 200 líneas. Si crece más, se refactoriza en submódulos o funciones utilitarias.
- **Pure Functions**: la lógica de negocio (extracción de URLs de LinkedIn, parseo de fechas, normalización de números de teléfono) debe ser pura, testeable y separada de la IO/efectos secundarios.
- **Estructura sugerida**:
  ```
  src/
    core/        # config, logger, tipos base
    whatsapp/    # conexión Baileys, manejo de sesión/reconexión
    parser/      # funciones puras: extracción de LinkedIn, fechas, dedupe
    sheets/      # cliente Google Sheets, mapeo de columnas, batch writes
    history/     # procesamiento del .txt exportado
    types/       # interfaces y modelos compartidos
  ```

## 2. TypeScript Best Practices
- **Strict Typing**: nada de `any`. Definir `interface`/`type` para todos los modelos (`Message`, `LinkedInRecord`, `QueueItem`, etc.).
- **Enums & Consts**: usar `const enum` u objetos `readonly` para estados, razones de desconexión y niveles de log.
- **Dependency Injection**: inyectar dependencias (cliente de Sheets, logger, config) en funciones y constructores para que sean desacoplables y testeables.
- **Validación de esquemas**: usar una librería como `zod` para validar en runtime los datos que entran desde WhatsApp y desde el `.txt` de historial (evita que un mensaje mal formado rompa el pipeline).

## 3. Configuration & Startup Validation
- **Typed Config**: todas las variables de entorno se cargan, parsean y validan en `src/core/config.ts` al arrancar. Si falta una variable requerida, la app lanza un error descriptivo y termina inmediatamente.
- **Secrets**: nunca commitear `.env`, `credentials.json` ni la carpeta de sesión de Baileys (auth state). Mantener un `.env.example` documentado como referencia.

## 4. Resiliencia y manejo de sesión (proceso 24/7)
- **Reconexión**: implementar backoff exponencial ante desconexiones de Baileys, distinguiendo `loggedOut` (requiere re-vincular manualmente) de otras causas (reconectar automáticamente).
- **Persistencia de sesión**: usar `multi-file auth state` de Baileys para no perder la sesión ante reinicios; excluir esa carpeta del repo.
- **Shutdown ordenado**: manejar `SIGINT`/`SIGTERM` para cerrar la conexión de WhatsApp y el cliente de Sheets sin dejar escrituras a medias.

## 5. Integridad de datos e idempotencia
- **Dedupe**: usar el número de teléfono normalizado como clave única; si la misma persona reenvía su LinkedIn, se actualiza la fila existente (upsert), nunca se duplica.
- **Escritura secuencial**: procesar mensajes en una cola (evitar condiciones de carrera si dos mensajes llegan casi al mismo tiempo y afectan la misma fila).
- **Orden del historial**: al cargar el `.txt` exportado, preservar el orden cronológico original al rellenar la hoja.

## 6. Uso de la API de Google Sheets
- **Batching**: agrupar lecturas/escrituras (`batchUpdate`) en vez de llamar a la API por cada mensaje individual, para no chocar con los límites de cuota.
- **Retry con backoff**: reintentar con backoff exponencial ante errores `429`/`5xx`.
- **Cache de estructura**: cachear el mapeo de columnas/índice de filas en memoria en vez de releer la hoja completa en cada operación.

## 7. Logging & Observabilidad
- Logger estructurado (por ejemplo `pino`) con niveles `debug`/`info`/`warn`/`error`; nada de `console.log` en código de producción.
- Loggear eventos clave: mensaje nuevo parseado, fila actualizada en Sheets, intentos de reconexión, errores de la API.

## 8. Testing
- Tests unitarios para las funciones puras (parser de LinkedIn, fechas, normalización de teléfono) con Vitest o Jest.
- Los tests no deben golpear WhatsApp ni Google Sheets reales: mockear esas fronteras de IO.

## 9. Calidad de código
- ESLint + Prettier configurados; sin warnings antes de commitear (opcional: hook de pre-commit con Husky).
- Convenciones consistentes de imports y naming en todo el repo.

## 10. Git Workflow
- Commits periódicos en hitos lógicos a la rama `main` de `https://github.com/Malvadapapa/wsp-scraper`.
- Mensajes de commit en formato Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`) para mantener un historial legible.
- `.gitignore` debe excluir `.env`, `credentials.json` y la carpeta de sesión de Baileys.