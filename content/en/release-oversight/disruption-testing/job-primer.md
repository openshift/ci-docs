---
title: "Job Primer"
description: Job Primer ci-tool used to generate job names for Big Query.
---

## Overview

{{% alert title="⚠️ NOTE" color="warning" %}}
In `Job Primer` a job name is very important. Please make sure that the job names contain correct information. ([see options below](#naming-convention))
{{% /alert %}}

[JobPrimer](https://github.com/openshift/ci-tools/tree/master/pkg/jobrunaggregator/jobtableprimer) is the `ci-tool` that is used to populate the `BigQuery` `Jobs` table. The `Jobs` table dictates which periodic jobs are ingested during `disruption` data gathering.

`JobPrimer` runs periodically in our CI. There are two sub commands described below that run on a cron schedule.

- The configuration for `generate-job-names` can be found [here](https://github.com/openshift/release/blob/1b5cdb332b99ec32316c8c89cf8268204609505b/ci-operator/jobs/infra-periodics.yaml#L2441-L2487). It updates the `generated_job_names.txt` file then opens and merges the PR via the Openshift bot. ([example PR](https://github.com/openshift/ci-tools/pull/2924))

- The configuration for `prime-job-table` which updates the table in big query can be found in the `DPCR Job Aggregation Configs` (**private repo**)

  ```
  https://github.com/openshift/continuous-release-jobs/tree/master/config/clusters/dpcr/services/dpcr-ci-job-aggregation/job-table-updater-cronjob.yaml
  ```

## High Level Diagram

{{< inlineSVG file="/static/job_primer_diagram.svg" >}}

### How The Data Flows

1. We first look at the `origin/release` repo to gather a list of the current release jobs that were created. The below command is run to look through the current configuration and generate the job names.

   ```sh
   ./job-run-aggregator generate-job-names > pkg/jobrunaggregator/jobtableprimer/generated_job_names.txt
   ```

1. That `generated_jobs_names.txt` is then committed to the repo.

   **You must then rebuild the binary so the newly generated list is correctly embedded.**

1. We then create the jobs in the BigQuery table by running the `prime-job-table` command (as a `CronJob` in the DPCR cluster in the `dpcr-ci-job-aggregation` project). This will use the embedded `generated_jobs_names.txt` data and generate the `Jobs` rows based off of the naming convention (see below). After which the `Jobs` table should be updated with the latest jobs.

   ```sh
   ./job-run-aggregator prime-job-table
   ```

NOTE: the `prime-job-table` depends on the `Jobs` table existing ; that `Jobs` table is created (if it doesn't already exist)
by the `./job-run-aggregator create-tables --google-service-account-credential-file <credJsonFile>` command which is
run as part of the `job-table-udpater` CronJob.

### Naming Convention

Please make sure your job names follow the convention defined below. All job names must include adequate information to allow proper data aggregation.

{{% pageinfo color="primary" %}}

- Platform:
  - aws, gcp, azure, etc...
- Architecture: (default: `amd64`)
  - arm64, ppc64le, s390x
- Upgrade: (default: `assumes NOT upgrade`)
  - upgrade
- Network: (default: `sdn && ipv4`)
  - sdn, ovn
  - ipv6, ipv4
- Topology: (default: `assumes ha`)
  - single
- Serial: (default: `assumes parallel`)
  - serial

{{% /pageinfo %}}

{{% card-code header="[Code Location](https://github.com/openshift/ci-tools/blob/659fc3fed6ebe7ed7fb0bde25330fe2f47e20d0b/pkg/jobrunaggregator/jobtableprimer/job_typer.go#L13-L114)" %}}

```go
func newJob(name string) *jobRowBuilder {
	platform := ""
	switch {
	case strings.Contains(name, "gcp"):
		platform = gcp
	case strings.Contains(name, "aws"):
		platform = aws
	case strings.Contains(name, "azure"):
		platform = azure
	case strings.Contains(name, "metal"):
		platform = metal
	case strings.Contains(name, "vsphere"):
		platform = vsphere
	case strings.Contains(name, "ovirt"):
		platform = ovirt
	case strings.Contains(name, "openstack"):
		platform = openstack
	case strings.Contains(name, "libvirt"):
		platform = libvirt
	}

	architecture := ""
	switch {
	case strings.Contains(name, "arm64"):
		architecture = arm64
	case strings.Contains(name, "ppc64le"):
		architecture = ppc64le
	case strings.Contains(name, "s390x"):
		architecture = s390x
	default:
		architecture = amd64
	}

...


```

{{% /card-code %}}
