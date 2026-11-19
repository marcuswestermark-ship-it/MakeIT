#!/usr/bin/env bash
# Sparar nyhämtad data till grenen även om andra körningar har sparat under tiden.
# Utgår alltid från senaste versionen av grenen och kopierar in denna körnings filer.
#   WATCHLIST_CHANGED=1  -> denna körning har ändrat aktielistan (add/remove/shares)
set -u
BRANCH="${GITHUB_REF_NAME:?}"
TMP="$(mktemp -d)"
cp -r data "$TMP/"
git config user.name "grangex-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
for i in 1 2 3 4 5; do
  git fetch -q origin "$BRANCH" && git reset -q --hard "origin/$BRANCH"
  mkdir -p data/stocks
  [ "${WATCHLIST_CHANGED:-0}" = "1" ] && cp "$TMP/data/watchlist.json" data/watchlist.json
  ids=$(node -e 'console.log(require("./data/watchlist.json").map(s=>s.id).join(" "))')
  for f in "$TMP"/data/stocks/*.json; do
    id=$(basename "$f" .json)
    case " $ids " in *" $id "*) cp "$f" data/stocks/ ;; esac
  done
  for f in data/stocks/*.json; do
    id=$(basename "$f" .json)
    case " $ids " in *" $id "*) ;; *) git rm -q "$f" ;; esac
  done
  rm -f data/data.json
  git add -A data
  git diff --cached --quiet && exit 0
  git commit -q -m "Uppdatera aktiedata" && git push -q origin "HEAD:$BRANCH" && exit 0
  sleep $((i * 4))
done
exit 1
