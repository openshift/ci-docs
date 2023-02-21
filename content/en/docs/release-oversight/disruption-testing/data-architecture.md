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

1. To initially setup disruption data collection, this command
   `./job-run-aggregator create-tables --google-service-account-credential-file <credJsonFile>`
   is run to create the `Jobs`, `JobRuns`, and `TestRuns` tables in big query.  That command is idempotent -- i.e., it
   can be run any time regardless of whether the tables are created or not and is part of the `job-table-updater` CronJob.
   Each of the "Uploader" CronJobs used in disruption data collection (`alert-uploader`, `disruption-uploader`, `job-run-uploader`,
   and `job-table-updater`) requires the `Jobs` table to exist.

   The `Jobs`, `JobRuns`, and `TestRuns` tables will already exist so no one should have to run that command unless the
   `Jobs` table needs to be deleted/re-created.  This is rare and only happens when we need to correct something in the
   `Jobs` table (because big query does not allow updates to tables).  The `JobRuns` and `TestRuns` tables should
   generally be preserved because they contain historical disruption data.

   If someone ever has to delete the `Jobs` table, delete it right before the `job-table-updater` CronJob
   triggers. This way, the `Jobs` table will immediately be re-created for you.

1. The `Disruption Uploader` is a `CronJob` that is set to run every `4 hours`. All the `Uploader` jobs (`disruption-uploader`,  `alert-uploader`, `job-run-uploader`, and `job-table-updater`) run in the DPCR cluster in the `dpcr-ci-job-aggregation` namespace, the current configuration can be found in the `openshift/continuous-release-jobs` private repo under `config/clusters/dpcr/services/dpcr-ci-job-aggregation`.
.

1. When e2e tests are done the results are uploaded to `GCS` and the results can be viewed in the artifacts folder for a particular job run.

   Clicking the artifact link on the top right of a prow job and navigating to the `openshift-e2e-test` folder will show you the disruption results. (ex. `.../openshift-e2e-test/artifacts/junit/backend-disruption_[0-9]+-[0-9]+.json`).

1. We only pull disruption data for job names specified in the `Jobs` table in `BigQuery`. (see [Job Primer](../job-primer) for more information on this process)

1. The disruption uploader will parse out the results from the e2e run backend-disruption json files and push them to the [openshift-ci-data-analysis](https://console.cloud.google.com/bigquery?project=openshift-ci-data-analysis) table in BigQuery.

1. Currently, backend disruption data is queried from BigQuery and downloaded in `json` format. The resulting `json` file is then committed to [origin/pkg/synthetictests/allowedbackenddisruption/query_results.json](https://github.com/openshift/origin/blob/master/pkg/synthetictests/allowedbackenddisruption/query_results.json) for **backend disruption** or [origin/pkg/synthetictests/allowedalerts/query_results.json](https://github.com/openshift/origin/blob/master/pkg/synthetictests/allowedalerts/query_results.json) for **alert data** (see [how to query](#how-to-query-the-data))

1. The static `query_results.json` in `openshift/origin` are then used by the the [matchers](../code-implementation#best-matcher) that the `samplers` invoke to find the best match for a given test (typically with "remains available using new/reused connections" or "should be nearly zero single second disruptions") to check if we're seeing noticeably worse disruption during the run.

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
