---
title: "Centralized Release Branching and Config Management"
description: How OCP component repositories have their content and configuration managed centrally.
---

# Motivation
The number of repositories and branches involved in assembling an OpenShift release (meaning here a colloquialism, more than the strict set of repositories needed to build the images in a release payload) is large. These repositories need to move at the same cadence and branch and configure at the same cadence when release cuts are made. DPTP owns the tooling that makes these cuts simple.

# Branching Phases
Every OCP release travels through four phases - normal development, feature freeze, code freeze, and general availability. This section details what to expect from each of these phases and the types of merge requirements that exist for PRs in each phase.

## Normal Development For 4.x Release
During normal development, active development branches are open to all changes.

|*Branch*|*Promotes To*|*Merge Criteria*|*Fast-Forwarded?*|
|-|-|-|-|
|`master/main`|`ocp/4.x`|`lgtm`, `approved`|no|
|`release-4.x-n`|`ocp/4.x-n`|`lgtm`, `approved`, `bugzilla/valid-bug`, `cherry-pick-approved`|no|
|`release-4.x`|nowhere|merges blocked|yes|
|`release-4.x+1`|`ocp/4.x+1`|merges blocked|yes|

## Feature Freeze For 4.x Release
During feature freeze, the expectation is that merges to the active development branch are fixing bugs, so we require that all PRs that land have a valid bug label.

|*Branch*|*Promotes To*|*Merge Criteria*|*Fast-Forwarded?*|
|-|-|-|-|
|`master/main`|`ocp/4.x`|`lgtm`, `approved`, `bugzilla/valid-bug`|no|
|`release-4.x-n`|`ocp/4.x-n`|`lgtm`, `approved`, `bugzilla/valid-bug`, `cherry-pick-approved`|no|
|`release-4.x`|nowhere|merges blocked|yes|
|`release-4.x+1`|`ocp/4.x+1`|merges blocked|yes|

## Code Freeze For 4.x Release
During code freeze, the active development branch opens to contributions that target the future release. Contributions to the release branch require group lead approval as they’re landing so close to the moment we are publishing the release publicly.

|*Branch*|*Promotes To*|*Merge Criteria*|*Fast-Forwarded?*|
|-|-|-|-|
|`master/main`|`ocp/4.x+1`|`lgtm`, `approved`|no|
|`release-4.x-n`|`ocp/4.x-n`|`lgtm`, `approved`, `bugzilla/valid-bug`, `cherry-pick-approved`|no|
|`release-4.x`|`ocp/4.x`|`lgtm`, `approved`, `bugzilla/valid-bug`, `group-lead-approved`|yes|
|`release-4.x+1`|nowhere|merges blocked|yes|

## General Availability For 4.x Release
After a release is generally available, we do not require group lead approval any longer for cherry-picks to that release. The release branch is no different from any others. This is the same as the normal development phase for the 4.x+1 release.

|*Branch*|*Promotes To*|*Merge Criteria*|*Fast-Forwarded?*|
|-|-|-|-|
|`master/main`|`ocp/4.x+1`|`lgtm`, `approved`|no|
|`release-4.x-n`|`ocp/4.x-n`|`lgtm`, `approved`, `bugzilla/valid-bug`, `cherry-pick-approved`|no|
|`release-4.x`|`ocp/4.x`|`lgtm`, `approved`, `bugzilla/valid-bug`, `cherry-pick-approved`|no|
|`release-4.x+1`|nowhere|merges blocked|yes|


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
