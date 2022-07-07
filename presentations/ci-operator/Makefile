PDFLATEX := texfot xelatex
ENV := TEXINPUTS=$(TEXINPUTS):../beamer
MAKE_PDF := \
	$(ENV) latexmk \
		--pdflatex='$(PDFLATEX)' \
		--latexoption=--interaction=nonstopmode \
		--latexoption=--halt-on-error \
		--latexoption=--file-line-error \
		--pdf
ci-operator.pdf: \
	ci-operator.tex \
	../beamer/beamerthemeredhat.sty \
	tex/history.tex \
	tex/motivation.tex \
	tex/arch/overview.tex \
	tex/arch/initialization.tex \
	tex/arch/job.tex \
	tex/etc.tex
ci-operator.pdf:
	$(MAKE_PDF) $<
.PHONY: clean
clean:
	latexmk -c ci-operator.tex
	rm -f ci-operator.{pdf,nav,snm,vrb}
