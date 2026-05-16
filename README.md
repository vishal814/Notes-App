# Multi-User Notes API

A robust, multi-user backend REST API for a note-taking application (similar to Google Keep or Apple Notes). Built with Node.js, Express, and PostgreSQL.

##  Features

* **JWT Authentication:** Secure user registration and login.
* **Notes Management:** Create, read, update, and soft-delete personal notes.
* **Note Sharing:** Share notes with other users with specific role-based permissions (`Viewer` or `Editor`).
* **Note Pinning:** Pin important notes to automatically sort them to the top of your list.
* **Soft Delete (Trash Bin):** Deleted notes are moved to a trash state to prevent accidental data loss, and can be easily restored.
* **Full-Text Search:** Search through all owned and shared notes by keyword.
* **Interactive Documentation:** Fully documented with Swagger UI, accessible at `/api-docs`.

##  Tech Stack

* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Security:** bcryptjs (password hashing), jsonwebtoken (auth)

##  Local Setup

1. Clone the repository.
2. Run `npm install` to install dependencies.
3. Create a `.env` file and configure your `DATABASE_URL` and `JWT_SECRET`.
4. Run `npx prisma db push` to sync the database schema.
5. Run `npm run dev` to start the development server.
6. Visit `http://localhost:3000/api-docs` to test the API.
