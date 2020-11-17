---
title: "Examples"
date: 2020-10-05T11:14:39-04:00
draft: false
---

# How do I add a job that runs the OpenShift end-to-end conformance suite on AWS?

Use the [`openshift-e2e-aws`](https://steps.ci.openshift.org/workflow/openshift-e2e-aws) workflow and set
`cluster_profile` to `aws`.

{{< highlight yaml >}}
- as: e2e-steps
  steps:
    cluster_profile: aws
    workflow: openshift-e2e-aws
{{< / highlight >}}

# How do I use an image from another repo in my repo’s tests?

In order to use an image from one repository in the tests of another, it is necessary to first publish the image from
the producer repository and import it in the consumer repository. Generally, a central `ImageStream` is used for
continuous integration; a repository opts into using an integration stream with the `tag_specification` field in the
`ci-operator` configuration and opts into publishing to the stream with the `promotion` field.

## Publishing an Image For Reuse

When configuring `ci-operator` for a repository, the `promotion` stanza declares which container `images` are published and
defines the integration `ImageStream` where they will be available. By default, all container `images` declared in the
`images` block of a `ci-operator` configuration are published when a `promotion` stanza is present to define the integration
`ImageStream`. Promotion can be furthermore configured to include other `images`, as well. In the following `ci-operator`
configuration, the following `images` are promoted for reuse by other repositories to the `ocp/4.4` integration `ImageStream`:

* the `pipeline:src` tag, published as `ocp/4.4:repo-scripts` containing the latest version of the repository to allow for executing helper scripts
* the `pipeline:test-bin` tag, published as `ocp/4.4:repo-tests` containing built test binaries to allow for running the repository's tests
* the `stable:component` tag, published as `ocp/4.4:component` containing the component itself to allow for deployments and installations in end-to-end scenarios

`ci-operator` configuration:
{{< highlight yaml >}}
test_binary_build_commands: go test -race -c -o e2e-tests # will create the test-bin tag
promotion:
  additional_images:
    repo-scripts: src    # promotes "src" as "repo-scripts"
    repo-tests: test-bin # promotes "test-bin" as "repo-tests"
  namespace: ocp
  name: 4.4
images:
- from: ubi8
  to: component # promotes "component" by default
  context_dir: images/component
{{< / highlight >}}

## Consuming an Image

Once a repository is publishing an image for reuse by others, downstream users can configure `ci-operator` to use that
image in tests by including it as a base_image or as part of the `tag_specification`. In general, `images` will be available
as part of the `tag_specification` and explicitly including them as a base_image will only be necessary if the promoting
repository is exposing them to a non-standard `ImageStream`. Regardless of which workflow is used to consume the image,
the resulting tag will be available under the stable `ImageStream`. The following `ci-operator` configuration imports a
number of `images`:

* the `stable:custom-scripts` tag, published as `myregistry.com/project/custom-scripts:latest`
* the `stable:component` and `:repo-{scripts|tests}` tags, by virtue of them being published under `ocp/4.4` and brought in with the `tag_specification`

`ci-operator` configuration:
{{< highlight yaml >}}
base_images:
  custom-scripts:
    namespace: project
    name: custom-scripts
    tag: latest
tag_specification:
  namespace: ocp
  name: 4.4
{{< / highlight >}}

Once the image has been configured to be an input for the repository's tests in the `ci-operator` configuration, either
explicitly as a `base_image` or implicitly as part of the `tag_specification`, it can be used in tests in one of two ways. A
registry step can be written to execute the shared tests in any `ci-operator` configuration, or a literal test step can be
added just to one repository's configuration to run the shared tests. Two examples follow which add an execution of
shared end-to-end tests using these two approaches. Both examples assume that we have the ipi workflow available to use.

### Adding a Reusable Test Step

Full directions for adding a new reusable test step can be found in the overview for [new registry
content](/docs/how-tos/adding-changing-step-registry-content/#adding-content). An example of the process is provided
here. First, `make` directory for the test step in the registry: `ci-operator/step-registry/org/repo/e2e`.

Then, declare a reusable step: `ci-operator/step-registry/org/repo/e2e/org-repo-e2e-ref.yaml`
{{< highlight yaml >}}
ref:
  as: org-repo-e2e
  from: repo-tests
  commands: org-repo-e2e-commands.sh
  resources:
    requests:
      cpu: 1000m
      memory: 100Mi
  documentation: |-
    Runs the end-to-end suite published by org/repo.
{{< / highlight >}}

Finally, populate a command file for the step: `ci-operator/step-registry/org/repo/e2e/org-repo-e2e-commands.sh`
{{< highlight bash >}}
#!/bin/bash
e2e-tests # as built by go test -c
{{< / highlight >}}

Now the test step is ready for use by any repository. To `make` use of it, update `ci-operator` configuration for a separate
repository under `ci-operator/config/org/other/org-other-master.yaml`:

{{< highlight yaml >}}
- as: org-repo-e2e
  steps:
    `cluster_profile`: aws
    workflow: ipi
    test:
    - ref: org-repo-e2e
{{< / highlight >}}

### Adding a Literal Test Step

`ci-operator` configuration:
{{< highlight yaml >}}
- as: repo-e2e
  steps:
   cluster_profile: aws
    workflow: ipi
    test:
    - as: e2e
      from: repo-tests
      commands: |-
        #!/bin/bash
        e2e-tests # as built by go test -c
      resources:
        requests:
          cpu: 1000m
          memory: 2Gi
{{< / highlight >}}
