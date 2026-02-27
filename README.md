# Fuel Intelligence Platform

This repo contains a full-stack fleet intelligence platform with a Supabase backend and an integrated Express + Vite server.

## Architecture (Option 2)
- **API + App Server:** `frontend/server` (Express)  
- **Client:** `frontend/client` (React + Vite in middleware mode)  
- **Database/Auth:** Supabase  
- **Legacy folder:** `backend/` is no longer used

## Setup
1. **Create a Supabase project**
2. **Apply the database schema**
   - Open Supabase SQL Editor and run: `supabase/schema.sql`
3. **Create your first admin**
   - Create a user in Supabase Auth, then run `supabase/seed.sql` with your user ID
4. **Create environment file**
   - Copy `frontend/.env.example` to `frontend/.env`
   - Fill in your Supabase keys:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `SUPABASE_ANON_KEY`
     - `VITE_SUPABASE_URL`
     - `VITE_SUPABASE_ANON_KEY`

## Run (Dev)
```bash
cd frontend
npm install
npm run dev


npm --prefix frontend install
npm --prefix frontend run dev

```

The app and API will run on the same port (default `3000`).

## Admin Panel
Admins can:
- Create client accounts
- Create user accounts
- Assign users to clients
- Manage vehicles and fuel events

Client users will only see data for their assigned clients.

## Production Notes
- Keep the **service role key** server-side only.
- Use `VITE_API_BASE_URL` only if you deploy the API separately.
- Enable RLS in Supabase if you allow direct client queries.
  - The provided `supabase/schema.sql` already enables RLS with safe policies.
