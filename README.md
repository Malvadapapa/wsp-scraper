# Bot de WhatsApp para Captura de LinkedIn en Google Sheets

Este proyecto en Node.js y TypeScript automatiza la captura y organización de enlaces de LinkedIn compartidos en un grupo de WhatsApp, almacenándolos de manera ordenada y visualmente atractiva en una hoja de Google Sheets.

El sistema se compone de dos flujos de trabajo independientes pero compartidos:
- **Módulo A (Importación Histórica)**: Un script de ejecución única que lee un archivo `.txt` exportado de WhatsApp (`chat.txt`), extrae los enlaces de LinkedIn de forma cronológica y los sube en lote (batch upsert) a la planilla de Google Sheets.
- **Módulo B (Escucha en Vivo 24/7)**: Un daemon continuo que utiliza Baileys (`@whiskeysockets/baileys`) para monitorear el grupo objetivo en tiempo real, registrando las detecciones en una cola local antes de subirlas a la nube para garantizar que ningún dato se pierda en caso de fallos de red.
- **Módulo C (Dashboard de Analytics)**: Un pipeline que descarga los registros de la Hoja 1, los cruza con clasificaciones de perfiles, y genera en la Hoja 2 ("Dashboard") tablas ordenadas de datos y 4 gráficos nativos interactivos estructurados en grilla con formato premium.

---

## 🛠️ Requisitos Previos

- **Node.js**: Versión 20 o superior.
- **WhatsApp**: Un número (recomendado secundario) para emparejar el bot mediante código QR.
- **Google Cloud Platform**: Proyecto con la API de Google Sheets habilitada y una **Cuenta de Servicio** configurada (las credenciales deben guardarse como `credentials.json` en la raíz del proyecto o pasarse como variable de entorno `GOOGLE_SERVICE_ACCOUNT_JSON`).
- **Google Sheet**: Compartir la planilla de destino otorgando permisos de **Editor** al email de la Cuenta de Servicio.

---

## 🚀 Instalación y Configuración

1. **Clonar e instalar dependencias**:
   ```bash
   npm install
   ```

2. **Configurar las credenciales de Google**:
   Coloca el archivo de credenciales JSON descargado de Google Cloud en la raíz del proyecto con el nombre `credentials.json`, o bien guárdalo en la variable de entorno `GOOGLE_SERVICE_ACCOUNT_JSON` en tu archivo `.env`.

3. **Configurar el archivo de entorno**:
   Copia el archivo `.env.example` como `.env` y edita los valores con el ID de tu Google Sheet:
   ```ini
   GOOGLE_SPREADSHEET_ID=tu_spreadsheet_id_aqui
   GOOGLE_SHEET_NAME=Hoja 1
   DATE_FORMAT=D/M/YYYY
   TZ=America/Argentina/Cordoba
   ```

---

## 📖 Instrucciones de Uso

### Paso 1: Obtener el JID del grupo
Los grupos de WhatsApp se identifican con un JID único. Para encontrar el JID del grupo que deseas monitorear:
```bash
npm run list-groups
```
1. Escanea el código QR que se muestra en tu terminal usando WhatsApp en tu celular (Configuración > Dispositivos Vinculados).
2. El script listará en consola los nombres de tus grupos y sus JID (ej. `1203632948102@g.us`).
3. Copia el JID del grupo de prueba/definitivo y agrégalo en tu archivo `.env`:
   ```ini
   TARGET_GROUP_JID=1203632948102@g.us
   ```

### Paso 2: Iniciar la escucha en vivo (Módulo B)
Una vez configurado el JID en tu `.env`, ejecuta el bot de escucha en vivo:
```bash
npm run start-live
```
- El bot leerá la hoja de cálculo, aplicará automáticamente el **diseño estético premium** (cabecera azul, zebra striping, columnas auto-ajustadas) y quedará activo escuchando mensajes.
- Si envías un enlace de LinkedIn en el grupo, este se registrará de inmediato.

### Paso 3: Importar el historial de chat (Módulo A)
Para importar el historial previo desde tu archivo exportado de WhatsApp (guárdalo como `chat.txt` en la raíz del proyecto):
```bash
npm run import-history
```
*Este proceso realiza un escaneo secuencial rápido y ejecuta un upsert masivo eficiente agrupando celdas contiguas, evitando chocar contra los límites de cuota de la API de Google.*

### Paso 4: Generar el Dashboard de Analytics (Módulo C)
Una vez clasificados los datos e importados en la Hoja 1, ejecuta el módulo de visualización:
```bash
npm run analytics
```
*Este comando descargará el dataset de Google Sheets, procesará las clasificaciones agregadas en `data/classifications.json` y creará la solapa `Dashboard` con un panel visual premium e interactivo con gráficos nativos.*

### Ejecutar Pruebas
Puedes ejecutar la suite de pruebas unitarias para validar el comportamiento del extractor y parseador usando:
```bash
npm run test
```

---

## 🏛️ Arquitectura del Código

La estructura sigue principios de **Clean Architecture**, dividiendo las responsabilidades y limitando el largo de los archivos para maximizar la mantenibilidad:

```
src/
  analytics/
    analyzer.ts            # Lógica pura de agregación, país por prefijo y distribución horaria
    chartSpecs.ts          # Especificaciones estructuradas para los gráficos nativos de Google Sheets
    dashboardWriter.ts     # Escritura y formateo premium de tablas y gráficos en solapa "Dashboard"
    run.ts                 # Orquestador del pipeline de análisis y visualización
  core/
    config.ts              # Validación en arranque de variables de entorno mediante Zod
    logger.ts              # Logger estructurado utilizando Pino
    linkedinExtractor.ts   # Regex pura para detectar y normalizar URLs de LinkedIn
    sheetsFormatter.ts     # Aplicación del diseño estético (UX/UI) a la hoja de cálculo
    sheetsWriter.ts        # Operaciones de API de Google Sheets y lógica de cacheo/batching
  historyImport/
    parseExport.ts         # Parser secuencial del log de chat WhatsApp .txt con soporte multilínea
    run.ts                 # Orquestador del script de importación histórico
  liveListener/
    baileysSocket.ts       # Ciclo de vida y reconexión resiliente del cliente de Baileys
    queueProcessor.ts      # Cola local append-only (data/queue.jsonl) ante fallos de la API
    listen.ts              # Callback central de mensyjería y persistencia en vivo
  utils/
    downloadSheet.ts       # Utilidad para descargar datos de Sheets vía API a JSON local
    listGroups.ts          # Utilidad para login temporal y mapeo de nombres de grupos
  types/
    index.ts               # Interfaces y definiciones estrictas de TypeScript
```

### 💎 Formato UX/UI Premium de Google Sheets
Para asegurar que la planilla compartida tenga una excelente lectura, la aplicación automatiza:
- **Cabecera Destacada**: Fondo azul marino elegante (`#1A365D`) con texto en blanco negrita, alineado en el centro.
- **Fila Congelada**: La fila 1 se mantiene siempre fija al hacer scroll.
- **Zebra Striping**: Filas de datos alternan color de fondo blanco y gris claro (`#F7FAFC`) de forma automática.
- **Ajuste de Texto**: El mensaje original de WhatsApp tiene habilitado el ajuste de texto en la celda para evitar deformar el layout.
- **Dashboard Autocontenido**: La pestaña secundaria consolida la información organizada con bordes limpios, alineación numérica estricta y gráficos nativos de torta, columnas y líneas sincronizados directamente con las tablas generadas.
