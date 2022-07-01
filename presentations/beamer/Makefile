PDFLATEX := xelatex
ENV := TEXINPUTS=$(TEXINPUTS):$(PWD)
MAKE_PDF := $(ENV) latexmk --pdflatex='$(PDFLATEX)' --pdf
example.pdf: example.tex
example.pdf:
	$(MAKE_PDF) $<
.PHONY: clean
clean:
	latexmk -c example.tex
	rm -f example.{pdf,nav,snm,vrb}
