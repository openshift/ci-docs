// Cluster pools DataTable

$(document).ready(function () {

    if ($('#table_pools').length === 0) {
        return;
    }

    var format = function(d) {
        return $('<table cellpadding="5" cellspacing="0" border="0" style="padding-left:50px">')
            .append($('<tr>')
                .append($('<td>').append('RELEASE IMAGE'))
                .append($('<td>').append(d.releaseImage))
            )
            .append($('<tr>')
                .append($('<td>').append('LABELS'))
                .append($('<td>').append(d.labels))
            );
    }

    $.fn.dataTable.ext.errMode = 'throw';
    var table = $('#table_pools').DataTable({
        "ajax": {
            "url": window.HUGO_PARAMS.api_v1_url + "/api/v1/clusterpools",
            "dataType": "jsonp",
        },
        "columns": [
            {
                "className": 'details-control',
                "orderable": false,
                "data": null,
                "defaultContent": ''
            },
            {"data": "namespace"},
            {"data": "name"},
            {"data": "ready"},
            {"data": "standby"},
            {"data": "size"},
            {"data": "maxSize"},
            {"data": "imageSet"},
            {"data": "owner"},
        ],
        "order": [[1, 'asc']]
    });

    $('#table_pools tbody').on('click', 'td.details-control', function () {
        var tr = $(this).closest('tr');
        var row = table.row(tr);

        if (row.child.isShown()) {
            row.child.hide();
            tr.removeClass('shown');
        } else {
            row.child(format(row.data())).show();
            tr.addClass('shown');
        }
    });
});
