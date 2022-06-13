---
title: "Architecture Data Flow"
description: A high level look at how the disruption historical data is gathered and updated.
---

### Resources

{{% alert title="⚠️ Note!" color="warning" %}}
You'll need access to the appropriate groups to work with disruption data, please reach out to the TRT team for access.
{{% /alert %}}

- [Periodic Jobs](https://github.com/openshift/release/tree/master/ci-operator/jobs/openshift/release)
- [BigQuery](https://console.cloud.google.com/bigquery?project=openshift-ci-data-analysis)
- [DPCR Job Aggregation Configs](https://github.com/openshift/continuous-release-jobs/tree/master/config/clusters/dpcr/services/dpcr-ci-job-aggregation)
- [Origin Synthetic Backend Tests](https://github.com/openshift/origin/tree/master/pkg/synthetictests/allowedbackenddisruption)

## Disruption Data Architecture

{{% alert color="info" %}}
The below diagram presents a high level overview on how we use our `periodic jobs`, `job aggregation` and `BigQuery` to generate the disruption historical data.
It does not cover how the tests themselves are run against a cluster.
{{% /alert %}}

### High Level Diagram

{{< inlineSVG file="/static/disruption_test_diagram.svg" >}}

### How The Data Flows

1. `Disruption uploader` jobs are run in the DPCR cluster, the current configuration can be found in the [openshift/continuous-release-jobs](https://github.com/openshift/continuous-release-jobs/tree/master/config/clusters/dpcr/services/dpcr-ci-job-aggregation).

1. We grab a list of the Jobs names that we should gather from the `Jobs` table in `BigQuery`

1. When e2e tests are done the results are uploaded to `GCS` and the results can be viewed in the artifacts folder for a particular job run. We only pull disruption data for job names specified in the `Jobs` table.

   Clicking the artifact link on the top right of a prow job and navigating to the `openshift-e2e-test` folder will show you the disruption results. (ex. `.../openshift-e2e-test/artifacts/junit/backend-disruption_[0-9]+-[0-9]+.json`).

1. We fetch and parse out the results from the e2e runs. They are then pushed to the [openshift-ci-data-analysis](https://console.cloud.google.com/bigquery?project=openshift-ci-data-analysis) table in BigQuery.

1. Currently, backend disruption data is queried from BigQuery and downloaded in `json` format. The resulting `json` file is then committed to [origin/pkg/synthetictests/allowedbackenddisruption/query_results.json](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/allowedbackenddisruption/query_results.json) for **backend disruption** or [origin/pkg/synthetictests/allowedalerts/query_results.json](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/allowedalerts/query_results.json) for **alert data** (see [how to query](#how-to-query-the-data))

### How To Query The Data

Once you have access to BigQuery in the `openshift-ci-data-analysis` project, you can run the below query to fetch the latest results.

#### Query

{{% card-code header="[origin/pkg/synthetictests/allowedbackenddisruption/types.go](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/allowedbackenddisruption/types.go#L13-L43)" %}}

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

{{% card-code header="[origin/pkg/synthetictests/allowedalerts/types.go](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/allowedalerts/types.go#L17-L35)" %}}

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
