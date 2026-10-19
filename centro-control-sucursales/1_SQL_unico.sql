-- =====================================================================
--  MANTENIMIENTO FINEZA + ÓRDENES DE TRABAJO  ·  SQL ÚNICO (versión 4)
--  Pégalo completo en Supabase > SQL Editor > New query > Run.
--  Se puede ejecutar más de una vez sin romper nada.
--  Las tablas empiezan con "mnt_" (mantenimiento) y "ot_" (órdenes de trabajo de
--  los móviles), así que conviven sin problema con otras apps (por ejemplo el
--  Centro de Control) en el mismo proyecto.
--  Primera vez: cambia el correo de la ÚLTIMA sección (busca "CAMBIA ESTE CORREO")
--  por el de tu usuario administrador. Si ya eres administrador, déjalo como está.
-- =====================================================================

-- ---------- TABLAS ----------
create table if not exists mnt_perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nombre text not null default '',
  rol text not null default 'tecnico',
  cuadrilla_id uuid,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists mnt_cuadrillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  integrantes text[] not null default '{}',
  especialidades text[] not null default '{Electricidad}',
  color text not null default '#0F7B6C',
  orden int not null default 0
);

create table if not exists mnt_sucursales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  unidad_negocio text not null default 'Baratote Minorista',
  direccion text,
  lat double precision,
  lng double precision,
  dias_operacion int not null default 7 check (dias_operacion in (5,6,7)),
  activa boolean not null default true,
  inventario jsonb,                       -- null = todavía sin relevar
  inventario_relevado_en timestamptz,
  creada_en timestamptz not null default now()
);

create table if not exists mnt_tipos_activo (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  etiqueta text not null,
  orden int not null default 0
);

create table if not exists mnt_catalogo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  especialidad text not null default 'Electricidad',
  unidad_medida text not null default 'unidad' check (unidad_medida in ('unidad','sucursal','visita')),
  minutos int not null default 30 check (minutos > 0),
  activo boolean not null default true
);

create table if not exists mnt_tareas (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references mnt_sucursales(id) on delete cascade,
  catalogo_id uuid not null references mnt_catalogo(id),
  cantidad int not null default 1 check (cantidad > 0),
  cuadrilla_id uuid references mnt_cuadrillas(id),
  fecha date,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_curso','hecha')),
  nota text,
  iniciada_en timestamptz,
  terminada_en timestamptz,
  creada_por uuid default auth.uid(),
  creada_en timestamptz not null default now()
);
create index if not exists mnt_tareas_fecha_idx on mnt_tareas(fecha);
create index if not exists mnt_tareas_suc_idx on mnt_tareas(sucursal_id);
create index if not exists mnt_tareas_cuad_idx on mnt_tareas(cuadrilla_id);
-- una cuadrilla solo puede tener una tarea en curso a la vez
create unique index if not exists mnt_un_en_curso on mnt_tareas(cuadrilla_id) where estado = 'en_curso';

create table if not exists mnt_fotos (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references mnt_tareas(id) on delete cascade,
  path text not null,
  creada_por uuid default auth.uid(),
  creada_en timestamptz not null default now()
);
create index if not exists mnt_fotos_tarea_idx on mnt_fotos(tarea_id);

create table if not exists mnt_parametros (
  clave text primary key,
  valor jsonb not null
);

do $$ begin
  alter table mnt_perfiles add constraint mnt_perfiles_cuadrilla_fk foreign key (cuadrilla_id) references mnt_cuadrillas(id) on delete set null;
exception when duplicate_object then null; end $$;


-- versión 3: relevamiento de trabajos y gastos por sucursal
alter table mnt_sucursales add column if not exists trabajos_relevados_en timestamptz;

create table if not exists mnt_gastos (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references mnt_sucursales(id) on delete cascade,
  tarea_id uuid references mnt_tareas(id) on delete set null,
  concepto text not null,
  categoria text not null default 'material' check (categoria in ('material','mano_obra','transporte','otro')),
  cantidad numeric not null default 1 check (cantidad > 0),
  precio_unit numeric not null default 0 check (precio_unit >= 0),
  monto numeric generated always as (cantidad * precio_unit) stored,
  estado text not null default 'cotizado' check (estado in ('cotizado','aprobado','comprado')),
  proveedor text,
  nota text,
  fecha date not null default ((now() at time zone 'America/Asuncion')::date),
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists mnt_gastos_suc_idx on mnt_gastos(sucursal_id);
create index if not exists mnt_gastos_fecha_idx on mnt_gastos(fecha);

-- ---------- ROLES CON PERMISOS ----------
create extension if not exists pgcrypto with schema extensions;

create table if not exists mnt_roles (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,
  descripcion text not null default '',
  sistema boolean not null default false,       -- los roles del sistema no se pueden borrar
  p_mapa boolean not null default false,        -- ver el mapa y las fichas
  p_planificar boolean not null default false,  -- programar y editar tareas
  p_panel boolean not null default false,       -- ver el panel del director
  p_parametros boolean not null default false,  -- administrar parámetros, roles y empleados
  p_operar boolean not null default false,
  p_gastos boolean not null default false  -- registrar cotizaciones y gastos de materiales por sucursal
);

-- versión 3: sobre una base anterior agrega el permiso de gastos y la tarea «Otro trabajo»
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mnt_roles' and column_name = 'p_gastos') then
    alter table mnt_roles add column p_gastos boolean not null default false;
    update mnt_roles set p_gastos = true where clave in ('admin','supervisor');
    insert into mnt_catalogo (nombre, especialidad, unidad_medida, minutos)
    select 'Otro trabajo (ver nota)', 'Electricidad', 'visita', 60
    where not exists (select 1 from mnt_catalogo where nombre = 'Otro trabajo (ver nota)');
  end if;
end $$;

-- versión 4: permisos de órdenes de trabajo (OT) de los móviles
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'mnt_roles' and column_name = 'p_ot_chofer') then
    alter table mnt_roles add column p_ot_chofer boolean not null default false;      -- manejar: generar y recibir OT, salidas y llegadas
    alter table mnt_roles add column p_ot_guardia boolean not null default false;     -- garita: registrar salidas y entradas con el QR
    alter table mnt_roles add column p_ot_supervisar boolean not null default false;  -- panel de OT en vivo, asignar, cancelar y reportes
    update mnt_roles set p_ot_guardia = true, p_ot_supervisar = true where clave = 'admin';
  end if;
end $$;

insert into mnt_roles (clave, nombre, descripcion, sistema, p_mapa, p_planificar, p_panel, p_parametros, p_operar, p_gastos, p_ot_chofer, p_ot_guardia, p_ot_supervisar)
select * from (values
  ('admin','Administrador','Ves todo y editas los parámetros: sucursales, catálogo de tareas, tipos de activo, cuadrillas, roles, empleados, inventarios, móviles y ubicaciones.',true,true,true,true,true,false,true,false,true,true),
  ('supervisor','Supervisor','Ordenas las tareas del día y de la semana, relevas los trabajos de cada sucursal, cotizas materiales y abres la ficha desde el mapa.',true,true,true,true,false,false,true,false,false,false),
  ('director','Director','Solo lectura: dónde trabaja cada cuadrilla ahora y cuánto se hizo por día, semana y mes, y cuánto se gasta por sucursal.',true,false,false,true,false,false,false,false,false,false),
  ('tecnico','Técnico','Marca que llegaste, agrega fotos y cierra cada tarea.',true,false,false,false,false,true,false,false,false,false),
  ('chofer','Chofer','Generas tus órdenes de trabajo, aceptas las que te asignan, muestras el QR en la garita y marcas la llegada con el GPS.',true,false,false,false,false,false,false,true,false,false),
  ('guardia','Guardia','Escaneas el QR de cada orden para registrar la salida y la entrada de los móviles en la garita.',true,false,false,false,false,false,false,false,true,false),
  ('supervisor_ot','Supervisor de OT','Sigues en vivo a los choferes de tu departamento, les asignas órdenes, cancelas las que no van y descargas los reportes.',true,false,false,false,false,false,false,false,false,true)
) v(clave,nombre,descripcion,sistema,p_mapa,p_planificar,p_panel,p_parametros,p_operar,p_gastos,p_ot_chofer,p_ot_guardia,p_ot_supervisar)
on conflict (clave) do nothing;

-- el rol de cada perfil ahora apunta a mnt_roles
alter table mnt_perfiles drop constraint if exists mnt_perfiles_rol_check;
do $$ begin
  alter table mnt_perfiles add constraint mnt_perfiles_rol_fk foreign key (rol) references mnt_roles(clave) on update cascade;
exception when duplicate_object then null; end $$;

-- ---------- FUNCIONES ----------
create or replace function mnt_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from mnt_perfiles where id = auth.uid() and activo
$$;

-- ¿El usuario actual tiene este permiso? (mapa, planificar, panel, parametros, operar, gastos, ot_chofer, ot_guardia, ot_supervisar)
create or replace function mnt_puede(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case p
      when 'mapa' then r.p_mapa
      when 'planificar' then r.p_planificar
      when 'panel' then r.p_panel
      when 'parametros' then r.p_parametros
      when 'operar' then r.p_operar
      when 'gastos' then r.p_gastos
      when 'ot_chofer' then r.p_ot_chofer
      when 'ot_guardia' then r.p_ot_guardia
      when 'ot_supervisar' then r.p_ot_supervisar
    end
    from mnt_perfiles pf join mnt_roles r on r.clave = pf.rol
    where pf.id = auth.uid() and pf.activo
  ), false)
$$;

create or replace function mnt_mi_cuadrilla() returns uuid
language sql stable security definer set search_path = public as $$
  select cuadrilla_id from mnt_perfiles where id = auth.uid() and activo
$$;

-- Crea el perfil del usuario que acaba de entrar (rol técnico por defecto).
create or replace function mnt_asegurar_perfil() returns mnt_perfiles
language plpgsql security definer set search_path = public as $$
declare p mnt_perfiles; v_email text;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into mnt_perfiles (id, email, nombre, rol)
  values (auth.uid(), v_email, split_part(coalesce(v_email,''), '@', 1), 'tecnico')
  on conflict (id) do nothing;
  select * into p from mnt_perfiles where id = auth.uid();
  return p;
end $$;

-- Un usuario no puede quitarse a sí mismo el rol ni desactivarse
create or replace function mnt_perfiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.id = auth.uid()
     and (new.rol is distinct from old.rol or new.activo is distinct from old.activo) then
    raise exception 'No puedes cambiar tu propio rol ni desactivarte';
  end if;
  return new;
end $$;
drop trigger if exists mnt_perfiles_guard on mnt_perfiles;
create trigger mnt_perfiles_guard before update on mnt_perfiles
  for each row execute function mnt_perfiles_guard();

-- Acciones en terreno: el que puede planificar actúa sobre cualquier tarea;
-- el que solo puede operar, únicamente sobre las de su cuadrilla.
create or replace function mnt_iniciar_tarea(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t mnt_tareas; v_hoy date := (now() at time zone 'America/Asuncion')::date;
begin
  select * into t from mnt_tareas where id = p_id;
  if t.id is null then raise exception 'La tarea no existe'; end if;
  if not (mnt_puede('planificar') or mnt_puede('operar')) then raise exception 'Sin permiso'; end if;
  if not mnt_puede('planificar') and t.cuadrilla_id is distinct from mnt_mi_cuadrilla() then raise exception 'Esta tarea es de otra cuadrilla'; end if;
  if t.cuadrilla_id is null then raise exception 'La tarea no tiene cuadrilla asignada'; end if;
  if t.estado <> 'pendiente' then raise exception 'La tarea ya no está pendiente'; end if;
  if exists (select 1 from mnt_tareas where cuadrilla_id = t.cuadrilla_id and estado = 'en_curso') then
    raise exception 'Termina primero la tarea que tienes en curso';
  end if;
  update mnt_tareas set estado = 'en_curso', iniciada_en = now(), fecha = v_hoy where id = p_id;
end $$;

create or replace function mnt_terminar_tarea(p_id uuid, p_inventario jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare t mnt_tareas; v_hoy date := (now() at time zone 'America/Asuncion')::date;
begin
  select * into t from mnt_tareas where id = p_id;
  if t.id is null then raise exception 'La tarea no existe'; end if;
  if not (mnt_puede('planificar') or mnt_puede('operar')) then raise exception 'Sin permiso'; end if;
  if not mnt_puede('planificar') and t.cuadrilla_id is distinct from mnt_mi_cuadrilla() then raise exception 'Esta tarea es de otra cuadrilla'; end if;
  if t.estado <> 'en_curso' then raise exception 'La tarea no está en curso'; end if;
  update mnt_tareas set estado = 'hecha', terminada_en = now(), fecha = v_hoy where id = p_id;
  if p_inventario is not null then
    update mnt_sucursales set inventario = p_inventario, inventario_relevado_en = now() where id = t.sucursal_id;
  end if;
end $$;

-- Marca que la sucursal ya fue visitada para relevar trabajos (lo hace quien puede planificar)
create or replace function mnt_relevar_sucursal(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not mnt_puede('planificar') then raise exception 'No tienes permiso para relevar sucursales'; end if;
  update mnt_sucursales set trabajos_relevados_en = now() where id = p_id;
end $$;
revoke all on function mnt_relevar_sucursal(uuid) from public, anon;
grant execute on function mnt_relevar_sucursal(uuid) to authenticated;

-- ---------- EMPLEADOS (crear, cambiar contraseña, eliminar) ----------
-- versión 4: el alta de empleado recibe también el departamento (para choferes y supervisores de OT)
drop function if exists mnt_crear_usuario(text, text, text, text, uuid);
create or replace function mnt_crear_usuario(p_email text, p_password text, p_nombre text, p_rol text, p_cuadrilla uuid default null, p_departamento uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_id uuid := gen_random_uuid(); v_email text := lower(trim(p_email));
begin
  if not mnt_puede('parametros') then raise exception 'Sin permiso'; end if;
  if v_email is null or v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then raise exception 'El correo no es válido'; end if;
  if p_password is null or length(p_password) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'Ya existe un usuario con ese correo'; end if;
  if not exists (select 1 from mnt_roles where clave = p_rol) then raise exception 'El rol no existe'; end if;
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
    '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now());
  insert into mnt_perfiles (id, email, nombre, rol, cuadrilla_id, departamento_id)
  values (v_id, v_email, coalesce(nullif(trim(p_nombre), ''), split_part(v_email, '@', 1)), p_rol, p_cuadrilla, p_departamento);
  return v_id;
end $$;

create or replace function mnt_cambiar_clave(p_id uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not mnt_puede('parametros') then raise exception 'Sin permiso'; end if;
  if p_password is null or length(p_password) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_id;
  if not found then raise exception 'El usuario no existe'; end if;
end $$;

create or replace function mnt_eliminar_usuario(p_id uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not mnt_puede('parametros') then raise exception 'Sin permiso'; end if;
  if p_id = auth.uid() then raise exception 'No puedes eliminar tu propio usuario'; end if;
  delete from auth.users where id = p_id;
end $$;

-- ---------- PERMISOS (RLS) ----------
alter table mnt_roles enable row level security;
alter table mnt_perfiles enable row level security;
alter table mnt_cuadrillas enable row level security;
alter table mnt_sucursales enable row level security;
alter table mnt_tipos_activo enable row level security;
alter table mnt_catalogo enable row level security;
alter table mnt_tareas enable row level security;
alter table mnt_fotos enable row level security;
alter table mnt_parametros enable row level security;

-- Lectura: cualquier usuario activo con perfil
do $$
declare t text;
begin
  foreach t in array array['mnt_roles','mnt_cuadrillas','mnt_sucursales','mnt_tipos_activo','mnt_catalogo','mnt_tareas','mnt_fotos','mnt_parametros'] loop
    execute format('drop policy if exists "mnt_leer" on %I', t);
    execute format('create policy "mnt_leer" on %I for select to authenticated using (mnt_rol() is not null)', t);
  end loop;
end $$;

drop policy if exists "mnt_leer" on mnt_perfiles;
create policy "mnt_leer" on mnt_perfiles for select to authenticated using (id = auth.uid() or mnt_rol() is not null);

-- Escritura de configuración: quien tenga el permiso "parametros"
do $$
declare t text;
begin
  foreach t in array array['mnt_cuadrillas','mnt_sucursales','mnt_tipos_activo','mnt_catalogo','mnt_parametros','mnt_perfiles'] loop
    execute format('drop policy if exists "mnt_admin_ins" on %I', t);
    execute format('drop policy if exists "mnt_admin_upd" on %I', t);
    execute format('drop policy if exists "mnt_admin_del" on %I', t);
    execute format('create policy "mnt_admin_ins" on %I for insert to authenticated with check (mnt_puede(''parametros''))', t);
    execute format('create policy "mnt_admin_upd" on %I for update to authenticated using (mnt_puede(''parametros'')) with check (mnt_puede(''parametros''))', t);
    execute format('create policy "mnt_admin_del" on %I for delete to authenticated using (mnt_puede(''parametros''))', t);
  end loop;
end $$;

-- Roles: se pueden crear y editar, salvo el de Administrador; los del sistema no se borran
drop policy if exists "mnt_roles_ins" on mnt_roles;
drop policy if exists "mnt_roles_upd" on mnt_roles;
drop policy if exists "mnt_roles_del" on mnt_roles;
create policy "mnt_roles_ins" on mnt_roles for insert to authenticated with check (mnt_puede('parametros') and not sistema and clave <> 'admin');
create policy "mnt_roles_upd" on mnt_roles for update to authenticated using (mnt_puede('parametros') and clave <> 'admin') with check (mnt_puede('parametros') and clave <> 'admin');
create policy "mnt_roles_del" on mnt_roles for delete to authenticated using (mnt_puede('parametros') and not sistema);

-- Tareas: programan quienes pueden planificar; el técnico usa mnt_iniciar_tarea / mnt_terminar_tarea
drop policy if exists "mnt_plan_ins" on mnt_tareas;
drop policy if exists "mnt_plan_upd" on mnt_tareas;
drop policy if exists "mnt_plan_del" on mnt_tareas;
create policy "mnt_plan_ins" on mnt_tareas for insert to authenticated with check (mnt_puede('planificar'));
create policy "mnt_plan_upd" on mnt_tareas for update to authenticated using (mnt_puede('planificar')) with check (mnt_puede('planificar'));
create policy "mnt_plan_del" on mnt_tareas for delete to authenticated using (mnt_puede('planificar'));

-- Fotos: las agregan quienes planifican u operan
drop policy if exists "mnt_fotos_ins" on mnt_fotos;
create policy "mnt_fotos_ins" on mnt_fotos for insert to authenticated with check (mnt_puede('planificar') or mnt_puede('operar'));

revoke all on function mnt_crear_usuario(text, text, text, text, uuid, uuid) from public, anon;
revoke all on function mnt_cambiar_clave(uuid, text) from public, anon;
revoke all on function mnt_eliminar_usuario(uuid) from public, anon;
grant execute on function mnt_rol() to authenticated;
grant execute on function mnt_puede(text) to authenticated;
grant execute on function mnt_mi_cuadrilla() to authenticated;
grant execute on function mnt_asegurar_perfil() to authenticated;
grant execute on function mnt_iniciar_tarea(uuid) to authenticated;
grant execute on function mnt_terminar_tarea(uuid, jsonb) to authenticated;
grant execute on function mnt_crear_usuario(text, text, text, text, uuid, uuid) to authenticated;
grant execute on function mnt_cambiar_clave(uuid, text) to authenticated;
grant execute on function mnt_eliminar_usuario(uuid) to authenticated;

-- Gastos: ven quienes registran gastos o ven el panel; escriben solo quienes tienen el permiso «gastos»
alter table mnt_gastos enable row level security;
drop policy if exists "mnt_gastos_sel" on mnt_gastos;
drop policy if exists "mnt_gastos_ins" on mnt_gastos;
drop policy if exists "mnt_gastos_upd" on mnt_gastos;
drop policy if exists "mnt_gastos_del" on mnt_gastos;
create policy "mnt_gastos_sel" on mnt_gastos for select to authenticated using (mnt_puede('gastos') or mnt_puede('panel'));
create policy "mnt_gastos_ins" on mnt_gastos for insert to authenticated with check (mnt_puede('gastos'));
create policy "mnt_gastos_upd" on mnt_gastos for update to authenticated using (mnt_puede('gastos')) with check (mnt_puede('gastos'));
create policy "mnt_gastos_del" on mnt_gastos for delete to authenticated using (mnt_puede('gastos'));

-- ---------- FOTOS (almacenamiento privado) ----------
insert into storage.buckets (id, name, public) values ('mnt-fotos', 'mnt-fotos', false)
on conflict (id) do nothing;

drop policy if exists "mnt_fotos_leer" on storage.objects;
drop policy if exists "mnt_fotos_subir" on storage.objects;
create policy "mnt_fotos_leer" on storage.objects for select to authenticated
  using (bucket_id = 'mnt-fotos' and mnt_rol() is not null);
create policy "mnt_fotos_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'mnt-fotos' and (mnt_puede('planificar') or mnt_puede('operar')));

-- ---------- TIEMPO REAL (el director ve los cambios sin recargar) ----------
do $$ begin alter publication supabase_realtime add table mnt_tareas; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table mnt_sucursales; exception when others then null; end $$;

-- ---------- DATOS INICIALES (solo si la tabla está vacía, así no reaparece lo que borres) ----------
insert into mnt_cuadrillas (nombre, integrantes, especialidades, color, orden)
select * from (values
  ('Oscar + Reinaldo', '{Oscar,Reinaldo}'::text[], '{Electricidad}'::text[], '#0F7B6C', 1),
  ('Pedro + Rubén',    '{Pedro,Rubén}'::text[],    '{Electricidad}'::text[], '#7344C9', 2),
  ('José',             '{José}'::text[],           '{TI}'::text[],           '#B52E7A', 3)
) v(nombre, integrantes, especialidades, color, orden)
where not exists (select 1 from mnt_cuadrillas);

insert into mnt_tipos_activo (clave, etiqueta, orden)
select * from (values
  ('heladeras','Heladeras',1),
  ('ventiladores','Ventiladores',2),
  ('tomas','Tomas eléctricas',3),
  ('tapas','Tapas ciegas por cubrir',4),
  ('luminarias','Luminarias',5),
  ('tableros','Tableros eléctricos',6)
) v(clave, etiqueta, orden)
where not exists (select 1 from mnt_tipos_activo);

insert into mnt_catalogo (nombre, especialidad, unidad_medida, minutos)
select * from (values
  ('Cubrir tapas ciegas','Electricidad','unidad',6),
  ('Ordenar cableado','Electricidad','sucursal',90),
  ('Instalar ventilador','Electricidad','unidad',40),
  ('Revisar tomas eléctricas','Electricidad','unidad',5),
  ('Revisar heladera','Electricidad','unidad',20),
  ('Relevar inventario','Electricidad','sucursal',45),
  ('Soporte de red y equipos','TI','visita',60),
  ('Reparar pérdida de agua','Plomería','visita',75),
  ('Reparar pared o revoque','Albañilería','visita',120),
  ('Otro trabajo (ver nota)','Electricidad','visita',60)
) v(nombre, especialidad, unidad_medida, minutos)
where not exists (select 1 from mnt_catalogo);

insert into mnt_parametros (clave, valor) values
  ('jornada_minutos', '480'::jsonb),
  ('unidades', '["Baratote Minorista","Baratote Mayorista","Fineglass","Fineboats"]'::jsonb)
on conflict (clave) do nothing;

-- =====================================================================
--  ÓRDENES DE TRABAJO (OT) DE LOS MÓVILES  ·  versión 4
--  El chofer genera o recibe la OT, el guardia valida salidas y entradas
--  en la garita con QR y el supervisor sigue a su gente en vivo.
--  Los empleados, roles y sucursales son los mismos de mantenimiento:
--  cualquier sucursal sirve de salida o destino de una OT.
--  Toda escritura de OT pasa por las funciones ot_*, que validan el ciclo:
--    pendiente ─aceptar→ autorizada ─salida (QR o GPS)→ en_ruta ─llegada (QR o GPS)→ finalizada
--    cualquier estado abierto ─cancelar (supervisor)→ cancelada
-- =====================================================================

-- ---------- TABLAS ----------
create table if not exists ot_departamentos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 2 and 120),
  archivado_en timestamptz,
  creado_en timestamptz not null default now()
);
create unique index if not exists ot_departamentos_nombre_uniq on ot_departamentos(lower(nombre)) where archivado_en is null;

-- choferes y supervisores de OT pertenecen a un departamento
alter table mnt_perfiles add column if not exists departamento_id uuid references ot_departamentos(id) on delete set null;

create table if not exists ot_ubicaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 2 and 120),
  tipo text not null default 'Ubicación',
  es_base boolean not null default false,           -- una base exige el QR del guardia para salir y para entrar
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  geocerco_m int not null default 200 check (geocerco_m between 20 and 5000),  -- radio en que se acepta la llegada por GPS
  activa boolean not null default true,
  adhoc boolean not null default false,             -- punto marcado en el mapa para una sola OT (no aparece en las listas)
  sucursal_id uuid unique references mnt_sucursales(id) on delete set null,  -- copia automática de una sucursal
  creada_en timestamptz not null default now()
);
create unique index if not exists ot_ubicaciones_nombre_uniq on ot_ubicaciones(lower(nombre)) where activa and not adhoc and sucursal_id is null;

create table if not exists ot_moviles (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (length(trim(codigo)) between 2 and 40),   -- MOV-01
  descripcion text not null default '',                                   -- Iveco Daily · ABC 123
  departamento_id uuid not null references ot_departamentos(id) on delete restrict,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index if not exists ot_moviles_codigo_uniq on ot_moviles(lower(codigo)) where activo;
create index if not exists ot_moviles_depto_idx on ot_moviles(departamento_id);

create sequence if not exists ot_codigo_seq start 1001;

create table if not exists ot_ordenes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('OT-' || nextval('ot_codigo_seq')),
  chofer_id uuid not null references mnt_perfiles(id) on delete restrict,
  departamento_id uuid not null references ot_departamentos(id) on delete restrict,
  movil_id uuid not null references ot_moviles(id) on delete restrict,
  origen_id uuid not null references ot_ubicaciones(id) on delete restrict,
  destino_id uuid not null references ot_ubicaciones(id) on delete restrict,
  motivo text not null,
  descripcion text not null default '',
  estado text not null default 'pendiente' check (estado in ('pendiente','autorizada','en_ruta','finalizada','cancelada')),
  -- se congelan al crear: el origen es base → salida por QR; el destino es base → cierre del día por QR
  sale_de_base boolean not null default false,
  cierra_dia boolean not null default false,
  fecha date not null,
  programada_en timestamptz,
  eta_min int not null default 30 check (eta_min between 5 and 600),
  asignada_por uuid references mnt_perfiles(id) on delete set null,
  cancelada_por uuid references mnt_perfiles(id) on delete set null,
  motivo_cancelacion text,
  salida_en timestamptz,
  llegada_en timestamptz,
  cerrada_en timestamptz,
  salida_lat double precision,
  salida_lng double precision,
  llegada_lat double precision,
  llegada_lng double precision,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);
create index if not exists ot_ordenes_chofer_idx on ot_ordenes(chofer_id);
create index if not exists ot_ordenes_depto_idx on ot_ordenes(departamento_id);
create index if not exists ot_ordenes_estado_idx on ot_ordenes(estado);
create index if not exists ot_ordenes_fecha_idx on ot_ordenes(fecha);
create index if not exists ot_ordenes_movil_abierta_idx on ot_ordenes(movil_id) where estado in ('pendiente','autorizada','en_ruta');

-- Trazabilidad (no se borra nunca)
create table if not exists ot_eventos (
  id bigserial primary key,
  orden_id uuid not null references ot_ordenes(id) on delete cascade,
  evento text not null,                    -- creada | autorizada | salida | llegada | cierre | cancelada
  actor_id uuid references mnt_perfiles(id) on delete set null,
  medio text not null default 'app',       -- app | qr | manual | gps
  lat double precision,
  lng double precision,
  nota text,
  creado_en timestamptz not null default now()
);
create index if not exists ot_eventos_orden_idx on ot_eventos(orden_id, creado_en);
create index if not exists ot_eventos_fecha_idx on ot_eventos(creado_en desc);

create table if not exists ot_auditoria (
  id bigserial primary key,
  actor_id uuid references mnt_perfiles(id) on delete set null,
  accion text not null,                    -- ot.crear, ot.cancelar, movil.update…
  entidad text,
  entidad_id text,
  meta jsonb not null default '{}',
  creado_en timestamptz not null default now()
);
create index if not exists ot_auditoria_fecha_idx on ot_auditoria(creado_en desc);

-- ---------- FUNCIONES DE ALCANCE ----------
create or replace function ot_mi_depto() returns uuid
language sql stable security definer set search_path = public as $$
  select departamento_id from mnt_perfiles where id = auth.uid() and activo
$$;

-- ¿Supervisa este departamento? El administrador y el supervisor de OT sin departamento supervisan todos.
create or replace function ot_supervisa(p_depto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select mnt_puede('parametros') or (mnt_puede('ot_supervisar') and (ot_mi_depto() is null or ot_mi_depto() = p_depto))
$$;

-- Quién ve una OT: su chofer, el guardia (valida cualquier QR) y quien supervisa el departamento
create or replace function ot_puede_ver(p_chofer uuid, p_depto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_chofer = auth.uid() and mnt_rol() is not null) or mnt_puede('ot_guardia') or ot_supervisa(p_depto)
$$;

create or replace function ot_es_chofer(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select r.p_ot_chofer from mnt_perfiles pf join mnt_roles r on r.clave = pf.rol where pf.id = p_id and pf.activo), false)
$$;

create or replace function ot_yo() returns mnt_perfiles
language plpgsql stable security definer set search_path = public as $$
declare me mnt_perfiles;
begin
  select * into me from mnt_perfiles where id = auth.uid() and activo;
  if not found then raise exception 'Tu usuario no está habilitado. Pídele al administrador que lo active.' using errcode = '42501'; end if;
  return me;
end $$;

create or replace function ot_log(p_accion text, p_entidad text, p_id text, p_meta jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into ot_auditoria (actor_id, accion, entidad, entidad_id, meta)
  values (auth.uid(), p_accion, p_entidad, p_id, coalesce(p_meta, '{}'))
$$;

create or replace function ot_distancia_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns int language sql immutable as $$
  select round(2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))::int
$$;

-- La ubicación de OT que corresponde a una sucursal (la crea o la pone al día)
create or replace function ot_ubicacion_de_sucursal(p_suc uuid) returns ot_ubicaciones
language plpgsql security definer set search_path = public as $$
declare s mnt_sucursales; u ot_ubicaciones;
begin
  select * into s from mnt_sucursales where id = p_suc and activa;
  if not found then raise exception 'La sucursal no existe o está inactiva'; end if;
  insert into ot_ubicaciones (nombre, tipo, es_base, lat, lng, sucursal_id)
  values (s.nombre, 'Sucursal · ' || s.unidad_negocio, false, s.lat, s.lng, s.id)
  on conflict (sucursal_id) do update
    set nombre = excluded.nombre, tipo = excluded.tipo, lat = excluded.lat, lng = excluded.lng, activa = true, adhoc = false
  returning * into u;
  return u;
end $$;

-- ---------- GUARDAS E INTEGRIDAD ----------
create or replace function ot_tocar() returns trigger language plpgsql as $$
begin new.actualizada_en = now(); return new; end $$;
drop trigger if exists ot_ordenes_tocar on ot_ordenes;
create trigger ot_ordenes_tocar before update on ot_ordenes for each row execute function ot_tocar();

create or replace function ot_moviles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (not new.activo or new.departamento_id <> old.departamento_id)
     and exists (select 1 from ot_ordenes where movil_id = old.id and estado in ('pendiente','autorizada','en_ruta')) then
    raise exception 'El móvil % tiene una OT abierta: un supervisor debe cerrarla o cancelarla primero', old.codigo;
  end if;
  return new;
end $$;
drop trigger if exists ot_moviles_guard on ot_moviles;
create trigger ot_moviles_guard before update on ot_moviles for each row execute function ot_moviles_guard();

create or replace function ot_departamentos_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.archivado_en is not null and old.archivado_en is null then
    if exists (select 1 from mnt_perfiles where departamento_id = old.id and activo)
       or exists (select 1 from ot_moviles where departamento_id = old.id and activo) then
      raise exception 'El departamento tiene empleados o móviles activos: reasígnalos antes de eliminarlo';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ot_departamentos_guard on ot_departamentos;
create trigger ot_departamentos_guard before update on ot_departamentos for each row execute function ot_departamentos_guard();

-- Un chofer con OT abiertas no se desactiva ni cambia de departamento
create or replace function ot_perfiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (not new.activo or new.departamento_id is distinct from old.departamento_id)
     and exists (select 1 from ot_ordenes where chofer_id = old.id and estado in ('pendiente','autorizada','en_ruta')) then
    raise exception '% tiene OT abiertas como chofer: ciérralas o cancélalas primero', coalesce(nullif(old.nombre, ''), old.email);
  end if;
  return new;
end $$;
drop trigger if exists ot_perfiles_guard on mnt_perfiles;
create trigger ot_perfiles_guard before update on mnt_perfiles for each row execute function ot_perfiles_guard();

-- La copia de cada sucursal sigue los cambios de nombre, coordenadas y estado
create or replace function ot_sucursal_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- queda como punto histórico de las OT que ya fueron allí
    update ot_ubicaciones set activa = false, adhoc = true where sucursal_id = old.id;
    return old;
  end if;
  update ot_ubicaciones
     set nombre = new.nombre, tipo = 'Sucursal · ' || new.unidad_negocio, lat = new.lat, lng = new.lng, activa = new.activa
   where sucursal_id = new.id;
  return new;
end $$;
drop trigger if exists ot_sucursal_upd on mnt_sucursales;
create trigger ot_sucursal_upd after update on mnt_sucursales for each row execute function ot_sucursal_sync();
drop trigger if exists ot_sucursal_del on mnt_sucursales;
create trigger ot_sucursal_del before delete on mnt_sucursales for each row execute function ot_sucursal_sync();

-- Auditoría de cambios de configuración
create or replace function ot_auditar_cambio() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_entidad text := tg_argv[0]; v_fila jsonb := to_jsonb(coalesce(new, old));
begin
  -- los puntos de una sola OT y las copias de sucursales no son configuración
  if coalesce((v_fila ->> 'adhoc')::boolean, false) or (v_fila ->> 'sucursal_id') is not null then return coalesce(new, old); end if;
  insert into ot_auditoria (actor_id, accion, entidad, entidad_id, meta)
  values (auth.uid(), v_entidad || '.' || lower(tg_op), v_entidad, v_fila ->> 'id',
          case when tg_op = 'UPDATE' then jsonb_build_object('antes', to_jsonb(old), 'despues', to_jsonb(new))
               else jsonb_build_object('fila', v_fila) end);
  return coalesce(new, old);
end $$;
drop trigger if exists ot_departamentos_audit on ot_departamentos;
create trigger ot_departamentos_audit after insert or update or delete on ot_departamentos for each row execute function ot_auditar_cambio('departamento');
drop trigger if exists ot_ubicaciones_audit on ot_ubicaciones;
create trigger ot_ubicaciones_audit after insert or update or delete on ot_ubicaciones for each row execute function ot_auditar_cambio('ubicacion');
drop trigger if exists ot_moviles_audit on ot_moviles;
create trigger ot_moviles_audit after insert or update or delete on ot_moviles for each row execute function ot_auditar_cambio('movil');
drop trigger if exists ot_perfiles_audit on mnt_perfiles;
create trigger ot_perfiles_audit after insert or update or delete on mnt_perfiles for each row execute function ot_auditar_cambio('empleado');
drop trigger if exists ot_roles_audit on mnt_roles;
create trigger ot_roles_audit after insert or update or delete on mnt_roles for each row execute function ot_auditar_cambio('rol');

-- ---------- VISTAS DE LECTURA ----------
-- Corren con los permisos del dueño (para mostrar nombres) y filtran por alcance.
drop view if exists ot_vista;
create view ot_vista as
select o.id, o.codigo, o.estado, o.motivo, o.descripcion, o.sale_de_base, o.cierra_dia, o.fecha, o.programada_en, o.eta_min,
       o.salida_en, o.llegada_en, o.cerrada_en, o.salida_lat, o.salida_lng, o.llegada_lat, o.llegada_lng,
       o.motivo_cancelacion, o.creada_en, o.actualizada_en,
       o.chofer_id, ch.nombre as chofer_nombre,
       o.departamento_id, d.nombre as departamento_nombre,
       o.movil_id, m.codigo as movil_codigo, m.descripcion as movil_descripcion,
       o.origen_id, uo.nombre as origen_nombre, uo.tipo as origen_tipo, uo.es_base as origen_es_base,
       uo.lat as origen_lat, uo.lng as origen_lng,
       o.destino_id, ud.nombre as destino_nombre, ud.tipo as destino_tipo, ud.es_base as destino_es_base,
       ud.lat as destino_lat, ud.lng as destino_lng, ud.geocerco_m as destino_geocerco_m, ud.sucursal_id as destino_sucursal_id,
       o.asignada_por, ap.nombre as asignada_por_nombre,
       o.cancelada_por, cp.nombre as cancelada_por_nombre,
       case
         when o.estado = 'en_ruta' then extract(epoch from (now() - o.salida_en)) / 60 > o.eta_min
         when o.llegada_en is not null and o.salida_en is not null then extract(epoch from (o.llegada_en - o.salida_en)) / 60 > o.eta_min
         else false
       end as demorada
from ot_ordenes o
join mnt_perfiles ch on ch.id = o.chofer_id
join ot_departamentos d on d.id = o.departamento_id
join ot_moviles m on m.id = o.movil_id
join ot_ubicaciones uo on uo.id = o.origen_id
join ot_ubicaciones ud on ud.id = o.destino_id
left join mnt_perfiles ap on ap.id = o.asignada_por
left join mnt_perfiles cp on cp.id = o.cancelada_por
where ot_puede_ver(o.chofer_id, o.departamento_id);
grant select on ot_vista to authenticated;
revoke select on ot_vista from anon;

drop view if exists ot_eventos_vista;
create view ot_eventos_vista as
select e.id, e.orden_id, e.evento, e.medio, e.lat, e.lng, e.nota, e.creado_en,
       e.actor_id, p.nombre as actor_nombre, o.codigo as orden_codigo, o.chofer_id
from ot_eventos e
join ot_ordenes o on o.id = e.orden_id
left join mnt_perfiles p on p.id = e.actor_id
where ot_puede_ver(o.chofer_id, o.departamento_id);
grant select on ot_eventos_vista to authenticated;
revoke select on ot_eventos_vista from anon;

-- ---------- REGLAS DE LA OT ----------
-- Disponibilidad de móviles: uno con OT abierta está bloqueado, salvo que esa OT
-- sea del MISMO chofer en la MISMA fecha (así encadena 2 o 3 tareas en el día).
create or replace function ot_disponibilidad(p_chofer uuid default null, p_fecha date default null)
returns table (
  id uuid, codigo text, descripcion text, departamento_id uuid, departamento_nombre text,
  estado text, elegible boolean, reservado_chofer boolean,
  ot_codigo text, ot_estado text, ot_chofer text
)
language sql stable security definer set search_path = public as $$
  select v.id, v.codigo, v.descripcion, v.departamento_id, d.nombre,
         case when o.id is null then 'disponible' else 'en_uso' end,
         (o.id is null or (o.chofer_id = p_chofer and o.fecha = coalesce(p_fecha, (now() at time zone 'America/Asuncion')::date))),
         (o.id is not null and o.chofer_id = p_chofer and o.fecha = coalesce(p_fecha, (now() at time zone 'America/Asuncion')::date)),
         o.codigo, o.estado, u.nombre
  from ot_moviles v
  join ot_departamentos d on d.id = v.departamento_id
  left join lateral (
    select * from ot_ordenes w
    where w.movil_id = v.id and w.estado in ('pendiente','autorizada','en_ruta')
    order by w.creada_en desc limit 1
  ) o on true
  left join mnt_perfiles u on u.id = o.chofer_id
  where v.activo and mnt_rol() is not null
  order by v.codigo
$$;

-- Crear OT. Sin p_chofer: el chofer la crea para sí y queda «autorizada».
-- Con p_chofer (quien supervisa): queda «pendiente» en la bandeja del chofer.
-- Salida y destino: una ubicación (p_origen / p_destino), una sucursal (p_origen_suc / p_destino_suc)
-- o, solo el destino, un punto del mapa (p_dest_lat, p_dest_lng).
create or replace function ot_crear(
  p_movil uuid,
  p_motivo text,
  p_fecha date,
  p_origen uuid default null,
  p_origen_suc uuid default null,
  p_destino uuid default null,
  p_destino_suc uuid default null,
  p_dest_lat double precision default null,
  p_dest_lng double precision default null,
  p_dest_nombre text default null,
  p_descripcion text default '',
  p_eta int default 30,
  p_chofer uuid default null,
  p_programada timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me mnt_perfiles := ot_yo();
  v_asigna boolean := p_chofer is not null and p_chofer <> me.id;
  v_hoy date := (now() at time zone 'America/Asuncion')::date;
  v_chofer mnt_perfiles;
  v_origen ot_ubicaciones;
  v_dest ot_ubicaciones;
  v_movil ot_moviles;
  v_bloquea ot_ordenes;
  v_orden ot_ordenes;
begin
  if not v_asigna and not mnt_puede('ot_chofer') then
    raise exception 'Indica el chofer responsable de la orden';
  end if;

  select * into v_chofer from mnt_perfiles where id = coalesce(p_chofer, me.id);
  if not found or not v_chofer.activo then raise exception 'El chofer no existe o está inactivo'; end if;
  if not ot_es_chofer(v_chofer.id) then raise exception '% no tiene un rol de chofer', v_chofer.nombre; end if;
  if v_chofer.departamento_id is null then
    raise exception '% no tiene departamento. El administrador lo asigna en Parámetros > Empleados.', v_chofer.nombre;
  end if;
  if v_asigna and not ot_supervisa(v_chofer.departamento_id) then
    raise exception 'Solo quien supervisa el departamento del chofer puede asignarle órdenes' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Indica el motivo de la OT'; end if;
  if p_fecha is null or p_fecha < v_hoy - 1 then raise exception 'La fecha de trabajo no puede estar en el pasado'; end if;

  if p_origen_suc is not null then
    v_origen := ot_ubicacion_de_sucursal(p_origen_suc);
  else
    select * into v_origen from ot_ubicaciones where id = p_origen and activa and not adhoc;
    if not found then raise exception 'La ubicación de salida no existe'; end if;
  end if;

  if p_destino_suc is not null then
    v_dest := ot_ubicacion_de_sucursal(p_destino_suc);
  elsif p_destino is not null then
    select * into v_dest from ot_ubicaciones where id = p_destino and activa and not adhoc;
    if not found then raise exception 'La ubicación de destino no existe'; end if;
  elsif p_dest_lat is not null and p_dest_lng is not null then
    insert into ot_ubicaciones (nombre, tipo, es_base, lat, lng, adhoc)
    values (coalesce(nullif(trim(p_dest_nombre), ''), 'Punto GPS'), 'Punto GPS', false, p_dest_lat, p_dest_lng, true)
    returning * into v_dest;
  else
    raise exception 'Indica el destino';
  end if;
  if v_dest.id = v_origen.id then raise exception 'El destino debe ser distinto de la salida'; end if;

  -- reserva del móvil (bloqueo para que dos OT simultáneas no tomen el mismo)
  select * into v_movil from ot_moviles where id = p_movil for update;
  if not found or not v_movil.activo then raise exception 'El móvil no existe o está inactivo'; end if;
  if v_movil.departamento_id <> v_chofer.departamento_id then
    raise exception 'El móvil % pertenece a otro departamento', v_movil.codigo;
  end if;
  select * into v_bloquea from ot_ordenes
  where movil_id = v_movil.id and estado in ('pendiente','autorizada','en_ruta')
    and not (chofer_id = v_chofer.id and fecha = p_fecha)
  limit 1;
  if found then
    raise exception 'El móvil % está ocupado por la OT %. Un supervisor debe cancelarla o cerrarla para liberarlo.', v_movil.codigo, v_bloquea.codigo;
  end if;

  insert into ot_ordenes (
    chofer_id, departamento_id, movil_id, origen_id, destino_id, motivo, descripcion,
    estado, sale_de_base, cierra_dia, fecha, programada_en, eta_min, asignada_por
  ) values (
    v_chofer.id, v_chofer.departamento_id, v_movil.id, v_origen.id, v_dest.id,
    trim(p_motivo), coalesce(p_descripcion, ''),
    case when v_asigna then 'pendiente' else 'autorizada' end,
    v_origen.es_base, v_dest.es_base, p_fecha, p_programada,
    coalesce(p_eta, 30), case when v_asigna then me.id end
  ) returning * into v_orden;

  if v_dest.adhoc and nullif(trim(p_dest_nombre), '') is null then
    update ot_ubicaciones set nombre = 'Punto GPS · ' || v_orden.codigo where id = v_dest.id;
  end if;

  insert into ot_eventos (orden_id, evento, actor_id, nota)
  values (v_orden.id, 'creada', me.id, case when v_asigna then 'Asignada por ' || me.nombre else 'Generada por el chofer' end);
  if not v_asigna then
    insert into ot_eventos (orden_id, evento, actor_id) values (v_orden.id, 'autorizada', me.id);
  end if;

  perform ot_log('ot.crear', 'orden', v_orden.id::text,
    jsonb_build_object('codigo', v_orden.codigo, 'asignada', v_asigna, 'chofer_id', v_chofer.id,
                       'movil_id', v_movil.id, 'cierra_dia', v_dest.es_base));

  return jsonb_build_object('id', v_orden.id, 'codigo', v_orden.codigo, 'estado', v_orden.estado,
                            'sale_de_base', v_orden.sale_de_base, 'cierra_dia', v_orden.cierra_dia);
end $$;

-- Transiciones del chofer y del supervisor
--   aceptar  : pendiente → autorizada (chofer)
--   salir    : autorizada → en_ruta, solo si la salida NO es base (GPS)
--   llegar   : en_ruta → finalizada, solo si el destino NO es base (GPS dentro del geocerco)
--   cancelar : abierta → cancelada (quien supervisa el departamento), libera el móvil
-- Las que pasan por la garita (salida o destino en base) van por ot_garita_registrar.
create or replace function ot_transicion(
  p_orden uuid,
  p_accion text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_motivo text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me mnt_perfiles := ot_yo();
  o ot_ordenes;
  v_dest ot_ubicaciones;
  v_origen ot_ubicaciones;
  v_dist int;
  v_nota text;
begin
  select * into o from ot_ordenes where id = p_orden for update;
  if not found or not ot_puede_ver(o.chofer_id, o.departamento_id) then raise exception 'Orden de trabajo no encontrada'; end if;
  select * into v_origen from ot_ubicaciones where id = o.origen_id;
  select * into v_dest from ot_ubicaciones where id = o.destino_id;

  if p_accion = 'cancelar' then
    if not ot_supervisa(o.departamento_id) then raise exception 'Solo un supervisor puede cancelar la OT' using errcode = '42501'; end if;
    if o.estado in ('finalizada','cancelada') then raise exception 'La OT % ya está %', o.codigo, o.estado; end if;
    if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Indica el motivo de la cancelación'; end if;
    update ot_ordenes set estado = 'cancelada', cancelada_por = me.id, motivo_cancelacion = trim(p_motivo) where id = o.id;
    insert into ot_eventos (orden_id, evento, actor_id, nota) values (o.id, 'cancelada', me.id, trim(p_motivo));
    perform ot_log('ot.cancelar', 'orden', o.id::text, jsonb_build_object('codigo', o.codigo, 'motivo', p_motivo, 'anterior', o.estado));
    return jsonb_build_object('id', o.id, 'codigo', o.codigo, 'estado', 'cancelada');
  end if;

  if o.chofer_id <> me.id and not mnt_puede('parametros') then
    raise exception 'Esa orden no es tuya' using errcode = '42501';
  end if;

  if p_accion = 'aceptar' then
    if o.estado <> 'pendiente' then raise exception 'La OT % no está pendiente', o.codigo; end if;
    update ot_ordenes set estado = 'autorizada' where id = o.id;
    insert into ot_eventos (orden_id, evento, actor_id, nota) values (o.id, 'autorizada', me.id, 'Aceptada por el chofer');

  elsif p_accion = 'salir' then
    if o.sale_de_base then
      raise exception 'La salida es desde una base (%): la registra el guardia escaneando el QR', v_origen.nombre;
    end if;
    if o.estado <> 'autorizada' then raise exception 'La OT % no está autorizada para salir', o.codigo; end if;
    update ot_ordenes set estado = 'en_ruta', salida_en = now(), salida_lat = p_lat, salida_lng = p_lng where id = o.id;
    insert into ot_eventos (orden_id, evento, actor_id, medio, lat, lng, nota)
    values (o.id, 'salida', me.id, 'gps', p_lat, p_lng, 'Inicio fuera de base desde ' || v_origen.nombre);

  elsif p_accion = 'llegar' then
    if o.cierra_dia then
      raise exception 'El destino es una base (%): la OT cierra con el QR de entrada en la garita', v_dest.nombre;
    end if;
    if o.estado <> 'en_ruta' then raise exception 'La OT % no está en ruta', o.codigo; end if;
    if p_lat is null or p_lng is null then raise exception 'Se necesita la posición GPS para marcar la llegada'; end if;
    if v_dest.lat is not null and v_dest.lng is not null then
      v_dist := ot_distancia_m(v_dest.lat, v_dest.lng, p_lat, p_lng);
      if v_dist > v_dest.geocerco_m then
        raise exception 'Estás a % m del destino (máximo permitido % m)', v_dist, v_dest.geocerco_m;
      end if;
      v_nota := 'A ' || v_dist || ' m del punto configurado';
    else
      v_nota := 'Destino sin coordenadas configuradas';
    end if;
    update ot_ordenes set estado = 'finalizada', llegada_en = now(), cerrada_en = now(), llegada_lat = p_lat, llegada_lng = p_lng where id = o.id;
    insert into ot_eventos (orden_id, evento, actor_id, medio, lat, lng, nota)
    values (o.id, 'llegada', me.id, 'gps', p_lat, p_lng, v_nota),
           (o.id, 'cierre', me.id, 'gps', p_lat, p_lng, 'Tarea cerrada en destino (no es OT de cierre del día)');

  else
    raise exception 'Acción no reconocida: %', p_accion;
  end if;

  perform ot_log('ot.' || p_accion, 'orden', o.id::text, jsonb_build_object('codigo', o.codigo, 'desde', o.estado, 'lat', p_lat, 'lng', p_lng));
  select * into o from ot_ordenes where id = o.id;
  return jsonb_build_object('id', o.id, 'codigo', o.codigo, 'estado', o.estado);
end $$;

-- Garita: vista previa del QR (qué movimiento corresponde, o por qué ninguno)
create or replace function ot_garita_ver(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me mnt_perfiles := ot_yo();
  o ot_ordenes;
  v_esperado text;
  v_bloqueo text;
begin
  if not (mnt_puede('ot_guardia') or mnt_puede('parametros')) then raise exception 'Solo el guardia registra movimientos' using errcode = '42501'; end if;
  select * into o from ot_ordenes where upper(codigo) = upper(trim(p_codigo));
  if not found then raise exception 'No existe la OT %', upper(trim(p_codigo)); end if;
  if o.estado = 'autorizada' and o.sale_de_base then v_esperado := 'salida';
  elsif o.estado = 'en_ruta' and o.cierra_dia then v_esperado := 'entrada';
  elsif o.estado = 'pendiente' then v_bloqueo := 'La OT está pendiente de aceptación por el chofer';
  elsif o.estado = 'autorizada' then v_bloqueo := 'Esta OT no sale de una base: el chofer la inicia por GPS';
  elsif o.estado = 'en_ruta' then v_bloqueo := 'El móvil está en ruta y esta OT no cierra en base';
  elsif o.estado = 'finalizada' then v_bloqueo := 'La OT ya fue cerrada';
  elsif o.estado = 'cancelada' then v_bloqueo := 'La OT fue cancelada';
  end if;
  return jsonb_build_object('id', o.id, 'codigo', o.codigo, 'esperado', v_esperado, 'bloqueo', v_bloqueo);
end $$;

create or replace function ot_garita_registrar(p_codigo text, p_movimiento text, p_manual boolean default false, p_nota text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me mnt_perfiles := ot_yo();
  o ot_ordenes;
  v_origen ot_ubicaciones;
  v_dest ot_ubicaciones;
  v_movil ot_moviles;
  v_medio text := case when p_manual then 'manual' else 'qr' end;
  v_sufijo text := case when p_manual then ' (registro manual)' else '' end
                   || case when nullif(trim(p_nota), '') is not null then ' · ' || trim(p_nota) else '' end;
  v_mensaje text;
begin
  if not (mnt_puede('ot_guardia') or mnt_puede('parametros')) then raise exception 'Solo el guardia registra movimientos' using errcode = '42501'; end if;
  select * into o from ot_ordenes where upper(codigo) = upper(trim(p_codigo)) for update;
  if not found then raise exception 'No existe la OT %', upper(trim(p_codigo)); end if;
  select * into v_origen from ot_ubicaciones where id = o.origen_id;
  select * into v_dest from ot_ubicaciones where id = o.destino_id;
  select * into v_movil from ot_moviles where id = o.movil_id;

  if p_movimiento = 'salida' then
    if not o.sale_de_base then raise exception 'La OT % no sale de una base (%): el chofer la inicia por GPS', o.codigo, v_origen.nombre; end if;
    if o.estado = 'pendiente' then raise exception 'La OT % está pendiente de aceptación por el chofer', o.codigo; end if;
    if o.estado <> 'autorizada' then raise exception 'La OT % está «%»: no corresponde registrar la salida', o.codigo, o.estado; end if;
    update ot_ordenes set estado = 'en_ruta', salida_en = now() where id = o.id;
    insert into ot_eventos (orden_id, evento, actor_id, medio, nota)
    values (o.id, 'salida', me.id, v_medio, 'Salida de ' || v_origen.nombre || ' validada en garita' || v_sufijo);
    v_mensaje := 'Salida registrada. ' || v_movil.codigo || ' habilitado a ' || v_dest.nombre || '.';
  elsif p_movimiento = 'entrada' then
    if not o.cierra_dia then raise exception 'La OT % no cierra en una base: su destino es %', o.codigo, v_dest.nombre; end if;
    if o.estado <> 'en_ruta' then raise exception 'La OT % está «%»: no corresponde registrar la entrada', o.codigo, o.estado; end if;
    update ot_ordenes set estado = 'finalizada', llegada_en = now(), cerrada_en = now() where id = o.id;
    insert into ot_eventos (orden_id, evento, actor_id, medio, nota)
    values (o.id, 'cierre', me.id, v_medio, 'Entrada a ' || v_dest.nombre || ' validada en garita' || v_sufijo);
    v_mensaje := 'Entrada registrada. OT ' || o.codigo || ' cerrada y ' || v_movil.codigo || ' liberado.';
  else
    raise exception 'Movimiento inválido: %', p_movimiento;
  end if;

  perform ot_log(case when p_manual then 'ot.movimiento_manual' else 'ot.garita_' || p_movimiento end,
    'orden', o.id::text, jsonb_build_object('codigo', o.codigo, 'movimiento', p_movimiento, 'manual', p_manual));
  return jsonb_build_object('id', o.id, 'codigo', o.codigo, 'mensaje', v_mensaje);
end $$;

-- Bitácora de la garita: movimientos por QR o a mano en el rango
create or replace function ot_bitacora(p_desde timestamptz, p_hasta timestamptz) returns table (
  creado_en timestamptz, evento text, medio text, nota text, orden_codigo text,
  chofer_nombre text, movil_codigo text, actor_nombre text
)
language sql stable security definer set search_path = public as $$
  select e.creado_en, e.evento, e.medio, e.nota, o.codigo, u.nombre, v.codigo, a.nombre
  from ot_eventos e
  join ot_ordenes o on o.id = e.orden_id
  join mnt_perfiles u on u.id = o.chofer_id
  join ot_moviles v on v.id = o.movil_id
  left join mnt_perfiles a on a.id = e.actor_id
  where e.medio in ('qr','manual')
    and e.creado_en >= p_desde and e.creado_en < p_hasta
    and (mnt_puede('ot_guardia') or mnt_puede('parametros'))
  order by e.creado_en desc
$$;

-- Reportes
create or replace function ot_reporte(p_desde date, p_hasta date, p_depto uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me mnt_perfiles := ot_yo();
  v_depto uuid := p_depto;
  v_tot jsonb;
begin
  if not (mnt_puede('ot_supervisar') or mnt_puede('parametros')) then raise exception 'Sin acceso a los reportes de OT' using errcode = '42501'; end if;
  if not mnt_puede('parametros') and me.departamento_id is not null then v_depto := me.departamento_id; end if;

  select to_jsonb(t) into v_tot from (
    select count(*)::int as total,
           count(*) filter (where estado = 'finalizada')::int as finalizadas,
           count(*) filter (where estado = 'cancelada')::int as canceladas,
           count(*) filter (where estado not in ('finalizada','cancelada'))::int as abiertas,
           count(*) filter (where cierra_dia)::int as cierres_dia,
           count(*) filter (where salida_en is not null and llegada_en is not null
                              and extract(epoch from (llegada_en - salida_en)) / 60 > eta_min)::int as con_demora,
           round(avg(extract(epoch from (llegada_en - salida_en)) / 60)
                 filter (where salida_en is not null and llegada_en is not null))::int as min_prom_viaje
    from ot_ordenes
    where fecha between p_desde and p_hasta and (v_depto is null or departamento_id = v_depto)
  ) t;

  return jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta),
    'departamento_id', v_depto,
    'kpis', v_tot || jsonb_build_object(
      'cumplimiento_pct', case when (v_tot->>'total')::int > 0
        then round((v_tot->>'finalizadas')::numeric * 100 / (v_tot->>'total')::int) else 0 end,
      'puntualidad_pct', case when (v_tot->>'finalizadas')::int > 0
        then round(((v_tot->>'finalizadas')::int - (v_tot->>'con_demora')::int)::numeric * 100 / (v_tot->>'finalizadas')::int) else 0 end),
    'por_chofer', coalesce((
      select jsonb_agg(r order by r.total desc, r.chofer) from (
        select u.nombre as chofer, d.nombre as departamento,
               count(*)::int as total,
               count(*) filter (where o.estado = 'finalizada')::int as finalizadas,
               count(*) filter (where o.estado not in ('finalizada','cancelada'))::int as en_curso,
               count(*) filter (where o.estado = 'cancelada')::int as canceladas,
               count(*) filter (where o.salida_en is not null and o.llegada_en is not null
                 and extract(epoch from (o.llegada_en - o.salida_en)) / 60 > o.eta_min)::int as demoras,
               round(avg(extract(epoch from (o.llegada_en - o.salida_en)) / 60)
                 filter (where o.salida_en is not null and o.llegada_en is not null))::int as min_prom,
               count(distinct o.movil_id)::int as moviles
        from ot_ordenes o
        join mnt_perfiles u on u.id = o.chofer_id
        join ot_departamentos d on d.id = o.departamento_id
        where o.fecha between p_desde and p_hasta and (v_depto is null or o.departamento_id = v_depto)
        group by u.nombre, d.nombre
      ) r), '[]'),
    'por_estado', coalesce((
      select jsonb_object_agg(estado, n) from (
        select estado, count(*)::int as n from ot_ordenes
        where fecha between p_desde and p_hasta and (v_depto is null or departamento_id = v_depto)
        group by estado
      ) s), '{}'),
    'por_movil', coalesce((
      select jsonb_agg(r order by r.viajes desc) from (
        select v.codigo as movil, v.descripcion, d.nombre as departamento,
               count(*)::int as viajes, count(distinct o.chofer_id)::int as choferes,
               round(sum(extract(epoch from (coalesce(o.cerrada_en, now()) - o.salida_en)) / 60)
                 filter (where o.salida_en is not null))::int as minutos_en_ruta
        from ot_ordenes o
        join ot_moviles v on v.id = o.movil_id
        join ot_departamentos d on d.id = v.departamento_id
        where o.fecha between p_desde and p_hasta and (v_depto is null or o.departamento_id = v_depto)
        group by v.codigo, v.descripcion, d.nombre
      ) r), '[]'),
    'por_destino', coalesce((
      select jsonb_agg(r order by r.visitas desc) from (
        select l.nombre as destino, l.es_base, count(*)::int as visitas
        from ot_ordenes o join ot_ubicaciones l on l.id = o.destino_id
        where o.fecha between p_desde and p_hasta and (v_depto is null or o.departamento_id = v_depto)
        group by l.nombre, l.es_base
      ) r), '[]')
  );
end $$;

-- ---------- PERMISOS (RLS) DE OT ----------
alter table ot_departamentos enable row level security;
alter table ot_ubicaciones enable row level security;
alter table ot_moviles enable row level security;
alter table ot_ordenes enable row level security;
alter table ot_eventos enable row level security;
alter table ot_auditoria enable row level security;

-- Catálogos: los lee cualquier empleado activo; los escribe quien administra parámetros
do $$
declare t text;
begin
  foreach t in array array['ot_departamentos','ot_ubicaciones','ot_moviles'] loop
    execute format('drop policy if exists "ot_leer" on %I', t);
    execute format('drop policy if exists "ot_admin_ins" on %I', t);
    execute format('drop policy if exists "ot_admin_upd" on %I', t);
    execute format('drop policy if exists "ot_admin_del" on %I', t);
    execute format('create policy "ot_leer" on %I for select to authenticated using (mnt_rol() is not null)', t);
    execute format('create policy "ot_admin_ins" on %I for insert to authenticated with check (mnt_puede(''parametros''))', t);
    execute format('create policy "ot_admin_upd" on %I for update to authenticated using (mnt_puede(''parametros'')) with check (mnt_puede(''parametros''))', t);
    execute format('create policy "ot_admin_del" on %I for delete to authenticated using (mnt_puede(''parametros''))', t);
  end loop;
end $$;

-- OT y eventos: solo lectura según alcance; toda escritura pasa por las funciones ot_*
drop policy if exists "ot_ordenes_leer" on ot_ordenes;
create policy "ot_ordenes_leer" on ot_ordenes for select to authenticated using (ot_puede_ver(chofer_id, departamento_id));
drop policy if exists "ot_eventos_leer" on ot_eventos;
create policy "ot_eventos_leer" on ot_eventos for select to authenticated
  using (exists (select 1 from ot_ordenes o where o.id = orden_id and ot_puede_ver(o.chofer_id, o.departamento_id)));
drop policy if exists "ot_auditoria_leer" on ot_auditoria;
create policy "ot_auditoria_leer" on ot_auditoria for select to authenticated using (mnt_puede('parametros'));

revoke execute on function ot_log(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function ot_ubicacion_de_sucursal(uuid) from public, anon, authenticated;
revoke execute on function ot_crear(uuid, text, date, uuid, uuid, uuid, uuid, double precision, double precision, text, text, int, uuid, timestamptz) from public, anon;
revoke execute on function ot_transicion(uuid, text, double precision, double precision, text) from public, anon;
revoke execute on function ot_garita_ver(text) from public, anon;
revoke execute on function ot_garita_registrar(text, text, boolean, text) from public, anon;
revoke execute on function ot_bitacora(timestamptz, timestamptz) from public, anon;
revoke execute on function ot_reporte(date, date, uuid) from public, anon;
revoke execute on function ot_disponibilidad(uuid, date) from public, anon;
grant execute on function ot_crear(uuid, text, date, uuid, uuid, uuid, uuid, double precision, double precision, text, text, int, uuid, timestamptz) to authenticated;
grant execute on function ot_transicion(uuid, text, double precision, double precision, text) to authenticated;
grant execute on function ot_garita_ver(text) to authenticated;
grant execute on function ot_garita_registrar(text, text, boolean, text) to authenticated;
grant execute on function ot_bitacora(timestamptz, timestamptz) to authenticated;
grant execute on function ot_reporte(date, date, uuid) to authenticated;
grant execute on function ot_disponibilidad(uuid, date) to authenticated;

-- Tiempo real: el panel del supervisor y la bandeja del chofer se actualizan solos
do $$ begin alter publication supabase_realtime add table ot_ordenes; exception when others then null; end $$;

-- ---------- DATOS INICIALES DE OT (solo si están vacías) ----------
insert into ot_departamentos (nombre)
select v.nombre from (values ('TI'), ('Comercial Baratote'), ('Comercial Glass'), ('Logística'), ('Mantenimiento')) v(nombre)
where not exists (select 1 from ot_departamentos);

insert into ot_ubicaciones (nombre, tipo, es_base, lat, lng)
select * from (values
  ('Fineza Central', 'Parque logístico', true,  -25.509700::double precision, -54.615600::double precision),
  ('Edificio Getto', 'Oficina',          false, -25.516300::double precision, -54.643600::double precision),
  ('Fine Glass CDE', 'Planta',           false, -25.501100::double precision, -54.662000::double precision)
) v(nombre, tipo, es_base, lat, lng)
where not exists (select 1 from ot_ubicaciones where sucursal_id is null and not adhoc);

insert into ot_moviles (codigo, descripcion, departamento_id)
select v.codigo, v.descripcion, d.id
from (values
  ('MOV-01', 'Iveco Daily · ABC 123',     'Logística'),
  ('MOV-02', 'Renault Master · DEF 456',  'Logística'),
  ('MOV-08', 'Fiat Fiorino · GHI 789',    'Logística'),
  ('MOV-09', 'VW Delivery · JKL 012',     'Logística'),
  ('MOV-10', 'Peugeot Partner · MNP 567', 'Logística'),
  ('MOV-03', 'Toyota Hilux · MNO 345',    'Mantenimiento'),
  ('MOV-04', 'VW Gol · PQR 678',          'Comercial Baratote'),
  ('MOV-05', 'Chevrolet Onix · STU 901',  'Comercial Glass'),
  ('MOV-06', 'Renault Kangoo · VWX 234',  'TI')
) v(codigo, descripcion, depto)
join ot_departamentos d on d.nombre = v.depto and d.archivado_en is null
where not exists (select 1 from ot_moviles);

-- ---------- ADMINISTRADOR ----------
-- Solo hace falta la primera vez. Si ya tienes un administrador, ignora el aviso que aparezca aquí.
-- 1) Crea tu usuario en Supabase > Authentication > Users > Add user (con contraseña).
-- 2) Cambia el correo de abajo por el mismo y ejecuta todo el script.
do $$
declare v_email text := 'CAMBIA ESTE CORREO';   -- <<<<<< CAMBIA ESTE CORREO (ej: ti@fineza.com.py)
        v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(v_email);
  if v_id is null then
    raise warning 'No encontré el usuario %. Si ya tienes un administrador, ignora este aviso.', v_email;
  else
    insert into mnt_perfiles (id, email, nombre, rol) values (v_id, v_email, split_part(v_email,'@',1), 'admin')
    on conflict (id) do update set rol = 'admin', activo = true;
  end if;
end $$;
