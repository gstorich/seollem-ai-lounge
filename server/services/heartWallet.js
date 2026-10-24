const crypto = require('node:crypto');

// Calendar-year expiry in Korea time; preserve all previously stored expiries.
const ONE_YEAR_POLICY_AT=Date.parse("2026-10-20T00:00:00+09:00");
function calendarExpiry(acquiredAt,years) {
  const local = new Date(acquiredAt + 9 * 3600000);
  const year = local.getUTCFullYear() + years;
  const month = local.getUTCMonth();
  const day = Math.min(local.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return Date.UTC(year, month, day, local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds()) - 9 * 3600000;
}
function expiresAfterTwoYears(at){return calendarExpiry(at,2);}
function expiresAfterOneYear(at){return calendarExpiry(at,1);}
function expiresForAcquisition(at){return calendarExpiry(at,at>=ONE_YEAR_POLICY_AT?1:2);}
function getEndOfDayKst(timestamp = Date.now()) {
  const local = new Date(timestamp + 9 * 3600000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  return Date.UTC(year, month, day + 1, 0, 0, 0, 0) - 9 * 3600000;
}
function getStartOfDayKst(timestamp = Date.now()) {
  const local = new Date(timestamp + 9 * 3600000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  return Date.UTC(year, month, day, 0, 0, 0, 0) - 9 * 3600000;
}
function getKstDateString(timestamp = Date.now()) {
  const local = new Date(timestamp + 9 * 3600000);
  return local.toISOString().slice(0, 10);
}
function units(value) {
  const result = Math.round(value * 10);
  if (!Number.isFinite(value) || !Number.isSafeInteger(result) || value < 0 || Math.abs(value * 10 - result) > 1e-6) throw Error('Invalid heart amount');
  return result;
}
function createWallet(sql) {
  sql.exec(`CREATE TABLE IF NOT EXISTS heart_wallets(user_id TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS heart_grants(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,granted_units INTEGER NOT NULL CHECK(granted_units>0),
    remaining_units INTEGER NOT NULL CHECK(remaining_units>=0 AND remaining_units<=granted_units),
    expired_units INTEGER NOT NULL DEFAULT 0,removed_units INTEGER NOT NULL DEFAULT 0,
    acquired_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,reason TEXT NOT NULL,source_ledger_id INTEGER UNIQUE);
  CREATE INDEX IF NOT EXISTS heart_grants_user_expiry ON heart_grants(user_id,expires_at,remaining_units);`);
  function tx(fn) { if (sql.isTransaction) return fn();sql.exec('BEGIN IMMEDIATE');try{const value=fn();sql.exec('COMMIT');return value;}catch(e){sql.exec('ROLLBACK');throw e;} }
  function rawUser(id) { const row=sql.prepare('SELECT data FROM users WHERE id=?').get(id);return row?JSON.parse(row.data):null; }
  function ledger(id,delta,reason,at) { return Number(sql.prepare('INSERT INTO ledger(user_id,delta,reason,created_at) VALUES(?,?,?,?)').run(id,delta,reason,at).lastInsertRowid); }
  function addGrant(id,amount,at,reason,ledgerId,remaining=amount,customExpiresAt=null) {
    if(amount<=0)return;
    const expiresAt = customExpiresAt || expiresForAcquisition(at);
    sql.prepare('INSERT INTO heart_grants(id,user_id,granted_units,remaining_units,acquired_at,expires_at,reason,source_ledger_id) VALUES(?,?,?,?,?,?,?,?)')
      .run(crypto.randomUUID(),id,amount,remaining,at,expiresAt,reason,ledgerId);
  }
  function initialize(id) {
    if(sql.prepare('SELECT 1 FROM heart_wallets WHERE user_id=?').get(id))return;
    const user=rawUser(id);if(!user)return;
    const balance=units(user.hearts);
    const net=sql.prepare('SELECT coalesce(sum(delta),0) n FROM ledger WHERE user_id=?').get(id).n;
    // Preserve an existing balance even if an old import has incomplete ledger data.
    if(net!==balance)ledger(id,balance-net,'legacy_balance_reconciliation',Date.now());
    const credits=sql.prepare('SELECT id,delta,reason,created_at FROM ledger WHERE user_id=? AND delta>0 ORDER BY created_at,id').all(id);
    let spent=credits.reduce((sum,row)=>sum+row.delta,0)-balance;
    let firstInitial=true;
    for(const credit of credits){
      let acquiredAt=credit.created_at;
      if(credit.reason==='legacy_balance_reconciliation' || (credit.reason==='initial' && firstInitial)){
        if(Number.isFinite(user.createdAt))acquiredAt=Math.min(acquiredAt,user.createdAt);
      }
      if(credit.reason==='initial')firstInitial=false;
      const consumed=Math.min(spent,credit.delta);spent-=consumed;
      addGrant(id,credit.delta,acquiredAt,credit.reason,credit.id,credit.delta-consumed);
    }
    sql.prepare('INSERT INTO heart_wallets(user_id) VALUES(?)').run(id);
  }
  function sync(id) {
    const user=rawUser(id);if(!user)return null;
    const balance=sql.prepare('SELECT coalesce(sum(remaining_units),0) n FROM heart_grants WHERE user_id=?').get(id).n/10;
    if(user.hearts!==balance){user.hearts=balance;user.updatedAt=Date.now();sql.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(user),id);}
    return user;
  }
  function expire(id,now=Date.now()) {
    return tx(()=>{
      initialize(id);
      const due=sql.prepare('SELECT id,remaining_units FROM heart_grants WHERE user_id=? AND expires_at<=? AND remaining_units>0').all(id,now);
      for(const grant of due){
        sql.prepare('UPDATE heart_grants SET expired_units=expired_units+remaining_units,remaining_units=0 WHERE id=?').run(grant.id);
        ledger(id,-grant.remaining_units,'heart_expired',now);
      }
      return sync(id);
    });
  }
  function expireAll() {
    return tx(()=>{
      for(const row of sql.prepare('SELECT u.id FROM users u LEFT JOIN heart_wallets w ON w.user_id=u.id WHERE w.user_id IS NULL').all())initialize(row.id);
      const due=sql.prepare('SELECT DISTINCT user_id FROM heart_grants WHERE expires_at<=? AND remaining_units>0').all(Date.now());
      for(const row of due)expire(row.user_id);
      return due.length;
    });
  }
  function change(id,delta,reason,acquiredAt=Date.now(),customExpiresAt=null) {
    if(!Number.isSafeInteger(delta))throw Error('Invalid heart units');
    return tx(()=>{
      const user=expire(id);if(!user)throw Error('Account not found');
      if(delta<0 && units(user.hearts)<-delta){const error=Error('하트가 부족합니다.');error.code='INSUFFICIENT_HEARTS';throw error;}
      if(delta>0){const ledgerId=ledger(id,delta,reason,acquiredAt);addGrant(id,delta,acquiredAt,reason,ledgerId,delta,customExpiresAt);}
      if(delta<0){
        let remaining=-delta;
        const grants=sql.prepare("SELECT id,remaining_units FROM heart_grants WHERE user_id=? AND remaining_units>0 ORDER BY CASE WHEN reason='daily_free' THEN 0 ELSE 1 END, acquired_at ASC, source_ledger_id ASC, id ASC").all(id);
        for(const grant of grants){const used=Math.min(remaining,grant.remaining_units);sql.prepare('UPDATE heart_grants SET remaining_units=remaining_units-? WHERE id=?').run(used,grant.id);remaining-=used;if(!remaining)break;}
        if(remaining)throw Error('Wallet balance mismatch');
        ledger(id,delta,reason,Date.now());
      }
      return expire(id);
    });
  }
  function create(id,amount,acquiredAt) {
    sql.prepare('INSERT INTO heart_wallets(user_id) VALUES(?)').run(id);
    return change(id,amount,'initial',acquiredAt);
  }
  function transfer(from,to,keepBalance) {
    return tx(()=>{
      expire(from);initialize(to);
      if(!keepBalance){
        const amount=sql.prepare('SELECT coalesce(sum(remaining_units),0) n FROM heart_grants WHERE user_id=?').get(from).n;
        sql.prepare('UPDATE heart_grants SET removed_units=removed_units+remaining_units,remaining_units=0 WHERE user_id=?').run(from);
        if(amount)ledger(from,-amount,'guest_balance_not_transferred',Date.now());
      }
      sql.prepare('UPDATE heart_grants SET user_id=? WHERE user_id=?').run(to,from);
      sql.prepare('INSERT OR IGNORE INTO heart_wallets VALUES(?)').run(to);
      sql.prepare('DELETE FROM heart_wallets WHERE user_id=?').run(from);
      return sync(to);
    });
  }
  function summary(id) {
    const user=expire(id);if(!user)return null;
    const next=sql.prepare('SELECT expires_at,sum(remaining_units) amount FROM heart_grants WHERE user_id=? AND remaining_units>0 GROUP BY expires_at ORDER BY expires_at LIMIT 1').get(id);
    const soon=sql.prepare('SELECT coalesce(sum(remaining_units),0) n FROM heart_grants WHERE user_id=? AND remaining_units>0 AND expires_at<=?').get(id,Date.now()+30*86400000).n;
    return {validityYears:1,policyEffectiveAt:ONE_YEAR_POLICY_AT,nextExpiresAt:next?.expires_at||null,nextExpiringHearts:(next?.amount||0)/10,expiringIn30Days:soon/10};
  }
  function grants(id) {
    expire(id);
    return sql.prepare('SELECT id,granted_units,remaining_units,expired_units,removed_units,acquired_at,expires_at,reason FROM heart_grants WHERE user_id=? ORDER BY acquired_at DESC,source_ledger_id DESC LIMIT 100').all(id)
      .map(row=>({id:row.id,grantedHearts:row.granted_units/10,remainingHearts:row.remaining_units/10,expiredHearts:row.expired_units/10,removedHearts:row.removed_units/10,acquiredAt:row.acquired_at,expiresAt:row.expires_at,reason:row.reason}));
  }
  function startWorker() {
    let stopped=false,timer;
    function tick(){if(stopped)return;try{expireAll();}catch(e){console.error('[HEART EXPIRY] sweep failed:',e.message);}
      const next=sql.prepare('SELECT min(expires_at) next FROM heart_grants WHERE remaining_units>0').get().next;
      timer=setTimeout(tick,Math.max(1,Math.min(60000,next?next-Date.now():60000)));timer.unref();
    }
    tick();return ()=>{stopped=true;clearTimeout(timer);};
  }
  return {expire,expireAll,change,create,transfer,summary,grants,startWorker};
}
module.exports={createWallet,expiresAfterTwoYears,expiresAfterOneYear,expiresForAcquisition,getEndOfDayKst,getStartOfDayKst,getKstDateString,ONE_YEAR_POLICY_AT,units};
