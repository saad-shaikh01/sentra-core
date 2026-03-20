#!/usr/bin/env bash

set -euo pipefail

cd /home/sentra-live
node deploy/scripts/backup-databases.cjs live
