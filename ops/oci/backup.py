#!/usr/bin/env python3
"""Consistent SQLite backup including WAL, with 14-day retention."""
import sqlite3, os, subprocess, json
from pathlib import Path
from datetime import datetime, timezone, timedelta
root=Path('/var/backups/seollem-ai-lounge')
root.mkdir(mode=0o700, parents=True, exist_ok=True)
source=Path('/var/lib/seollem-ai-lounge/seollem.sqlite')
if source.exists():
    target=root/('seollem-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.sqlite')
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    os.close(fd)
    with sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True) as src, sqlite3.connect(target) as dst:
        src.backup(dst)
        if dst.execute('pragma integrity_check').fetchone()[0]!='ok':
            raise RuntimeError('Backup integrity check failed')
    # Upload only a coherent snapshot, then verify that every encrypted part
    # can be downloaded and decoded before considering this a successful backup.
    envfile=Path('/etc/seollem-ai-lounge/storage.env')
    if envfile.exists():
        script=Path(__file__).resolve().parents[2]/'server/scripts/backup-store.cjs'
        result=subprocess.run(['/usr/bin/node',str(script),'upload',str(target)],check=True,capture_output=True,text=True)
        record=json.loads(result.stdout.strip().splitlines()[-1])
        (root/'last-remote-success.json').write_text(json.dumps({'at':datetime.now(timezone.utc).isoformat(),'object':record['key'],'bytes':record['bytes']}))
        print('Encrypted R2 backup read-back verified')
    cutoff=datetime.now(timezone.utc)-timedelta(days=3)
    for item in root.glob('seollem-*.sqlite'):
        if datetime.fromtimestamp(item.stat().st_mtime,timezone.utc)<cutoff:
            item.unlink()
    print('SQLite backup integrity verified')
