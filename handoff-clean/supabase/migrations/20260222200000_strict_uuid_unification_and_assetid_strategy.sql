-- Strict UUID unification for telemetry tables and references.
-- Teletrac rule: IMEI is treated as asset_id for this source.

create extension if not exists pgcrypto;
create or replace function public.promote_reference_column_to_uuid(
  p_src_schema text,
  p_src_table text,
  p_src_col text,
  p_ref_schema text,
  p_ref_table text,
  p_ref_legacy_col text default 'id_legacy',
  p_fk_name text default null,
  p_on_delete text default 'SET NULL',
  p_on_update text default 'NO ACTION'
)
returns void
language plpgsql
as $$
declare
  v_src regclass;
  v_ref regclass;
  v_src_type text;
  v_ref_id_type text;
  v_tmp_col text := p_src_col || '__uuid';
  v_src_has_legacy boolean;
  v_ref_has_legacy boolean;
  v_has_fk boolean;
  v_fk_name text := coalesce(p_fk_name, substr(p_src_table || '_' || p_src_col || '_fkey_uuid', 1, 63));
  v_drop_fk record;
begin
  v_src := to_regclass(format('%I.%I', p_src_schema, p_src_table));
  v_ref := to_regclass(format('%I.%I', p_ref_schema, p_ref_table));
  if v_src is null or v_ref is null then
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = p_src_schema
      and table_name = p_src_table
      and column_name = p_src_col
  ) then
    return;
  end if;

  select format_type(a.atttypid, a.atttypmod)
  into v_src_type
  from pg_attribute a
  where a.attrelid = v_src
    and a.attname = p_src_col
    and a.attnum > 0
    and not a.attisdropped;

  select format_type(a.atttypid, a.atttypmod)
  into v_ref_id_type
  from pg_attribute a
  where a.attrelid = v_ref
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if v_src_type <> 'uuid' then
    execute format(
      'alter table %I.%I add column if not exists %I uuid',
      p_src_schema,
      p_src_table,
      v_tmp_col
    );

    select exists (
      select 1
      from information_schema.columns
      where table_schema = p_ref_schema
        and table_name = p_ref_table
        and column_name = p_ref_legacy_col
    )
    into v_ref_has_legacy;

    if v_ref_has_legacy then
      execute format(
        'update %I.%I src
         set %I = ref.id
         from %I.%I ref
         where src.%I is not null
           and src.%I is null
           and (
             ref.id::text = src.%I::text
             or ref.%I = src.%I::text
           )',
        p_src_schema,
        p_src_table,
        v_tmp_col,
        p_ref_schema,
        p_ref_table,
        p_src_col,
        v_tmp_col,
        p_src_col,
        p_ref_legacy_col,
        p_src_col
      );
    else
      execute format(
        'update %I.%I src
         set %I = ref.id
         from %I.%I ref
         where src.%I is not null
           and src.%I is null
           and ref.id::text = src.%I::text',
        p_src_schema,
        p_src_table,
        v_tmp_col,
        p_ref_schema,
        p_ref_table,
        p_src_col,
        v_tmp_col,
        p_src_col
      );
    end if;

    for v_drop_fk in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
      where con.contype = 'f'
        and con.confrelid = v_ref
        and array_length(con.conkey, 1) = 1
        and ns.nspname = p_src_schema
        and rel.relname = p_src_table
        and att.attname = p_src_col
    loop
      execute format(
        'alter table %I.%I drop constraint if exists %I',
        p_src_schema,
        p_src_table,
        v_drop_fk.conname
      );
    end loop;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = p_src_schema
        and table_name = p_src_table
        and column_name = p_src_col || '_legacy'
    )
    into v_src_has_legacy;

    if not v_src_has_legacy then
      execute format(
        'alter table %I.%I rename column %I to %I',
        p_src_schema,
        p_src_table,
        p_src_col,
        p_src_col || '_legacy'
      );
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = p_src_schema
        and table_name = p_src_table
        and column_name = p_src_col
    ) then
      execute format(
        'alter table %I.%I rename column %I to %I',
        p_src_schema,
        p_src_table,
        v_tmp_col,
        p_src_col
      );
    end if;
  end if;

  if v_ref_id_type = 'uuid' and exists (
    select 1
    from information_schema.columns
    where table_schema = p_src_schema
      and table_name = p_src_table
      and column_name = p_src_col
      and data_type = 'uuid'
  ) then
    select exists (
      select 1
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
      where con.contype = 'f'
        and ns.nspname = p_src_schema
        and rel.relname = p_src_table
        and con.conname = v_fk_name
    )
    into v_has_fk;

    if not v_has_fk then
      execute format(
        'alter table %I.%I add constraint %I foreign key (%I) references %I.%I(id) on update %s on delete %s',
        p_src_schema,
        p_src_table,
        v_fk_name,
        p_src_col,
        p_ref_schema,
        p_ref_table,
        p_on_update,
        p_on_delete
      );
    end if;
  end if;
end;
$$;
create or replace function public.convert_table_id_to_uuid(
  p_schema text,
  p_table text,
  p_legacy_col text default 'id_legacy'
)
returns void
language plpgsql
as $$
declare
  v_target regclass;
  v_id_type text;
  v_fk record;
  v_drop_pk record;
  v_legacy_col text := p_legacy_col;
  v_alt_legacy_col text;
  v_has_id_uuid boolean;
begin
  v_target := to_regclass(format('%I.%I', p_schema, p_table));
  if v_target is null then
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = 'id'
  ) then
    return;
  end if;

  select format_type(a.atttypid, a.atttypmod)
  into v_id_type
  from pg_attribute a
  where a.attrelid = v_target
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if v_id_type = 'uuid' then
    execute format(
      'alter table %I.%I alter column id set default gen_random_uuid()',
      p_schema,
      p_table
    );
    return;
  end if;

  execute format(
    'alter table %I.%I add column if not exists id_uuid uuid default gen_random_uuid()',
    p_schema,
    p_table
  );

  execute format(
    'update %I.%I set id_uuid = gen_random_uuid() where id_uuid is null',
    p_schema,
    p_table
  );

  if exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = v_legacy_col
  ) then
    v_alt_legacy_col := v_legacy_col || '_text';
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = p_schema
        and table_name = p_table
        and column_name = v_alt_legacy_col
    ) then
      execute format(
        'alter table %I.%I add column %I text',
        p_schema,
        p_table,
        v_alt_legacy_col
      );
    end if;
    execute format(
      'update %I.%I set %I = coalesce(%I, id::text)',
      p_schema,
      p_table,
      v_alt_legacy_col,
      v_alt_legacy_col
    );
    v_legacy_col := v_alt_legacy_col;
  else
    execute format(
      'alter table %I.%I add column %I text',
      p_schema,
      p_table,
      v_legacy_col
    );
    execute format(
      'update %I.%I set %I = coalesce(%I, id::text)',
      p_schema,
      p_table,
      v_legacy_col,
      v_legacy_col
    );
  end if;

  create temporary table if not exists _uuid_fk_work (
    src_schema text,
    src_table text,
    src_col text,
    constraint_name text,
    on_delete text,
    on_update text
  ) on commit drop;

  truncate table _uuid_fk_work;

  insert into _uuid_fk_work (src_schema, src_table, src_col, constraint_name, on_delete, on_update)
  select
    ns.nspname,
    rel.relname,
    att.attname,
    con.conname,
    case con.confdeltype
      when 'a' then 'NO ACTION'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
      else 'NO ACTION'
    end as on_delete,
    case con.confupdtype
      when 'a' then 'NO ACTION'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
      else 'NO ACTION'
    end as on_update
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
  where con.contype = 'f'
    and con.confrelid = v_target
    and array_length(con.conkey, 1) = 1
    and array_length(con.confkey, 1) = 1;

  for v_fk in
    select * from _uuid_fk_work
  loop
    execute format(
      'alter table %I.%I add column if not exists %I uuid',
      v_fk.src_schema,
      v_fk.src_table,
      v_fk.src_col || '__uuid'
    );

    execute format(
      'update %I.%I src
       set %I = ref.id_uuid
       from %I.%I ref
       where src.%I is not null
         and src.%I is null
         and (
           ref.id::text = src.%I::text
           or ref.%I = src.%I::text
         )',
      v_fk.src_schema,
      v_fk.src_table,
      v_fk.src_col || '__uuid',
      p_schema,
      p_table,
      v_fk.src_col,
      v_fk.src_col || '__uuid',
      v_fk.src_col,
      v_legacy_col,
      v_fk.src_col
    );

    execute format(
      'alter table %I.%I drop constraint if exists %I',
      v_fk.src_schema,
      v_fk.src_table,
      v_fk.constraint_name
    );
  end loop;

  for v_drop_pk in
    select conname
    from pg_constraint
    where conrelid = v_target
      and contype = 'p'
  loop
    execute format(
      'alter table %I.%I drop constraint if exists %I',
      p_schema,
      p_table,
      v_drop_pk.conname
    );
  end loop;

  execute format(
    'alter table %I.%I rename column id to %I',
    p_schema,
    p_table,
    v_legacy_col || '_old'
  );

  select exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = 'id_uuid'
  )
  into v_has_id_uuid;

  if v_has_id_uuid then
    execute format(
      'alter table %I.%I rename column id_uuid to id',
      p_schema,
      p_table
    );
  end if;

  execute format(
    'alter table %I.%I alter column id set default gen_random_uuid()',
    p_schema,
    p_table
  );

  execute format(
    'alter table %I.%I alter column id set not null',
    p_schema,
    p_table
  );

  if not exists (
    select 1
    from pg_constraint
    where conrelid = v_target
      and contype = 'p'
  ) then
    execute format(
      'alter table %I.%I add primary key (id)',
      p_schema,
      p_table
    );
  end if;

  for v_fk in
    select * from _uuid_fk_work
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = v_fk.src_schema
        and table_name = v_fk.src_table
        and column_name = v_fk.src_col
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = v_fk.src_schema
        and table_name = v_fk.src_table
        and column_name = v_fk.src_col || '__uuid'
    ) then
      if not exists (
        select 1
        from information_schema.columns
        where table_schema = v_fk.src_schema
          and table_name = v_fk.src_table
          and column_name = v_fk.src_col || '_legacy'
      ) then
        execute format(
          'alter table %I.%I rename column %I to %I',
          v_fk.src_schema,
          v_fk.src_table,
          v_fk.src_col,
          v_fk.src_col || '_legacy'
        );
      end if;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = v_fk.src_schema
        and table_name = v_fk.src_table
        and column_name = v_fk.src_col
    ) and exists (
      select 1
      from information_schema.columns
      where table_schema = v_fk.src_schema
        and table_name = v_fk.src_table
        and column_name = v_fk.src_col || '__uuid'
    ) then
      execute format(
        'alter table %I.%I rename column %I to %I',
        v_fk.src_schema,
        v_fk.src_table,
        v_fk.src_col || '__uuid',
        v_fk.src_col
      );
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = v_fk.src_schema
        and table_name = v_fk.src_table
        and column_name = v_fk.src_col
        and data_type = 'uuid'
    ) then
      if not exists (
        select 1
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace ns on ns.oid = rel.relnamespace
        where con.contype = 'f'
          and ns.nspname = v_fk.src_schema
          and rel.relname = v_fk.src_table
          and con.conname = v_fk.constraint_name
      ) then
        execute format(
          'alter table %I.%I add constraint %I foreign key (%I) references %I.%I(id) on update %s on delete %s',
          v_fk.src_schema,
          v_fk.src_table,
          v_fk.constraint_name,
          v_fk.src_col,
          p_schema,
          p_table,
          v_fk.on_update,
          v_fk.on_delete
        );
      end if;
    end if;
  end loop;
end;
$$;
select public.convert_table_id_to_uuid('public', 'vehicles', 'id_legacy');
select public.convert_table_id_to_uuid('public', 'fuel_temperature_reports', 'id_legacy');
select public.promote_reference_column_to_uuid(
  'public', 'telemetry_alerts', 'vehicle_id',
  'public', 'vehicles',
  'id_legacy',
  'telemetry_alerts_vehicle_id_fkey',
  'SET NULL',
  'NO ACTION'
);
select public.promote_reference_column_to_uuid(
  'public', 'fuel_temperature_reports', 'vehicle_id',
  'public', 'vehicles',
  'id_legacy',
  'fuel_temperature_reports_vehicle_id_fkey',
  'SET NULL',
  'NO ACTION'
);
select public.promote_reference_column_to_uuid(
  'public', 'refuel_events', 'vehicle_id',
  'public', 'vehicles',
  'id_legacy',
  'refuel_events_vehicle_id_fkey',
  'SET NULL',
  'NO ACTION'
);
select public.promote_reference_column_to_uuid(
  'public', 'raw_sensor_data', 'vehicle_id',
  'public', 'vehicles',
  'id_legacy',
  'raw_sensor_data_vehicle_id_fkey',
  'SET NULL',
  'NO ACTION'
);
select public.promote_reference_column_to_uuid(
  'public', 'daily_movement_reports', 'vehicle_id',
  'public', 'vehicles',
  'id_legacy',
  'daily_movement_reports_vehicle_id_fkey',
  'SET NULL',
  'NO ACTION'
);
select public.promote_reference_column_to_uuid(
  'public', 'refuel_events', 'temperature_report_id',
  'public', 'fuel_temperature_reports',
  'id_legacy',
  'refuel_events_temperature_report_id_fkey',
  'CASCADE',
  'NO ACTION'
);
select public.promote_reference_column_to_uuid(
  'public', 'raw_sensor_data', 'temperature_report_id',
  'public', 'fuel_temperature_reports',
  'id_legacy',
  'raw_sensor_data_temperature_report_id_fkey',
  'CASCADE',
  'NO ACTION'
);
do $$
declare
  r record;
begin
  for r in
    select c.table_schema, c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'id'
      and c.data_type = 'uuid'
  loop
    begin
      execute format(
        'alter table %I.%I alter column id set default gen_random_uuid()',
        r.table_schema,
        r.table_name
      );
    exception
      when others then null;
    end;
  end loop;
end $$;
create or replace function public.sync_vehicle_from_fuel_report(
  p_assigned_asset text,
  p_client_name text default null,
  p_imei_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned_asset text := nullif(trim(p_assigned_asset), '');
  v_client text := nullif(trim(p_client_name), '');
  v_imei text := public.normalize_imei(p_imei_number);
  v_asset_key text := coalesce(v_imei, v_assigned_asset);
  v_vehicle_id text;
  v_has_id boolean;
  v_has_imei boolean;
  v_has_asset_id boolean;
  v_has_vehicle_plate boolean;
  v_has_client_name boolean;
  v_has_company_name boolean;
  v_cols text[] := array[]::text[];
  v_vals text[] := array[]::text[];
  v_missing_required text[];
  v_col record;
  v_sql text;
begin
  if to_regclass('public.vehicles') is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'vehicles_table_missing');
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'id'
  ) into v_has_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'imei'
  ) into v_has_imei;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'asset_id'
  ) into v_has_asset_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'vehicle_plate'
  ) into v_has_vehicle_plate;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'client_name'
  ) into v_has_client_name;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vehicles' and column_name = 'company_name'
  ) into v_has_company_name;

  if v_has_id and v_has_imei and v_imei is not null then
    execute 'select id::text from public.vehicles where public.normalize_imei(imei) = $1 limit 1'
      into v_vehicle_id
      using v_imei;
  end if;

  if v_vehicle_id is null and v_has_id and v_has_asset_id and v_asset_key is not null then
    execute 'select id::text from public.vehicles where asset_id = $1 limit 1'
      into v_vehicle_id
      using v_asset_key;
  end if;

  if v_vehicle_id is null and v_has_id and v_has_vehicle_plate and v_assigned_asset is not null then
    execute 'select id::text from public.vehicles where vehicle_plate = $1 limit 1'
      into v_vehicle_id
      using v_assigned_asset;
  end if;

  if v_vehicle_id is not null then
    if v_has_imei and v_imei is not null then
      execute '
        update public.vehicles
        set imei = coalesce(imei, $1)
        where id::text = $2
      ' using v_imei, v_vehicle_id;
    end if;

    if v_has_asset_id and v_asset_key is not null then
      execute '
        update public.vehicles
        set asset_id = case
          when asset_id is null then $1
          when $2 is not null and asset_id = $2 then $1
          else asset_id
        end
        where id::text = $3
      ' using v_asset_key, v_assigned_asset, v_vehicle_id;
    end if;

    if v_has_vehicle_plate and v_assigned_asset is not null then
      execute '
        update public.vehicles
        set vehicle_plate = coalesce(vehicle_plate, $1)
        where id::text = $2
      ' using v_assigned_asset, v_vehicle_id;
    end if;

    if v_client is not null then
      if v_has_client_name then
        execute 'update public.vehicles set client_name = coalesce(client_name, $1) where id::text = $2'
          using v_client, v_vehicle_id;
      end if;
      if v_has_company_name then
        execute 'update public.vehicles set company_name = coalesce(company_name, $1) where id::text = $2'
          using v_client, v_vehicle_id;
      end if;
    end if;

    return jsonb_build_object('status', 'existing', 'vehicle_id', v_vehicle_id);
  end if;

  if v_asset_key is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'missing_imei_and_asset');
  end if;

  for v_col in
    select column_name, udt_name, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vehicles'
      and column_name in (
        'id',
        'asset_id',
        'vehicle_plate',
        'client_name',
        'company_name',
        'imei_number',
        'imei',
        'name',
        'vehicle_name'
      )
  loop
    if v_col.column_name = 'id' then
      if v_col.column_default is null then
        if v_col.udt_name = 'uuid' then
          v_cols := array_append(v_cols, 'id');
          v_vals := array_append(v_vals, 'gen_random_uuid()');
        else
          v_cols := array_append(v_cols, 'id');
          v_vals := array_append(v_vals, format('%L', v_asset_key));
        end if;
      end if;
    elsif v_col.column_name = 'asset_id' then
      v_cols := array_append(v_cols, 'asset_id');
      v_vals := array_append(v_vals, format('%L', v_asset_key));
    elsif v_col.column_name = 'vehicle_plate' and v_assigned_asset is not null then
      v_cols := array_append(v_cols, 'vehicle_plate');
      v_vals := array_append(v_vals, format('%L', v_assigned_asset));
    elsif v_col.column_name = 'client_name' and v_client is not null then
      v_cols := array_append(v_cols, 'client_name');
      v_vals := array_append(v_vals, format('%L', v_client));
    elsif v_col.column_name = 'company_name' and v_client is not null then
      v_cols := array_append(v_cols, 'company_name');
      v_vals := array_append(v_vals, format('%L', v_client));
    elsif v_col.column_name = 'imei_number' and v_imei is not null then
      v_cols := array_append(v_cols, 'imei_number');
      v_vals := array_append(v_vals, format('%L', v_imei));
    elsif v_col.column_name = 'imei' and v_imei is not null then
      v_cols := array_append(v_cols, 'imei');
      v_vals := array_append(v_vals, format('%L', v_imei));
    elsif v_col.column_name = 'name' then
      v_cols := array_append(v_cols, 'name');
      v_vals := array_append(v_vals, format('%L', coalesce(v_assigned_asset, v_asset_key)));
    elsif v_col.column_name = 'vehicle_name' then
      v_cols := array_append(v_cols, 'vehicle_name');
      v_vals := array_append(v_vals, format('%L', coalesce(v_assigned_asset, v_asset_key)));
    end if;
  end loop;

  select array_agg(c.column_name order by c.ordinal_position)
  into v_missing_required
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'vehicles'
    and c.is_nullable = 'NO'
    and c.is_generated = 'NEVER'
    and coalesce(c.is_identity, 'NO') = 'NO'
    and c.column_default is null
    and not (c.column_name = any(v_cols));

  if coalesce(array_length(v_missing_required, 1), 0) > 0 then
    return jsonb_build_object(
      'status',
      'skipped',
      'reason',
      'vehicles_required_columns_missing',
      'columns',
      v_missing_required
    );
  end if;

  if coalesce(array_length(v_cols, 1), 0) = 0 then
    return jsonb_build_object('status', 'skipped', 'reason', 'vehicles_insert_columns_unavailable');
  end if;

  if v_has_id then
    v_sql := format(
      'insert into public.vehicles (%s) values (%s) returning id::text',
      array_to_string(v_cols, ','),
      array_to_string(v_vals, ',')
    );
    execute v_sql into v_vehicle_id;
  else
    v_sql := format(
      'insert into public.vehicles (%s) values (%s)',
      array_to_string(v_cols, ','),
      array_to_string(v_vals, ',')
    );
    execute v_sql;
    v_vehicle_id := null;
  end if;

  return jsonb_build_object('status', 'inserted', 'vehicle_id', v_vehicle_id);
exception
  when others then
    return jsonb_build_object('status', 'error', 'error', sqlerrm);
end;
$$;
