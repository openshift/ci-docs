FROM klakegg/hugo:0.111.3-ext-ubuntu as builder

COPY . /src/

RUN set -x && make generate

FROM nginxinc/nginx-unprivileged:1.18-alpine

COPY --from=builder /src/public/ /usr/share/nginx/html/
COPY nginx/relative_redirect.sh /docker-entrypoint.d/
