#!/usr/bin/env bash

pushd() {
  command pushd "$@" > /dev/null
}

popd() {
  command popd "$@" > /dev/null
}

greenecho() {
  local text=$1
  echo -e "\033[1;32m${text}\033[0m"
}

redecho() {
  local text=$1
  echo -e "\033[1;31m${text}\033[0m"
}

