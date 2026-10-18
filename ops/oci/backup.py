#!/usr/bin/env python3
"""Consistent SQLite backup including WAL, with 14-day retention."""
import sqlite3, os
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
    cutoff=datetime.now(timezone.utc)-timedelta(days=14)
    for item in root.glob('seollem-*.sqlite'):
        if datetime.fromtimestamp(item.stat().st_mtime,timezone.utc)<cutoff:
            item.unlink()
    print('SQLite backup integrity verified')
