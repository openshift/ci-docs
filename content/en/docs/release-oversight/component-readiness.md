---

title: "Component Readiness"
description: Documentation on Sippy's Component Readiness UI for determining our ability to ship a release.
---

[Component Readiness](https://sippy.dptools.openshift.org/sippy-ng/component_readiness/main) is one of the newest and most important portions of Sippy. Component Readiness analyzes huge quantities of test data comparing the last week (by default) of the current dev release, against the last month leading up to GA for the most recent stable release. It uses [Fisher's Exact Test](https://en.wikipedia.org/wiki/Fisher%27s_exact_test) to determine if any test is failing statistically more often than it was.

Filters on the left can be used to adjust the parameters of the query. By default, we do not include all variants.

Component Readiness is now one of the main requirements for being ready to ship a release.

## Component Report

The Component Report is the initial view presented when you load the Component Readiness UI. At the top level, it shows if a component (row) is safe to ship or not for the selected variant combinations (columns). This is calculated by examining all the tests aligned with that component, grouped by the job variants. If Fisher's Exact Test tells us there is a statistically significant difference in the pass rate when compared to the basis, the cell will be marked red.

Red indicates a problem is detected with at least one test within that component/feature, while green indicates we see no significant evidence of regression. By design, there is no in-between (yellow).

Clicking a cell drills down further, first to a breakdown by feature/capability, then by test for a capability, until eventually you arrive at the Test Details page (see below).

Take special note of the "Show Regressed Tests" table at the top of every component report page. This lists *only* the regressed tests within the current report with some details on when the regression was first detected in the default report and a shortcut to the Test Details page.

Parameters for the report can be adjusted on the left-hand side of the UI, but a default view is presented on load and this is our primary "release readiness" view. We hope to expand the variants included by default over time as they are proven safe and stable enough to be there. A mechanism for custom report views is in development.

## Test Details

Navigating from the report page down to the test details page for a regressed test can be done either by clicking through the red cells in the report or by using the test table in the top right of each report. The test details page will display the data backing the decision to mark a test as regressed, including a great visualization of which jobs the failures are appearing in. This page also contains a button to file a new Jira for an issue, and lists all open linked Jiras. (*NOTE*: Jiras are linked by mentioning the test name in the description or a comment). It is important for visibility in the organization to ensure that your component has a linked active bug when it is regressed, as per above Component Readiness is blocking for release unless an exception is granted by senior management.

## Additional / Future Tooling

TRT currently has a manual triage tool available which can (a) scan for runs affected by an infrastructure problem and remove them from consideration (possibly flipping a component back to green), or (b) find runs failing on a specific bug and attribute them to that bug (flagging them with a separate icon indicating all test failures are triaged). A web interface to allow teams to perform (b) is being developed.

## Alerting on Component Regressions

TRT has implemented tooling that allows component teams to have alerts sent to a Slack channel of their choice when their component goes regressed. See [tooling](./tooling.md) for more details.

