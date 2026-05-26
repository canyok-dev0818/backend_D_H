# REST API

Базовый URL: `http://localhost:3000`  
Формат: JSON (`Content-Type: application/json`)

**Веб-UI для ручной проверки:** откройте [http://localhost:3000/](http://localhost:3000/) после `npm start`.

## 1. Получение предпочтений пользователя

```http
GET /users/:id/preferences
```

**Ответ `200`:**

```json
{
  "userId": "user-1",
  "preferences": [
    {
      "notificationType": "transactional_email",
      "channel": "email",
      "enabled": true,
      "source": "default"
    },
    {
      "notificationType": "marketing_email",
      "channel": "email",
      "enabled": false,
      "source": "default"
    }
  ],
  "quietHours": null
}
```

## 2. Изменение предпочтений пользователя

```http
POST /users/:id/preferences
Idempotency-Key: <unique-key>
```

**Тело — включение/выключение по типу и каналу:**

```json
{
  "setPreference": {
    "notificationType": "marketing_email",
    "channel": "email",
    "enabled": false
  }
}
```

**Тело — quiet hours (таймзона IANA, локальное время HH:mm):**

```json
{
  "quietHours": {
    "timezone": "Europe/Moscow",
    "start": "22:00",
    "end": "08:00"
  }
}
```

**Оба поля в одном запросе:**

```json
{
  "setPreference": {
    "notificationType": "marketing_push",
    "channel": "push",
    "enabled": true
  },
  "quietHours": {
    "timezone": "Europe/Moscow",
    "start": "22:00",
    "end": "08:00"
  }
}
```

**Ответ `200`:** тот же формат, что у `GET` (актуальный снимок после изменения).

**Ошибка валидации `400`:** `{ "error": "описание" }`

## 3. Проверка возможности отправки уведомления

```http
POST /evaluate
```

**Запрос (как в ТЗ):**

```json
{
  "userId": "user-1",
  "notificationType": "marketing_sms",
  "channel": "sms",
  "region": "EU",
  "datetime": "2026-05-21T21:30:00Z"
}
```

> В seed-данных глобальная политика: `marketing_sms` + `EU` → запрет.  
> Для `marketing_email` + `EU` политика не задана — ответ зависит от предпочтений пользователя.

**Ответ при запрете:**

```json
{
  "decision": "deny",
  "reason": "blocked_by_global_policy"
}
```

**Ответ при разрешении:**

```json
{
  "decision": "allow"
}
```

### Возможные значения `reason` при `deny`

| `reason` | Смысл |
|----------|--------|
| `blocked_by_global_policy` | Региональная политика |
| `disabled_by_user_preference` | Пользователь отключил |
| `disabled_by_default` | Выключено дефолтом |
| `blocked_by_quiet_hours` | Quiet hours |
| `notification_type_channel_mismatch` | Несовпадение type/channel |

## Дополнительно (не из минимального набора)

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/health` | `{ "status": "ok" }` |
| GET | `/defaults` | Системные дефолты |
| GET | `/policies` | Глобальные политики |
