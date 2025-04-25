---
title: "Triggering ProwJobs via the REST"
description: How to interact with the REST interface to run jobs and get information about results.
---

{{< alert title="Warning" color="warning" >}}
This document is intended for advanced users with specific use cases. Typical users should not need to trigger ProwJobs via REST.
{{< /alert >}}
{{< alert title="Warning" color="warning" >}}
The REST API has rate limits, and the username is recorded in the annotations for statistical purposes.
{{< /alert >}}

# Obtaining an Authentication Token

Each SSO user is entitled to obtain a personal authentication token. Tokens can be retrieved through the UI of the app.ci cluster at [OpenShift Console](https://console-openshift-console.apps.ci.l2s4.p1.openshiftapps.com/). Alternatively, if the app.ci cluster context is already configured, you may execute:

```
oc whoami -t
```

# API Overview

There is currently no formal API specification available for this service because the API endpoints are dynamically transcoded and served using GRPC. This document outlines common use cases. For further extension and technical details, please refer to the GRPC API definition provided in the proto file available on GitHub: [gangway.proto](https://github.com/kubernetes-sigs/prow/blob/main/pkg/gangway/gangway.proto).

# Common Use Cases

## Triggering a Periodic Job

The REST interface is most commonly used to trigger periodic jobs. For example:

```
curl -v -X POST -H "Authorization: Bearer $(oc whoami -t)" -d '{"job_name": "periodic-to-trigger", "job_execution_type": "1"}' https://gangway-ci.apps.ci.l2s4.p1.openshiftapps.com/v1/executions
```

In this example, only two parameters are required: `job_name` and `job_execution_type`. For periodic jobs, the `job_execution_type` must always be set to `"1"`.

## Triggering a Periodic Job, override the payload

```
curl -v -X POST -H "Authorization: Bearer $(oc whoami -t)" -d '{"job_name": "periodic-to-trigger", "job_execution_type": "1", "pod_spec_options": {"envs":  {"RELEASE_IMAGE_LATEST": "quay.io/openshift-release-dev/ocp-release:4.18.8-x86_64"}}}' https://gangway-ci.apps.ci.l2s4.p1.openshiftapps.com/v1/executions
```

## Triggering a Postsubmit Job

Triggering a postsubmit job involves an additional requirement to define a `refs` structure. Below is an example `spec.json` file that must be created:

```
{
  "job_name": "branch-ci-openshift-assisted-installer-release-4.12-images",
  "job_execution_type": "2",
  "refs": {
    "base_link": "https://github.com/openshift/assisted-installer/compare/bc8fd4d3f1f7...a336f38f75f9",
    "base_ref": "release-4.12",
    "base_sha": "7336f38f75f91a876313daacbfw97f25dfe21bbf",
    "org": "openshift",
    "repo": "assisted-installer",
    "repo_link": "https://github.com/openshift/assisted-installer"
  }
}
```

For postsubmit jobs, the `job_execution_type` must be set to `"2"`. After saving the file, trigger the job by executing:

```
curl -v -X POST -H "Authorization: Bearer $(oc whoami -t)" -d @spec.json https://gangway-ci.apps.ci.l2s4.p1.openshiftapps.com/v1/executions
```

## Triggering a Presubmit Job

{{< alert title="Warning" color="warning" >}}
While the REST interface supports triggering presubmit jobs, it is generally unnecessary. Presubmit jobs should be automatically executed or re-triggered using Prow commands (e.g., `/test` and `/retest`) via GitHub interactions.
{{< /alert >}}


## Querying Job Status

To query the status of a job, send a GET request:

```
curl -X GET -H "Authorization: Bearer $(oc whoami -t)" https://gangway-ci.apps.ci.l2s4.p1.openshiftapps.com/v1/executions/ca249d50-dee8-4424-a0a7-6dd9d5605267
```

A sample response might be:

```
{
  "id": "ca249d50-dee8-4424-a0a7-6dd9d5605267",
  "job_name": "",
  "job_type": "JOB_EXECUTION_TYPE_UNSPECIFIED",
  "job_status": "SUCCESS",
  "gcs_path": ""
}
```

# External Client Tool

Test Platform recommends [Gangway CLI](https://github.com/openshift-eng/gangway-cli) as a reliable client for running periodics. It is especially useful if you need to modify job environment variables or specify additional execution options.
