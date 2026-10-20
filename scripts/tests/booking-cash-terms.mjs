// Isolated PostgreSQL regression: imported prepaid lease, fixed winter owner income, normal summer.
import fs from 'node:fs/promises';
process.env.PGLITE_MODULE=import.meta.resolve(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const original=await fs.readFile('scripts/tests/crm-commission.mjs','utf8');
const setup=original.slice(0,original.indexOf('const terms='));
const financeTest=await fs.readFile('scripts/tests/booking-finance-sync.mjs','utf8');
const scaffold=financeTest.slice(financeTest.indexOf('const scenarios=`')+'const scenarios=`'.length,financeTest.indexOf('const year='));
const scenarios=String.raw`
for(const file of ['20261019120000_daily_rental_period_prices.sql','20261019140000_rental_terms_auto_sync.sql','20261019180000_booking_owner_payout_day.sql','20261019200000_owner_expenses.sql'])await db.exec(await fs.readFile('supabase/migrations/'+file,'utf8'));
const year=Number((await db.query('SELECT extract(year FROM now()) y')).rows[0].y)+1;
const periods=[{start_date:year+'-01-07',end_date:year+'-05-31',price_month:110000},{start_date:year+'-06-01',end_date:year+'-08-31',price_month:150000},{start_date:year+'-09-01',end_date:(year+1)+'-01-07',price_month:110000}];
const terms={property_id:id(20),client_id:id(30),start_date:year+'-01-07',end_date:(year+1)+'-01-07',price_type:'periodic',price_month:null,payment_day:7,deposit:100000,source:'website',status:'active',comment:'',stay_kind:'long_term',periods,owner_payout_day:10};
const bookingId=(await db.query('SELECT finance_save_booking(NULL,$1,$2) id',[terms,id(90)])).rows[0].id;
const before=(await db.query('SELECT id,amount,company_fee,planned_date FROM payments WHERE booking_id=$1 ORDER BY planned_date',[bookingId])).rows;
await db.exec(await fs.readFile('supabase/migrations/20261020160000_booking_cash_terms.sql','utf8'));
assert.deepEqual((await db.query('SELECT id,amount,company_fee,planned_date FROM payments WHERE booking_id=$1 ORDER BY planned_date',[bookingId])).rows,before,'schema does not change existing cash');
const rates=periods.filter(p=>p.price_month===110000).map(p=>({from:p.start_date,to:p.end_date,owner_monthly:100000}));
await db.query('SELECT finance_set_booking_cash_terms($1,$2,$3)',[bookingId,year+'-03-07',rates]);
let rows=(await db.query('SELECT *,planned_date::text date FROM payments WHERE booking_id=$1 AND rental_schedule ORDER BY planned_date',[bookingId])).rows;
assert.equal(rows.length,10,'prepaid first two months removed without fake receipts');
assert.equal(rows[0].date,year+'-03-07');
for(const r of rows.filter(r=>[3,4,9,10,11,12].includes(Number(r.date.slice(5,7)))))assert.equal(Number(r.amount)-Number(r.company_fee),100000,'full winter month pays owner 100000');
for(const r of rows.filter(r=>[6,7].includes(Number(r.date.slice(5,7))))){assert.equal(Number(r.amount),150000);assert.equal(Number(r.company_fee),15000,'summer unchanged');}
assert.equal(Number(rows.find(r=>r.date===year+'-05-07').company_fee),10967.74,'transition weighted by actual winter/summer days');
assert.equal(Number(rows.find(r=>r.date===year+'-08-07').company_fee),14032.26);
await db.query("INSERT INTO finance_counterparties(id,name,kind) VALUES($1,'Owner','owner')",[id(800)]);
await db.query('INSERT INTO finance_object_settings(property_id,owner_counterparty_id) VALUES($1,$2)',[id(20),id(800)]);
for(const month of ['01','02']){
 const ob=(await db.query("INSERT INTO finance_obligations(counterparty_id,property_id,planned_date,amount,direction,status) VALUES($1,$2,$3,100000,'payable','open') RETURNING id",[id(800),id(20),year+'-'+month+'-10'])).rows[0].id;
 await db.query("INSERT INTO finance_owner_settlements(property_id,period,obligation_id,booking_id,automatic,gross_amount) VALUES($1,$2,$3,$4,false,100000)",[id(20),year+'-'+month+'-01',ob,bookingId]);
 await db.query("SELECT set_config('rm.owner_plan_write','yes',false)");
 await db.query("INSERT INTO payments(property_id,booking_id,counterparty_id,obligation_id,planned_date,amount,direction,status,kind,rental_component,rental_period,paid_amount,account) VALUES($1,$2,$3,$4,$5,100000,'out','partial','owner_payout','owner_plan',$6,0,'Карта')",[id(20),bookingId,id(800),ob,year+'-'+month+'-10',year+'-'+month+'-01']);
 await db.query("SELECT set_config('rm.owner_plan_write','',false)");
}
const snapshots=rows.map(r=>[r.id,r.amount,r.company_fee,r.date]);
await db.query('SELECT finance_save_booking($1,$2,$3)',[bookingId,terms,id(90)]);
rows=(await db.query('SELECT *,planned_date::text date FROM payments WHERE booking_id=$1 AND rental_schedule ORDER BY planned_date',[bookingId])).rows;
assert.deepEqual(rows.map(r=>[r.id,r.amount,r.company_fee,r.date]),snapshots,'booking re-save keeps exclusions and fees, no duplicates');
assert.equal((await db.query("SELECT count(*) n FROM payments WHERE booking_id=$1 AND rental_component='owner_plan'",[bookingId])).rows[0].n,2,'prepaid owner payouts retained without recreating rent');
await db.query("UPDATE payments SET status='paid',paid_amount=amount,paid_at=planned_date WHERE id=$1",[rows[0].id]);
assert.equal(Number((await db.query('SELECT company_fee FROM payments WHERE id=$1',[rows[0].id])).rows[0].company_fee),10000,'receiving winter rent retains agreed fee');
await db.query("SELECT set_config('test.user',$1,false)",[id(2)]);
await assert.rejects(db.query('SELECT finance_set_booking_cash_terms($1,$2,$3)',[bookingId,year+'-04-07',rates]),/администратор/);
console.log('PASS: prepaid months excluded, winter net 100000, summer unchanged, mixed days, persistent booking resync, actual receipt and admin guard');
await db.close();
`;
try{const decoded=Function('return `'+scaffold+'`')();await import('data:text/javascript;base64,'+Buffer.from(setup+decoded+scenarios).toString('base64'));}catch(error){console.error(error.message,error.detail??'',error.where??'',error.query??'');process.exitCode=1;}
