---
title: "Disruption Tests"
description: A look at how disruption tests are architected and implemented.
---

## Summary

Disruption tests are a set of tests that measure an endpoint's resilience or an allowed alert duration. As the `e2e tests` are run the results are matched against historical data to determine if the disruption intervals are within expectations.

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

1. Disruption data is gathered from periodic jobs that run e2e tests. When e2e tests are done the results are uploaded to `GCS` and the results can be viewed in the artifacts folder for a particular job run.

   Clicking the artifact link on the top right of a prow job and navigating to the `openshift-e2e-test` folder will show you the disruption results. (ex. `.../openshift-e2e-test/artifacts/junit/backend-disruption_[0-9]+-[0-9]+.json`).

1. Job aggregation jobs are run in the DPCR cluster, the current configuration can be found in the [openshift/continuous-release-jobs](https://github.com/openshift/continuous-release-jobs/tree/master/config/clusters/dpcr/services/dpcr-ci-job-aggregation).

   These jobs fetch and parse out the results from the e2e runs. They are then pushed to the [openshift-ci-data-analysis](https://console.cloud.google.com/bigquery?project=openshift-ci-data-analysis) table in BigQuery.

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

## Code Implementation

> Note! In the examples below we use the `Backend Disruption` tests, but the same will hold true for the alerts durations,

Now that we have a better understanding of how the disruption test data is generated and updated, let's discuss how the code makes use of it.

### Best Matcher

The [origin/pkg/synthetictests/allowedbackenddisruption/query_results.json](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/allowedbackenddisruption/query_results.json) file that we updated previously is embedded into the `openshift-tests` binary. At runtime, we ingest the raw data and create a `historicaldata.NewMatcher()` object which implements the `BestMatcher` interface.

{{% card-code header="[origin/pkg/synthetictests/allowedbackenddisruption/types.go](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/allowedbackenddisruption/types.go#L53-L77)" %}}

```go
//go:embed query_results.json
var queryResults []byte

var (
	readResults    sync.Once
	historicalData historicaldata.BestMatcher
)

const defaultReturn = 2.718

func getCurrentResults() historicaldata.BestMatcher {
	readResults.Do(
		func() {
			var err error
			genericBytes := bytes.ReplaceAll(queryResults, []byte(`    "BackendName": "`), []byte(`    "Name": "`))
			historicalData, err = historicaldata.NewMatcher(genericBytes, defaultReturn)
			if err != nil {
				panic(err)
			}
		})

	return historicalData
}
```

{{% /card-code %}}

### Best Guesser

The core logic of the current best matcher will check if we have an exact match in the historical data. An exact match is one that contains the same `Backend Name` and [JobType](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/platformidentification/types.go#L16-L23). When we don't have an exact match, we make a best guess effort by doing a fuzzy match for data we don't have. Fuzzy matching is done by iterating through all the `nextBestGuessers` and stopping at the first match that fits our criteria and checking if it's contained in the data set.

{{% card-code header="[origin/pkg/synthetictests/historicaldata/types.go](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/historicaldata/types.go#L89-L111)" %}}

```go
	exactMatchKey := DataKey{
		Name:    name,
		JobType: jobType,
	}

	if percentiles, ok := b.historicalData[exactMatchKey]; ok {
		return percentiles, "", nil
	}

	for _, nextBestGuesser := range nextBestGuessers {
		nextBestJobType, ok := nextBestGuesser(jobType)
		if !ok {
			continue
		}
		nextBestMatchKey := DataKey{
			Name:    name,
			JobType: nextBestJobType,
		}
		if percentiles, ok := b.historicalData[nextBestMatchKey]; ok {
			return percentiles, fmt.Sprintf("(no exact match for %#v, fell back to %#v)", exactMatchKey, nextBestMatchKey), nil
		}
	}
```

{{% /card-code %}}

### Default Next Best Guessers

[Next Best Guessers](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/historicaldata/next_best_guess.go#L13-L53) are functions that can be chained together and will return either a `true` or `false` if the current `JobType` matches the desired logic. In the code snippet below, we check if `MicroReleaseUpgrade` matches the current `JobType`, if false, we continue down the list. The [combine](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/historicaldata/next_best_guess.go#L179-L191) helper function gives you the option to chain and compose a more sophisticated check. In the example below, if we can do a [PreviousReleaseUpgrade](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/historicaldata/next_best_guess.go#L100-L113) the result of that will be fed into [MicroReleaseUpgrade](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/historicaldata/next_best_guess.go#L80-L98) and if no function returns `false` during this chain, we have successfully fuzzy matched and can now check the historical data has information for this match.

{{% card-code header="Ex: `nextBestGuessers` [origin/pkg/synthetictests/historicaldata/next_best_guess.go](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/historicaldata/next_best_guess.go#L13-L53)" %}}

```go
var nextBestGuessers = []NextBestKey{
	MicroReleaseUpgrade,
	PreviousReleaseUpgrade,
    ...
	combine(PreviousReleaseUpgrade, MicroReleaseUpgrade),
    ...
}
```

{{% /card-code %}}

{{% card-code header="Ex: `PreviousReleaseUpgrade` [origin/pkg/synthetictests/historicaldata/next_best_guess.go](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/historicaldata/next_best_guess.go#L100-L113)" %}}

```go
// PreviousReleaseUpgrade if we don't have data for the current toRelease, perhaps we have data for the congruent test
// on the prior release.   A 4.11 to 4.11 upgrade will attempt a 4.10 to 4.10 upgrade.  A 4.11 no upgrade, will attempt a 4.10 no upgrade.
func PreviousReleaseUpgrade(in platformidentification.JobType) (platformidentification.JobType, bool) {
	toReleaseMajor := getMajor(in.Release)
	toReleaseMinor := getMinor(in.Release)

	ret := platformidentification.CloneJobType(in)
	ret.Release = fmt.Sprintf("%d.%d", toReleaseMajor, toReleaseMinor-1)
	if len(in.FromRelease) > 0 {
		fromReleaseMinor := getMinor(in.FromRelease)
		ret.FromRelease = fmt.Sprintf("%d.%d", toReleaseMajor, fromReleaseMinor-1)
	}
	return ret, true
}
```

{{% /card-code %}}

{{% card-code header="Ex: `MicroReleaseUpgrade` [origin/pkg/synthetictests/historicaldata/next_best_guess.go](https://github.com/openshift/origin/blob/a93ac08b2890dbe6dee760e623c5cafb1d8c9f97/pkg/synthetictests/historicaldata/next_best_guess.go#L80-L98)" %}}

```go
// MicroReleaseUpgrade if we don't have data for the current fromRelease and it's a minor upgrade, perhaps we have data
// for a micro upgrade.  A 4.10 to 4.11 upgrade will attempt a 4.11 to 4.11 upgrade.
func MicroReleaseUpgrade(in platformidentification.JobType) (platformidentification.JobType, bool) {
	if len(in.FromRelease) == 0 {
		return platformidentification.JobType{}, false
	}

	fromReleaseMinor := getMinor(in.FromRelease)
	toReleaseMajor := getMajor(in.Release)
	toReleaseMinor := getMinor(in.Release)
	// if we're already a micro upgrade, this doesn't apply
	if fromReleaseMinor == toReleaseMinor {
		return platformidentification.JobType{}, false
	}

	ret := platformidentification.CloneJobType(in)
	ret.FromRelease = fmt.Sprintf("%d.%d", toReleaseMajor, toReleaseMinor)
	return ret, true
}
```

{{% /card-code %}}
