#!/bin/bash

while true; do
  echo "Starting with code built on $(cat date.txt)"
  START=$(date +%s)
  node ./index.js
  STOP=$(date +%s)
  if [[ $(($STOP - $START)) -lt 20 ]]; then
    echo "re-starting too quickly ($STOP - $START) -- exiting"
    exit 1
  fi
done
