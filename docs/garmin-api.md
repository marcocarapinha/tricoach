# Garmin Connect Personal API: endpoints usados

Fonte: [Swagger oficial](https://developer.garmin.com/gc-developer-program/personal/swagger-docs/) (OpenAPI 3.0.1, versão 1.0.0), lido a 13 nov 2026.
Servidor: `https://personal.connectapi.garmin.com` (China: `.cn`). Autenticação: `Authorization: Bearer <token>`. O token vem de `POST /personalapitoken-service/personal-api/personal-api-key/token` com `Authorization: ApiKey <chave>`, dura 24 h e não tem refresh.

| Dados | Endpoint | Janela máx. | Resposta | Campos usados |
| --- | --- | --- | --- | --- |
| Atividades | `GET /activitylist-service/activities/search/activities?startDate&endDate&start&limit&excludeChildren=false` | sem limite (paginado, 99 por defeito; usamos 100 e janelas de 31 d) | `SummarizedActivityDTO[]` | `activityId`, `activityName`, `startTimeLocal`, `startTimeGMT`, `activityType.typeKey`, `eventType.typeKey`, `isParent`, `parentId`, `duration`, `distance`, `elevationGain`, `averageHR`, `maxHR`, `avgPower`, `normPower`, `calories`, `trainingStressScore`, `hrTimeInZone_1..5` |
| Resumo diário | `GET /usersummary-service/v2/dailysummaries?startDate&endDate` | **1 ano** | `{ data: UserDailySummaryV2DTO[] }` | `heartRate.restingValue`, `stress.avgLevel`, `bodyBattery.maxValue`, `movement.steps.value`, `hydration.consumedInFractionalMl` |
| Sono | `GET /sleep-service/sleep/dailySleepSummariesByDate?startDate&endDate` | 31 dias | `DailySleepDTO[]` | `sleepTimeSeconds`, `sleepScores.overall.value`, `deep/light/rem/awakeSleepSeconds` |
| HRV | `GET /hrv-service/hrv/daily/{fromDate}/{toDate}` | não documentada (usamos 28 d) | `{ hrvSummaries: HrvSummaryDTO[] }` | `lastNightAvg` (também `weeklyAvg`, `baseline`, `status`) |

Resposta `204` = sem dados no intervalo.

**Multidesporto (triatlo/brick):** a atividade-mãe repete os totais das pernas. Importamos as pernas (`excludeChildren=false`), descartamos a mãe e passamos às pernas o nome e o tipo de evento `race`.

**Body Battery "ao acordar":** o resumo v2 não tem este valor. Usamos `bodyBattery.maxValue`, que normalmente é atingido ao acordar. O valor exato existe em `GET /usersummary-service/usersummary/daily?calendarDate=` (`bodyBatteryAtWakeTime`), mas só dia a dia.

Outros endpoints disponíveis e ainda não usados:
- `activity-service/activity/{id}`: detalhe com voltas.
- `download-service/files/activity/{id}`: ficheiro FIT em ZIP. Fica para a Fase 2.
- `biometric-service/heartRateZones/v2`: zonas de FC.
- `userprofile-service/userprofile/settings`.
- Peso, fitness age, SpO2 e nutrição.
