#!/bin/sh
set -e

host="${MATOMO_PUBLIC_HOST:-}"
if [ -z "$host" ] && [ -n "${PUBLIC_MATOMO_URL:-}" ]; then
	host=$(printf '%s' "$PUBLIC_MATOMO_URL" | sed -E 's#^https?://##; s#[/?].*##')
fi

config="/var/www/html/config/config.ini.php"
if [ -n "$host" ] && [ -f "$config" ]; then
	if ! grep -Fq "trusted_hosts[] = \"$host\"" "$config"; then
		printf '\n[General]\ntrusted_hosts[] = "%s"\n' "$host" >> "$config"
	fi
fi

exec apache2-foreground
