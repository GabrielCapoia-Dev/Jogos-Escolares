"""Exercise the production shell scheduler in WSL with a fake clock/database."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
def linux(path):
    return '/mnt/host/' + str(path.resolve()).replace('\\', '/').replace(':', '').replace('D/', 'd/', 1)

class ScheduleTest(unittest.TestCase):
    def setUp(self):
        (ROOT/'tmp').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT/'tmp', prefix='backup-schedule-')
        self.root = Path(self.temp.name)
        self.bin = self.root/'bin'; self.bin.mkdir()
        self.dest = self.root/'backups'
        scripts = {
            'date': '''#!/bin/sh
case "$*" in
  '+%F') echo "$FAKE_DAY";;
  '+%s') echo "$FAKE_EPOCH";;
  '-u +%Y%m%dT%H%M%SZ') echo "$FAKE_STAMP";;
  *) echo '2026-11-11T03:00:00Z';;
esac
''',
            'pg_dump': '''#!/bin/sh
echo "$TZ:$PGAPPNAME" >> "$TEST_ROOT/calls"
for arg in "$@"; do case "$arg" in --file=*) target=${arg#--file=};; esac; done
echo 'test archive' > "$target"
[ "${FAIL_DUMP:-0}" != 1 ]
''',
            'pg_restore': '''#!/bin/sh
[ "${FAIL_VALIDATE:-0}" != 1 ] || exit 1
for arg in "$@"; do last=$arg; done
grep -q 'test archive' "$last"
'''
        }
        for name, source in scripts.items():
            path=self.bin/name;path.write_text(source,encoding='utf-8',newline='\n');path.chmod(0o755)
        self.env={'BACKUP_DIR':linux(self.dest),'TEST_ROOT':linux(self.root),
                  'FAKE_DAY':'2026-11-11','FAKE_EPOCH':'1794366000',
                  'FAKE_STAMP':'20261111T030000Z','TZ':'America/Sao_Paulo'}

    def tearDown(self): self.temp.cleanup()

    def run_job(self, mode='--once', **updates):
        env={**self.env,**updates}
        cmd=['wsl','-d','docker-desktop','--','env',*[f'{k}={v}' for k,v in env.items()],
             'PATH='+linux(self.bin)+':/usr/bin:/bin',
             '/bin/sh',linux(ROOT/'scripts/backups/run.sh'),mode]
        return subprocess.run(cmd,capture_output=True,text=True,encoding='utf-8')

    def test_initial_backup_and_timezone(self):
        result=self.run_job();self.assertEqual(result.returncode,0,result.stderr)
        meta=json.loads((self.dest/'latest.json').read_text())
        self.assertEqual(meta['scheduledDay'],'2026-11-11')
        self.assertEqual(meta['timezone'],'America/Sao_Paulo')
        self.assertEqual((self.root/'calls').read_text().strip(),'America/Sao_Paulo:jogos-escolares-backup')
        self.assertEqual(self.run_job('--check').returncode,0)

    def test_no_repeat_on_same_day(self):
        self.assertEqual(self.run_job().returncode,0)
        self.assertEqual(self.run_job().returncode,0)
        self.assertEqual(len((self.root/'calls').read_text().splitlines()),1)

    def test_next_midnight_and_preservation(self):
        self.run_job()
        r=self.run_job(FAKE_DAY='2026-11-12',FAKE_EPOCH='1794452400',FAKE_STAMP='20261112T030000Z')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertEqual(len(list(self.dest.glob('*.dump'))),2)

    def test_dump_failure_then_retry(self):
        self.assertNotEqual(self.run_job(FAIL_DUMP='1').returncode,0)
        self.assertFalse((self.dest/'.last-success').exists())
        self.assertFalse(list(self.dest.glob('*.partial')))
        self.assertEqual(self.run_job().returncode,0)

    def test_bad_archive_does_not_replace_success(self):
        self.run_job();before=(self.dest/'.last-success').read_bytes()
        r=self.run_job(FAKE_DAY='2026-11-12',FAKE_STAMP='20261112T030000Z',FAIL_VALIDATE='1')
        self.assertNotEqual(r.returncode,0)
        self.assertEqual((self.dest/'.last-success').read_bytes(),before)
        self.assertEqual(len(list(self.dest.glob('*.dump'))),1)

    def test_missing_backup_and_overdue_health(self):
        self.assertNotEqual(self.run_job('--check').returncode,0)
        self.run_job()
        self.assertNotEqual(self.run_job('--check',FAKE_EPOCH='1794456001').returncode,0)

    def test_missing_archive_triggers_recovery(self):
        self.run_job()
        next(self.dest.glob('*.dump')).unlink()
        self.assertNotEqual(self.run_job('--check').returncode,0)
        self.assertEqual(self.run_job(FAKE_STAMP='20261111T120000Z').returncode,0)
        self.assertEqual(self.run_job('--check').returncode,0)

    def test_startup_after_missed_midnight(self):
        self.run_job()
        self.assertEqual(self.run_job(FAKE_DAY='2026-11-14',FAKE_EPOCH='1794625200',FAKE_STAMP='20261114T120000Z').returncode,0)
        self.assertEqual(json.loads((self.dest/'latest.json').read_text())['scheduledDay'],'2026-11-14')

if __name__=='__main__': unittest.main(verbosity=2)
