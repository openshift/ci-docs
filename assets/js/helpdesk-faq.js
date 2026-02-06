// Helpdesk FAQ DataTable
$(document).ready(function () {
    if ($('#table_helpdesk_faq').length === 0) return;

    function formatDate(timestamp) {
        return new Date(timestamp * 1000).toLocaleString();
    }

    function formatLinks(reply) {
        return makeLinksClickable(formatSlackLinks(reply))
    }

    // Replaces slack links (URL|text) with html links (<a href="URL">text</a>)
    function formatSlackLinks(text) {
        return text.replace(/`?([^`\s]+)\|([^`\s]+)`?/g, '<a href=' + '"$1"' + '>$2</a>');
    }

    // Replaces plain URLs with html links (<a href="URL">URL</a>)
    function makeLinksClickable(text) {
        const regex = /(<a href[^>]*>.*?<\/a>|(?:https?:\/\/|www\.)\S+)/g;

        return text.replace(regex, function(match) {
            if (match.startsWith('<a href')) {
                return match;
            }
            // Ensure URL starts with http:// or https://
            let fullUrl = match.startsWith('www.') ? 'https://' + match : match;
            return '<a href="' + fullUrl + '">' + match + '</a>';
        });
    }

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
                    return formatLinks(data)
                }
            },
            {
                "data": "question.body",
                "render": function (data, type, row, meta) {
                    return formatLinks(data)
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
                        return "<a href=\"" + data + "\">Thread</a>"
                    }
                    return ""
                }
            }
        ]
    });

    function replies(item) {
        let formatted = '<table width="100%">';

        formatted += '<head><th>Type</th><th>Reply</th><th>User</th><th>Date</th></head>'
        $.each(item.contributing_info, function (index, answer) {
            formatted += '<tr>' +
                '<td>Additional Context</td><td>' +
                formatLinks(answer["body"]) +
                '</td><td>' +
                answer["author"] +
                '</td><td>' +
                formatDate(answer["timestamp"]) +
                '</td></tr>';
        });
        $.each(item.answers, function (index, answer) {
            formatted += '<tr>' +
                '<td>Answer</td><td>' +
                formatLinks(answer["body"]) +
                '</td><td>' +
                answer["author"] +
                '</td><td>' +
                formatDate(answer["timestamp"]) +
                '</td></tr>';
        });

        formatted += '</table>';

        return formatted;
    }

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
