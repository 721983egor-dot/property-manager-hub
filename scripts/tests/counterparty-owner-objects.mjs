// Real PostgreSQL functions in an isolated in-memory database. No production data.
import fs from 'node:fs/promises';
process.env.PGLITE_MODULE=import.meta.resolve(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const original=await fs.readFile('scripts/tests/crm-commission.mjs','utf8');
const setup=original.slice(0,original.indexOf('const terms='));
const financeTest=await fs.readFile('scripts/tests/booking-finance-sync.mjs','utf8');
const scaffold=financeTest.slice(financeTest.indexOf('const scenarios=`')+'const scenarios=`'.length,financeTest.indexOf('const year='));
const scenarios=String.raw`
await db.exec("CREATE TYPE finance_counterparty_kind AS ENUM('tenant','owner','contractor','employee','deposit','other'); ALTER TABLE finance_counterparty_classes ALTER COLUMN legacy_kind TYPE finance_counterparty_kind USING legacy_kind::finance_counterparty_kind; ALTER TABLE finance_counterparties ALTER COLUMN kind TYPE finance_counterparty_kind USING kind::finance_counterparty_kind; ALTER TABLE finance_counterparties ADD classification_id uuid,ADD requisites text DEFAULT '',ADD comment text DEFAULT '',ADD client_id uuid; ALTER TABLE finance_object_settings ADD classification_id uuid; CREATE TRIGGER log_owner_settings AFTER INSERT OR UPDATE OR DELETE ON finance_object_settings FOR EACH ROW EXECUTE FUNCTION log_activity(); CREATE TRIGGER log_owner_cards AFTER INSERT OR UPDATE OR DELETE ON finance_counterparties FOR EACH ROW EXECUTE FUNCTION log_activity();");
await db.exec("CREATE OR REPLACE FUNCTION log_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN INSERT INTO activity_log(table_name,record_id,changes) VALUES(TG_TABLE_NAME,coalesce((to_jsonb(NEW)->>'id')::uuid,(to_jsonb(NEW)->>'property_id')::uuid),to_jsonb(NEW)); RETURN NEW; END $$;");
await db.exec(await fs.readFile('supabase/migrations/20261019160000_counterparty_owner_objects.sql','utf8'));
await db.query("INSERT INTO finance_counterparty_classes(id,name,legacy_kind) VALUES($1,'Owners','owner'),($2,'Other','other')",[id(900),id(901)]);
await db.query("INSERT INTO properties(id,title,portfolio) VALUES($1,'Second object','rm'),($2,'Third object','rm'),($3,'Hotel object','n11')",[id(22),id(23),id(24)]);
const input={name:'Test owner',kind:'other',classification_id:id(900),requisites:'Bank details'};
const save=async(idValue,inputValue,properties,expected=null)=>(await db.query('SELECT finance_save_counterparty($1,$2,$3,$4) id',[idValue,inputValue,properties,expected])).rows[0].id;
const ownerId=await save(null,input,[id(20),id(22)],[]);
assert.equal((await db.query('SELECT kind FROM finance_counterparties WHERE id=$1',[ownerId])).rows[0].kind,'owner','owner classification sets settlement role');
assert.equal((await db.query('SELECT count(*) n FROM finance_object_settings WHERE owner_counterparty_id=$1',[ownerId])).rows[0].n,2,'one owner has multiple objects');
await db.query('UPDATE finance_object_settings SET payout_day=10,classification_id=$2 WHERE property_id=$1',[id(20),id(999)]);
await db.query("INSERT INTO finance_obligations(id,counterparty_id,planned_date,amount,direction,property_id,status) VALUES($1,$2,'2026-10-10',90000,'payable',$3,'open')",[id(810),ownerId,id(22)]);
await save(ownerId,{...input,name:'Updated owner'},[id(20),id(23)],[id(20),id(22)]);
const settings=(await db.query('SELECT * FROM finance_object_settings WHERE property_id=$1',[id(20)])).rows[0];
assert.equal(settings.payout_day,10);assert.equal(settings.classification_id,id(999));
assert.equal((await db.query('SELECT owner_counterparty_id FROM finance_object_settings WHERE property_id=$1',[id(22)])).rows[0].owner_counterparty_id,null,'uncheck detaches only ownership');
assert.equal((await db.query('SELECT counterparty_id FROM finance_obligations WHERE id=$1',[id(810)])).rows[0].counterparty_id,ownerId,'old liability keeps its owner');
await assert.rejects(save(ownerId,input,[id(20)],[id(20),id(22)]),/изменились/,'stale complete list cannot drop new links');
await assert.rejects(save(null,{...input,name:'Other owner'},[id(20)],[]),/уже есть собственник/,'another owner is not silently replaced');
assert.equal((await db.query("SELECT count(*) n FROM finance_counterparties WHERE name='Other owner'")).rows[0].n,0,'failed link also rolls back counterparty creation');
await assert.rejects(save(ownerId,input,[],[id(20),id(23)]),/хотя бы один/);
await assert.rejects(save(ownerId,input,[id(24)],[id(20),id(23)]),/объекты Резиденции/);
await assert.rejects(save(ownerId,{...input,classification_id:id(901)},[id(20)],[id(20),id(23)]),/только собственнику/);
await save(ownerId,{...input,classification_id:id(901)},[],[id(20),id(23)]);
assert.equal((await db.query('SELECT count(*) n FROM finance_object_settings WHERE owner_counterparty_id=$1',[ownerId])).rows[0].n,0);
assert.equal(Number((await db.query('SELECT amount FROM finance_obligations WHERE id=$1',[id(810)])).rows[0].amount),90000);
const apiOwner=await save(null,{name:'API owner',kind:'owner'},[id(22)],[]);
assert.equal((await db.query('SELECT classification_id FROM finance_counterparties WHERE id=$1',[apiOwner])).rows[0].classification_id,id(900),'Assistant creation gets owner classification');
await db.query("SELECT set_config('test.user',$1,false)",[id(2)]);
await assert.rejects(save(null,input,[id(22)],[]),/администратор/);
assert.ok((await db.query("SELECT count(*) n FROM activity_log WHERE table_name IN ('finance_counterparties','finance_object_settings')")).rows[0].n>0,'ownership changes audited');
console.log('PASS: owner classification, multiple objects, shared payout settings, detachment, debt history, stale edit guard, owner conflict, atomic creation, role validation, admin access, audit');
await db.close();
`;
try {const decoded=Function('return `'+scaffold+'`')();await import('data:text/javascript;base64,'+Buffer.from(setup+decoded+scenarios).toString('base64'));}
catch(error){console.error(error.message,error.detail??'',error.where??'');process.exitCode=1;}
