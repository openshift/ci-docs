---
title: "Migrating to HyperShfit FAQ"
description: FAQ on migrating CI tests from use regular AWS clusters to HyperShift clusters.
---
This documents is an FAQ for migrating CI tests from use regular AWS clusters to HyperShift clusters.

## Where is the workflow?
Check the [hypershift-hostedcluster-workflow](https://steps.ci.openshift.org/workflow/hypershift-hostedcluster-workflow) in step-registry.

## What does the workflow do?
The workflow we are providing will create a hosted cluster from DPTP-managed HyperShift deployment.

## Who can use it?
Anyone who just want a cluster in AWS.

## Who may not use it?
Anyone who is developing and testing OCP components, except `console` and `monitoring`.

## What are the benefits?
1. Faster than installing a cluster in AWS. The cluster can usually be ready in ~15min.
2. More cost-effective. Instances only for workers are created in the cloud. The masters are running as pods in the management cluster.

## Which version of OpenShift is supported?
4.12.z to 4.13 master

## I am using `ipi-aws` workflow to install new clusters in AWS. How difficult is migration?
`hypershift-hosted-workflow` should serve as a drop-in replacement for your existing `ipi-aws` in many cases. Simply replace `workflow: ipi-aws` to `hypershift-hostedcluster-workflow` and set up the environment variables, including `HYPERSHIFT_BASE_DOMAIN` and `HYPERSHIFT_HC_RELEASE_IMAGE` and you should be good to go. A full list of environment variables can be find in [step-registry](https://steps.ci.openshift.org/workflow/hypershift-hostedcluster-workflow). An example of using this workflow is [Cluster Bot](https://github.com/openshift/release/blob/0a138aca8cc8d99ee84d15cdee71b266355bbd55/ci-operator/jobs/openshift/release/openshift-release-infra-periodics.yaml#L2300)

## I have questions. Who shall I contact?
On Slack #forum-testplatform. Make sure you mention DPTP's HyperShift workflow.
