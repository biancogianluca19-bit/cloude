#!/bin/sh
# Genera index.html (versión independiente, para GitHub Pages o abrir en el navegador)
# a partir de app.html, que es la misma página publicada como Artifact en claude.ai.
set -e
cd "$(dirname "$0")"
{
  printf '<!doctype html>\n<html lang="es-AR">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  printf '<meta name="theme-color" content="#EDF0EE">\n'
  printf '<style>html,body{margin:0}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}[hidden]{display:none!important}</style>\n'
  printf '</head>\n<body>\n'
  cat app.html
  printf '\n</body>\n</html>\n'
} > index.html
echo "index.html generado"
