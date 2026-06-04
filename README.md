# PiCloud 2.0

PiCloud 2.0 is a self-hosted personal cloud storage app built with Next.js App Router, TypeScript, Tailwind CSS, Prisma, SQLite, and local filesystem storage.

It is designed for a single-user Raspberry Pi or small home server setup. Files are stored on disk in `storage/uploads`; SQLite stores users and file metadata.

## Current Features

- Secure login with bcrypt password hashing
- Protected dashboard routes
- Drag-and-drop multi-file upload
- Configurable upload limit, currently 1 GB per request
- Local filesystem file storage
- SQLite metadata through Prisma
- Nested folder organization with breadcrumbs
- File list with search and type filters
- Storage usage summary
- Download, rename, and delete actions
- Bulk select, move, delete, and selected ZIP download
- Folder ZIP downloads with nested paths preserved
- Protected previews for images, PDFs, text-like documents, audio, and video
- Browser editing for UTF-8 text files up to 1 MB
- Cached WebP image thumbnails in the file list
- Password change form in settings
- Admin-only local account creation with username and password
- Admin user management: storage usage, password resets, disable/enable, delete non-admin users
- Disk health view for upload drive space
- Per-file upload progress, cancellation, and failed-upload states

Office documents such as `.docx`, `.xlsx`, and `.pptx` can be stored and downloaded, but local browser preview needs a converter such as LibreOffice.

## Setup

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
copy .env.example .env
```

Edit `.env` before running this outside local development:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="replace-with-a-random-secret-at-least-32-characters-long"
UPLOAD_DIR="./storage/uploads"
MAX_UPLOAD_SIZE_BYTES="1073741824"
DEFAULT_ADMIN_USERNAME="admin"
DEFAULT_ADMIN_PASSWORD="change-this-password"
```

Create the database and Prisma client:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

Default local login after seeding:

```text
Username: admin
Password: value of DEFAULT_ADMIN_PASSWORD in .env
```

Change the password from `/dashboard/settings` after the first login.

The configured admin account can also create and manage additional local accounts from `/dashboard/settings`. By default, the admin username is `admin`, controlled by `DEFAULT_ADMIN_USERNAME` in `.env`.

## Useful Commands

```bash
npm run lint
npm run typecheck
npm run build
npm run db:studio
```

## Project Structure

```text
app/                    Next.js App Router pages and API routes
components/             React UI components
lib/                    Auth, database, storage, validation, file helpers
prisma/                 Prisma schema, migrations, and seed script
storage/uploads/        Local uploaded file storage
```

## Security Notes

- File paths from clients are never trusted.
- Uploads receive generated stored filenames.
- Download and preview routes check authentication and ownership.
- Raw filesystem paths are not returned to the frontend.
- Upload size is enforced server-side.
- Keep `.env` private and use a strong `AUTH_SECRET`.
