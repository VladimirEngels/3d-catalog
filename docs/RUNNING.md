# Установка и запуск

Все команды выполняются из корня проекта. Краткое описание — в [README](../README.md).

## Запуск через Docker

Конфигурация находится в `docker/`: `Dockerfile` описывает сборку приложения,
`compose.yaml` — запуск приложения и базы, `Dockerfile.dockerignore` — исключения
из контекста сборки. Корневой `.env` задаёт пароль, порт и путь `COMPOSE_FILE`.

Нужен запущенный Docker Desktop с Linux-контейнерами. Команды выполняются из корня
проекта. При первом запуске, если корневого `.env` ещё нет, скопируйте шаблон настроек:

```powershell
Copy-Item .env.example .env
```

В корневом `.env` замените `CHANGE_ME` на свой пароль базы из латинских букв
и цифр (не менее 16 символов). Этот файл исключён из Git. `backend/.env`
при запуске в Docker не используется.

```powershell
docker compose up -d --build
docker compose logs -f app
```

Откройте [localhost:3000](http://localhost:3000). Если порт занят, измените
`APP_PORT` в корневом `.env` и повторите запуск. Первая сборка скачивает Node.js,
зависимости и Chromium; следующие сборки используют кеш.

Compose запускает два контейнера: `app` — Express, собранный интерфейс и фоновая
очередь конвертации; `db` — PostgreSQL 17. Схема применяется автоматически при
первом запуске с пустым томом базы. Последующие изменения схемы нужно применять
отдельно. Сайт доступен только на этом компьютере; порт базы наружу не публикуется.

База, модели и журналы сохраняются в именованных томах `database`, `storage`
и `logs`. Текущая локальная база и модели автоматически в Docker не переносятся.
Для увеличения текстур подготовленный ONNX-файл и его лицензия должны находиться
в `backend/storage/ai/`: эта папка подключается только для чтения. Без файла
остальные функции работают. Подготовка модели описана ниже.

Остановка с сохранением данных:

```powershell
docker compose down
```

Не добавляйте `-v`: этот параметр удаляет тома вместе с данными. Изменение пароля
в `.env` после создания базы само по себе не меняет пароль в PostgreSQL.

Назначение системного администратора после регистрации пользователя:

```powershell
docker compose exec app node --import tsx src/make-admin.ts user@example.com
```

## Резервное копирование в Windows

Сценарий `docker/backup.ps1` создаёт копию базы PostgreSQL и файлов моделей
из проекта `my-app`. Пароль берётся из корневого `.env` и не выводится.
Ручной запуск:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File docker/backup.ps1
```

На время копирования приложение и очередь останавливаются, PostgreSQL остаётся
работать; после копирования приложение запускается снова. Новая папка
`%USERPROFILE%\Backups\3D-Katalog\db-models-*` содержит `database.dump` и `models/`.
Это личные данные: ограничьте доступ к папке. ONNX, лицензия, журналы, код и
`.env` в копию не входят.

Ежедневный запуск в 03:00 по часовому поясу Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File docker/install-backup-task.ps1
Start-ScheduledTask -TaskName '3D-Katalog Daily Backup'
Get-ScheduledTaskInfo -TaskName '3D-Katalog Daily Backup'
```

Задача выполняется в сеансе текущего пользователя. Компьютер должен быть включён,
пользователь должен войти, Docker Desktop должен работать. Пропущенный запуск
выполняется при доступности сеанса; при ошибке предусмотрены три повтора через
15 минут. `LastTaskResult = 0` означает успех; журнал `backup.log` находится
в папке копий. При выключенном Docker ошибка записывается в журнал, прежние
копии сохраняются. Параллельные запуски не допускаются. Автоматической очистки
и восстановления нет: перед удалением старых копий проверьте новую в отдельном
окружении. Для восстановления нужны PostgreSQL `pg_restore`, файлы из `models/`,
образ приложения и прежние настройки `.env`.

## Локальный запуск

Нужны Node.js 24, npm и запущенный PostgreSQL. Команды выполняются
**из корня репозитория**. Утилиты `createdb` и `psql` должны быть доступны в терминале.

### База данных и настройки

Создайте пустую базу и примените [схему](../backend/schema.sql):

```powershell
createdb -U postgres catalog_3d
psql -U postgres -d catalog_3d -v ON_ERROR_STOP=1 -f backend/schema.sql
```

Скопируйте [шаблон настроек](../backend/.env.example):

```powershell
Copy-Item backend/.env.example backend/.env
```

В `backend/.env` замените `CHANGE_ME` на пароль своего пользователя PostgreSQL.
При необходимости измените имя пользователя, адрес, порт и название базы в `DATABASE_URL`.

| Переменная | Назначение | Значение в шаблоне |
|---|---|---|
| `DATABASE_URL` | Подключение к PostgreSQL | `postgresql://postgres:CHANGE_ME@localhost:5432/catalog_3d` |
| `PORT` | Порт сервера | `3000` |

Настоящий `.env` содержит пароль и исключён из Git.

### Установка и запуск

```powershell
npm --prefix backend ci
npm --prefix frontend ci
node backend/node_modules/playwright/cli.js install chromium
npm --prefix frontend run build
npm --prefix backend start
```

Откройте [localhost:3000](http://localhost:3000). Express раздаёт собранный интерфейс
и обрабатывает запросы API. Сервер слушает только `localhost`.

### Модель увеличения текстур

Для этой опции один раз подготовьте ONNX-файл из официальных весов Real-ESRGAN.
Нужен Python 3.11; Python и PyTorch используются только при подготовке модели,
обычный сервер запускает её через ONNX Runtime Node.js.

```powershell
python -m venv "$env:LOCALAPPDATA\3d-catalog-model-export"
& "$env:LOCALAPPDATA\3d-catalog-model-export\Scripts\python.exe" -m pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu
& "$env:LOCALAPPDATA\3d-catalog-model-export\Scripts\python.exe" -m pip install onnx==1.23.2 numpy==2.4.6
& "$env:LOCALAPPDATA\3d-catalog-model-export\Scripts\python.exe" backend/scripts/prepare-upscale-model.py
```

Скрипт проверяет SHA-256 исходников, весов и готового ONNX-файла, сохраняет модель
и лицензию BSD-3-Clause в `backend/storage/ai/`. Эта папка не входит в Git.
Для другого расположения задайте `UPSCALE_MODEL_PATH` в `backend/.env`.
Без подготовленного файла обычная конвертация работает, запрос с нейрообработкой
вернёт сообщение о необходимости установить модель.

### Запуск с автоматическим обновлением

Этот режим нужен при изменении исходников: Vite обновляет интерфейс, а сервер
перезапускается после сохранения файлов. Для обычной работы используйте Docker
или собранный интерфейс. Запустите два отдельных терминала:

```powershell
npm --prefix backend run dev
```

```powershell
npm --prefix frontend run dev
```

| Компонент | Адрес |
|---|---|
| Интерфейс Vite | [localhost:5173](http://localhost:5173) |
| Сервер Express | [localhost:3000](http://localhost:3000) |

Vite передаёт запросы `/api/*` серверу на порту `3000`. Если меняете порт бэкенда,
обновите адрес прокси в `frontend/vite.config.ts`.

## Демонстрационные данные

Для локального показа используйте отдельную демонстрационную базу с применённой схемой
и укажите её в `backend/.env`. После этого выполните:

```powershell
npm --prefix backend run seed-demo
```

Скрипт создаёт команду «Студия «Север» (демо)», пользователей и набор моделей.
Повторный запуск удаляет команды, в которых состоят демонстрационные пользователи,
и пересоздаёт данные. Запускайте его только на отдельной демонстрационной базе.

| Роль | Логин | Пароль |
|---|---|---|
| Владелец команды | `owner@demo.3d-katalog.local` | `demo12345` |
| Участник | `anna@demo.3d-katalog.local` | `demo12345` |
| Участник | `ivan@demo.3d-katalog.local` | `demo12345` |
| Наблюдатель | `viewer@demo.3d-katalog.local` | `demo12345` |
| Администратор системы | `admin@demo.3d-katalog.local` | `demo12345` |

Эти учётные данные предназначены только для локальной демонстрации.
Войдите как владелец и откройте каталог: браузер создаст превью моделей.
Часть отчётов и результатов заданий подготовлена заранее; подробнее — в разделе ограничений.

## Администратор системы

Вход ограничен до вычисления хеша пароля: за 15 минут с первой попытки разрешены
30 попыток с одного IP и 10 с сочетания IP и нормализованной почты. Ответ `429`
содержит `Retry-After` в секундах; отказ не продлевает окно. Счётчики находятся
в памяти одного процесса и сбрасываются при перезапуске. При запуске нескольких
серверов потребуется общее хранилище счётчиков. Приложение не доверяет
`X-Forwarded-For`; при установке обратного прокси нужно отдельно настроить доверие
только к нему, иначе лимит будет общим для его IP.

Сначала зарегистрируйте пользователя, затем назначьте ему права командой:

```powershell
npm --prefix backend run make-admin -- user@example.com
```

Для снятия прав:

```powershell
npm --prefix backend run make-admin -- user@example.com --remove
```

