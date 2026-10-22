// Exercise the real finance migration chain in an isolated PostgreSQL database.
import fs from 'node:fs/promises';
process.env.PGLITE_MODULE=import.meta.resolve(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const source=await fs.readFile('scripts/tests/finance-task-receipt.mjs','utf8');
const ownerCases=await fs.readFile('scripts/tests/owner-payout-on-request-cases.txt','utf8');
const cases=String.raw`
await db.query("SELECT set_config('test.user',$1,false)",[id(1)]);
const untouchedBefore=(await db.query('SELECT to_jsonb(p) snapshot FROM payments p ORDER BY id')).rows;
await db.exec(await fs.readFile('supabase/migrations/20261022120000_commission_only_rentals.sql','utf8'));
assert.deepEqual((await db.query('SELECT to_jsonb(p) snapshot FROM payments p ORDER BY id')).rows,untouchedBefore,'migration never rewrites existing cash or history');
await db.query("INSERT INTO properties(id,title,portfolio,status,service_type,management_fee_type,management_fee_value) VALUES($1,'Broker test','rm','free','commission_only','percent',15),($2,'Managed test','rm','free','management','percent',12)",[id(9900),id(9901)]);
await db.query('INSERT INTO finance_object_settings(property_id,owner_counterparty_id) VALUES($1,$2)',[id(9900),id(800)]);
for(const n of [9910,9911,9912])await db.query("INSERT INTO deals(id,title,stage_id,pipeline,client_id,source)VALUES($1,'Broker test',$2,'rental',$3,'Авито')",[id(n),id(10),id(30)]);
const brokerYear=year+15;
const brokerTerms={service_type:'commission_only',property_id:id(9900),start_date:brokerYear+'-01-10',end_date:brokerYear+'-12-10',price_month:120000,deposit:120000,payment_day:10,closing_source:'ЦИАН',create_booking:true,account_id:id(90),one_time:60000,one_time_date:brokerYear+'-01-10',seasons:[]};
const broker=(await db.query('SELECT crm_close_won_finance($1,$2) id',[id(9910),brokerTerms])).rows[0].id;
assert.ok(broker);const savedBroker=(await db.query('SELECT *,end_date::text finish FROM bookings WHERE id=$1',[broker])).rows[0];
assert.equal(savedBroker.service_type,'commission_only');assert.equal(savedBroker.finish,brokerTerms.end_date);
const brokerPayments=(await db.query('SELECT * FROM payments WHERE booking_id=$1',[broker])).rows;
assert.equal(brokerPayments.length,1,'only a single one-time company commission, no zero monthly rows');assert.equal(brokerPayments[0].crm_charge,'one_time');assert.equal(Number(brokerPayments[0].amount),60000);assert.equal(brokerPayments[0].status,'expected','never fabricate receipt');
assert.equal((await db.query('SELECT count(*) n FROM finance_booking_schedules WHERE id=$1',[broker])).rows[0].n,0,'no rent cash schedule');
assert.equal((await db.query('SELECT count(*) n FROM finance_owner_settlements WHERE booking_id=$1',[broker])).rows[0].n,0,'no owner debts');
assert.equal(Number((await db.query('SELECT management_fee_value FROM properties WHERE id=$1',[id(9900)])).rows[0].management_fee_value),15,'a one-time contract does not erase property management terms');
assert.equal((await db.query('SELECT finance_terms FROM deals WHERE id=$1',[id(9910)])).rows[0].finance_terms.service_type,'commission_only');
await db.query('SELECT crm_close_won_finance($1,$2)',[id(9910),brokerTerms]);assert.equal((await db.query('SELECT count(*) n FROM payments WHERE booking_id=$1',[broker])).rows[0].n,1,'closing replay is idempotent');
// Reopening the booking does not demand a rent account or owner payout day.
const edit={property_id:id(9900),client_id:id(30),service_type:'commission_only',start_date:brokerTerms.start_date,end_date:(brokerYear+1)+'-02-10',price_type:'fixed',price_month:130000,payment_day:10,deposit:120000,source:'cian',status:'active',comment:'extended',stay_kind:'long_term',periods:[]};
await db.query("UPDATE payments SET status='paid',paid_amount=amount,paid_at=planned_date WHERE id=$1",[brokerPayments[0].id]);
const earned=(await db.query('SELECT to_jsonb(p) snapshot FROM payments p WHERE id=$1',[brokerPayments[0].id])).rows;
await db.query('SELECT finance_save_booking($1,$2,NULL)',[broker,edit]);
assert.equal((await db.query('SELECT end_date::text finish FROM deals WHERE id=$1',[id(9910)])).rows[0].finish,edit.end_date);assert.equal((await db.query('SELECT count(*) n FROM payments WHERE booking_id=$1',[broker])).rows[0].n,1);assert.deepEqual((await db.query('SELECT to_jsonb(p) snapshot FROM payments p WHERE id=$1',[brokerPayments[0].id])).rows,earned,'received commission is immutable during date changes');
await assert.rejects(db.query('SELECT finance_save_booking($1,$2,NULL)',[broker,{...edit,management_fee_type:'percent',management_fee_value:10}]),/ежемесячные/);
await assert.rejects(db.query('SELECT finance_save_booking($1,$2,NULL)',[broker,{...edit,service_type:'management'}]),/Формат/);
await db.query('SELECT finance_cancel_booking($1)',[broker]);assert.deepEqual((await db.query('SELECT to_jsonb(p) snapshot FROM payments p WHERE id=$1',[brokerPayments[0].id])).rows,earned,'cancellation retains actual income');
// A brokerage booking without a CRM deal keeps dates without inventing any payments.
const manualBroker=(await db.query('SELECT finance_save_booking(NULL,$1,NULL) id',[{...edit,start_date:(brokerYear+2)+'-01-10',end_date:(brokerYear+2)+'-12-10'}])).rows[0].id;
assert.equal((await db.query('SELECT count(*) n FROM payments WHERE booking_id=$1',[manualBroker])).rows[0].n,0);
// Management still requires a monthly reward and generates the normal recurring schedule.
await assert.rejects(db.query('SELECT crm_close_won_finance($1,$2)',[id(9911),{...brokerTerms,property_id:id(9901),service_type:'management'}]),/доход компании/);
const managed=(await db.query('SELECT crm_close_won_finance($1,$2) id',[id(9911),{...brokerTerms,property_id:id(9901),service_type:'management',income_type:'percent',income_value:12}])).rows[0].id;
assert.equal((await db.query('SELECT service_type FROM bookings WHERE id=$1',[managed])).rows[0].service_type,'management');assert.ok((await db.query('SELECT count(*) n FROM payments WHERE booking_id=$1 AND rental_schedule',[managed])).rows[0].n>0,'management still schedules rent');
// Explicit commission-only service can also be selected for a property normally managed.
const alternate=(await db.query('SELECT crm_close_won_finance($1,$2) id',[id(9912),{...brokerTerms,property_id:id(9901),start_date:(brokerYear+3)+'-01-10',end_date:(brokerYear+3)+'-12-10'}])).rows[0].id;
assert.equal((await db.query('SELECT count(*) n FROM payments WHERE booking_id=$1',[alternate])).rows[0].n,1);assert.equal(Number((await db.query('SELECT management_fee_value FROM properties WHERE id=$1',[id(9901)])).rows[0].management_fee_value),12);
await db.query("SELECT set_config('test.user',$1,false)",[id(2)]);await assert.rejects(db.query('SELECT finance_save_booking($1,$2,NULL)',[manualBroker,edit]),/администратор/);
console.log('PASS: brokerage without monthly reward; dates in CRM/calendar; exactly one commission; no rent/owner schedules; idempotency; edit/cancel paid-history protection; per-contract mode; unchanged management; administrator guard.');
`;
const marker="console.log('PASS: task receipt";
if(!source.includes(marker))throw Error('Fixture insertion point missing');
const code=source.replace("process.env.PGLITE_MODULE=import.meta.resolve(process.env.PGLITE_MODULE||'@electric-sql/pglite');",'').replace(marker,ownerCases+'\n'+cases+'\n'+marker);
await import('data:text/javascript,'+encodeURIComponent(code));
