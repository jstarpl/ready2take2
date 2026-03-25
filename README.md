# Ready2Take2

Full-stack TypeScript scaffold for a live production coordination app.

## Stack

- Vite + React
- Express + tRPC
- SQLite + TypeORM
- Zod
- Tailwind + shadcn-style UI foundation

## Scripts

- `pnpm dev` starts client and server together
- `pnpm build` builds the client and compiles the server
- `pnpm typecheck` runs TypeScript checks

## Default development login

The server seeds a default user on first start:

- username: `admin`
- password: `admin123!`

## Notes

- SQLite data is stored under `data/ready2take2.sqlite`
- This is a scaffold, not a finished production app