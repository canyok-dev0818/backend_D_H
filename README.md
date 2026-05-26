# Notification Preferences Service

Сервис управления предпочтениями уведомлений — единый источник правды для продуктовых модулей. Хранит дефолты, индивидуальные настройки пользователя и глобальные политики; отвечает на запросы «можно ли отправить уведомление» с учётом quiet hours и таймзоны.

## Стек

- **TypeScript**, **Node.js 20+**
- **PostgreSQL 16**
- **Fastify** (REST API)
- **Vitest** (интеграционные и unit-тесты)

## Быстрый старт

### 1. PostgreSQL (Docker)

```bash
docker compose up -d
```

Поднимается PostgreSQL на порту **5433** (чтобы не конфликтовать с локальным Postgres на 5432). Базы: `notification_preferences` и `notification_preferences_test`.

### 2. Зависимости и миграции

```bash
npm install
npm run build
npm run migrate
```

Переменные окружения (опционально): скопируйте `.env.example` в `.env`.

### 3. Запуск сервиса

```bash
npm start
# или в dev-режиме:
npm run dev
```

Сервис слушает `http://localhost:3000`.

**Demo UI** (проверка API в браузере): [http://localhost:3000/](http://localhost:3000/)

- статус `/health`
- GET/POST предпочтений, POST `/evaluate`
- быстрые сценарии из ТЗ (дефолты, marketing email, quiet hours, global policy)

### 4. Тесты

Убедитесь, что PostgreSQL запущен (`docker compose up -d`).

```bash
npm test
```

Интеграционные тесты используют `notification_preferences_test` на порту `5433` (см. `tests/setup.ts`). Переопределение: `DATABASE_URL=... npm test`.

## API

Формат: **REST** (JSON). Подробные примеры запросов/ответов: [docs/API.md](docs/API.md).

### Минимальный набор (ТЗ)

| # | Метод | Путь |
|---|--------|------|
| 1 | `GET` | `/users/:id/preferences` |
| 2 | `POST` | `/users/:id/preferences` |
| 3 | `POST` | `/evaluate` |

### П. 2 ТЗ — обязательные эндпоинты

| Требование | Метод | Путь | Тело запроса (ключевые поля) | Ответ |
|------------|-------|------|------------------------------|--------|
| Текущие предпочтения пользователя | `GET` | `/users/:id/preferences` | — | `{ userId, preferences[], quietHours }` |
| Вкл/выкл типа по каналу | `POST` | `/users/:id/preferences` | `setPreference: { notificationType, channel, enabled }` | обновлённый снимок предпочтений |
| Quiet hours + таймзона | `POST` | `/users/:id/preferences` | `quietHours: { timezone, start, end }` или `quietHours: null` | обновлённый снимок |
| Проверка отправки | `POST` | `/evaluate` | `userId`, `notificationType`, `channel`, `region`, `datetime` | `{ decision: "allow" }` или `{ decision: "deny", reason: "..." }` |

Заголовок `Idempotency-Key` (или поле `idempotencyKey`) обязателен для идемпотентных изменений настроек.

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/defaults` | Дефолтные предпочтения для новых пользователей |
| `GET` | `/policies` | Глобальные политики (тип / канал / регион) |
| `GET` | `/users/:id/preferences` | Эффективные предпочтения + `source` (`default` \| `user`) + quiet hours |
| `POST` | `/users/:id/preferences` | Изменение индивидуальных настроек (идемпотентно по `Idempotency-Key`) |
| `POST` | `/evaluate` | Проверка возможности отправки |
| `GET` | `/health` | Health check |

### Хранение настроек (п. 1 ТЗ)

| Что хранится | Таблица PostgreSQL | Как посмотреть |
|--------------|-------------------|----------------|
| Дефолты для новых пользователей | `default_preferences` | `GET /defaults` |
| Индивидуальные настройки (тип + канал) | `user_preferences` | `GET /users/:id/preferences` (поле `source: "user"`) |
| Глобальные политики по региону | `global_policies` | `GET /policies` |

При первом обращении к пользователю создаётся запись в `users`; эффективные настройки = дефолты, переопределённые индивидуальными значениями.

### Сценарий 5: Идемпотентность

Повтор `POST /users/:id/preferences` с тем же `Idempotency-Key` не меняет состояние повторно.  
Пример: дважды отключить `marketing_email` → результат как после одного отключения.

```bash
# Первый раз
curl -X POST http://localhost:3000/users/user-1/preferences \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: disable-marketing-email" \
  -d '{"setPreference":{"notificationType":"marketing_email","channel":"email","enabled":false}}'

# Повтор с тем же ключом — ответ тот же, в БД одна запись в preference_commands
curl -X POST http://localhost:3000/users/user-1/preferences \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: disable-marketing-email" \
  -d '{"setPreference":{"notificationType":"marketing_email","channel":"email","enabled":false}}'
```

Ключ можно передать в заголовке `Idempotency-Key` или в теле как `idempotencyKey`.

### Сценарий 4: Глобальные политики

В seed-данных: `marketing_sms` + `sms` запрещены в регионе `EU`. Политика проверяется в `POST /evaluate` **до** пользовательских настроек.

```bash
# Посмотреть политики
curl http://localhost:3000/policies

# Пользователь включил marketing SMS, но в EU всё равно deny
curl -X POST http://localhost:3000/users/user-1/preferences \
  -H "Content-Type: application/json" -H "Idempotency-Key: enable-sms" \
  -d '{"setPreference":{"notificationType":"marketing_sms","channel":"sms","enabled":true}}'

curl -X POST http://localhost:3000/evaluate -H "Content-Type: application/json" \
  -d '{"userId":"user-1","notificationType":"marketing_sms","channel":"sms","region":"EU","datetime":"2026-05-21T21:30:00Z"}'
# → deny, reason: blocked_by_global_policy

curl -X POST http://localhost:3000/evaluate -H "Content-Type: application/json" \
  -d '{"userId":"user-1","notificationType":"marketing_sms","channel":"sms","region":"US","datetime":"2026-05-21T21:30:00Z"}'
# → allow
```

### Сценарий 3: Quiet hours

Пользователь задаёт окно 22:00–08:00 в своей таймзоне. В это время **marketing push** блокируется, **transactional push** остаётся разрешённым.

```bash
curl -X POST http://localhost:3000/users/user-1/preferences \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: set-quiet-hours" \
  -d '{
    "setPreference": {"notificationType":"marketing_push","channel":"push","enabled":true},
    "quietHours": {"timezone":"Europe/Moscow","start":"22:00","end":"08:00"}
  }'

# Во время quiet hours (23:30 MSK = 2026-05-21T20:30:00Z)
curl -X POST http://localhost:3000/evaluate -H "Content-Type: application/json" \
  -d '{"userId":"user-1","notificationType":"marketing_push","channel":"push","region":"RU","datetime":"2026-05-21T20:30:00Z"}'
# → deny, reason: blocked_by_quiet_hours

curl -X POST http://localhost:3000/evaluate -H "Content-Type: application/json" \
  -d '{"userId":"user-1","notificationType":"transactional_push","channel":"push","region":"RU","datetime":"2026-05-21T20:30:00Z"}'
# → allow
```

### Сценарий 2: Изменение настроек пользователем

Пользователь отключает marketing email; transactional email остаётся включённым.

```bash
# Отключить marketing email
curl -X POST http://localhost:3000/users/user-1/preferences \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: opt-out-marketing" \
  -d '{"setPreference":{"notificationType":"marketing_email","channel":"email","enabled":false}}'

# Проверить в ответе GET
curl http://localhost:3000/users/user-1/preferences
# marketing_email: enabled false, source "user"
# transactional_email: enabled true, source "default"

# Проверить отправку
curl -X POST http://localhost:3000/evaluate -H "Content-Type: application/json" \
  -d '{"userId":"user-1","notificationType":"transactional_email","channel":"email","region":"US","datetime":"2026-05-21T12:00:00Z"}'
# → allow

curl -X POST http://localhost:3000/evaluate -H "Content-Type: application/json" \
  -d '{"userId":"user-1","notificationType":"marketing_email","channel":"email","region":"US","datetime":"2026-05-21T12:00:00Z"}'
# → deny, reason: disabled_by_user_preference
```

### Сценарий 1: Новый пользователь и дефолты

При первом `GET /users/:id/preferences` (или первом `POST /evaluate` / `POST /users/:id/preferences`):

1. Создаётся запись в `users` (если её ещё нет).
2. В `user_preferences` **нет** строк — только системные дефолты из `default_preferences`.
3. В ответе 8 предпочтений, у всех `source: "default"`.
4. Пример из ТЗ: `transactional_email` → `enabled: true`, `marketing_email` → `enabled: false`.

```bash
curl http://localhost:3000/users/brand-new-user/preferences
```

Проверка через evaluate без предварительного GET (пользователь создаётся автоматически):

```bash
# transactional — allow
curl -X POST http://localhost:3000/evaluate -H "Content-Type: application/json" \
  -d '{"userId":"brand-new-user","notificationType":"transactional_email","channel":"email","region":"US","datetime":"2026-05-21T12:00:00Z"}'

# marketing — deny (дефолт выключен)
curl -X POST http://localhost:3000/evaluate -H "Content-Type: application/json" \
  -d '{"userId":"brand-new-user","notificationType":"marketing_email","channel":"email","region":"US","datetime":"2026-05-21T12:00:00Z"}'
```

### Примеры

**Получить предпочтения**

```bash
curl http://localhost:3000/users/user-1/preferences
```

**Отключить marketing email**

```bash
curl -X POST http://localhost:3000/users/user-1/preferences \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: cmd-001" \
  -d '{"setPreference":{"notificationType":"marketing_email","channel":"email","enabled":false}}'
```

**Quiet hours**

```bash
curl -X POST http://localhost:3000/users/user-1/preferences \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: cmd-002" \
  -d '{"quietHours":{"timezone":"Europe/Moscow","start":"22:00","end":"08:00"}}'
```

**Проверка отправки**

```bash
curl -X POST http://localhost:3000/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-1",
    "notificationType": "marketing_sms",
    "channel": "sms",
    "region": "EU",
    "datetime": "2026-05-21T21:30:00Z"
  }'
```

Ответ при блокировке политикой:

```json
{ "decision": "deny", "reason": "blocked_by_global_policy" }
```

## Архитектура

### Требования к реализации (проверено)

| Требование | Где в проекте |
|------------|----------------|
| TypeScript на всём backend | `src/**/*.ts`, `strict: true` в `tsconfig.json` |
| Разделение домена и инфраструктуры | `domain/` не импортирует `infrastructure/` или `api/` (см. тест `project-structure.test.ts`) |
| Типы `notificationType`, `channel`, `region` | `src/domain/types.ts` — union-типы + константы `NOTIFICATION_TYPES`, `CHANNELS`, `REGIONS` |
| Даты и таймзоны | `src/domain/datetime.ts` — ISO instant для `/evaluate`, `Intl` + IANA TZ для quiet hours |

```
src/
  domain/          # Чистая бизнес-логика (без БД и HTTP)
    types.ts       # NotificationType, Channel, Region, DTO
    datetime.ts    # ISO-8601, IANA timezone, local HH:mm
    quiet-hours.ts # Окно 22:00–08:00 в TZ пользователя
    preference-evaluator.ts
    validation.ts
    notification-meta.ts
  application/     # PreferencesService — оркестрация use-case
  infrastructure/# PostgreSQL, миграции, логирование
  api/             # Fastify routes
tests/             # Интеграционные сценарии + unit-тесты
```

### П. 3 ТЗ — бизнес‑правила

| Правило | Где реализовано | Как проверить |
|---------|-----------------|---------------|
| Дефолтные настройки | `default_preferences` + merge в `evaluate` | `POST /evaluate` без override → `reason: "disabled_by_default"` для `marketing_email` |
| Индивидуальные настройки | `user_preferences` перекрывают дефолт | `POST` вкл/выкл → `reason: "disabled_by_user_preference"` или `allow` |
| Глобальные политики (тип/канал/регион) | `global_policies`, проверка **до** пользователя | `marketing_sms` + `EU` → `blocked_by_global_policy` даже если user enabled |
| Quiet hours + таймзона | `user_quiet_hours`, `Intl` в `quiet-hours.ts` | 22:00–08:00 MSK → marketing блок, transactional проходит |
| Идемпотентность изменений | `preference_commands` + `Idempotency-Key` | повтор того же ключа → состояние не ломается, 1 запись в БД |

**Порядок в `POST /evaluate`** (см. `EVALUATION_RULE_ORDER` в `preference-evaluator.ts`):

1. Пользователь существует  
2. `notificationType` ↔ `channel`  
3. **Глобальная политика** (перекрывает пользователя и дефолт)  
4. **Эффективная настройка**: user override > default (`source: "user" \| "default"`)  
5. **Quiet hours** в таймзоне пользователя (только если шаг 4 разрешил)

### Идемпотентность (детали)

- Таблица `preference_commands` хранит пару `(user_id, idempotency_key)` и JSON команды.
- При повторе ключа: пропуск `upsert` / `quietHours`, возврат актуального снимка предпочтений.
- Разные ключи = отдельные команды (например, сначала включить, потом выключить).

### Observability

Структурированные JSON-логи (`info`) для:

- изменений предпочтений и quiet hours;
- решений `allow` / `deny` на `/evaluate`.

В `src/infrastructure/logging/logger.ts` есть комментарии, куда добавить Prometheus-счётчики в продакшене.

## Что добавил бы для продакшена

- Версионирование API и OpenAPI-спека
- Аутентификация / авторизация (service-to-service, user context)
- Распределённые блокировки или `INSERT … ON CONFLICT` для гонок идемпотентности
- Кэш предпочтений (Redis) с инвалидацией по событиям
- Аудит-лог изменений (отдельная таблица / event stream)
- Admin API для глобальных политик и дефолтов без правки SQL
- Health check с проверкой PostgreSQL
- CI (lint, test, migrate), Helm/K8s, секреты через vault
- Rate limiting и request tracing (OpenTelemetry)

## Лицензия

MIT
