#!/bin/sh
set -eu

sed -i \
    '/server_name\s\+localhost;/a\    absolute_redirect off;' \
    /etc/nginx/conf.d/default.conf
