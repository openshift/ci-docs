---
title: "Risk Analysis"
description: Overview of Test Failure Risk Analysis.
---

### Summary
In an effort to raise awareness for potential regressions, 
tooling to analyze the overall risk for individual test failures has been created.  Risk 
Analysis compares failed tests against the historical results of similar periodics and 
ranks the 'Risk of Regression' based on the previous results. It **does not** analyze the code changed in a PR or payload. It 
does consider the historical pass rate for failed tests 
and provides a ranking based on that pass rate.  The motivation for the tooling is to help raise awareness 
for test failures that historically are considered stable and are worth an additional review when failures are encountered.

### Analyzing Risk of Test Failures
Risk Analysis takes a closer look within jobs at the individual tests.  A 
job that is not required for presubmits or may fail more frequently than others can still provide signal for potential regression if a test, or tests, 
that regularly succeed start to show failures.

As e2e tests complete, origin based 
[test failures are summarized](https://github.com/openshift/origin/blob/798a6eaf2327ecccf8f81c3a18127156aea72bd3/pkg/riskanalysis/write_test_failure_summary.go#L19) 
for later evaluation. When 
[openshift-e2e-test jobs complete](https://github.com/openshift/release/blob/fb6ba3c103e477a74bdf0d5faab5bb13cb1556af/ci-operator/step-registry/openshift/e2e/test/openshift-e2e-test-commands.sh#L45) 
the summaries are passed to 
[Sippy for analysis](https://github.com/openshift/sippy/blob/376a0be3595f7f5ddda90e5f8834293ab93277e5/pkg/sippyserver/server.go#L1033).



The test failures are submitted to Sippy along with metadata about the job itself.  That 
data is used to find matching jobs within Sippy and analyze the historical pass rates, 
typically over a 7 to 14 day period. The 
higher the historical pass rate the higher the potential risk of regression.

| Historical Pass Rate % | Risk Analysis Ranking |
| :---: | :---: |
| 100 - 98 | High |
| 97 - 80 | Medium | 
| < 80 | Low |


<br><br>
### Prow Job Artifacts ###
Artifacts are created under the e2e test junit directory like `test-failures-summary_20230706-065159.json` and the final 
analysis `test-risk-analysis.html`.  When available, the `test-risk-analysis.html` 
summarization will show in the prow job spyglass view under the `Risk Analysis` 
heading.  The view will show the Test Name, Risk Level, Risk Reason and 
Open Bugs.  At the top of the table the Test Name `Overall` will 
show the highest risk value.  The Open Bugs 
are listed to surface any known issues with the test that may be impacting the results.  Additionally,
 a link to Sippy is provided at the top of the section to aid in further investigation. If your job is not run by a step that includes 
 the Risk Analysis artifacts generation, or the junits fail to run, the Risk Analysis artifacts will not be present.

<br><br>
Link to Sippy
| Test Name	| Risk Level |	Risk Reason | Open Bugs |
| :--- | :---: | :--- | :--- |
|Overall	|High	| Maximum failed test risk: High | |
|[bz-DNS][invariant] alert/KubePodNotReady should not be at or above info in ns/openshift-dns |	High | This test has passed 100.00% of 928 runs on jobs ['periodic-ci-openshift-release-master-ci-4.14-upgrade-from-stable-4.13-e2e-azure-sdn-upgrade'] in the last 14 days. | |

<br><br>
If there are too many test failures the Overall Risk Level will be High with a message showing the number of failed tests.  
| Test Name	| Risk Level |	Risk Reason | Open Bugs |
| :--- | :---: | :--- | :--- |
|Overall	|High	| 53 tests failed in this run: High | |

<br><br>
If there are too few tests run, 
compared to historical runs, a message indicating IncompleteTests will be 
shown.
| Test Name	| Risk Level |	Risk Reason | Open Bugs |
| :--- | :---: | :--- | :--- |
|Overall	|High	| Tests for this run (47) are below the historical average (1432): IncompleteTests| |

<br><br>
### PR Commenting ###
For repos with Risk Analysis PR commenting enabled, 
a comment will be added to the PR ranking the 
failure risk for each job with an associated risk once all of the current jobs complete.  
The comment contains the sha that is associated with the job runs and 
lists the Job Names (as a link to the job run results) ranking them by Failure Risk from high to 
low. Each job row will contain the test failures that match the overall risk level for that 
job, the risk reason for each test failure and any known bugs associated with the test.

In an effort to reduce flagging flaky tests, PR Commenting will only include tests that have failed in consecutive jobs.

<br><br>
Job Failure Risk Analysis for sha: 79d237196d93eb92ed58c66497d8718259264226

| Job Name | Failure Risk |
|:---|:---|
|[pull-ci-openshift-origin-master-e2e-gcp-ovn-upgrade](https://prow.ci.openshift.org/view/gs/origin-ci-test/pr-logs/pull/28075/pull-ci-openshift-origin-master-e2e-gcp-ovn-upgrade/1682395379418533888)|<b>High</b><br>[sig-api-machinery] disruption/cache-oauth-api connection/reused should be available throughout the test:<br>This test has passed 99.88% of 827 runs on jobs ['periodic-ci-openshift-release-master-nightly-4.14-e2e-gcp-ovn-upgrade' 'periodic-ci-openshift-release-master-ci-4.14-e2e-gcp-ovn-upgrade'] in the last 14 days.|
|[pull-ci-openshift-origin-master-e2e-metal-ipi-ovn-ipv6](https://prow.ci.openshift.org/view/gs/origin-ci-test/pr-logs/pull/28075/pull-ci-openshift-origin-master-e2e-metal-ipi-ovn-ipv6/1682395380257394688)|<b>Low</b><br>[sig-network][Feature:vlan] should create pingable pods with macvlan interface on an in-container master [apigroup:k8s.cni.cncf.io] [Suite:openshift/conformance/parallel]:<br>This test has passed 72.09% of 43 runs on jobs ['periodic-ci-openshift-release-master-nightly-4.14-e2e-metal-ipi-ovn-ipv6'] in the last 14 days.<br>---<br>[sig-cli] oc idle [apigroup:apps.openshift.io][apigroup:route.openshift.io][apigroup:project.openshift.io][apigroup:image.openshift.io] by name [Suite:openshift/conformance/parallel]:<br>This test has passed 72.09% of 43 runs on jobs ['periodic-ci-openshift-release-master-nightly-4.14-e2e-metal-ipi-ovn-ipv6'] in the last 14 days.<br><br>Open Bugs<br>https://issues.redhat.com/browse/OCPBUGS-6586<br>---<br>[sig-network][Feature:tuning] pod should start with all sysctl on whitelist [apigroup:k8s.cni.cncf.io] [Suite:openshift/conformance/parallel]:<br>This test has passed 72.09% of 43 runs on jobs ['periodic-ci-openshift-release-master-nightly-4.14-e2e-metal-ipi-ovn-ipv6'] in the last 14 days.<br>---<br>[sig-network][Feature:bond] should create a pod with bond interface [apigroup:k8s.cni.cncf.io] [Suite:openshift/conformance/parallel]:<br>This test has passed 72.09% of 43 runs on jobs ['periodic-ci-openshift-release-master-nightly-4.14-e2e-metal-ipi-ovn-ipv6'] in the last 14 days.|

<br><br>
The job name links can be used to review the failures to further analyze if the changes within the PR might be impacting the test failures. 

<br><br>
### How to use Risk Analysis ###
Risk Analysis is not intended to indicate a particular code change 
or set of code changes is the source of regression, 
it is intended to raise awareness that the risk of regression may be 
elevated based on the failures of tests that consistently pass at a high rate.  You 
can use Risk Analysis as a guide to identify jobs to investigate closer to see if the failures may be related to recent changes.