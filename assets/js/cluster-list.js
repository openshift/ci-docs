// Cluster list loader for useful-links page
$(document).ready(function () {
    if ($("#m-docsgetting-starteduseful-links").hasClass("active")) {
        $.ajax({
            url: window.HUGO_PARAMS.api_v1_url + "/api/v1/clusters",
            dataType: 'jsonp',
            success: function (res) {
                $.each(res.data, function (index, item) {
                    if (item['error']) {
                        $("#ul_clusters").append('<li>' + item["cluster"] + ': ' + item['error'] + '</li>');
                        return;
                    }
                    var description = item['product'] + ' ' + item['version'] + ' cluster on ' + item['cloud'];
                    if (item['cluster'] === 'app.ci') {
                        description = description + ' containing most Prow services.';
                    } else if (item['cluster'] === 'core-ci') {
                        description = description + ' to replace app.ci (WIP).';
                    } else if (item['cluster'] === 'hosted-mgmt') {
                        description = description + ' containing a Hive control plane.';
                    } else if (!item['cluster'].startsWith('build')) {
                        description = description + ' used for ' + item['cluster'].replace(/\d+/g, '').toUpperCase() + ' tests, not managed by DPTP.';
                    } else {
                        description = description + ' that executes a growing subset of the jobs.'
                    }
                    $("#ul_clusters").append('<li><a href="https://' + item["consoleHost"] + '/">' + item["cluster"] + '</a>: ' + description + '</li>');
                    $("#progress").hide();
                });
            },
            error: function (xhr) {
                $("#progress").text('failed to load the cluster info: status ' + xhr.status);
            },
        });
    }
});
