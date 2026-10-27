#!/bin/sh
set -eu
superset db upgrade
superset init
python /app/bootstrap.py
