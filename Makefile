generate:
	npm install --save-dev postcss postcss-cli autoprefixer && git submodule update -f --init && hugo --gc --minify
image:
	podman build -t ci-docs -f Dockerfile .	
