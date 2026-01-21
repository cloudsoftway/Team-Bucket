# Database Setup Guide

This project uses PostgreSQL with Prisma ORM to store action sessions and actions.

## Prerequisites

- Docker and Docker Compose installed
- Node.js and npm installed

## Setup Steps

### 1. Start PostgreSQL Database

```bash
docker-compose up -d
```

This will start a PostgreSQL container on port 5432.

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and update the `DATABASE_URL`:

```env
DATABASE_URL="postgresql://capacity_user:capacity_password@localhost:5432/capacity_planning?schema=public"
```

### 3. Install Dependencies

```bash
npm install
```

This will install Prisma and other dependencies.

### 4. Generate Prisma Client

```bash
npm run db:generate
```

### 5. Push Database Schema

```bash
npm run db:push
```

This will create the `action_sessions` and `actions` tables in your database.

### 6. (Optional) Open Prisma Studio

To view and manage your database visually:

```bash
npm run db:studio
```

This will open Prisma Studio at http://localhost:5555

## Database Schema

### ActionSession Table
- `id` (UUID, Primary Key)
- `created_by` (String)
- `status` (String: 'draft' | 'confirmed' | 'applied' | 'failed')
- `created_at` (DateTime)

### Action Table
- `id` (UUID, Primary Key)
- `session_id` (UUID, Foreign Key → ActionSession)
- `description` (String)
- `entity_type` (String)
- `entity_id` (Integer)
- `action_type` (String: 'assign' | 'unassign' | 'change_stage')
- `before_state` (JSON)
- `after_state` (JSON)
- `applied_at` (DateTime, nullable)
- `status` (String: 'pending' | 'applied' | 'failed')

## Useful Commands

- `npm run db:generate` - Generate Prisma Client
- `npm run db:push` - Push schema changes to database (development)
- `npm run db:migrate` - Create a migration (production)
- `npm run db:studio` - Open Prisma Studio

## Troubleshooting

### Database Connection Issues

1. Make sure Docker container is running:
   ```bash
   docker-compose ps
   ```

2. Check database logs:
   ```bash
   docker-compose logs postgres
   ```

3. Verify DATABASE_URL in `.env.local` matches docker-compose.yml settings

### Reset Database

To reset the database (⚠️ This will delete all data):

```bash
docker-compose down -v
docker-compose up -d
npm run db:push
```
