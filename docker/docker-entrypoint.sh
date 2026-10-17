#!/bin/sh
set -e

# Create runtime env config for the SPA so API base can be set at container start
API_BASE_VAL="${RIGTRACKER_API_BASE:-${VITE_API_BASE:-}}"
cat > /usr/share/nginx/html/env-config.js <<EOF
window.__RIGTRACKER_API_BASE = "${API_BASE_VAL}";
EOF

# Start the Node server in background.
# Build output may be at dist/main.js or dist/src/main.js depending on TS config.
if [ -f dist/main.js ]; then
	NODE_ENTRYPOINT="dist/main.js"
else
	NODE_ENTRYPOINT="dist/src/main.js"
fi

node "$NODE_ENTRYPOINT" &
NODE_PID=$!

# Wait for Node server to accept HTTP connections (timeout 60s)
SECS=0
MAX=60
echo "Waiting for Node server to become available on 127.0.0.1:4000..."
until curl -sSf http://127.0.0.1:4000/api/auth/me >/dev/null 2>&1 || [ $SECS -ge $MAX ]; do
	sleep 1
	SECS=$((SECS+1))
done
if [ $SECS -ge $MAX ]; then
	echo "Warning: Node server did not respond after ${MAX}s — starting nginx anyway"
else
	echo "Node server is responding after ${SECS}s"
fi

# Remove Debian default site to avoid duplicate default_server errors
# remove both the symlink in sites-enabled and the file in sites-available if present
if [ -e /etc/nginx/sites-enabled/default ]; then
	echo "Removing /etc/nginx/sites-enabled/default"
	rm -f /etc/nginx/sites-enabled/default || true
fi
if [ -e /etc/nginx/sites-available/default ]; then
	echo "Removing /etc/nginx/sites-available/default"
	rm -f /etc/nginx/sites-available/default || true
fi

# Test nginx configuration and start nginx in foreground
if nginx -t >/dev/null 2>&1; then
	nginx -g 'daemon off;'
else
	echo "nginx configuration test failed"
	tail -n +1 /var/log/nginx/error.log || true
	exit 1
fi
