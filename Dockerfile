FROM klakegg/hugo:0.111.3-ext-ubuntu as builder

COPY . /src/

RUN set -x && HUGO_ENV=production make generate

FROM nginxinc/nginx-unprivileged:1.18-alpine

COPY --from=builder /src/public/ /usr/share/nginx/html/
COPY --from=builder /src/static/googlea8e04f239c597b8a.html /usr/share/nginx/html/
COPY nginx/relative_redirect.sh /docker-entrypoint.d/
