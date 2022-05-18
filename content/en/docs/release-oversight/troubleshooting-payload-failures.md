---
title: "Troubleshooting Payload Failures"
description: A guide to tools and strategies used to diagnose payload failures.
---

### Problem Statement
There is a lot of data collected during payload testing and multiple tools to assist in analyzing that data.
We can't expect 'always passing' tests in an eventually consistent distributed environment so what we look for
is a change in the signals generated over multiple (aggregated) runs.  When we see a failure we want to check to
see if the cause is identifiable.  If it isn't clear then we need to review the trends for the failure and then
take a deeper dive into the data collected. However, the data is not complete and some tools are better at capturing & analyzing particular types or subsets of data than others.
Additionally, with the number of jobs, job failures and individual tests it can be hard to determine how / where to start.
There is no step by step guide but we hope to document the benefits of the tools we have available and approaches to help investigate payload failures.

### Description of Tools and Usages
Typically when analyzing individual prow runs there are currently 
3 tools listed at the top of the job as well as additional
tools to check for larger trends related to tests, errors and events.

- Loki - Grafana logging stack allowing you search logs and narrow time ranges.  This contains ephemeral pod logs that are not present in the must-gather or gather-extra artifacts collected at the end of the CI run,  as well as the kubelet journal logs found under gather-extra and others to aid in searching.

- KaaS - Representation of the last known state of the cluster.  Can be useful for navigating the cluster via `oc` or `k9s` and interrogating namespaces, logs, etc.


- PromeCIeus - Metrics from the cluster during the test run loaded in Prometheus.


- [CI Search](https://search.ci.openshift.org/) - If you have found a particular log entry or test failure and want to search bugs and other junit runs to find:
    - How frequently does it occur
    - Did it start or spike recently
    - Is there an open bug against it <br><br>

- [Sippy](https://sippy.dptools.openshift.org/sippy-ng/) - One of our primary tools for locating top failing jobs and tests, determining how often they are failing, on which variants, and when the problems started. You can filter by Release, Job, or Test as well as variants like platform, network, etc. Also stores historical data for the contents and status of each nightly and CI payload similar to the [release controller](https://amd64.ocp.releases.ci.openshift.org/), which clears older data after 10 or so payloads.

- [Big Query](https://console.cloud.google.com/bigquery?project=openshift-ci-data-analysis) - The big hammer with big data.  This is our data warehouse.  Has some significant overlap with data in Sippy but a longer timeline, and also includes data on disruption and alerting intervals for CI job runs. Does not scrape all prow jobs, but a fairly large number. (hardcoded list)

- [Data Studio](https://datastudio.google.com/navigation/reporting) - Provides some prepared reports to review trends and dissect by variants using the data in BigQuery, including disruption charts.

- [Test Grid](https://testgrid.k8s.io/redhat) - redhat-openshift-ocp-release-4.11-blocking, etc.  Summary of recent jobs with alerts and the ability to dig into jobs to look for most frequent failures. Sippy includes links to the relevant testgrid job pages in a number of prominent places.

### Prow Job
The [Release Status](https://amd64.ocp.releases.ci.openshift.org/) will show recent build and test runs for each release version as well as CI and Nightly builds for the recent releases.
The Phase will indicate if it was Accepted, Rejected or Failed.
The name will be a link to a specific build instance.
The build instance will list the Blocking jobs and if they succeeded or failed.
- When there are multiple failed build instances we can compare the failed blocking jobs to look for patterns
- Each Blocking job listed is a link to a specific Prow job
- Aggregated Prow jobs will have an aggregation-testrun-summary where you can view the individual Prow job failures for that aggregated job
- Individual Prow jobs will have 
  - Debug Tools (referenced above) listed at the top
  - Interval graphs to see timelines for tests and failures
  - JUnit showing the failures
    - These failures can be used to look for failure patterns across multiple runs
#### Artifacts
The prow job will have a link to the artifacts collected during the run.
Artifacts are grouped based on the [steps](https://docs.ci.openshift.org/docs/architecture/step-registry/) that compose the test run.
Some of the highlights contained in the artifacts are

- The main build-log.txt in the root of the folder, each step will also include a build-log.txt
- [ipi-install-install-stableinitial](https://steps.ci.openshift.org/reference/ipi-install-install-stableinitial) 
  - Includes .openshift_install.log
- [Gather-must-gather](https://steps.ci.openshift.org/reference/gather-must-gather) [[src]](https://github.com/openshift/must-gather)
    - Includes event-filter.html which can be used to search for events that occurred during the run
    - Includes must-gather.tar that can be downloaded, untarred and searched / viewed locally
- [Gather-extra](https://steps.ci.openshift.org/reference/gather-extra)
    - Includes nodes containing the kubelet journal logs that can be downloaded and untarred for searching and viewing locally
    - events.json a collection of all of the events collected during the run
    - pods  - most recent pod logs (but not ephemeral pods)
- [Gather-network](https://steps.ci.openshift.org/chain/gather-network)
    - Includes network.tar that can be downloaded, untarred and searched / viewed locally

### Troubleshooting steps
- Look for the obvious, did the job fail?  Is there a failure message that can be connected to a recent commit or service?
- If there are multiple job failures look to see if the same blocking job is failing in each, or identify the one that is most frequently failing
    - Investigate those aggregated jobs that fail most frequently
    - Look at the individual runs for the aggregated jobs and identify the most commonly occurring failures
- If you can't identify a particular test to focus on based on frequency you either have to rely on your gut or ask for help
- When you narrow in on an individual test:
    - Use Sippy and / or Big Query and see if this a new trend, if you can identify a time frame it began / trend changed and identify a commit that was introduced around that time
    - Review the 'Changes from' section for the payload or consult the repo and see if any recent commits are obvious candidates to impact it
    - Check CI Search to see if there are any bugs related to the test that might be relevant
      - Using output from the failed test can help determine if this is an existing problem with a commonly failing test or a new problem (different from other failures within the same test)
    - Review the test to try to get a better understanding of the tests expectations
      - Search for a substring of the test name in [openshift/origin](https://github.com/openshift/origin) to find it
    - Identify a time frame and or service area to focus your investigation on 
    - Search Slack for any recent discussions
- Consider variants - Can you narrow the scope of the issue to a particular set of variants to narrow the problem down or is it affecting multiple variants
  - SDN / OVN
  - AWS / AZURE / GCP / METAL 
  - Upgrade minor / micro
    
