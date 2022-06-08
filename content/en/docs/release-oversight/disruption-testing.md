---
title: "Disruption Testing"
description: An overview for how disruption tests work and are configured.
---

### Overview
To measure our ability to provide upgrades to OCP clusters with minimal
downtime the Disruption Testing framework monitors select backends and
records disruptions in the backend service availability.
This document serves as an overview of the framework used to provide
disruption testing and how to configure new disruption tests when needed


### Adding new disruption tests
Currently disruption tests are focused on disruptions created during upgrades.
To add a new backend to monitor during the upgrade test
Add a new [backendDisruptionTest](https://github.com/openshift/origin/blob/master/test/extended/util/disruption/backend_sampler_tester.go)
via NewBackendDisruptionTest to the e2e [upgrade](https://github.com/openshift/origin/blob/master/test/e2e/upgrade/upgrade.go) AllTests.
If this is a completely new backend being tested then [query_results](https://github.com/openshift/origin/blob/master/pkg/synthetictests/allowedbackenddisruption/query_results.json)
data will need to be added or, if preferable, NewBackendDisruptionTestWithFixedAllowedDisruption can be used instead of NewBackendDisruptionTest and the allowable disruption hardcoded.



### Updating test data
Allowable disruption values can be added / updated in [query_results](https://github.com/openshift/origin/blob/master/pkg/synthetictests/allowedbackenddisruption/query_results.json).
Disruption data can be queried from BigQuery using [p95Query](https://github.com/openshift/origin/blob/master/pkg/synthetictests/allowedbackenddisruption/types.go)


### Populating BigQuery with disruption test data
TBD


### Disruption test framework overview
To check for disruptions while upgrading OCP clusters 
* The tests are defined by [AllTests](https://github.com/neisw/origin/blob/46f376386ab74ecfe0091552231d378adf24d5ea/test/e2e/upgrade/upgrade.go#L53)
* The disruption is defined by [clusterUpgrade](https://github.com/neisw/origin/blob/46f376386ab74ecfe0091552231d378adf24d5ea/test/e2e/upgrade/upgrade.go#L270)
* These are passed into [disruption.Run](https://github.com/neisw/origin/blob/2a97f51d4981a12f0cadad53db133793406db575/test/extended/util/disruption/disruption.go#L81)
* Which creates a new [Chaosmonkey](https://github.com/neisw/origin/blob/59599fad87743abf4c84f05952552e6d42728781/vendor/k8s.io/kubernetes/test/e2e/chaosmonkey/chaosmonkey.go#L48) and [executes](https://github.com/neisw/origin/blob/59599fad87743abf4c84f05952552e6d42728781/vendor/k8s.io/kubernetes/test/e2e/chaosmonkey/chaosmonkey.go#L78) the disruption monitoring tests and the disruption
* The [backendDisruptionTest](https://github.com/neisw/origin/blob/0c50d9d8bedbd2aa0af5c8a583418601891ee9d4/test/extended/util/disruption/backend_sampler_tester.go#L34) is responsible for
  * Creating the event broadcaster, recorder and monitor
  * Attempting to query the backend and timing out after the max interval (1 second typically)
  * Analyzing the disruption events for disruptions that exceed allowable values
* When the disruption is complete the disruptions tests are validated via Matches / BestMatcher to find periods that exceed allowable thresholds
  * [Matches](https://github.com/neisw/origin/blob/43d9e9332d5fb148b2e68804200a352a9bc683a5/pkg/synthetictests/allowedbackenddisruption/matches.go#L11) will look for an entry in [query_results](https://github.com/openshift/origin/blob/master/pkg/synthetictests/allowedbackenddisruption/query_results.json) if an exact match is not found it will utilize [BestMatcher](https://github.com/neisw/origin/blob/4e8f0ba818ed5e89cf09bf2902be857859a2125c/pkg/synthetictests/historicaldata/types.go#L128) to look for data with the closest variants match

### Relationship to test aggregations
TBD

### Testing disruption tests
TBD