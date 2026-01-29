FROM docker.io/klakegg/hugo:0.111.3-ext-ubuntu as builder

WORKDIR /src
COPY . /src/

# Ensure we're in the right directory for the build
# Disable git info since we don't have .git in the build context
RUN set -x && cd /src && HUGO_ENV=production hugo --gc --minify

FROM docker.io/nginxinc/nginx-unprivileged:1.18-alpine

# Copy static files
COPY --from=builder /src/public/ /usr/share/nginx/html/
COPY --from=builder /src/static/googlea8e04f239c597b8a.html /usr/share/nginx/html/

# Copy nginx configuration
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copy entrypoint script
COPY nginx/relative_redirect.sh /docker-entrypoint.d/
