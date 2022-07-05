#!/bin/bash

GITHUB_REPO=HIP-infrastructure/gateway

[ -z "$GITHUB_TOKEN" ] && echo GITHUB_TOKEN var is missing. Go to https://github.com/settings/tokens && exit 1

git diff --quiet --exit-code
[ $? != 0 ] && echo There is unstaged changes && exit 1

VERSION=v`sed -nr 's/^\s*\"version": "([0-9]{1,}\.[0-9]{1,}.*)",$/\1/p' package.json`
PRE=false

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "master" ]]; then
  PRE=true
  VERSION="$VERSION-pre-release+$(git rev-parse --short HEAD)"
fi

echo "{\"tag_name\":\"$VERSION\", \"prerelease\":$PRE}"

UPLOAD_URL=`curl \
-H "Authorization: token $GITHUB_TOKEN" \
-H "Accept: application/vnd.github.v3+json" \
-d "{\"tag_name\":\"$VERSION\", \"prerelease\":$PRE}" \
https://api.github.com/repos/$GITHUB_REPO/releases` # | grep '"upload_url"' | sed 's/.*"\(https:.*\){.*/\1/'`
[ -z "$UPLOAD_URL" ] && echo Can not get upload url && exit 1
echo $UPLOAD_URL

git tag $VERSION

curl -sH "Authorization: token $GITHUB_TOKEN" -H 'Content-Type: application/octet-stream' --data-binary '@release.tar.gz' ${UPLOAD_URL}?name=release.tar.gz > /dev/null

LATEST_RELEASE_URL=`curl -sH "Authorization: token $GITHUB_TOKEN" https://api.github.com/repos/$GITHUB_REPO/releases/latest | grep '"browser_download_url"' | head -1 | egrep -o 'https.*.gz'`
[ -z "$LATEST_RELEASE_URL" ] && echo Can not get upload url && exit 1

echo Release published at:
echo $LATEST_RELEASE_URL