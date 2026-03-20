#!/bin/sh
# Create runtime env config for the SPA so API base can be set at container start
API_BASE_VAL="${RIGTRACKER_API_BASE:-${VITE_API_BASE:-}}"
cat > /usr/share/nginx/html/env-config.js <<EOF
window.__RIGTRACKER_API_BASE = "${API_BASE_VAL}";
EOF
exec nginx -g 'daemon off;'
