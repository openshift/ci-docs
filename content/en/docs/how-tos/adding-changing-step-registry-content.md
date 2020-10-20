---
title: "Adding and Changing Step Registry Content"
date: 2020-10-05T11:14:39-04:00
draft: false
---

# Adding Content

Adding a new component (step, chain, or workflow) to the registry is quite simple. Descriptions of each of the
components as well as the naming scheme and directory layout is available at the
[Getting Started](/docs/architecture/step-registry/) page. To add a new component, add the new files into the
`ci-operator/step-registry` directory in `openshift/release` following the naming scheme along with an
`OWNERS` file for the new component and open a PR.

Prow will automatically run a few tests on registry components.
* Verify that all required fields are supplied
* Verify that the naming scheme for all components is correct
* Verify that there are no cyclic dependencies (infinite loops) in chains
* Run shellcheck on all shell files used by steps, failing on errors

If a new test is added that uses the new component as well, `pj-rehearse` will test the new job with the new component.

# Changing Content

To change registry content, make the changes in `openshift/release` and open a new PR. Prow will run all of the same
checks on the registry listed in the above “Adding Content” section and run rehearsals for all jobs that use the changed
registry component. The component will require approval and an lgtm from one of the people listed in the `OWNERS` file for
the component, located in the same directory as the component.
