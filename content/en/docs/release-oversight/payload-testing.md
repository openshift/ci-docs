---
title: "Payload Testing"
description: An overview of payload testing.
---

TRT needs the capability to run [a selected subset of release qualification jobs](https://docs.google.com/document/d/1x-hGyTnWFUuN5UMGdUnL9yK27kIUX31AfOigJrWrc2o/edit?usp=sharing) on selected pull requests in all repositories that contribute to OCP, before they are merged.
The `/payload` command is provided for this purpose.


## Usage
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
