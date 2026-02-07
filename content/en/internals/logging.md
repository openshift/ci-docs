---
title: Accessing CI component logs
description: >
  Using AWS's CloudWatch to query application logs for: Prow, CI services, Cluster Bot, Release Controller, etc..
---

This document is intended as a guide to utilizing `CloudWatch` for Test Platform and SHIP admins.

## Accessing CloudWatch
The logs are forwarded to the `openshift-ci-audit` (`058264270455`) AWS account, and are accessible there through CloudWatch.
If you do not have access to that account, and believe that you should, reach out to DPTP in `#forum-ocp-testplatform` to request access.
The logs are stored in the `us-east-1` region, so be sure that your console is utilizing that region.

## Querying the Logs
Application logs from `app.ci` are stored in the `ci-dv2np.application` Log Group.
Due to the way that OpenShift logging forwards the logs to CloudWatch, most of the useful information is stored within the `structured` stanza of the log entry.

### Examples
An example query to get all Prow (and most ci-service) `error` level logs follows:
```
fields @timestamp, structured.component as component, structured.msg as msg, structured.error as error
| sort @timestamp desc
| filter (level = "error" and isPresent(component))
```

It is also sometimes useful to retrieve all logs for a given PR; this can be done as follows:
```
fields @timestamp, structured.component as component, structured.msg as msg
| sort @timestamp desc
| filter (structured.org = "openshift" and structured.repo = "release" and structured.pr = 52503)
```
