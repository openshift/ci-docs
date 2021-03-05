---
title: "Centralized Release Branching and Config Management"
description: How OCP component repositories have their content and configuration managed centrally.
---

# Motivation
The number of repositories and branches involved in assembling an OpenShift release (meaning here a colloquialism, more than the strict set of repositories needed to build the images in a release payload) is large. These repositories need to move at the same cadence and branch and configure at the same cadence when release cuts are made. DPTP owns the tooling that makes these cuts simple.

# Frequently Asked Questions
## Where can I see official dates for branch cut-overs?
Use [this spreadsheet](https://docs.google.com/spreadsheets/u/1/d/19bRYespPb-AvclkwkoizmJ6NZ54p9iFRn6DGD8Ugv2c/edit#gid=0) to view the planned dates but be advised that they may slip, so keep an eye out on the aos-devel mailing list as well.

## How do I opt my repository into automated branching?
Ensure that the promotion stanza in your `ci-operator` configuration is pointing to the latest OCP release. For example:

{{< highlight yaml >}}
promotion:
  namespace: ocp
  name: 4.3
{{< / highlight >}}

## Why are there future release branches on my repository?
DPTP will create release branches for future versions ahead of time so that ART and others may use them for building artifacts. These branches are frozen and should not be touched.

## Why is there an issue created by `openshift-merge-robot` on my repository?
DPTP will create an issue with a title like “Future Release Branches Frozen For Merging | branch:release-4.1” on every repository we create branches on. These issues ensure that branches which are fast-forwarded do not allow merges. There is nothing you need to do for this issue, but please keep it open.

## Do I need to update release branches manually?
No, while a release branch is inactive it will be fast-forwarded automatically every hour. Please view the job overview page to see logs and debug if you feel that fast-forwarding is not happening correctly.

## When a release branch is opened for backports, is the development branch open for the next version?
Yes. When final freeze happens for release X.Y, the release branch for that version opens for backports and the development branch begins to accumulate features for X.Y+1.

## Do I need to make sure branched CI Operator configs are up to date for release branches?
No. When the branch is cut and goes live, the current CI Operator configuration for the development branch is used to seed the configuration for the release branch. These are not DRY intentionally to allow for drift between CI for branches.
