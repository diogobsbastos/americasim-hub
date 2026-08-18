#!/bin/bash
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
