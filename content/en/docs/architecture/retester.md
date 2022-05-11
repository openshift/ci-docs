---
title: "Retester"
description: An overview of the retester implementation.
---
## What Is Retester?
Retester is a tool that evaluate which pull requests should be retested, and then retest 
by [@openshift-ci-robot](https://github.com/openshift-ci-robot) 's commenting `/retest-required` on the pull requests.

{{< alert title="Info" color="info" >}}
The old retester is implemented by a periodic job [periodic-retester](https://github.com/openshift/release/blob/05dd9a1ab5881e55165a0cc0f40d5513e2e2fd11/ci-operator/jobs/infra-periodics.yaml#L260-L300) which uses a GitHub query to filter out the pull requests with failing jobs and a Prow tool [commenter](https://github.com/kubernetes/test-infra/tree/master/robots/commenter) to comment on those pull requests. The same query is applied to all GitHub repos and thus it does not recognize any criteria for Prow's auto-merging tool, [Tide](https://github.com/kubernetes/test-infra/tree/master/prow/cmd/tide).
{{< /alert >}}

## How Do We Set up Retester?
Retester completely reuses [`tide`](https://github.com/kubernetes/test-infra/blob/master/prow/cmd/tide/README.md) 
configuration, whatever onboards to Tide, gets onboarded to retester too.
Retester is aware of Prow and the concept of optional and required jobs. It only triggers retests on PRs 
where at least one required Prow job is failing.

We can enable the retester on a repository by adding a flag `--enable-on-repo=<org>/<repo>` to [the retester's deployment](https://github.com/openshift/release/blob/master/clusters/app.ci/prow/03_deployment/retester.yaml) and exclude it from [the old retester](https://github.com/openshift/release/blob/05dd9a1ab5881e55165a0cc0f40d5513e2e2fd11/ci-operator/jobs/infra-periodics.yaml#L260-L300) by `-repo:<org>/<repo>` in the `query`. The following example shows how to achieve it for repo `openshift/ci-tools`:

{{< highlight yaml >}}
  spec:
    containers:
    - image: retester:latest
      name: retester
      command:
      - retester
      args:
      ...
      - --enable-on-repo=openshift/ci-tools       # Enable the retester on repo openshift/ci-tools
{{< / highlight >}}

{{< highlight yaml >}}
  name: periodic-retester
  spec:
    containers:
    - args:
      - --query=is:pr state:open label:lgtm label:approved status:failure comments:<2500
        ...
        -repo:openshift/ci-tools                  # Exclude repo openshift/ci-tools
{{< / highlight >}}

### Back-off
Retests are paused after three attempts against one base/PR HEAD combination, and the PR is explicitly held (`/hold`) after nine retests of a single PR HEAD.