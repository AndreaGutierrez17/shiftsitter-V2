# IMPLEMENTATION_NOTES

## Estado actual (Auditoría inicial - sin cambios de lógica)

Fecha de auditoría: 2026-02-25
Objetivo de esta fase: entender el sistema actual antes de editar código de matching/chat/agreement.

## Archivos modificados

- `IMPLEMENTATION_NOTES.md` (nuevo, resumen de auditoría)

## Resumen de auditoría del repositorio

### 1) Rutas actuales (Next.js App Router)

Rutas principales identificadas en `src/app`:

- `/` -> `src/app/page.tsx`
- `/families` -> `src/app/families/page.tsx`
- `/families/onboarding` -> `src/app/families/onboarding/page.tsx`
- `/families/match` -> `src/app/families/match/page.tsx`
- `/families/messages` -> `src/app/families/messages/page.tsx`
- `/families/messages/[Id]` -> `src/app/families/messages/[Id]/page.tsx`
- `/families/profile` -> `src/app/families/profile/page.tsx`
- `/families/profile/[Id]` -> `src/app/families/profile/[Id]/page.tsx`
- `/families/profile/edit` -> `src/app/families/profile/edit/page.tsx`
- `/families/calendar` -> `src/app/families/calendar/page.tsx`
- `/families/assistant` -> `src/app/families/assistant/page.tsx`
- API routes: `/api/assistant`, `/api/icebreakers`, `/api/notify`

Observación:
- Existe flujo "calendar/shifts" ya funcional que puede servir como referencia para Agreement Cards mínimos.

### 2) Componentes/flujo actual de matching

Archivo principal:
- `src/app/families/match/page.tsx`

Comportamiento actual:
- Lee perfil actual desde `users/{uid}` con `onSnapshot`.
- Bloquea matching si `profileComplete` no está completo (no carga stack si falta).
- Obtiene swipes del usuario desde colección `swipes` (`swiperId == user.uid`) para excluir perfiles ya vistos.
- Obtiene perfiles desde colección `users` filtrando por `profileComplete == true` y `limit(80)`.
- Filtra compatibilidad por rol en cliente (`parent/sitter/reciprocal`) con `isRoleCompatible(...)`.
- No existe hard filtering formal ni weighted scoring.
- No existe filtro Maryland-only actualmente en query ni en filtro cliente.
- Fallback a usuarios demo (`isDemo == true`) si no hay perfiles.
- Swipe right guarda `swipes/{swiperId_swipedId}` con `direction: 'right'`.
- Si hay mutual like (o si el perfil swiped es demo), crea conversación directamente en `conversations`.
- Muestra `MatchModal` y permite ir a chat inmediatamente usando `conversationId`.

Riesgo relevante para próximos cambios:
- El flujo actual mezcla criterio de match y creación de conversación en la misma pantalla (`match/page.tsx`), por lo que mutual-match gating del chat deberá endurecerse sin romper conversaciones ya existentes.

### 3) Componentes/flujo actual de mensajería

Listado de conversaciones:
- `src/app/families/messages/page.tsx`
- Query: `conversations` con `where('userIds', 'array-contains', user.uid)`

Chat 1:1:
- `src/app/families/messages/[Id]/page.tsx`
- Lee `conversations/{conversationId}` + subcolección `conversations/{conversationId}/messages`
- Envía mensajes con `addDoc(.../messages)` y luego `updateDoc(conversations/{id})` para `lastMessage*`
- Actualmente NO valida explícitamente mutual match en UI antes de renderizar chat (solo depende de membresía en `conversation.userIds` y reglas Firestore)

Conclusión:
- Para cumplir el criterio "Mutual match obligatorio para chat", será necesario agregar gating explícito (UI + validación de acceso lógica) sin alterar contratos existentes de `conversations`.

### 4) Match card / detalle actual

Match card actual:
- Implementada inline en `src/app/families/match/page.tsx` (`SwipeCard`)
- Muestra foto, nombre/edad, location, child age, availability, needs, intereses (chips)
- No muestra score total ni breakdown por drivers

Vista detalle usada actualmente:
- `src/app/families/profile/[Id]/page.tsx`
- Funciona como detalle de perfil (availability, needs, intereses, workplace, hijos, verificación)
- No existe (todavía) una vista de "match detail" con breakdown de scoring

### 5) Helpers Firebase (client/server)

Cliente:
- `src/lib/firebase/client.ts`
- Exporta `auth`, `db`, `storage`, `messaging`
- Usa variables `NEXT_PUBLIC_FIREBASE_*`

Admin/server:
- `src/lib/firebase/admin.ts`
- Inicializa Firebase Admin desde `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON string) o variables separadas
- Exporta helpers `adminAuth`, `adminDb`, `adminMessaging`

Observación:
- Backend Firebase actual está desacoplado y estable; no se detecta necesidad de cambio destructivo para implementar scoring/gating en frontend + Firestore current flow.

### 6) Estructura observada de colecciones Firestore (actual)

Colecciones activamente usadas por flujo actual web (`src`):
- `users`
- `swipes`
- `conversations`
- `conversations/{conversationId}/messages`
- `shifts`
- `reviews`

Colecciones/paths legacy soportados por reglas y Cloud Functions:
- `swipes/{uid}/decisions/{targetUid}` (legacy swipes)
- `matches`
- `chats`
- `chats/{matchId}/messages`
- `notifications/{uid}/items`
- `fcm_tokens`
- `reports`
- `blocked_users/{uid}/list`
- `app_config`

Observación importante:
- El frontend actual usa `swipes` + `conversations` (flujo moderno del repo).
- `functions/index.js` todavía opera sobre el flujo legacy `swipes/{uid}/decisions`, `matches` y `chats`.
- Esto implica coexistencia real de 2 modelos. Cualquier cambio debe preservar compatibilidad y no asumir que Cloud Functions actuales cubren el flujo de `conversations`.

### 7) Estructura de datos de usuario (sin migrar)

Tipo principal en `src/types/index.ts`:
- `UserProfile` contiene: `id`, `email`, `name`, `age`, `role`, `location`, `latitude?`, `longitude?`, `numberOfChildren?`, `childAge?`, `childrenAgesText?`, `availability`, `needs`, `interests[]`, `photoURLs[]`, `workplace?`, `backgroundCheckStatus`, `profileComplete`, `isDemo?`, etc.

Campos relevantes para matching actual/futuro:
- Sí existen: `location`, `latitude`, `longitude`, `availability`, `needs`, `interests`, `childAge`, `numberOfChildren`, `backgroundCheckStatus`, `role`
- No existen como campos estructurados explícitos: `state`, `zip`, valores/values estructurados, hard-dealbreakers formales, weights persistidos, agreement cards

Restricción de este proyecto (a respetar):
- No cambiar contratos de datos existentes de forma destructiva.
- Cualquier metadata nueva debe ser opcional y compatible hacia atrás.

### 8) Onboarding actual (Needs + Values)

Archivo:
- `src/app/families/onboarding/page.tsx`

Estado actual:
- Onboarding multi-step usando `react-hook-form` + `zod`
- Campos guardados: `role`, `name`, `age`, `location`, `workplace`, `numberOfChildren`, `childAge`, `needs`, `availability`, `interests`
- Guarda `profileComplete: true` y lat/lng mockeados en Baltimore (`latitude=39.2904`, `longitude=-76.6122`)

Hallazgo clave:
- El requisito de onboarding estructurado "Needs + Values" NO está implementado como estructura formal actualmente (solo texto libre `needs` y `interests`).
- Para cumplir el objetivo sin romper contratos, conviene añadir lógica derivada/heurística y campos opcionales, evitando reemplazar los campos actuales.

### 9) Usuarios demo / seeds

Script de seed:
- `scripts/seed_demo_users.js`

Hallazgos:
- Crea 10 usuarios demo en Maryland (`isDemo: true`, `role: 'reciprocal'`, `profileComplete: true`)
- Ubicaciones en `location` con `, MD`
- Incluye lat/lng reales aproximados por ciudad de Maryland
- Convive con usuarios reales mediante colección `users`

Impacto para implementación:
- Se debe mantener compatibilidad demo/real (requisito explícito del usuario).
- El flujo actual ya prioriza reales y luego fallback a demos.

### 10) Filtro actual por estado Maryland (requisito obligatorio)

Resultado de auditoría:
- No hay enforcement actual de Maryland-only en matching/queries.
- No existe campo `state` estructurado en `UserProfile` actual.
- `location` es string libre (`"City, State"`) y algunos demos usan formato `"..., MD"`.
- `latitude/longitude` existen, pero onboarding actual los mockea a Baltimore para usuarios reales (no confiable para geofiltro exacto).

Conclusión segura:
- En el estado actual, el enforcement Maryland-only deberá implementarse con fallback robusto basado en `location` (string parsing), y opcionalmente lat/lng solo cuando sea confiable.
- No conviene depender de ZIP porque actualmente no existe campo ZIP.

### 11) Agreement Cards (estado actual)

No existe una entidad llamada "agreement cards" hoy.
Sí existe un flujo estructurado cercano:
- `shifts` + `calendar` (propuesta/aceptación/rechazo/completado)

Opción más segura para milestone E (recomendada preliminarmente):
- Crear estructura mínima nueva opcional (p.ej. colección `agreements` o subcolección asociada al match/conversation) SIN alterar `shifts`
- Reusar patrones visuales y de permisos del flujo `shifts`

### 12) Logging/debug actual

Ya hay `console.error(...)` / `console.log(...)` dispersos en frontend y scripts.
No existe logging estructurado para matching score/breakdown.

Dirección segura:
- Añadir logging mínimo local (`console.info/debug/error`) detrás de helper utilitario y/o feature flag, sin servicios externos.

## Decisiones técnicas (auditoría, antes de implementar)

1. No se realizará migración ni refactor de modelos existentes (`users`, `swipes`, `conversations`, `shifts`).
2. Se trabajará sobre el flujo actual del frontend (`swipes` + `conversations`), preservando compatibilidad con colecciones legacy presentes en reglas/functions.
3. El filtro Maryland-only se implementará primero como validación/filtro seguro sobre `location` (string), porque `state/zip` no existen y `lat/lng` de onboarding no son confiables hoy.
4. El weighted scoring se integrará como cálculo derivado (funciones puras + metadata opcional), sin reemplazar campos existentes.
5. El gating de chat por mutual match se reforzará sin romper conversaciones ya creadas (compatibilidad hacia atrás prioritaria).

## Ambigüedades detectadas (opciones + tradeoffs + elección segura)

### A) ¿Dónde persistir el resultado del scoring?

Opción 1: Calcular scoring solo en cliente al construir stack de matches.
- Pros: cero cambios de backend/contratos, rollout rápido, menor riesgo.
- Contras: no reusable para otros flujos (chat/agreements/analytics), duplicación futura.

Opción 2: Persistir metadata opcional de scoring en documento nuevo o campo opcional no destructivo.
- Pros: trazabilidad y debugging más fácil, reusable para detail/agreements.
- Contras: requiere diseño cuidadoso de compatibilidad y reglas.

Elección segura inicial:
- Empezar con Opción 1 (cálculo derivado en cliente) y solo persistir si hace falta para milestone de detalle/gating.

### B) ¿Dónde anclar Agreement Cards mínimas?

Opción 1: Nueva colección `agreements` referenciando `conversationId`/participantes.
- Pros: separa responsabilidades, no acopla a `shifts`, permite estados `pending/active/completed` exactos.
- Contras: implica nuevas reglas Firestore y UI nueva.

Opción 2: Reusar `shifts` como pseudo-agreement.
- Pros: menos código nuevo, ya existe UI/acciones.
- Contras: semántica distinta (fecha/horario específico), no representa bien acuerdo estructurado post-match.

Elección segura inicial:
- Opción 1 (colección nueva mínima y opcional), manteniendo `shifts` intacto.

## Cómo probar manualmente (fase auditoría)

Sin cambios funcionales en esta fase. Validación manual de auditoría:
- Confirmar rutas existentes en `src/app` (match, messages, profile, calendar).
- Confirmar que matching actual usa `users + swipes + conversations` en `src/app/families/match/page.tsx`.
- Confirmar que mensajería actual lee/escribe `conversations/{id}/messages`.
- Confirmar seed demo Maryland en `scripts/seed_demo_users.js`.
- Confirmar ausencia de enforcement Maryland en matching (no hay filtro por estado en `match/page.tsx`).

## Validación automática (fase auditoría)

Pendiente ejecutar después de este milestone de auditoría:
- `npm run lint`
- `npx tsc --noEmit` (no hay script `typecheck` en `package.json`)
- `npm run build`
- Tests: no existe script `test` en `package.json` (se documentará como gap)

## Confirmación de seguridad (auditoría)

- No se alteró destructivamente el backend existente.
- No se modificaron contratos de datos, colecciones Firestore, auth flow, endpoints ni variables de entorno.
- Solo se agregó documentación de auditoría en `IMPLEMENTATION_NOTES.md`.
## Resultados de validacion ejecutados (Milestone 1 - Auditoria)

Fecha de ejecucion: 2026-02-25

- `npm run lint`: OK (exit 0), con 48 warnings preexistentes y 0 errores.
- `npx tsc --noEmit`: OK (exit 0).
- `npm run build`: OK (exit 0), build de Next.js completado y rutas generadas correctamente.
- `npm test`: No ejecutado (no existe script `test` en `package.json`).

Notas de baseline:
- Hay warnings de lint preexistentes en multiples archivos (incluyendo `src/app/families/match/page.tsx`, `src/app/families/messages/page.tsx`, `src/app/families/onboarding/page.tsx`, `src/app/page.tsx`, etc.).
- Existe un cambio previo del usuario en `src/app/page.tsx` ya presente antes de esta auditoria; no fue modificado en esta fase.
