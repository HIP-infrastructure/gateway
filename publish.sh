#!/usr/bin/env bash

set -e

# Set the current directory to be shared in the docker tools container
TOOLS="docker run --rm -v $(pwd):/usr/src/app -w /usr/src/app node:lts "


# git porcelain: All changes must be commited
echo
echo "Testing for uncommited files"
count=$($TOOLS git status --porcelain | wc -l)
if test $count -gt 0; then
  $TOOLS git status
  echo "Repository dirty. Exiting..."
  # exit 1
fi

# npm lint - code must not have errors (warnings are ok)
# npm test - tests must pass
# echo
# echo "Running tests"
# $TOOLS npm ci-test

PACKAGE_VERSION=$($TOOLS node -p -e "require('./package.json').version")

echo
echo "Increment version number (see semver.org)"
echo "Current version: " $PACKAGE_VERSION
echo
echo "  1) major"
echo "  2) minor"
echo "  3) patch"

read n
case $n in
1) VERSION="major" ;;
2) VERSION="minor" ;;
3) VERSION="patch" ;;
*)
  echo "invalid option, exiting..."
  exit 1
  ;;
esac

$TOOLS npm version --no-git-tag-version $VERSION
INCREMENTED_VERSION=$($TOOLS node -p -e "require('./package.json').version")

echo "Incremented version ($VERSION):$INCREMENTED_VERSION"
echo

# Build
echo "Build the project..."
docker build  \
    --no-cache \
    -t hip/gateway:$INCREMENTED_VERSION  .


docker tag hip/gateway:$INCREMENTED_VERSION hip/gateway:latest

echo
echo "Built"
echo "hip/gateway:$INCREMENTED_VERSION"
echo "hip/gateway:latest"

# echo `docker scan "hip/gateway:latest"`

# echo
# echo "Git tag gateway:$INCREMENTED_VERSION"
# $TOOLS git commit -a -m "Bumped version to $INCREMENTED_VERSION"
# $TOOLS  git tag $INCREMENTED_VERSION
# $TOOLS git push --tags

# echo
# echo "Push hip/gateway:$INCREMENTED_VERSION on repo"
# docker push hip/gateway:$INCREMENTED_VERSION
# docker push hip/gateway:latest

# echo
# echo "Pushed"
# echo "hip/gateway:$INCREMENTED_VERSION"
# echo "hip/gateway:latest"