# Openshift CI docs

This repository holds the content of the Openshift CI documentation at https://docs.ci.openshift.org/

## Development

1. Clone the repository including submodules: `git clone --recursive git@github.com:openshift/ci-docs.git`. NOTE: Git submodules must be fully cloned for the server to work. If you've already cloned the repository without submodules, run `git submodule update --init --recursive --depth 1`. 
1. Install the extended version of hugo as described [here](https://gohugo.io/getting-started/installing/). Generally, installing the extended binary from their [releases](https://github.com/gohugoio/hugo/releases) page is the best option. 
1. Start the hugo server via `hugo server`
1. Edit content and watch your changes live at http://localhost:1313/
