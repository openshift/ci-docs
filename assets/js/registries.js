// Registries DataTable
$(document).ready(function () {
    if ($('#table_registries').length === 0) return;

    $.fn.dataTable.ext.errMode = 'throw';
    var table = $('#table_registries').DataTable({
        "paging": false,
        "ordering": false,
        "info": false,
        "searching": false,
        "ajax": {
            "url": window.HUGO_PARAMS.api_v1_url + "/api/v1/clusters?skipHive=true",
            "dataType": "jsonp",
        },
        "columns": [
            {
                "data": "cluster",
                "render": function (data, type, row, meta) {
                    if (row['cluster'] === 'qci') {
                        return '-';
                    }
                    return '<a href="https://' + row['consoleHost'] + '/">' + data + '</a>';
                }
            },
            {
                "data": "registryHost",
                "render": function (data, type, row, meta) {
                    if (row['cluster'] === 'qci') {
                        return 'quay-proxy.ci.openshift.org/openshift/ci';
                    }
                    return '<a href="https://' + row['registryHost'] + '/">' + data + '</a>';
                }
            },
            {
                "data": "description",
                "render": function (data, type, row, meta) {
                    var data = "contains images either built in Prow jobs or imported from QCI"
                    if (row['cluster'] === 'app.ci') {
                        data = 'the CI registry with published images';
                    } else if (row['cluster'] === 'hosted-mgmt') {
                        data = '';
                    } else if (row['cluster'] === 'arm01' || row['cluster'] === 'vsphere') {
                        data = data + '; only open to ' + row['cluster'].replace(/\d+/g, '').toUpperCase() + ' admins';
                    } else if (row['cluster'] === 'qci') {
                        data = 'the authoritative CI registry and the source of truth of all CI images';
                    }
                    return data;
                }
            },
        ]
    });
    table.row.add({cluster: 'qci'});
});
