FROM registry.access.redhat.com/ubi10/ubi as builder

ARG HUGO_VERSION=0.155.2
ARG ARCH=amd64

WORKDIR /src

RUN dnf install -y golang git nodejs
RUN curl -sL https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_${HUGO_VERSION}_linux-${ARCH}.tar.gz \
  | tar -C /usr/bin -xzf - hugo

COPY . /src/

RUN set -x && HUGO_ENV=production make generate

FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY --from=builder /src/public/ /usr/share/nginx/html/
COPY --from=builder /src/static/googlea8e04f239c597b8a.html /usr/share/nginx/html/
COPY nginx/relative_redirect.sh /docker-entrypoint.d/
