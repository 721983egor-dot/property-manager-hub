import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE user_roles(user_id uuid,role text);GRANT SELECT ON user_roles TO authenticated;
CREATE TABLE properties(id uuid PRIMARY KEY,portfolio text);CREATE TABLE activity_log(table_name text,record_id uuid,actor_id uuid,action text,summary text,changes jsonb);`);
await db.query('INSERT INTO auth.users VALUES($1),($2),($3)',[id(1),id(2),id(3)]);await db.query("INSERT INTO user_roles VALUES($1,'admin'),($2,'manager')",[id(1),id(2)]);await db.query("INSERT INTO properties VALUES($1,'rm'),($2,'n11')",[id(10),id(11)]);
await db.exec(await fs.readFile('supabase/migrations/20261022100000_property_key_inventory.sql','utf8'));
const inv={required:[],bundles:[],transfers:[],history:[{at:'2026-10-22',actor:id(1),text:'Состав ключей обновлён'}]};
const save=(version,actor=id(1),property=id(10),inventory=inv)=>db.query('SELECT save_property_key_inventory($1,$2,$3,$4) v',[property,version,inventory,actor]);
assert.equal((await save(0)).rows[0].v,1);await assert.rejects(save(0),/изменился/);assert.equal((await db.query('SELECT count(*) n FROM activity_log')).rows[0].n,1);
assert.equal((await save(1,id(2))).rows[0].v,2);await assert.rejects(save(2,id(3)),/сотрудники/);await assert.rejects(save(0,id(1),id(11)),/РМ/);await assert.rejects(save(2,id(1),id(10),{}),/состав/);
assert.equal((await db.query("SELECT has_function_privilege('authenticated','save_property_key_inventory(uuid,int,jsonb,uuid)','EXECUTE') ok")).rows[0].ok,false);
assert.equal((await db.query("SELECT has_function_privilege('anon','save_property_key_inventory(uuid,int,jsonb,uuid)','EXECUTE') ok")).rows[0].ok,false);
assert.equal((await db.query("SELECT has_table_privilege('authenticated','property_key_inventories','UPDATE') ok")).rows[0].ok,false);
assert.equal((await db.query("SELECT has_table_privilege('anon','property_key_inventories','SELECT') ok")).rows[0].ok,false);
for(const [actor,count] of [[id(1),1],[id(2),1],[id(3),0]]){await db.query("SELECT set_config('test.user',$1,false)",[actor]);await db.exec('SET ROLE authenticated');assert.equal((await db.query('SELECT count(*) n FROM property_key_inventories')).rows[0].n,count);await db.exec('RESET ROLE');}
// Audit and write are atomic even if recording the audit fails.
await db.exec("CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END $$; CREATE TRIGGER fail_audit BEFORE INSERT ON activity_log FOR EACH ROW EXECUTE FUNCTION fail_audit();");await assert.rejects(save(2),/audit failure/);assert.equal((await db.query('SELECT version FROM property_key_inventories')).rows[0].version,2);
console.log('PASS: CAS version conflicts, atomic audit rollback, staff roles, RM scope, private RPC and RLS.');await db.close();
