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

### 4. Тесты

Убедитесь, что PostgreSQL запущен (`docker compose up -d`).

```bash
npm test
```

Интеграционные тесты используют `notification_preferences_test` на порту `5433` (см. `tests/setup.ts`). Переопределение: `DATABASE_URL=... npm test`.

## API

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/users/:id/preferences` | Текущие предпочтения (дефолты + переопределения + quiet hours) |
| `POST` | `/users/:id/preferences` | Изменение настроек (идемпотентно по `Idempotency-Key`) |
| `POST` | `/evaluate` | Проверка возможности отправки |
| `GET` | `/health` | Health check |

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

```
src/
  domain/          # Типы, quiet hours, evaluator, валидация (без БД и HTTP)
  application/     # PreferencesService — сценарии use-case
  infrastructure/  # PostgreSQL, миграции, structured logging
  api/             # Fastify routes + сборка сервера
tests/             # Интеграционные сценарии + unit-тесты домена
```

### Порядок принятия решения (`POST /evaluate`)

1. Пользователь существует
2. Согласованность `notificationType` и `channel`
3. **Глобальная политика** по типу / каналу / региону
4. **Индивидуальная настройка** (или дефолт, если переопределения нет)
5. **Quiet hours** — по умолчанию блокируются только `marketing_*`; transactional проходят

### Идемпотентность

Каждая команда `POST /users/:id/preferences` сохраняется в `preference_commands` с ключом `Idempotency-Key` (заголовок) или `idempotencyKey` в теле. Повтор с тем же ключом не меняет состояние повторно.

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
