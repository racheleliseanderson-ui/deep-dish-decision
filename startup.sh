#!/bin/sh
# Revive contract: start the app on 0.0.0.0:8080 via npm run dev if it is down.
set -eu
cd /workspace
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >/tmp/deepdish-dev.log 2>&1 &
# Wait briefly for listen without blocking the revive script.
i=0
while [ "$i" -lt 40 ]; do
  if curl -sf -o /dev/null --max-time 1 http://127.0.0.1:8080/; then
    exit 0
  fi
  i=$((i + 1))
  sleep 0.25
done
exit 0
