---
title: "Code Implementation"
description: An overview for how disruption tests are implemented, the core logic that makes use of the historical data, and how to go about adding a new tests.
---

## Overview

{{% alert title="Note!" color="primary" %}}
In the examples below we use the `Backend Disruption` tests, but the same will hold true for the alerts durations.
{{% /alert %}}

To measure our ability to provide upgrades to OCP clusters with minimal
downtime, the Disruption Testing framework monitors select backends and
records disruptions in the backend service availability.
This document serves as an overview of the framework used to provide
disruption testing and how to configure new disruption tests when needed

## Matcher Code Implementation

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

## Adding new disruption tests

Currently disruption tests are focused on disruptions created during upgrades.
To add a new backend to monitor during the upgrade test, add a new backendDisruptionTest
{{% card-code header="Ex: `NewBackendDisruptionTest` [origin/test/extended/util/disruption/backend_sampler_tester.go](https://github.com/openshift/origin/blob/master/test/extended/util/disruption/backend_sampler_tester.go#L34-L41)" %}}
```go
func NewBackendDisruptionTest(testName string, backend BackendSampler) *backendDisruptionTest {
	ret := &backendDisruptionTest{
		testName: testName,
		backend:  backend,
	}
	ret.getAllowedDisruption = alwaysAllowOneSecond(ret.historicalP95Disruption)
	return ret
}

```
{{% /card-code %}}
via NewBackendDisruptionTest to the e2e upgrade AllTests.

{{% card-code header="Ex: `AllTests` [origin/test/e2e/upgrade/upgrade.go](https://github.com/openshift/origin/blob/master/test/e2e/upgrade/upgrade.go#L54-L86)" %}}
```go
func AllTests() []upgrades.Test {
	return []upgrades.Test{
		&adminack.UpgradeTest{},
		controlplane.NewKubeAvailableWithNewConnectionsTest(),
		controlplane.NewOpenShiftAvailableNewConnectionsTest(),
		controlplane.NewOAuthAvailableNewConnectionsTest(),
		controlplane.NewKubeAvailableWithConnectionReuseTest(),
		controlplane.NewOpenShiftAvailableWithConnectionReuseTest(),
		controlplane.NewOAuthAvailableWithConnectionReuseTest(),

		...
	}

```
{{% /card-code %}}

{{% card-code header="Ex: `NewKubeAvailableWithNewConnectionsTest` [origin/test/extended/util/disruption/controlplane/controlplane.go](https://github.com/neisw/origin/blob/ce3a9bb9e3f5662873214cc0d2dd03e9748f3c14/test/extended/util/disruption/controlplane/controlplane.go#L13-L22)" %}}
```go
func NewKubeAvailableWithNewConnectionsTest() upgrades.Test {
	restConfig, err := monitor.GetMonitorRESTConfig()
	utilruntime.Must(err)
	backendSampler, err := createKubeAPIMonitoringWithNewConnections(restConfig)
	utilruntime.Must(err)
	return disruption.NewBackendDisruptionTest(
		"[sig-api-machinery] Kubernetes APIs remain available for new connections",
		backendSampler,
	)
}

```
{{% /card-code %}}
  


If this is a completely new backend being tested, then [query_results](https://github.com/openshift/origin/blob/master/pkg/synthetictests/allowedbackenddisruption/query_results.json)
data will need to be added or, if preferable, NewBackendDisruptionTestWithFixedAllowedDisruption can be used instead of NewBackendDisruptionTest and the allowable disruption hardcoded.

### Updating test data

{{% alert color="primary" %}}
For information on how to get the historical data please refer to the [Architecture Diagram](../data-architecture)
{{% /alert %}}

Allowable disruption values can be added / updated in [query_results](https://github.com/openshift/origin/blob/master/pkg/synthetictests/allowedbackenddisruption/query_results.json).
Disruption data can be queried from BigQuery using [p95Query](https://github.com/openshift/origin/blob/master/pkg/synthetictests/allowedbackenddisruption/types.go)

## Disruption test framework overview


{{< inlineSVG file="/static/disruption_test_flow.svg" >}}


To check for disruptions while upgrading OCP clusters

- The tests are defined by [AllTests](https://github.com/neisw/origin/blob/46f376386ab74ecfe0091552231d378adf24d5ea/test/e2e/upgrade/upgrade.go#L53)
- The disruption is defined by [clusterUpgrade](https://github.com/neisw/origin/blob/46f376386ab74ecfe0091552231d378adf24d5ea/test/e2e/upgrade/upgrade.go#L270)
- These are passed into [disruption.Run](https://github.com/neisw/origin/blob/2a97f51d4981a12f0cadad53db133793406db575/test/extended/util/disruption/disruption.go#L81)
- Which creates a new [Chaosmonkey](https://github.com/neisw/origin/blob/59599fad87743abf4c84f05952552e6d42728781/vendor/k8s.io/kubernetes/test/e2e/chaosmonkey/chaosmonkey.go#L48) and [executes](https://github.com/neisw/origin/blob/59599fad87743abf4c84f05952552e6d42728781/vendor/k8s.io/kubernetes/test/e2e/chaosmonkey/chaosmonkey.go#L78) the disruption monitoring tests and the disruption
- The [backendDisruptionTest](https://github.com/neisw/origin/blob/0c50d9d8bedbd2aa0af5c8a583418601891ee9d4/test/extended/util/disruption/backend_sampler_tester.go#L34) is responsible for
  - Creating the event broadcaster, recorder and monitor
  - [Attempting to query the backend](../backend_queries) and timing out after the max interval (1 second typically)
  - Analyzing the disruption events for disruptions that exceed allowable values
- When the disruption is complete, the disruptions tests are validated via Matches / BestMatcher to find periods that exceed allowable thresholds
  - [Matches](https://github.com/neisw/origin/blob/43d9e9332d5fb148b2e68804200a352a9bc683a5/pkg/synthetictests/allowedbackenddisruption/matches.go#L11) will look for an entry in [query_results](https://github.com/openshift/origin/blob/master/pkg/synthetictests/allowedbackenddisruption/query_results.json) if an exact match is not found it will utilize [BestMatcher](#best-matcher) to look for data with the closest variants match

{{% comment %}}

Remove comment block when we populate these sections
### Relationship to test aggregations

TBD

### Testing disruption tests

TBD

{{% /comment %}}
