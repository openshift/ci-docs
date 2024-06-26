---
title: "The Technical Release Team"
description: The TRT's role in improving product quality.
---

### Background

The Technical Release Team (TRT) was formed during the OpenShift 4.5 development cycle because our existing signals for product quality were failing us.  Blocker bugs were imprecise and the signal from CI was unclear.  Regressions were slipping through prebsubmit testing, into accepted payloads, and only surfacing much later at which point it was extremely difficult to find the source.

Originally staffed by volunteers from across OpenShift Engineering, with OpenShift 4.10 development it has become a formally staffed team.

### What we do today

The TRT can be thought of as a form of Site Reliability Engineering for OpenShift quality.  Our goal is to ensure the highest sustainable rate of development, but no higher.  We define sustainable as not letting regressions compound and therefore our aim is to catch them as quickly as possible.  In the same way a SRE might need to revert a change or apply a patch to disable a feature in light of an outage, we work with teams to revert changes that can be proven to have introduced a regression. We allow an error budget based on historical pass rates, and once in violation of that budget components are flagged as regressed, alerts start firing, and TRT becomes engaged to attempt to find the source of the problem.

TRT focuses heavily on keeping the Release Controller [Payloads](../payload-testing/) green, which keeps the size of the changelog reasonable and helps us identify and revert new regressions quickly.

TRT also spends a lot of time analyzing CI signal for regressions, and to assist in this we focus heavily on automating analysis and the development of tools like [Sippy](https://sippy.ci.openshift.org/), and alerting ourselves and component teams when problems are detected. See the [tooling](../tooling/) page for a full listing of the various tools we use and/or maintain to help analyze CI signal.

### Revert First, Ask Questions Later

The OpenShift org has agreed to a [revert first](https://github.com/openshift/enhancements/blob/master/enhancements/release/improving-ci-signal.md#quick-revert) policy. When a change has been identified as regressing the product in some significant way, TRT or component teams themselves will revert the change. These changes can be force merged (by overriding all presubmits) if we're reverting the most recent commit in that repo and going back to a known good state.

Teams are asked to then unrevert and resubmit their change, with a separate commit layered on top which addresses the issue.

This takes pressure off everyone quickly, and helps keep the green payloads flowing throughout the org. History has proven that fixing forward often goes wrong and takes more attempts and time than engineering can forsee at the outset.

### Why are regressions happening anyway?  Why not catch them pre-merge?

Whenever possible we hope to catch regressions before merging (see [presubmit testing](../presubmit-testing/)), however there is a large class of regressions that make this financially and computationally infeasible. OpenShift supports many platforms and configurations which we cannot run jobs for on every repo and pull request. Additionally a large subset of regressions are intermittent, they can easily pass on a given run but fail 5-10% of the time (or perhaps 5-10% *worse* than they were previously failing).

These more subtle regressions thus have to be detected and acted on post-merge via [Payload Testing](../payload-testing) and [Component Readiness](../component-readiness/).


