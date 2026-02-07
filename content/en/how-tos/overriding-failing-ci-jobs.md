---
title: "Overriding Failing CI Jobs"
description: How and when to override a failing CI job in order to allow a pullrequest to merge
---
This document talks about how to bypass a failing CI job so that a PR can merge, and when it is appropriate to do so.

## How to override

Putting `/override $ci-job-name` (e.g. `/override ci/prow/e2e-aws-single-node-serial`, note that the `ci/prow/` prefix is necessary)
in a PR comment will cause tide to ignore the test failure and process the PR for merging if all other requirements are met.  In order
to merge, a PR must have been tested (or overridden) on top of the current head of the branch it is merging into.  This means that even
if you override a failing job, if another PR has merged into the repository in the meantime, the PR will still be retested(and
potentially fail) during the merge attempt.  This means that `/override` is more likely to be helpful in a low traffic repository where
nothing else is likely to have merged in the meantime.

## Who CAN override

Permission to use `/override` is determined by the approvers in the top level OWNERS file in the repository.

## Who SHOULD override

While it's determined by the OWNERS file, some people are better suited to make the decision about an override than others for a given
situation, so when asking for an override (or being asked), consider who the right person is to assess the risk + implications of the
override.  That might be another approver, or perhaps even someone who's not an approver but has a better understanding of the failure
you want to override and/or the changes the PR is introducing, so they can properly determine whether it is safe/reasonable to override.

## Things to do before applying an override

1. Confirm that someone/team owns and is aware of the failure you are trying to override.  Don't just override something broken and let
the rest of the org keep running into it until someone else reports it.  You don't have to solve it, but at least make sure there's an
active/current bug or that the team in question acknowledges the issue.
2. Confirm the failure the PR is hitting is unrelated to the PR in question.  This seems obvious, but don't skip this step.
3. Confirm that by doing a `/override`, you are not compromising the test coverage the PR is subjected to.  This one is harder.  Consider
the case where e2e-aws is repeatedly failing because of some AWS issues.  Is someone aware of/owning the issue?  Probably(amazon).  Is the
failure the PR is hitting unrelated to the PR in question?  Definitely.  But if you /override e2e-aws, is the PR still going to get adequate
test coverage to confirm it has not broken something else?  No.  So it should not be overridden.  That's a strawman example, but the more
concrete example is the situation where a particular test has been failing consistently in master. With the PR it continues to fail in the
same way.  But unless you confirm otherwise, it's possible that the PR introduces a new failure mode for the test, one that you can't even
see until the original test issue is resolved.  In this case test coverage of the PR is being compromised by the existing test failure, and
you should not be overriding to merge the PR.
