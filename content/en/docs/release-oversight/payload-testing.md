---
title: "Payload Testing"
description: An overview of payload testing.
---

TRT needs the capability to run [a selected subset of release qualification jobs](https://docs.google.com/document/d/1x-hGyTnWFUuN5UMGdUnL9yK27kIUX31AfOigJrWrc2o/edit?usp=sharing) on selected pull requests in all repositories that contribute to OCP, before they are merged.
The `PullRequestPayloadQualificationRun` CRD and the `/payload` command is provided for this purpose.


## Usage

### Payload Command
Any collaborator of the GitHub OpenShift organization can issue the command on a pull request to a branch of a repository of the organization that contributes to OpenShift official images:

> /payload <ocp_version> <ci|nightly> <informing|blocking>

For example, if `/payload 4.10 nightly informing` is issued on a PR, the robot will reply the list of the triggered jobs:

![payload command](/payload-cmd.png)

The jobs triggered by the command are determined by [OpenShift Release Controllers](/docs/getting-started/useful-links/#services).
The linked page from [payload-tests portal](https://pr-payload-tests.ci.openshift.org/runs/) at the bottom of the comment shows the status of the payload testing and the details of those jobs.

A particular job or set of jobs can be triggered by `/payload-job`, such as

> /payload-job <periodic_ci_openshift_release_some_job> <periodic_ci_openshift_release_another_job>

A job can be executed more than once by a single `/payload-aggregate` command, e.g, 

> /payload-aggregate <periodic_ci_openshift_release_some_job> <aggregated_count>

#### Abort all Payload Jobs
It is possible to quickly abort all running payload jobs for a specific PR. Simply comment `/payload-abort` on the PR to do so.

### Manually Submitting a `PRPQR`
It is also possible to manually create a `PullRequestPayloadQualificationRun` instance without using the `payload` command.
This allows for additional options to be supplied that are currently not possible via the command.

#### Supplying Multiple PRs from Component Repositories
The `ci-operator` can assemble a release payload by building and using images from multiple PRs in distinct OCP component repos.
In order to do this, refs for each PR must be provided in the `PRPQR` spec:
```yaml
apiVersion: ci.openshift.io/v1
kind: PullRequestPayloadQualificationRun
metadata:
  name: multiple-pr-payload-test
  namespace: ci
spec:
  jobs:
    ...
  pullRequests:
    - baseRef: master
      baseSHA: 270de19d62fc7275f22de22a7eca270bd77dd05d
      org: openshift
      pr:
        author: developer
        number: 1575
        sha: c9817bfb09b48bc84ef20a1cf5a01cac36c2687d
        title: 'A Pull Request'
      repo: kubernetes
    - baseRef: master
      baseSHA: dcf812295b06c9463cb7c8d8126a337334049234
      org: openshift
      pr:
        author: developer
        number: 7640
        sha: 7d5da4ce183886b6de33172e7af2a01ca2e46708
        title: 'Another Pull Request'
      repo: installer
...
```
{{% alert title="NOTE" color="warning" %}}
It is currently not possible to assemble the payload from multiple PRs in the same repository. This feature will be available at a later date.
{{% /alert %}}
