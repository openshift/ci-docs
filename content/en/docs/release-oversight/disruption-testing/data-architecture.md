---
title: "Architecture Data Flow"
description: A high level look at how the disruption historical data is gathered and updated.
weight: 1
---

### Resources

{{% alert title="⚠️ Note!" color="warning" %}}
You'll need access to the appropriate groups to work with disruption data, please reach out to the TRT team for access.
{{% /alert %}}

- [Periodic Jobs](https://github.com/openshift/release/tree/master/ci-operator/jobs/openshift/release)
- [BigQuery](https://console.cloud.google.com/bigquery?project=openshift-ci-data-analysis)
- `DPCR Job Aggregation Configs` (**private repo**)

  ```
  https://github.com/openshift/continuous-release-jobs/tree/master/config/clusters/dpcr/services/dpcr-ci-job-aggregation
  ```

- [Origin Synthetic Backend Tests](https://github.com/openshift/origin/tree/master/pkg/synthetictests/allowedbackenddisruption)

## Disruption Data Architecture

{{% alert color="info" %}}
The below diagram presents a high level overview on how we use our `periodic jobs`, `job aggregation` and `BigQuery` to generate the disruption historical data.
It does not cover how the tests themselves are run against a cluster.
{{% /alert %}}

### High Level Diagram

{{< inlineSVG file="/static/disruption_test_diagram.svg" >}}

### How The Data Flows

{{% alert color="info" %}}
`openshift-tests` run `disruption samplers`, these run `GET` requests against a number of backends in the cluster every second and record the results to determine disruption. (see [Testing Backends For Availability](../backend_queries) for more info)
{{% /alert %}}

1. The `Disruption Uploader` is a `CronJob` that is set to run every `4 hours`. All the `Uploader` jobs are run in the DPCR cluster, the current configuration can be found in the `openshift/continuous-release-jobs` private repo under `config/clusters/dpcr/services/dpcr-ci-job-aggregation`.

1. When e2e tests are done the results are uploaded to `GCS` and the results can be viewed in the artifacts folder for a particular job run.

   Clicking the artifact link on the top right of a prow job and navigating to the `openshift-e2e-test` folder will show you the disruption results. (ex. `.../openshift-e2e-test/artifacts/junit/backend-disruption_[0-9]+-[0-9]+.json`).

1. We only pull disruption data for job names specified in the `Jobs` table in `BigQuery`. (see [Job Primer](../job-primer) for more information on this process)

1. The disruption uploader will parse out the results from the e2e run backend-disruption json files and push them to the [openshift-ci-data-analysis](https://console.cloud.google.com/bigquery?project=openshift-ci-data-analysis) table in BigQuery.

1. We currently run a periodic [disruption data analyzer job](https://github.com/openshift/release/blob/7186dca51d5350e3d42c75b071d8a1e4e6f68d5f/ci-operator/jobs/infra-periodics.yaml#L2549-L2630) in the [app.ci](https://console-openshift-console.apps.ci.l2s4.p1.openshiftapps.com/) cluster. It gathers the recent disruption data and commits the results back to `openshift/origin`. The PR it generates will also include a report that will help show the differences from previous to current disruptions in a table format. ([example PR](https://github.com/openshift/origin/pull/27475#issue-1414053178)).

   Note, the read only BigQuery secret used by this job is saved in `Vault` using the processes described in this [HowTo](../../../how-tos/adding-a-new-secret-to-ci/#add-a-new-secret).

1. The static `query_results.json` in `openshift/origin` are then used by the the [matchers](../code-implementation#best-matcher) that the `samplers` invoke to find the best match for a given test (typically with "remains available using new/reused connections" or "should be nearly zero single second disruptions") to check if we're seeing noticeably worse disruption during the run.

### How To Query The Data Manually

The process for gathering and updating disruption data is fully automated, however, if you wish to explore the BigQuery data set, below are some of the queries you can run. If you also want to run the `job-run-aggregator` locally, the [README.md](https://github.com/openshift/ci-tools/tree/master/cmd/job-run-aggregator) for the project will provide guidance.

Once you have access to BigQuery in the `openshift-ci-data-analysis` project, you can run the below query to fetch the latest results.

#### Query

{{% alert title="⚠️ Note!" color="warning" %}}
The below queries are examples, please feel free to visit the linked permalinks for where to find the most up to date queries used by our automation.
{{% /alert %}}

{{% card-code header="[ci-tools/pkg/jobrunaggregator/jobrunaggregatorlib/ci_data_client.go](https://github.com/openshift/ci-tools/blob/13478ce7f8e79d8f2ddc25af859afc9ae4be3c67/pkg/jobrunaggregator/jobrunaggregatorlib/ci_data_client.go#L98-L136)" %}}

```sql
SELECT
    BackendName,
    Release,
    FromRelease,
    Platform,
    Architecture,
    Network,
    Topology,
    ANY_VALUE(P95) AS P95,
    ANY_VALUE(P99) AS P99,
FROM (
    SELECT
        Jobs.Release,
        Jobs.FromRelease,
        Jobs.Platform,
        Jobs.Architecture,
        Jobs.Network,
        Jobs.Topology,
        BackendName,
        PERCENTILE_CONT(BackendDisruption.DisruptionSeconds, 0.95) OVER(PARTITION BY BackendDisruption.BackendName, Jobs.Network, Jobs.Platform, Jobs.Release, Jobs.FromRelease, Jobs.Topology) AS P95,
        PERCENTILE_CONT(BackendDisruption.DisruptionSeconds, 0.99) OVER(PARTITION BY BackendDisruption.BackendName, Jobs.Network, Jobs.Platform, Jobs.Release, Jobs.FromRelease, Jobs.Topology) AS P99,
    FROM
        openshift-ci-data-analysis.ci_data.BackendDisruption as BackendDisruption
    INNER JOIN
        openshift-ci-data-analysis.ci_data.BackendDisruption_JobRuns as JobRuns on JobRuns.Name = BackendDisruption.JobRunName
    INNER JOIN
        openshift-ci-data-analysis.ci_data.Jobs as Jobs on Jobs.JobName = JobRuns.JobName
    WHERE
        JobRuns.StartTime > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 21 DAY)
)
GROUP BY
BackendName, Release, FromRelease, Platform, Architecture, Network, Topology
```

{{% /card-code %}}

{{% card-code header="[ci-tools/pkg/jobrunaggregator/jobrunaggregatorlib/ci_data_client.go](https://github.com/openshift/ci-tools/blob/13478ce7f8e79d8f2ddc25af859afc9ae4be3c67/pkg/jobrunaggregator/jobrunaggregatorlib/ci_data_client.go#L167-L190)" %}}

```sql
SELECT * FROM openshift-ci-data-analysis.ci_data.Alerts_Unified_LastWeek_P95
where
  alertName = "etcdMembersDown" or
  alertName = "etcdGRPCRequestsSlow" or
  alertName = "etcdHighNumberOfFailedGRPCRequests" or
  alertName = "etcdMemberCommunicationSlow" or
  alertName = "etcdNoLeader" or
  alertName = "etcdHighFsyncDurations" or
  alertName = "etcdHighCommitDurations" or
  alertName = "etcdInsufficientMembers" or
  alertName = "etcdHighNumberOfLeaderChanges" or
  alertName = "KubeAPIErrorBudgetBurn" or
  alertName = "KubeClientErrors" or
  alertName = "KubePersistentVolumeErrors" or
  alertName = "MCDDrainError" or
  alertName = "PrometheusOperatorWatchErrors" or
  alertName = "VSphereOpenshiftNodeHealthFail"
order by
 AlertName, Release, FromRelease, Topology, Platform, Network
```

{{% /card-code %}}

#### Downloading

Once the query is run, you can download the data locally.

![BigQuery Download](/bigquery_download.png)
