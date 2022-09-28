#!/usr/bin/env bash

docker exec --user www-data:www-data cron php occ files:scan $1