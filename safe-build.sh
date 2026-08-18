#!/bin/bash
# Constroi em .next.new e SO troca a pasta servida se compilar. Build quebrado
# deixa a loja no ar com a versao anterior, em vez de derrubar tudo.
#
# TRAVA (18/08/2026): este script tem DOIS chamadores — o autodeploy, a cada 2
# minutos, e o operador, a mao. Rodando juntos, os dois escrevem no MESMO
# .next.new: um faz `rm -rf` enquanto o outro esta gravando, e o build morre com
#   ENOENT ... .next.new/static/<id>/_buildManifest.js.tmp.xxxx
# que parece bug do Next e nao e. O flock serializa: o segundo espera o
# primeiro terminar em vez de atropelar.
LOCK=/home/ubuntu/.americasim-build.lock
touch "$LOCK" 2>/dev/null
chmod 666 "$LOCK" 2>/dev/null
exec 9>"$LOCK" || exit 1
if ! flock -w 900 9; then
  echo "SAFE-BUILD: outro build segurou a trava por 15 min. Abortando sem mexer em nada."
  exit 1
fi

cd /home/ubuntu/americasim-hub || exit 1
npm install || exit 1
rm -rf .next.new
if BUILD_DIST=.next.new npm run build && [ -f .next.new/BUILD_ID ]; then
  rm -rf .next.old
  [ -d .next ] && mv .next .next.old
  mv .next.new .next
  rm -rf .next.old
  echo "SAFE-BUILD: sucesso — troca feita"
  exit 0
else
  rm -rf .next.new
  echo "SAFE-BUILD: build FALHOU -> .next intacto"
  exit 1
fi
