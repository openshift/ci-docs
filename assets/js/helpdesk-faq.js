// Helpdesk FAQ DataTable
$(document).ready(function () {
    if ($('#table_helpdesk_faq').length === 0) {
		return;
	}

    var formatDate = function(timestamp) {
        return new Date(timestamp * 1000).toLocaleString();
    };

    var formatLinks = function(reply) {
        return marked.parse(formatSlackLinks(reply))
    };

    // Replaces slack links (URL|text) with html links (<a href="URL">text</a>)
	const regexLink = /`?([^`\s]+)\|([^`\s]+)`?/g
    var formatSlackLinks = function(text) {
        return text.replace(regexLink, '[$2]($1)');
    };

    $.fn.dataTable.ext.errMode = 'throw';
    var table = $('#table_helpdesk_faq').DataTable({
        "ajax": {
            "url": window.HUGO_PARAMS.helpdesk_faq_api_url,
            "dataType": "jsonp",
        },
        "scrollX": false,
        "columns": [
            {
                "className": 'details-control',
                "orderable": false,
                "data": null,
                "defaultContent": ''
            },
            {"data": "question.topic"},
            {
                "data": "question.subject",
                "render": function (data, type, row, meta) {
                    return formatLinks(data);
                }
            },
            {
                "data": "question.body",
                "render": function (data, type, row, meta) {
                    return formatLinks(data);
                }
            },
            {
                "data": "timestamp",
                "render": function (data, type, row, meta) {
                    return formatDate(data);
                }

            },
            {
                "data": "thread_link",
                "render": function (data, type, row, meta) {
                    if (data !== "") {
                        return `<a href="${data}">Thread</a>`;
                    }
                    return "";
                }
            }
        ]
    });

    var replies = function(item) {
        let formatted = $('<table width="100%">')
            .append($('<thead>')
                .append($('<th>').append('Type'))
                .append($('<th>').append('Reply'))
                .append($('<th>').append('User'))
                .append($('<th>').append('Date'))
            );

        $.each(item.contributing_info, function (index, answer) {
            formatted.append($('<tr>')
                .append($('<td>').append('Additional Context'))
                .append($('<td>').append(formatLinks(answer["body"])))
                .append($('<td>').append(answer["author"]))
                .append($('<td>').append(formatDate(answer["timestamp"])))
            );
        });
        $.each(item.answers, function (index, answer) {
            formatted.append($('<tr>')
                .append($('<td>').append('Answer'))
                .append($('<td>').append(formatLinks(answer["body"])))
                .append($('<td>').append(answer["author"]))
                .append($('<td>').append(formatDate(answer["timestamp"])))
            );
        });
        return formatted;
    };

    $('#table_helpdesk_faq tbody').on('click', 'td.details-control', function () {
        var tr = $(this).closest('tr');
        var row = table.row(tr);

        if (row.child.isShown()) {
            row.child.hide();
            tr.removeClass('shown');
        } else {
            row.child(replies(row.data())).show();
            tr.addClass('shown');
        }
    });
});
