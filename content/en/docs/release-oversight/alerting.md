---
title: "Alerting"
description: An overview of TRT alert manager
---

TRT’s tooling can send your team Slack alerts on [metrics that Sippy knows about](https://sippy.dptools.openshift.org/metrics). To request changes or additional alerts, [please file a JIRA issue in the TRT project](https://issues.redhat.com/secure/CreateIssue.jspa?pid=12323832&issuetype=17).

## Silencing Alerts

If you wish to silence an alert for a period of time while you’re working on fixing the underlying problem, click on the [FIRING] message on Slack:

![slack message](/slack_alert.png)

In alert manager, click Silence on the particular alert you wish to silence:

![alert manager main](/alert_manager_1.png)

On the silence page, set a duration, add a note, enter your name, and then click Create:

![alert manager silence](/alert_manager_2.png)
