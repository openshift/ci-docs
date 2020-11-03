---
title: "Add a job to TestGrid"
date: 2020-10-28T11:14:39-04:00
draft: false
---
This document lays out the process of getting a CI job recorded as blocking or informing a release as well as the process for having job outputs exposed in a TestGrid page. While all jobs that block or inform a release are necessarily exposed in TestGrid pages, it is not required that a job have influence on an OpenShift release for the job's output to be present in a TestGrid overview.
To just understand how a job is added to TestGrid skip to [How do I add a job to TestGrid?](#how-do-i-add-a-job-to-testgrid)

## What is TestGrid?
TestGrid is an aggregator for job results across many runs, allowing us to display test results over time and thus giving an indication of current health, especially in the face of flaky tests. Note that TestGrid exposes job results only from jUnit.

## How can CI Jobs impact the OpenShift release status?
* Blocking jobs are those that ensure compliance to our conformance criteria. These are traditionally the core end-to-end test runs on our major platforms and upgrades from previous versions. 
* Informing jobs are a broader suite that test the variety of enviroments and configurations our customers expect. 
* Broken jobs are those that have a known, triaged failure that prevents their function for a sustained period of time (more than a week).

## When does a job qualify as a release-informing job?
Since release informing jobs get run every time we build a new payload for that release we need to ensure that the given job:
1) is reliable enough to provide a useful signal when it fails
2) covers an important function that determines whether the payload is viable or not, which is not covered by other informing or blocking jobs


## How do I add a job to TestGrid?

#### Adding a release gating job to TestGrid
Release gating jobs are picked up automatically to be added to TestGrid. If the job has already been configured in the release controller nothing further needs to be done. For information on how to configure a job to be release gating refer to [How do I set a job to be release-gating?](#how-do-i-set-a-job-to-be-release-gating)

**Note 1:** If a job in the release definition is an upgrade job it goes into the overall informing dashboard (because upgrades cross dashboards).

**Note 2:** If the release gating job has an entry in the [`_allow-list.yaml`](https://github.com/openshift/release/blob/master/core-services/testgrid-config-generator/_allow-list.yaml) the new entry would override the default on the job. But the override would be invalid if the release gating job is blocking and the annotation is informing.

#### Adding a non-release gating job to TestGrid
If a non-release gating job is added to the [`_allow-list.yaml`](https://github.com/openshift/release/blob/master/core-services/testgrid-config-generator/_allow-list.yaml) it would simply add the job to TestGrid in the specified dashboard.


Refer to the README for the [TestGrid config generator tool](https://github.com/openshift/ci-tools/tree/master/cmd/testgrid-config-generator) for more details regarding how the testgrid-config-generator works.

Once the changes for either the release gating or non release gating jobs have been checked into [`openshift/release`](https://github.com/openshift/release) they should automatically be picked up by the [`periodic-prow-auto-testgrid-generator`](https://prow.ci.openshift.org/?job=periodic-prow-auto-testgrid-generator) job which runs daily. This job creates a PR to merge these changes into the [TestGrid config](https://github.com/kubernetes/test-infra/tree/master/config/testgrids/openshift). 

If the PR is not merged in a timely manner 
1. Search for the PR titled [Update OpenShift testgrid definitions by auto-testgrid-generator job](https://github.com/kubernetes/test-infra/pulls?q=is%3Apr+is%3Aopen+Update+OpenShift+testgrid+definitions+by+auto-testgrid-generator+job) in [`kubernetes/test-infra`](https://github.com/kubernetes/test-infra)
2. Request the assignee to approve the PR


**Note:** Adding a job to the [`_allow-list.yaml`](https://github.com/openshift/release/blob/master/core-services/testgrid-config-generator/_allow-list.yaml) alone does not make it a "true" informing job (it just adds the job to the testgrid). 
A true informing job needs to be in the [release controller config](https://github.com/openshift/release/tree/master/core-services/release-controller/_releases) and the release controller runs the job on new payloads and reports the results. Jobs in the [`_allow-list.yaml`](https://github.com/openshift/release/blob/master/core-services/testgrid-config-generator/_allow-list.yaml) would just run on whatever periodic schedule you configured it for.

## How do I set a job to be release-gating?
* Release gating jobs are configured via the `verify` property in [`_releases/release-*.json`](https://github.com/openshift/release/tree/master/core-services/release-controller/_releases). 
* The `optional` property distinguishes between blocking and informing jobs.

