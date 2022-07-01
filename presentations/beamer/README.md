Unofficial Red Hat template for Beamer
======================================

*Warning: programmer art!*

Prerequisites
-------------

Requires the official Red Hat logos and font files, which can be obtained (with
due permission) from:

- https://www.redhat.com/en/about/brand/standards/logo
- https://www.redhat.com/en/about/brand/standards/typography

The following image files are required:

- `img/logo.png`: the regular footline logo.
- `img/logo_white.png`: the white version of the logo, used in the title page.

This theme requires a LaTeX engine which can process TrueType fonts, such as
`xelatex`.  The fonts must be installed in the system.  An easy way to get
started is to place them in `$XDG_DATA_HOME/fonts` and update the font cache
with `fc-cache`.

Usage
-----

To use, simply put it in your TeX input path, e.g.:

    $ TEXINPUTS=$TEXINPUTS:/path/to/this/dir xelatex …

Example document:

    \documentclass[10pt]{beamer}

    \mode<presentation>{
        \usetheme{redhat}
        % …
    }
