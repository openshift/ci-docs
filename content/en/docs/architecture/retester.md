---
title: "Retester"
description: An overview of the retester implementation.
---
## What Is Retester?
Retester is a tool that evaluate which pull requests should be retested, and then selected pull requests retest 
by [@openshift-ci-robot](https://github.com/openshift-ci-robot) 's commenting `/retest-required` on the pull requests.

## How Do We Set up Retester?
Retester completely reuses [`tide`](https://github.com/kubernetes/test-infra/blob/master/prow/cmd/tide/README.md) 
configuration, whatever onboards to Tide, gets onboarded to retester too.
Retester is aware of Prow and the concept of optional and required jobs. It only triggers retests on PRs 
where at least one required Prow job is failing.

We need to enable repository on the retester's deployment and remove it from the old retester.

{{< highlight yaml >}}
  spec:
    containers:
    - image: retester:latest
      name: retester
      command:
      - retester
      args:
      - --config-path=/etc/config/config.yaml
      - --supplemental-prow-config-dir=/etc/config
      - --dry-run=false
      - --job-config-path=/etc/job-config
      - --cache-file=/cache/backoff
      - --enable-on-repo=openshift/ci-tools       #Add this line in new retester's deployment
{{< / highlight >}}

{{< highlight yaml >}}
  name: periodic-retester
  spec:
    containers:
    - args:
      - --query=is:pr state:open label:lgtm label:approved status:failure comments:<2500
        NOT "consistent with ART" -label:do-not-merge -label:do-not-merge/work-in-progress
        -label:do-not-merge/hold -label:needs-rebase -label:needs-ok-to-test org:openshift
        org:openshift-priv repo:operator-framework/operator-lifecycle-manager repo:operator-framework/operator-marketplace
        repo:operator-framework/operator-registry repo:cri-o/cri-o repo:kubevirt-ui/kubevirt-plugin
        -repo:openshift/ci-tools                  #Remove this line in old retester
      - --token=/etc/oauth/oauth
      - --updated=0
{{< / highlight >}}

### Back-off
Retests are paused after three attempts against one base/PR HEAD combination, and the PR is explicitly held (`/hold`) after nine retests of a single PR HEAD.