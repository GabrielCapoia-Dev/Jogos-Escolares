#!/bin/sh
set -eu
umask 077
export TZ="${TZ:-America/Sao_Paulo}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-15}"
export PGAPPNAME=jogos-escolares-backup
export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c default_transaction_read_only=on"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
STATE="$BACKUP_DIR/.last-success"

read_state() {
    saved_day= saved_epoch= saved_file= saved_hash=
    [ -r "$STATE" ] || return 1
    IFS='|' read -r saved_day saved_epoch saved_file saved_hash < "$STATE" || return 1
    case "$saved_file" in jogos-escolares-*.dump) ;; *) return 1 ;; esac
    case "$saved_file" in */*) return 1 ;; esac
    case "$saved_epoch" in ''|*[!0-9]*) return 1 ;; esac
    [ -s "$BACKUP_DIR/$saved_file" ] && [ -s "$BACKUP_DIR/$saved_file.sha256" ]
}

health() {
    read_state || return 1
    now=$(date +%s)
    age=$((now - saved_epoch))
    [ "$age" -ge 0 ] && [ "$age" -le 90000 ]
}

backup_due() (
    day=$(date +%F)
    if read_state && [ "$saved_day" = "$day" ]; then return 0; fi
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    name="jogos-escolares-$stamp.dump"
    partial="$BACKUP_DIR/.$name.partial"
    trap 'rm -f "$partial"' EXIT HUP INT TERM
    printf '%s Backup iniciado: %s (%s)\n' "$(date -u +%FT%TZ)" "$day" "$TZ"
    pg_dump --format=custom --file="$partial" || return 1
    [ -s "$partial" ] || return 1
    # Read the whole archive, including compressed table data, without a DB connection.
    pg_restore --file=/dev/null "$partial" || return 1
    mv "$partial" "$BACKUP_DIR/$name"
    (cd "$BACKUP_DIR" && sha256sum "$name" > ".$name.sha256.partial") || return 1
    mv "$BACKUP_DIR/.$name.sha256.partial" "$BACKUP_DIR/$name.sha256"
    hash=$(cut -d ' ' -f 1 "$BACKUP_DIR/$name.sha256")
    epoch=$(date +%s)
    printf '%s|%s|%s|%s\n' "$day" "$epoch" "$name" "$hash" > "$STATE.partial"
    mv "$STATE.partial" "$STATE"
    printf '{"scheduledDay":"%s","timezone":"%s","file":"%s","sha256":"%s","completedAtUTC":"%s"}\n' \
        "$day" "$TZ" "$name" "$hash" "$(date -u +%FT%TZ)" > "$BACKUP_DIR/.latest.json.partial"
    mv "$BACKUP_DIR/.latest.json.partial" "$BACKUP_DIR/latest.json"
    printf '%s Backup validado: %s\n' "$(date -u +%FT%TZ)" "$name"
)

case "${1:-}" in
    --check) health; exit $? ;;
    ''|--once) ;;
    *) echo 'Argumento inválido' >&2; exit 2 ;;
esac
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
if [ "${1:-}" = --once ]; then backup_due; exit $?; fi
while :; do
    if ! backup_due; then
        printf '%s ERRO no backup; nova tentativa no próximo ciclo\n' "$(date -u +%FT%TZ)" >&2
    fi
    sleep "${BACKUP_POLL_SECONDS:-15}"
done
