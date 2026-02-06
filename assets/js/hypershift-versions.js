// Load Hypershift supported versions for ci-operator page
$(document).ready(function () {
    if ($("#m-docsarchitectureci-operator").hasClass("active")) {
        $.ajax({
            url: window.HUGO_PARAMS.api_v1_url + "/api/v1/clusters",
            dataType: 'jsonp',
            success: function (res) {
                $.each(res.data, function (index, item) {
                    if (item['error']) {
                        $('#hypershift_supported_versions').text(item['error']);
                        return;
                    }
                    if (item['cluster'] === 'hosted-mgmt') {
                        $('#hypershift_supported_versions').text(item["hypershiftSupportedVersions"]);
                    }
                });
            },
            error: function (xhr) {
                $("#hypershift_supported_versions").text('failed to load the hosted-mgmt cluster info: status ' + xhr.status);
            },
        });
    }
});
