#!/usr/bin/env bash

set -euo pipefail

cd /home/sentra-core
node deploy/scripts/backup-databases.cjs testing
