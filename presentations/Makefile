PDFLATEX := texfot xelatex
ENV := TEXINPUTS=$(TEXINPUTS):../beamer
MAKE_PDF := \
	$(ENV) latexmk \
		--pdflatex='$(PDFLATEX)' \
		--latexoption=--interaction=nonstopmode \
		--latexoption=--halt-on-error \
		--latexoption=--file-line-error \
		--pdf
$(OUTPUT).pdf:
	$(MAKE_PDF) $<
.PHONY: clean
clean:
	latexmk -c $(OUTPUT).tex
	rm -f $(OUTPUT).{pdf,nav,snm,vrb}
