-- Seed data for first admin user
-- 1) Create a user in Supabase Auth and copy the user ID
-- 2) Replace the placeholders below and run this script

-- Create admin profile
-- insert into profiles (id, role, display_name)
-- values ('AUTH_USER_ID', 'admin', 'Platform Admin');

-- Create a sample client
-- insert into clients (name) values ('Demo Client') returning id;

-- Assign admin to the client
-- insert into client_users (client_id, user_id)
-- values ('CLIENT_ID', 'AUTH_USER_ID');
