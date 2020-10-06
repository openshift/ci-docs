generate:
	npm install -D --save postcss postcss-cli autoprefixer && cd themes/docsy && git submodule update -f --init && cd ../.. && hugo --gc --minify
