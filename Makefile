generate:
	npm install -D --unsafe-perm=true --save postcss postcss-cli autoprefixer && cd themes/docsy && git submodule update -f --init && cd ../.. && hugo --gc --minify
