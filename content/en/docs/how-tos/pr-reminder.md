---
title: "Receive PR Review Request Reminders"
description: Configure open PR review request reminders for yourself and your team for the repositories you care about
---

## What is pr-reminder?
[pr-reminder](https://github.com/openshift/ci-tools/tree/master/cmd/pr-reminder) is a tool created to notify contributors of active PR review requests requiring their attention.
It utilizes a config containing your team's: kerberos ids, github team names, and repositories to find active PR review requests for each team member.
It then gathers useful information about each PR and sorts them into an easy to analyze digest delivered via Slack daily.
The tool is currently run under a periodic job titled `periodic-pr-reminder`, and is set to run each weekday at 8 am UTC.

<img src="/pr-reminder.png" width="600" alt="example pr-reminder output">

## How to configure it for your team
The configuration for `pr-reminder` is located in the `openshift/release` repo under [clusters/app.ci/pr-reminder](https://github.com/openshift/release/blob/master/clusters/app.ci/pr-reminder/pr-reminder-config.yaml).
Adding the configuration for a specific team is as simple as adding an entry to the `teams` list for the team:
```yaml
teams:
- teamMembers: # kerberos ids for members of the configured team
  - usera
  - userb
  teamNames: # github slug(s) representing the team (utilized for determining when a team is requested to review a PR)
  - gh-team-slug
  - another-slug
  repos: # the repos for which PRs will be gathered
  - openshift/some-repo
  - kubernetes/a-repo
```
### Configuration details
A `team` doesn't need to contain more than one member if an individual has different repositories that they care about.
A `teamMember` can also be configured on more than one team, and their resulting digest will include PRs from each team they are configured under.
A presubmit check exists to verify that all the necessary condtions are met.

{{< alert title="Warning" color="warning" >}}
Each configured `teamMember` will need to have
* A Slack account set up using their Red Hat email in the CoreOS slack space
* Their github username configured (as the last, or only, github account) in their rover profile under "Professional Social Media"
{{< /alert >}}
