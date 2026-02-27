-- Remove unused user settings persistence.
-- Frontend settings are currently local-state only and do not use /api/user-settings.

drop policy if exists "user_settings_select" on public.user_settings;
drop policy if exists "user_settings_write" on public.user_settings;
drop table if exists public.user_settings;
