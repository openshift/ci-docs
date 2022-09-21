PDFLATEX := texfot xelatex
ENV := TEXINPUTS=$(TEXINPUTS):../beamer
MAKE_PDF := \
	$(ENV) latexmk \
		--pdflatex='$(PDFLATEX)' \
		--latexoption=--interaction=nonstopmode \
		--latexoption=--halt-on-error \
		--latexoption=--file-line-error \
		--pdf
e2e_tests.pdf: \
	e2e_tests.tex \
	tex/input_images.tex \
	tex/intro.tex \
	tex/pipeline.tex \
	tex/releases.tex \
	tex/test_types.tex \
	../beamer/beamerthemeredhat.sty
e2e_tests.pdf:
	$(MAKE_PDF) $<
.PHONY: clean
clean:
	latexmk -c e2e_tests.tex
	rm -f e2e_tests.{pdf,nav,snm,vrb}
