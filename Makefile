generate:
	npm install -D --unsafe-perm=true --save postcss postcss-cli autoprefixer && (cd themes/docsy && git submodule update -f --init || echo "Submodule already initialized or not a git repo") && hugo --gc --minify
