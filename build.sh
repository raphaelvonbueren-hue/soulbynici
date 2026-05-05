#!/bin/sh
# Vercel Build-Step: schreibt config.js mit den Env-Vars
#
# Dieses Skript läuft bei jedem Vercel-Deploy und erzeugt eine
# config.js-Datei aus den Environment Variables, die im
# Vercel-Dashboard gesetzt sind. Damit muss man die Keys NIE wieder
# in der index.html einsetzen.

cat > config.js <<EOF
window.SUPABASE_CONFIG = {
  url: '${SUPABASE_URL}',
  anonKey: '${SUPABASE_ANON_KEY}'
};
EOF

echo "✓ config.js erstellt mit URL: ${SUPABASE_URL}"
