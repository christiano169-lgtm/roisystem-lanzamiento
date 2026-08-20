# ROISystem — Backend + Frontend (Fase 1 + Fase 2 + Fase 3 + Fase 3.5 + Fase 4 + Fase 5 + Fase 6)

Plataforma multi-tenant para el dashboard AutoKPI/ROISystem. Cada subcuenta
de GoHighLevel se conecta pegando su propio **Private Integration Token**
(Fase 6 — ver "Conexión con GHL" más abajo; ya no es OAuth/Marketplace app);
el backend sincroniza contactos, oportunidades, llamadas,
citas, chats y usuarios de todas sus Locations (subcuentas) hacia Postgres
(**Fase 1**), calcula KPIs reales sobre esos datos (**Fase 2** — reemplazando
la función `factor()` simulada que tenía el mock original `AutoKPI.dc.html`),
mide con IA el grado de interés y la calidad de cada conversación — llamada
(GHL), videollamada (Fathom, conectado por cada closer) y chat (GHL) — para
reportarle a los managers, por closer, la calidad y los aspectos de mejora,
y opcionalmente escribe ese análisis de vuelta al contacto en GHL como
etiqueta + nota (**Fase 3**). **Fase 3.5** agrega: mover automáticamente la
oportunidad de etapa según el interés detectado (opt-in, configurable por
subcuenta), un resumen de patrones de mejora repetidos entre varios closers
(no solo por closer individual), e integraciones de **Meta Ads** (inversión y
leads por campaña) y **Hotmart** (ventas de cursos/infoproductos) por
subcuenta. Desde **Fase 4** hay un frontend real (`frontend/`, Vite + React)
que consume toda esta API — login, conexión de GHL, selector de subcuenta y
7 pantallas con datos reales, reemplazando por completo el mock. **Fase 5**
agrega la capa de operador de plataforma: quien vende/opera ROISystem tiene
una cuenta "admin de plataforma" (creada automáticamente la primera vez que
alguien se registra en una instalación nueva) con un Panel maestro para dar
de alta agencias clientes a mano (el registro público queda cerrado después
de esa primera vez) y marcar manualmente si cada una está en prueba,
activa, atrasada o suspendida (suspendida bloquea su próximo login).

**Fuera de alcance todavía**: cobro automático (Stripe u otro) de la
mensualidad a las agencias clientes — confirmado con el usuario que por
ahora el estado de cada suscripción se marca a mano en el Panel maestro;
integración real de pasarela de pago para las ventas de las agencias (ver
"Efectivo cobrado" más abajo — sigue siendo manual, solo se le agregó UI);
OAuth real de Fathom (Fathom sí lo ofrece para apps de terceros, pero
requiere registrar ROISystem como partner — ver "Escritura de vuelta a GHL y
Fase 3.5" más abajo); paginación más allá de la primera página en las sync
de Meta Ads/Hotmart; y tiempo real "de fábrica" desde GHL (sin Marketplace
app, el webhook nativo ya no aplica — ver "Conexión con GHL (Fase 6)").

## Frontend (Fase 4)

Proyecto separado en `frontend/` (Vite + React + TypeScript + Tailwind, con
su propio `package.json`). Cubre el flujo principal de punta a punta: login/
registro → conectar GHL → elegir subcuenta → sincronizar → ver KPIs reales
(tarjetas operativas, embudo por etapa, ranking por asesor — y, si la
subcuenta tiene Meta Ads y/o Hotmart conectados, un bloque adicional de
tarjetas con inversión/leads/costo por lead y ventas/ingresos de Hotmart
para el mismo rango de fechas), más pantallas adicionales bajo la misma
shell (`AppLayout` con navegación por pestañas):

- **`/app/quality`** — reporte de calidad por closer (interés promedio,
  puntaje de calidad, notas de mejora expandibles), consumiendo
  `GET /api/quality/summary` con filtros de rango y canal (llamada/
  videollamada/chat), más un botón "Analizar temas del equipo" (Fase 3.5,
  `GET /api/quality/themes`) que sintetiza con IA los patrones de mejora
  repetidos ENTRE closers — a diferencia del resto de la página (agregados
  de base de datos, se recargan solos con los filtros), esto es una llamada
  a OpenAI y por eso es manual, no automático en cada cambio de filtro.
- **`/app/settings`** — clave de OpenAI a nivel agencia (solo admin);
  interruptor de escritura automática a GHL (Fase 3.5, tag+nota) y reglas de
  movimiento de etapa por nivel de interés (Fase 3.5, un dropdown de etapa
  por bucket alto/medio/bajo); conexión de Meta Ads y de Hotmart por
  subcuenta (Fase 3.5, admin, conectar/desconectar/sincronizar); conexión
  personal de Fathom por closer (conectar/desconectar/sincronizar, con
  instrucciones de dónde sacar la API key); y vínculo del usuario del
  dashboard con su `ghlUserId` (necesario para que el ranking y la calidad
  le atribuyan sus llamadas/citas/videollamadas).
- **`/app/payments`** — lista de pagos (`GET /api/payments`, filtrable por
  rango de fechas) más un formulario de registro manual (`POST /api/payments`,
  solo admin/manager) con buscador de oportunidad por nombre. Sigue siendo
  100% registro manual — no hay pasarela de pago conectada.
- **`/app/advisor/:ownerGhlId`** — panel de un asesor individual
  (`GET /api/kpis/advisor`), con las mismas métricas del ranking del
  Dashboard más el tiempo real al lead (que en la fila de ranking siempre
  viene `null` por costo de cómputo). Se llega ahí haciendo clic en el
  nombre de un asesor en la tabla de ranking del Dashboard.
- **`/app/overview`** ("Resumen", primera pestaña) — vista agregada de
  agencia: suma los KPIs operativos de todas las Locations del tenant
  (`GET /api/kpis/operational-multi`, sin `locationId` — se resuelve
  implícitamente desde el tenant autenticado) más una tabla con el
  desglose por subcuenta. Las tasas/promedios del total (tasa de
  contestación, ticket promedio) se recalculan desde los conteos sumados
  de todas las Locations, no promediando los porcentajes ya calculados de
  cada una, para que se mantengan matemáticamente consistentes.

Con esto el frontend ya cubre todas las pantallas del mock original,
incluida la vista agregada multi-location.

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_BASE_URL apunta a http://localhost:4000 por defecto
npm run dev             # http://localhost:5173
```

Necesita el backend corriendo (`npm run dev` + `npm run worker` desde la
raíz, con Postgres/Redis levantados) para que el login y los datos
funcionen — sin backend, solo se ven las pantallas de login/registro (ya
verificado visualmente que renderizan sin errores de consola).

## Stack

Node.js + TypeScript + Express + Prisma (Postgres) + BullMQ (Redis, jobs en
background para backfill, refresh de tokens, transcripción con Whisper,
análisis de calidad con IA y sync de Fathom) + OpenAI SDK (Whisper +
chat completions con structured output).

## Arquitectura de integración con GHL (verificada contra la documentación oficial)

El equipo de GHL publica los specs OpenAPI reales en
[github.com/GoHighLevel/highlevel-api-docs](https://github.com/GoHighLevel/highlevel-api-docs)
(`apps/*.json`) y la tabla de scopes en
[`docs/oauth/Scopes.md`](https://github.com/GoHighLevel/highlevel-api-docs/blob/main/docs/oauth/Scopes.md).
Todo lo de esta sección se verificó contra esas fuentes el 2026-08-03 — no es
una suposición.

**1. Todos los endpoints de recursos son Sub-Account, no Agencia** — `contacts`,
`opportunities`, `calendars/events`, `conversations` están marcados como
**Sub-Account** en la tabla de scopes. Esto ya no importa para el flujo de
auth (Fase 6 usa un token por Location directamente, ver "Conexión con GHL
(Fase 6)" abajo), pero explica por qué cada subcuenta necesita su propio
Private Integration Token en vez de uno solo por agencia.

**2. GHL no tiene un recurso "calls".** No existe `/calls/` ni los eventos de
webhook `CallCreate`/`CallUpdate` (confirmado: no aparecen en
`docs/webhook events/`). Una llamada telefónica es un **Message** dentro de
una Conversation, con `messageType` `TYPE_CALL` (API REST) o `CALL` (payload
de webhook), y trae `callDuration`, `callStatus`, `userId` (quién la hizo/
recibió) y la URL de grabación en `attachments[0]`. Por eso
`src/modules/ghl/sync/calls.ts` ya no pega contra ningún endpoint — solo
expone `upsertCallFromMessage`, llamado desde
`src/modules/ghl/sync/conversations.ts` (backfill) y desde
`src/modules/ghl/webhooks.ts` (tiempo real, eventos `InboundMessage`/
`OutboundMessage`). La tabla `Call` en Postgres no cambió — solo de dónde
sale su data.

**3. GHL ya transcribe llamadas.** Existe
`GET /conversations/locations/{locationId}/messages/{messageId}/transcription`
— `src/modules/quality/transcription.ts` la intenta primero y solo cae a
Whisper si GHL no tiene transcripción para esa llamada.

**4. Lo que sigue siendo suposición** (marcado con `NOTE:` en el código):
el contrato exacto de la API de **Fathom** (`src/modules/fathom/*`) — GHL no
tiene relación con Fathom, así que no hay specs oficiales que verificar de
la misma forma — y algunos valores de `status` (ver "Supuestos de los KPIs"
más abajo).

**5. Escribir de vuelta a GHL (Fase 3.5) también está verificado.** Contra el
mismo repo de docs oficiales: `POST /contacts/{contactId}/tags` (agregar
etiquetas), `POST /contacts/{contactId}/notes` (agregar nota), y
`PUT /opportunities/{id}` con `pipelineStageId` en el body (mover etapa) —
`GET /opportunities/pipelines?locationId=` es el endpoint para listar
pipelines/etapas válidas (usado ya, indirectamente, por el sync de
`PipelineStage`). Implementado en `src/modules/quality/writeback.ts`.

## Conexión con GHL (Fase 6)

**Cambio de arquitectura sobre Fase 1-5**: ya no se usa OAuth/Marketplace
app. Se cambió a **Private Integration Token (PIT)** por dos razones reales
del usuario: (1) no tiene su propia cuenta de agencia en GHL — siempre ha
operado desde las cuentas de sus clientes, así que no podía registrar una
Marketplace app (eso requiere una cuenta propia); y (2) una app Marketplace
en modo "Private/Testing" solo admite **5 instalaciones de agencia** antes
de bloquearse (confirmado contra help.gohighlevel.com/changelog, política
vigente desde el 18 nov 2025) — publicarla requiere pasar la revisión de
GHL, que no se puede automatizar ni predecir desde aquí.

**Cómo funciona ahora:**

- Cada cliente entra a **su propia** subcuenta de GHL → Settings → Private
  Integrations → genera un token con los scopes de contactos, oportunidades,
  calendarios/citas, conversaciones y **formularios** (`forms.readonly` —
  necesario para el módulo de Lanzamientos, ver más abajo: asistencia a
  clases detectada por formulario de acceso). Lo pega en ROISystem
  (`POST /api/locations`, formulario "Conectar subcuenta" en el frontend).
- Confirmado contra `marketplace.gohighlevel.com/docs/Authorization/
  PrivateIntegrationsToken` (2026-08-04): header `Authorization: Bearer
  <token>` (igual que antes), el token es estático — no expira ni necesita
  refresh (GHL recomienda rotarlo cada 90 días; `POST /api/locations/:id/
  token` permite reemplazarlo cuando eso pase), y no requiere que ROISystem
  esté registrado como Marketplace app en absoluto — cero límite de
  instalaciones, cero revisión de GHL.
- `src/modules/ghl/client.ts` quedó mucho más simple: sin agencia, sin
  refresh, sin caché de tokens — decrypta el `Location.ghlPitCipher` de la
  base de datos y lo usa directo en cada request.
- **Trade-off real, no gratis**: sin Marketplace app, GHL no manda
  webhooks nativos (`InboundMessage`, `ContactCreate`, etc. — esos
  dependían de una suscripción de app). El tiempo real ahora es
  "mejor esfuerzo": si un cliente quiere que su sistema se entere al
  instante de algo, tiene que armar un Workflow en su propio GHL con una
  acción "Webhook" apuntando a `/webhooks/ghl` — la forma del payload la
  define ese Workflow, no algo que ROISystem controle (ver
  `src/modules/ghl/webhooks.ts`). La sincronización confiable sigue siendo
  el botón "Sincronizar ahora" (backfill completo, sin depender de
  webhooks).
- **Publicar en el Marketplace de GHL sigue siendo una opción a futuro** si
  el usuario decide en algún momento crear su propia cuenta de agencia y
  pasar por la revisión de GHL — eso desbloquearía instalación con un clic
  + webhooks nativos otra vez. No implementado, es una decisión de negocio
  del usuario, no algo pendiente de código.

## Escritura de vuelta a GHL y Fase 3.5

**Etiqueta + nota (`Tenant.aiWriteBackEnabled`, opt-in, admin, apagado por
defecto):** cada análisis de calidad exitoso agrega al contacto en GHL una
etiqueta de interés (`ia-interes-alto/medio/bajo`), una etiqueta por cada
objeción detectada (`objecion-<slug>`), y una nota con el resumen + aspectos
de mejora del coach de IA. Nunca lanza error — si falla (token vencido,
contacto no encontrado, GHL caído), solo lo loguea; el análisis de calidad
que ya corrió con éxito no se pierde.

**Mover etapa (`StageAutomationRule`, opt-in por subcuenta, requiere que lo
anterior esté activado):** un admin configura, por nivel de interés
(alto/medio/bajo), a qué etapa mover la oportunidad abierta más reciente del
contacto. "Abierta" es una heurística, no una garantía de GHL — el enum de
`status` más allá de `open`/`won` no está documentado (ver "Supuestos de los
KPIs"), así que solo se excluye lo único confirmado como cerrado (`won`); un
contacto con varias oportunidades concurrentes podría mover la que no era.
Un contacto puede tener 0 reglas configuradas (no se mueve nada) hasta 3 (una
por bucket).

**Temas comunes del equipo (`GET /api/quality/themes`):** a diferencia de
`/api/quality/summary` (agregado de base de datos, se recarga solo con los
filtros), esto es una llamada a OpenAI que agrupa las notas de mejora de
TODOS los closers del rango y encuentra patrones repetidos — por eso en el
frontend es un botón ("Analizar temas del equipo"), no algo automático, para
no disparar una llamada a OpenAI en cada cambio de fecha/canal.

**Meta Ads (`src/modules/metaAds/*`):** confirmado contra
`developers.facebook.com/docs/marketing-api/insights` — `GET /{ad-account-id}
/insights` con `access_token` como query param, `level=campaign`,
`time_increment=1`, campos `spend`/`impressions`/`clicks`/`actions`. Cada
subcuenta conecta su propio `adAccountId` + un token de acceso de tipo System
User (estándar para reporting server-a-servidor de agencias, evita el
App Review de Facebook Login que necesitaría un OAuth completo). **Sin
verificar**: el `action_type` exacto que Meta usa para contar leads en la
cuenta real que conectes (`sync/insights.ts` reconoce varias variantes
plausibles — `lead`, `onsite_conversion.lead_grouped`,
`offsite_conversion.fb_pixel_lead` — pero solo una prueba con datos reales
lo confirma), y la sync solo trae la primera página de resultados (revisar
`paging.next` si una cuenta tiene más campañas de las que caben en una
respuesta).

**Hotmart (`src/modules/hotmart/*`):** OAuth2 `client_credentials` y la URL
base de `/sales/history` confirmadas contra `developers.hotmart.com`. **Sin
verificar**: la página de specs de "Sales History" no se pudo leer completa
de forma automatizada, así que la forma exacta de cada venta en la respuesta
(`sync/sales.ts`) es la estructura anidada `purchase`/`buyer`/`product` más
comúnmente documentada para Hotmart, no algo confirmado contra un ejemplo
real — se parsea todo de forma defensiva y siempre se guarda el `raw`
completo para poder reconciliar sin rehacer la sync desde cero.

**Webhook de Hotmart (Fase 7, `src/modules/hotmart/webhooks.ts`):**
además del polling (`syncHotmartSales`, "Sincronizar ahora" / 90 días hacia
atrás), cada Location puede conectar el webhook de su propia cuenta Hotmart
para que las ventas nuevas lleguen en tiempo real — necesario para escalar
a más agencias sin depender de sincronizar manualmente. Como el payload de
Hotmart no trae ningún identificador de tenant (a diferencia de GHL, que sí
manda `locationId`), cada cliente apunta su webhook a una URL propia
(`POST /webhooks/hotmart/:locationId`, mostrada en Configuración → Hotmart)
y el body debe traer su "Hottok" (token que Hotmart muestra en Herramientas
> Webhook de esa cuenta) — se guarda cifrado y se compara contra el que
llega en cada request antes de aceptar el evento. **Sin verificar contra un
payload real**: el `event`/`data.purchase`/`data.buyer`/`data.product` de
`webhooks.ts` se reconstruyó de ejemplos de integraciones de terceros (la
doc oficial de Hotmart no se pudo leer completa de forma automatizada,
mismo problema que con `/sales/history` arriba) — confirmar nombres de
campo apenas dispare el webhook de una cuenta real y ajustar
`HotmartSaleItem` si difieren. El polling sigue siendo el path confiable de
respaldo, igual que con los webhooks de GHL.

**Fathom — bug real corregido:** el header de autenticación estaba mal —
`src/modules/fathom/client.ts` mandaba `Authorization: Bearer <key>`, pero
Fathom espera `X-Api-Key: <key>` (confirmado contra
`developers.fathom.ai/quickstart.md`). Ya corregido. Fathom también ofrece
OAuth para apps de terceros (`/oauth2/token`), lo que dejaría a cada closer
conectar con un clic en vez de pegar su API key — pero requiere registrar
ROISystem como partner de Fathom primero (un paso real en fathom.ai, no algo
que se pueda simular); el flujo de API key personal sigue siendo el único
conectable hoy.

## Lanzamientos (Fase 7)

Para agencias cuyo negocio es un lanzamiento (webinar/reto → carrito
abierto → carrito cerrado) en vez de un pipeline high-ticket continuo. Antes
de esto, esa data existía en GHL pero había que bajarla a Excel a mano
(tags, formularios llenados, ventas, asistencia a clases) para armar un
reporte — confirmado con el usuario que ese era el dolor real a resolver.

- **`Launch`** (`prisma/schema.prisma`): una entidad con `startDate`/
  `endDate` por Location — una agencia puede correr varios lanzamientos a
  lo largo del tiempo y compararlos, en vez de que todo caiga en un balde
  sin fechas. Todo lo demás de esta sección se filtra a esa ventana.
- **Ventas**: `Opportunity`/`HotmartSale` filtrados a las fechas del
  lanzamiento (`GET /api/launches/:id/summary`). Deliberadamente NO incluye
  `Payment` (cobro manual) — confirmado con el usuario que ese dato no hace
  falta acá.
- **Asistencia a clases**: nuevo sync de formularios de GHL
  (`src/modules/ghl/sync/forms.ts`, entidad `formSubmissions`, requiere el
  scope `forms.readonly` en el PIT — ver "Conexión con GHL" arriba).
  `LaunchAttendanceRule` deja que cada agencia defina, por lanzamiento, qué
  tag o qué formulario de GHL significa "entró a la clase 1/2/3..." — nada
  hardcodeado a una cuenta específica, así funciona igual para cualquier
  cliente nuevo que conecte su propio GHL. Las reglas por tag cuentan
  contactos que tienen esa etiqueta hoy (GHL no versiona cuándo se agregó
  un tag); las reglas por formulario sí quedan acotadas a la fecha exacta
  del envío.
- **Gestión de setters**: `GET /api/setters/summary` (ya existía, Fase 3.5)
  ahora se reutiliza filtrado a las fechas del lanzamiento — assignados/
  atendidos/pendientes/tiempo de primera respuesta por setter, calculado
  comparando el primer mensaje entrante vs. saliente de cada conversación
  (no hay un campo de estado persistido; es una agregación en cada consulta,
  igual que el resto de KPIs de este proyecto).
- Frontend: `/app/lanzamiento` (`frontend/src/routes/lanzamiento/
  LaunchDashboard.tsx`) — selector de lanzamiento + las 4 tarjetas de arriba
  en una sola vista. Alta de lanzamientos y reglas de asistencia en
  Configuración → pestaña "Lanzamientos".

## Panel maestro (Fase 5)

Capa de operador de plataforma — para quien vende/administra ROISystem, no
para las agencias clientes. Confirmado con el usuario: quiere control total
(ver/crear/suspender agencias, ver uso, cobro manual por ahora) y que el
registro público quede cerrado.

**Cómo funciona:**

- `User.isPlatformAdmin` (booleano, independiente del `role` admin/manager/
  asesor que sigue siendo por-tenant) marca a la persona que opera la
  plataforma. `POST /auth/register` — el registro público — **solo funciona
  una vez**: el primer usuario que se registre en una instalación nueva
  (`prisma.user.count() === 0`) se vuelve automáticamente platform admin con
  su propio tenant en `subscriptionStatus: 'active'`. Después de esa primera
  vez, `/auth/register` responde `403` siempre — toda cuenta nueva se crea
  desde `POST /api/platform/tenants`, que requiere estar autenticado como
  platform admin.
- `src/middleware/auth.ts` (`requirePlatformAdmin`) protege todo
  `src/modules/platform/routes.ts` (`GET`/`POST /api/platform/tenants`,
  `PATCH /api/platform/tenants/:id`) — cross-tenant a propósito, es la única
  parte del backend que no está limitada a un solo tenant.
- **Suscripción manual, no Stripe** (confirmado con el usuario): cada Tenant
  tiene `subscriptionStatus` (`trial`/`active`/`overdue`/`suspended`),
  `subscriptionPlan` y `subscriptionNotes` (texto libre, ej. "paga por
  transferencia el día 5"), editables desde el Panel maestro. Solo
  `suspended` bloquea algo — el login de esa agencia (`src/modules/auth/
  service.ts`, `login`), con un mensaje claro. La suspensión aplica en el
  siguiente login, no a media sesión (el JWT no se re-valida contra la base
  de datos en cada request — sería un costo por request en toda la app para
  un caso que, con cobro manual, no necesita ser instantáneo).
- Frontend: `frontend/src/routes/Platform.tsx` en `/platform` (ruta separada
  de `/app`, no anidada — es cross-tenant, no tiene un `locationId`). Tabla
  de agencias con usuarios/subcuentas/estado/plan, edición inline del
  estado, y un formulario para dar de alta un cliente nuevo (tú eliges su
  contraseña inicial y se la compartes). Un botón "Panel maestro" aparece en
  la barra superior de `/app` solo si `user.isPlatformAdmin`.
- `Login.tsx`/`Register.tsx` se ajustaron: el link "¿No tienes cuenta?" se
  quitó de Login (ya no aplica), y Register ahora deja claro que solo sirve
  para la cuenta maestra inicial.

**Verificado en vivo contra la base de datos real** (no solo con mocks,
2026-08-04) — este fue el primer registro real del proyecto: bootstrap
funcionó (primer usuario = platform admin), crear un cliente vía el panel
funcionó, un cliente normal recibió `403` al intentar `GET /api/platform/
tenants`, y suspender un tenant efectivamente bloqueó su login con el
mensaje esperado. También se encontró y corrigió un bug real en esta
verificación: `POST /api/platform/tenants` devolvía el `passwordHash` del
nuevo admin sin querer (el objeto `tenant` de Prisma trae sus `users`
anidados) — ya no se reenvía el objeto crudo de Prisma en ninguna respuesta
del módulo `platform`.

## Requisitos

- Node 20+
- Docker (para Postgres + Redis locales) — o tus propias instancias
- Ya NO hace falta una app de GoHighLevel Marketplace (Fase 6) — solo que
  cada cliente tenga acceso a su propia subcuenta de GHL para generar un
  Private Integration Token cuando llegue el momento de conectarla.

## Puesta en marcha

```bash
npm install
cp .env.example .env
# Genera una clave de cifrado de 32 bytes para los tokens de GHL:
openssl rand -base64 32   # pega el resultado en TOKEN_ENCRYPTION_KEY

docker compose up -d      # levanta Postgres + Redis
npx prisma migrate dev    # crea el esquema

npm run dev                # API en http://localhost:4000
npm run worker              # en otra terminal: procesa el backfill en background
```

## Flujo completo de prueba

1. **Registrar el primer usuario (te vuelve platform admin automáticamente)**
   — ver "Panel maestro (Fase 5)" arriba: esto **solo funciona una vez**, en
   una base de datos recién creada.

   ```bash
   curl -X POST http://localhost:4000/auth/register \
     -H "Content-Type: application/json" \
     -d '{"tenantName":"Mi Agencia","email":"admin@agencia.com","password":"contraseñaSegura123"}'
   ```

   Guarda el `token` de la respuesta — `user.isPlatformAdmin` debe venir en
   `true`. Para crear cuentas de clientes después de esta, usa
   `POST /api/platform/tenants` (autenticado como platform admin) en vez de
   volver a llamar `/auth/register`, que a partir de aquí siempre responde
   `403`.

2. **Conectar una subcuenta de GHL** (Fase 6 — ver "Conexión con GHL"
   arriba, ya no es OAuth). En la subcuenta de GHL que quieras conectar:
   Settings → Private Integrations → crea una con scopes de contactos,
   oportunidades, calendarios/citas, conversaciones (lectura y escritura) y
   formularios (`forms.readonly`) → copia el token. El `ghlLocationId` está en la URL de esa subcuenta
   (`app.gohighlevel.com/location/<id>/...`).

   ```bash
   curl -X POST http://localhost:4000/api/locations \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"name":"Mi Subcuenta","ghlLocationId":"<id-de-la-subcuenta-en-ghl>","privateIntegrationToken":"<pit-que-generaste>"}'
   ```

   Guarda el `location.id` (interno) de la respuesta — es el `<locationId>`
   que usan todos los pasos siguientes.

3. **Disparar el backfill de una Location**

   ```bash
   curl -X POST http://localhost:4000/api/locations/<locationId>/sync \
     -H "Authorization: Bearer <token>"
   ```

   Esto encola un job; `npm run worker` lo procesa. Revisa el progreso:

   ```bash
   curl "http://localhost:4000/api/sync-jobs?locationId=<locationId>" \
     -H "Authorization: Bearer <token>"
   ```

4. **Consultar los datos ya sincronizados**

   ```bash
   curl "http://localhost:4000/api/contacts?locationId=<locationId>&page=1&pageSize=20" \
     -H "Authorization: Bearer <token>"
   ```

   También disponibles: `/api/opportunities`, `/api/calls`, `/api/appointments`.

5. **Consultar KPIs reales** (Fase 2 — necesita que el backfill del punto 3
   ya haya corrido, incluyendo la sincronización de usuarios GHL)

   ```bash
   curl "http://localhost:4000/api/kpis/operational?locationId=<locationId>&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z" \
     -H "Authorization: Bearer <token>"
   ```

   También disponibles: `/api/kpis/funnel`, `/api/kpis/ranking`,
   `/api/kpis/acquisition`, `/api/kpis/advisor?ownerGhlId=<id>`. Todos
   aceptan `from`, `to`, `ownerGhlId` y `tags` (nombres de etiqueta separados
   por coma) como filtros opcionales.

   ⚠️ **"Efectivo cobrado" es manual por ahora** — no hay integración con
   Stripe/GHL Payments todavía. Regístralo a mano contra una oportunidad:

   ```bash
   curl -X POST http://localhost:4000/api/payments \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"opportunityId":"<id-interno-de-la-oportunidad>","amount":1500000,"collectedAt":"2026-03-01T00:00:00Z","note":"Primer pago"}'
   ```

   y confirma que `efectivoCobrado` sube en `/api/kpis/operational`.

6. **Webhooks en tiempo real** (best-effort desde Fase 6, ver "Conexión con
   GHL" arriba — requiere que el cliente arme un Workflow en su GHL, ya no
   llega gratis con una Marketplace app)

   En la subcuenta de GHL del cliente: Automation → Workflows → crea uno con
   el trigger que te interese (ej. "Contact Created") y una acción
   "Webhook" apuntando a `https://<tu-ngrok-o-dominio>/webhooks/ghl`. La
   firma HMAC de GHL_WEBHOOK_SECRET solo aplicaba a las suscripciones
   nativas de una Marketplace app — un Workflow no la manda, así que en la
   práctica queda sin validar (aceptable porque esto es best-effort, no la
   vía principal de sync). Prueba creando/editando un contacto y confirma
   que aparece en `/api/contacts` sin correr el backfill manual.

7. **Configurar la clave de OpenAI de la agencia** (Fase 3 — admin únicamente,
   se usa tanto para transcribir llamadas con Whisper como para el análisis
   de calidad)

   ```bash
   curl -X PUT http://localhost:4000/api/settings/openai-key \
     -H "Authorization: Bearer <token-admin>" -H "Content-Type: application/json" \
     -d '{"apiKey":"sk-...", "model":"gpt-4o-mini"}'
   ```

8. **(Opcional) Activar la escritura de vuelta a GHL** — admin únicamente,
   apagado por defecto. Cuando está activo, cada análisis de calidad exitoso
   agrega al contacto en GHL una etiqueta de interés (`ia-interes-alto` /
   `-medio` / `-bajo`), una etiqueta por cada objeción detectada
   (`objecion-precio-muy-alto`, etc.), y una nota con el resumen + los
   aspectos de mejora del coach de IA.

   ```bash
   curl -X PUT http://localhost:4000/api/settings/ai-writeback \
     -H "Authorization: Bearer <token-admin>" -H "Content-Type: application/json" \
     -d '{"enabled": true}'
   ```

9. **(Opcional, requiere el paso anterior) Configurar movimiento de etapa
   por nivel de interés** — admin únicamente, por subcuenta. Primero consulta
   las etapas sincronizadas (`GET /api/pipeline-stages?locationId=`) para
   obtener el `id` interno de la etapa destino, luego:

   ```bash
   curl -X PUT http://localhost:4000/api/settings/stage-automation \
     -H "Authorization: Bearer <token-admin>" -H "Content-Type: application/json" \
     -d '{"locationId":"<locationId>","rules":[
       {"interestBucket":"alto","targetStageId":"<id-de-PipelineStage>","enabled":true},
       {"interestBucket":"medio","targetStageId":null,"enabled":true},
       {"interestBucket":"bajo","targetStageId":null,"enabled":true}
     ]}'
   ```

   `targetStageId: null` en un bucket = no mover nada en ese caso.

10. **Vincular tu usuario a tu identidad de GHL** (cada closer, incluido el
   admin si también vende) — necesario para que el reporte de calidad y el
   ranking sepan que "tú en el dashboard" y "tú en GHL/Fathom" son la misma
   persona:

   ```bash
   curl -X PUT http://localhost:4000/api/profile/me/ghl-user \
     -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
     -d '{"ghlUserId":"<id-del-usuario-en-GhlUser>"}'
   ```

   (El `ghlUserId` es el `ghlUserId` que quedó guardado en la tabla
   `GhlUser` tras el backfill del punto 4 — puedes consultarlo con
   `npx prisma studio`.)

11. **Cada closer conecta su Fathom** (API key personal, no OAuth de agencia)

    ```bash
    curl -X POST http://localhost:4000/api/fathom/connection \
      -H "Authorization: Bearer <token-del-closer>" -H "Content-Type: application/json" \
      -d '{"locationId":"<locationId>","apiKey":"<fathom-api-key-del-closer>"}'

    curl -X POST http://localhost:4000/api/fathom/sync \
      -H "Authorization: Bearer <token-del-closer>"
    ```

    ⚠️ La forma exacta de cada meeting en la respuesta de Fathom
    (`sync/videoCalls.ts`) sigue sin verificar — el header de autenticación y
    el endpoint base sí están confirmados (ver "Escritura de vuelta a GHL y
    Fase 3.5" más arriba).

12. **(Opcional) Conectar Meta Ads de una subcuenta** — admin únicamente,
    agencia-level (no por closer). Necesitas el `adAccountId`
    (`act_XXXXXXXXX`) y un token de acceso System User con scope `ads_read`
    generado desde tu Business Manager:

    ```bash
    curl -X POST http://localhost:4000/api/meta-ads/connection \
      -H "Authorization: Bearer <token-admin>" -H "Content-Type: application/json" \
      -d '{"locationId":"<locationId>","adAccountId":"act_123456789","accessToken":"<system-user-token>"}'

    curl -X POST http://localhost:4000/api/meta-ads/sync \
      -H "Authorization: Bearer <token-admin>" -H "Content-Type: application/json" \
      -d '{"locationId":"<locationId>"}'
    ```

    Trae los últimos 30 días de inversión/leads por campaña
    (`GET /api/meta-ads/summary?locationId=&from=&to=`, ya visible en el
    Dashboard del frontend si hay datos).

13. **(Opcional) Conectar Hotmart de una subcuenta** — admin únicamente.
    Genera `client_id`/`client_secret` en Hotmart, Herramientas >
    Credenciales de desarrollador:

    ```bash
    curl -X POST http://localhost:4000/api/hotmart/connection \
      -H "Authorization: Bearer <token-admin>" -H "Content-Type: application/json" \
      -d '{"locationId":"<locationId>","clientId":"<client-id>","clientSecret":"<client-secret>"}'

    curl -X POST http://localhost:4000/api/hotmart/sync \
      -H "Authorization: Bearer <token-admin>" -H "Content-Type: application/json" \
      -d '{"locationId":"<locationId>"}'
    ```

    Trae los últimos 90 días de ventas aprobadas/completadas
    (`GET /api/hotmart/summary?locationId=&from=&to=`).

14. **Confirmar que la transcripción y el análisis de calidad corrieron**

    Una llamada de GHL con `recordingUrl` pasa automáticamente por Whisper
    (`npm run worker` la procesa) y luego por el análisis de IA; una
    videollamada de Fathom ya trae transcripción y se analiza directo; un
    chat se analiza tras sincronizar sus mensajes. Verifica:

    ```bash
    curl "http://localhost:4000/api/quality/summary?locationId=<locationId>" \
      -H "Authorization: Bearer <token>"

    curl "http://localhost:4000/api/quality/closer/<ownerGhlId>?locationId=<locationId>" \
      -H "Authorization: Bearer <token>"
    ```

    `summary` trae, por closer: conteo de conversaciones analizadas,
    promedio de interés y de calidad, y las notas de mejora más recientes —
    el reporte para managers pedido en la Fase 3. Con al menos 3
    conversaciones con nota de mejora en el rango, también puedes pedir el
    resumen de patrones repetidos entre closers (Fase 3.5, botón "Analizar
    temas del equipo" en el frontend):

    ```bash
    curl "http://localhost:4000/api/quality/themes?locationId=<locationId>" \
      -H "Authorization: Bearer <token>"
    ```

## Estructura

```
src/
  config/        env validado con zod, logger
  db/            cliente Prisma singleton
  middleware/    requireAuth, requireRole, manejo central de errores
  modules/
    auth/        registro (solo el primer usuario, ver Fase 5), login, JWT
    platform/    panel maestro: listar/crear/suspender tenants, cross-tenant (Fase 5)
    ghl/
      client.ts        wrapper HTTP contra la API de GHL — decrypta y usa el Private Integration Token del Location (Fase 6, sin OAuth)
      webhooks.ts       receptor best-effort de webhooks (Fase 6: alimentado por un Workflow del cliente, no una suscripción nativa)
      sync/             backfill paginado por entidad (contacts, opportunities, appointments, conversations+messages, pipelines, users)
                          calls.ts ya no pega a ningún endpoint — ver "Arquitectura de integración con GHL" arriba
    locations/   conectar subcuentas pegando su Private Integration Token (Fase 6), rotar token, CRUD ligero
    data/        endpoints de lectura (contacts/opportunities/calls/appointments/sync-jobs/pipeline-stages)
    kpis/        servicio de agregación (operational/operational-multi/funnel/ranking/acquisition/advisor) + rutas
    payments/    registro manual de "efectivo cobrado" contra una oportunidad
    fathom/      conexión personal por closer (API key) + sync de videollamadas
    metaAds/     conexión por subcuenta (System User token) + sync de insights de campañas (Fase 3.5)
    hotmart/     conexión por subcuenta (client_id/secret) + sync de ventas (Fase 3.5)
    quality/
      analyzer.ts    transcripción (Whisper) + análisis de calidad con IA
      themes.ts      síntesis de patrones de mejora entre closers (Fase 3.5, LLM, on-demand)
      writeback.ts   escritura de vuelta a GHL: tag+nota siempre, mover etapa si hay regla (Fase 3.5)
    settings/    clave de OpenAI de la agencia, toggle de escritura a GHL, reglas de movimiento de etapa
    users/       perfil propio, vínculo dashboard-user ↔ GHL user
  jobs/          colas BullMQ (backfill, transcripción, análisis, sync Fathom/Meta Ads/Hotmart) + workers
  lib/           helpers compartidos entre módulos (assertOwnedLocation)
  server.ts
  **/*.test.ts   tests unitarios, colocados junto al código que prueban (ver "Tests")
prisma/schema.prisma
docker-compose.yml
vitest.config.ts
```

## Notas de seguridad

- Los tokens de GHL (Private Integration Token, Fase 6) y demás credenciales
  (Fathom, Meta Ads, Hotmart) se cifran en reposo (AES-256-GCM) con
  `TOKEN_ENCRYPTION_KEY` — nunca se guardan en texto plano.
- Todas las consultas de datos (`/api/*`) verifican que el `locationId`
  pertenezca al `tenantId` del usuario autenticado antes de tocar la base.
- El JWT del dashboard es independiente de los tokens de GHL — nunca se
  exponen al frontend.
- Cualquier endpoint que devuelva un `Location` usa un `select` explícito
  (`SAFE_LOCATION_SELECT` en `src/modules/locations/service.ts`) que excluye
  `ghlPitCipher` — se encontró y corrigió un caso real donde el objeto crudo
  de Prisma se filtraba en la respuesta JSON (mismo tipo de bug ya corregido
  una vez antes en `platform/service.ts` con `passwordHash`; revisa
  cualquier endpoint nuevo que devuelva un modelo con un campo `*Cipher` con
  el mismo cuidado).

## Supuestos de los KPIs (Fase 2) — verificar contra datos reales

`src/modules/kpis/service.ts` asume valores de status de GHL que no están
garantizados para toda cuenta/producto (documentados en el propio archivo):
llamada contestada = `status` en `['completed','answered']`; cita asistida =
`status` en `['showed','completed','confirmed']`; oportunidad ganada =
`status === 'won'`. Ajusta estas constantes una vez veas datos reales
sincronizados — es la forma más rápida de detectar si tu cuenta usa otros
valores.

## Supuestos de la Fase 3 — verificar contra datos reales

- `src/modules/quality/analyzer.ts` asume `Message.direction` en
  `'inbound'|'outbound'` — esto SÍ está confirmado en el schema oficial de
  GHL (`GetMessageResponseDto`).
- El contrato de la API de **Fathom** (`src/modules/fathom/*`) sigue siendo
  una mejor suposición razonable sin verificar — GHL no tiene relación con
  Fathom, así que no hay un repo de specs oficiales equivalente que revisar.
- La escritura de vuelta a GHL (`src/modules/quality/writeback.ts`) usa
  `POST /contacts/{contactId}/tags`, `POST /contacts/{contactId}/notes` y
  `PUT /opportunities/{id}`, confirmados contra los specs `apps/contacts.json`
  y `apps/opportunities.json` del mismo repo de docs oficiales — pero, a
  diferencia del resto de la sync, nunca se ha probado contra una cuenta real
  (requiere `aiWriteBackEnabled` activo + datos sincronizados). Falla en
  silencio (solo loguea) si algo no calza, para no romper el análisis de
  calidad que ya corrió con éxito. "Oportunidad abierta" para el movimiento
  de etapa es una heurística (solo excluye `status === 'won'`, ver supuesto
  de arriba), no una garantía — un contacto con varias oportunidades
  concurrentes podría mover la que no era.
- **Meta Ads** (`src/modules/metaAds/*`): endpoint y forma de la respuesta
  confirmados contra `developers.facebook.com/docs/marketing-api/insights`;
  sin verificar contra una cuenta real: el `action_type` exacto para contar
  leads (`sync/insights.ts` reconoce varias variantes plausibles) y si hace
  falta paginar más allá de la primera página de campañas.
- **Hotmart** (`src/modules/hotmart/*`): la autenticación OAuth2
  `client_credentials` y la URL base de `/sales/history` están confirmadas
  contra `developers.hotmart.com`, pero la página de specs del endpoint no
  se pudo leer completa de forma automatizada — la forma exacta de cada
  venta en la respuesta (`sync/sales.ts`) es una mejor suposición razonable,
  parseada defensivamente, con el `raw` completo siempre guardado.
- **Fathom**: el header de autenticación (`X-Api-Key`, no
  `Authorization: Bearer`) y el endpoint `/meetings` sí están confirmados
  contra `developers.fathom.ai` — corregido en `src/modules/fathom/client.ts`
  (era un bug real, no solo una suposición sin probar). Lo que sigue sin
  verificar es la forma exacta de cada meeting en la respuesta.
- El análisis de IA usa `response_format: json_schema` (structured outputs)
  de OpenAI; si tu clave/modelo no lo soporta, `analyzeTranscript` en
  `src/modules/quality/analyzer.ts` fallará — usa un modelo que lo soporte
  (ej. `gpt-4o-mini`, `gpt-4o`).
- `GET /conversations/search` no trae ningún campo de fecha en el objeto
  `ConversationSchema` documentado (posible gap real de la documentación de
  GHL) — la paginación (`startAfterDate`) se arma leyendo `dateAdded` de
  forma defensiva del payload crudo; si tu cuenta no lo trae, el sync de
  conversaciones se queda en la primera página en vez de fallar en loop.
  Revisa `src/modules/ghl/sync/conversations.ts` si tienes más de ~100
  conversaciones por Location.

## Tests

```bash
npm test
```

Son 45 tests unitarios sobre la lógica pura más delicada del proyecto —
cifrado de credenciales, hash/verificación de contraseñas, firma/verificación
de JWT, detección de "esto es una llamada" en un mensaje de GHL, la
construcción de ventanas de fechas del sync de citas, la matemática de los
KPIs (`pct`/`average`), la verificación de firma HMAC de los webhooks, el
armado de etiquetas/nota de la escritura de vuelta a GHL (bucket de interés,
slug de objeciones, texto de la nota), la extracción de leads/normalización
de `adAccountId` de Meta Ads, y la resolución de `transactionId` de Hotmart.
Corren sin
Docker/Postgres/Redis (`vitest.config.ts` inyecta variables de entorno
válidas en formato pero no conectadas a nada real) — es justo lo que este
entorno de desarrollo puede ejecutar sin infraestructura.

**Lo que NO cubren estos tests**: el código que sí toca Prisma/la base de
datos (todos los `upsert*`, los servicios de KPIs/calidad con queries reales,
las rutas Express) y las llamadas HTTP reales a GHL/Fathom/OpenAI. Eso
necesita Postgres+Redis levantados — usa el flujo manual con `curl` de la
sección "Flujo completo de prueba" de arriba. Si se agrega una base de datos
de test en el futuro, sería el siguiente paso natural para subir cobertura.

## Siguientes fases (fuera de este alcance)

- Crear una tarea de seguimiento en GHL desde el análisis de IA (la
  escritura de etiqueta+nota y el movimiento de etapa ya existen, ver Fase
  3.5 arriba) — GHL sí tiene un recurso de tareas por contacto, pero no se
  investigó todavía.
- Registrar ROISystem como partner de Fathom para ofrecer conexión OAuth de
  un clic en vez de pegar la API key personal — requiere un signup/review
  real en fathom.ai, fuera de lo que se puede hacer sin esa cuenta.
- Publicar ROISystem como Marketplace app pública de GHL (ver "Conexión con
  GHL (Fase 6)" arriba) — desbloquearía conectar con un clic + webhooks
  nativos otra vez, a cambio de que el usuario cree su propia cuenta de
  agencia GHL y pase la revisión de GHL. Decisión de negocio pendiente, no
  técnica.
- Webhooks en tiempo real "de fábrica" — hoy dependen de que cada cliente
  arme un Workflow en su GHL (ver "Conexión con GHL (Fase 6)"); solo se
  resuelve publicando la app (punto anterior) o con más ingeniería de
  mapeo de payloads de Workflow, que no se hizo en esta ronda.
- Paginación más allá de la primera página en los sync de Meta Ads (más de
  ~100 campañas) y Hotmart (más ventas de las que caben en una respuesta) —
  ver "Escritura de vuelta a GHL y Fase 3.5" arriba.
- Integración real de pasarela de pagos (Stripe/GHL Payments) — hoy
  "efectivo cobrado" es 100% registro manual (`POST /api/payments`); el
  usuario confirmó explícitamente que esto se queda manual por ahora.
- Cobro automático de la mensualidad a las agencias clientes (hoy
  `subscriptionStatus` se marca a mano en el Panel maestro — confirmado con
  el usuario, ver "Panel maestro (Fase 5)" arriba).
- Cuando una agencia se suspende, su sesión ya abierta sigue viva hasta que
  el JWT expira (hasta 7 días) — no hay revocación inmediata. Aceptable para
  cobro manual; si se automatiza el cobro, revisar esto.
- Reenviar/resetear la contraseña de un cliente sin pasar por el platform
  admin (hoy no hay flujo de "olvidé mi contraseña" para nadie).
- **Estado de verificación (2026-08-04)**: Docker/Postgres/Redis SÍ están
  instalados y corriendo — `docker compose up -d` + `npx prisma migrate dev`
  se ejecutaron contra una base de datos real por primera vez, y se probó en
  vivo (no solo con mocks): registro/login, creación de tenants y suspensión
  desde el Panel maestro, y — tras cambiar de OAuth a Private Integration
  Token (Fase 6) — conectar una subcuenta (`POST /api/locations` con un
  token de prueba), confirmando que el flujo funciona y que la respuesta ya
  no filtra el `ghlPitCipher`. Esta ronda encontró y corrigió DOS bugs
  reales de filtración de credenciales de esta forma (`passwordHash` en
  Fase 5, `ghlPitCipher` en Fase 6) — ambos solo aparecieron al probar
  contra HTTP real, no con `tsc`/`eslint`/tests. Lo que SIGUE sin probarse
  contra una cuenta real: un Private Integration Token de verdad (los datos
  que trae GHL, si los scopes alcanzan, sync completo), Meta Ads, Hotmart y
  Fathom — para eso sigue el resto de "Flujo completo de prueba" de arriba
  con tus propias cuentas de esos servicios. El código pasa `tsc --noEmit`,
  `eslint` y `npm test` (45/45) sin errores. El **frontend** cubre las 7
  pantallas del mock (Login/Register, Resumen de agencia, Dashboard,
  Calidad, Pagos, Configuración, panel de asesor) más el Panel maestro, el
  formulario de conexión por Private Integration Token, y las secciones de
  Meta Ads/Hotmart/movimiento de etapa dentro de Configuración — verificado
  tanto con Playwright (con y sin backend/con API simulada) como en vivo
  contra el backend real corriendo en `localhost:4000`.
