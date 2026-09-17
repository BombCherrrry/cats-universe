# Как запустить Cat's Universe

Сайт состоит из двух частей:
- **GitHub Pages** — сам сайт (файлы, картинки)
- **Supabase** — бесплатная база данных для реакций, комментариев и болталки

Ничего не нужно платить. Аккаунты создаёшь только ты (один раз), друзья ничего не регистрируют.

---

## Шаг 1. Supabase (база данных)

1. Зайди на **supabase.com** → Sign up (можно через GitHub-аккаунт — так проще).
2. Создай новый проект (New Project). Название — любое, например `cats-universe`. Пароль базы — любой, сохрани его куда-нибудь на всякий случай (для сайта он не понадобится).
3. Подожди 1-2 минуты, пока проект создастся.
4. Слева открой **SQL Editor** → **New query** и вставь код ниже целиком → **Run**.

```sql
create table comments (
  id bigint generated always as identity primary key,
  comic_slug text not null,
  parent_id bigint references comments(id) on delete cascade,
  author text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table reactions (
  id bigint generated always as identity primary key,
  comic_slug text not null,
  emoji text not null,
  author text not null,
  created_at timestamptz not null default now(),
  unique (comic_slug, emoji, author)
);

alter table comments enable row level security;
alter table reactions enable row level security;

create policy "public read comments" on comments for select using (true);
create policy "public insert comments" on comments for insert with check (true);

create policy "public read reactions" on reactions for select using (true);
create policy "public insert reactions" on reactions for insert with check (true);
create policy "public delete own reactions" on reactions for delete using (true);

alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table reactions;
```

Это создаёт две таблицы (комментарии и реакции) и открывает к ним доступ на чтение/запись всем, у кого есть ссылка на сайт (без паролей — это осознанный выбор для закрытого круга друзей).

5. Слева зайди в **Project Settings → API**. Скопируй:
   - **Project URL**
   - **anon public** key

6. Открой в проекте файл `js/config.js` и вставь их вместо заглушек:

```js
window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOi...длинная строка...";
```

Это не секретные данные — их можно спокойно держать в открытом коде сайта.

---

## Шаг 2. GitHub Pages (сам сайт)

1. Создай новый репозиторий на GitHub, например `cats-universe`.
2. Залей туда все файлы из этой папки (перетащить через веб-интерфейс GitHub — Add file → Upload files — тоже подойдёт).
3. Зайди в репозитории в **Settings → Pages**.
4. В **Branch** выбери `main` (или `master`) и папку `/ (root)` → **Save**.
5. Через минуту-две сайт появится по адресу вида:
   `https://твой-ник.github.io/cats-universe/`

Готово — можно скидывать ссылку друзьям.

---

## Проверка

Открой сайт, зайди на любой комикс, поставь реакцию и напиши комментарий. Если всё подключено верно — они появятся сразу и останутся после перезагрузки страницы.

Если реакции/комментарии не работают — почти всегда дело в `js/config.js` (опечатка в URL или ключе) или в том, что SQL из шага 1 не был выполнен.
