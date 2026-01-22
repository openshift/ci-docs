// Enhanced offline search with improved indexing and search capabilities
// Adapted from themes/docsy/assets/js/offline-search.js with enhancements

(function ($) {
    'use strict';

    $(document).ready(function () {
        const $searchInput = $('.td-search-input');

        // Options for popover
        $searchInput.data('html', true);
        $searchInput.data('placement', 'bottom');
        $searchInput.data(
            'template',
            '<div class="popover offline-search-result" role="tooltip"><div class="arrow"></div><h3 class="popover-header"></h3><div class="popover-body"></div></div>'
        );

        // Register handler
        $searchInput.on('change', (event) => {
            render($(event.target));
            $searchInput.blur();
        });

        // Prevent reloading page by enter key on sidebar search
        $searchInput.closest('form').on('submit', () => {
            return false;
        });

        // Enhanced Lunr index with more fields
        let idx = null;
        const resultDetails = new Map();

        // Load search index
        $.ajax($searchInput.data('offline-search-index-json-src')).then(
            (data) => {
                idx = lunr(function () {
                    this.ref('ref');

                    // Enhanced field configuration with better boosting
                    this.field('title', { boost: 15 });
                    this.field('description', { boost: 8 });
                    this.field('categories', { boost: 5 });
                    this.field('tags', { boost: 5 });
                    this.field('keywords', { boost: 5 });
                    this.field('section', { boost: 3 });
                    this.field('type', { boost: 2 });
                    this.field('body', { boost: 1 });
                    this.field('allText', { boost: 1 });

                    data.forEach((doc) => {
                        this.add(doc);

                        resultDetails.set(doc.ref, {
                            title: doc.title || '',
                            excerpt: doc.excerpt || doc.description || '',
                            description: doc.description || '',
                            categories: doc.categories || [],
                            tags: doc.tags || [],
                            section: doc.section || '',
                            type: doc.type || '',
                            date: doc.date || '',
                            lastmod: doc.lastmod || ''
                        });
                    });
                });

                $searchInput.trigger('change');
            }
        );

        const render = ($targetSearchInput) => {
            // Dispose the previous result
            $targetSearchInput.popover('dispose');

            if (idx === null) {
                return;
            }

            const searchQuery = $targetSearchInput.val();
            if (searchQuery === '') {
                return;
            }

            // Enhanced search query with better relevance
            const results = idx
                .query((q) => {
                    const tokens = lunr.tokenizer(searchQuery.toLowerCase());
                    tokens.forEach((token) => {
                        const queryString = token.toString();
                        // Exact match boost
                        q.term(queryString, { boost: 100 });
                        // Wildcard matches
                        q.term(queryString, {
                            wildcard:
                                lunr.Query.wildcard.LEADING |
                                lunr.Query.wildcard.TRAILING,
                            boost: 10,
                        });
                        // Fuzzy matches
                        q.term(queryString, {
                            editDistance: 2,
                            boost: 5
                        });
                    });
                })
                .slice(
                    0,
                    $targetSearchInput.data('offline-search-max-results') || 10
                );

            // Build result HTML
            const $html = $('<div>');

            $html.append(
                $('<div>')
                    .css({
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '1em',
                    })
                    .append(
                        $('<span>')
                            .text(`Found ${results.length} result${results.length !== 1 ? 's' : ''}`)
                            .css({ fontWeight: 'bold' })
                    )
                    .append(
                        $('<i>')
                            .addClass('fas fa-times search-result-close-button')
                            .css({ cursor: 'pointer' })
                    )
            );

            const $searchResultBody = $('<div>').css({
                maxHeight: `calc(100vh - ${
                    $targetSearchInput.offset().top -
                    $(window).scrollTop() +
                    180
                }px)`,
                overflowY: 'auto',
            });
            $html.append($searchResultBody);

            if (results.length === 0) {
                $searchResultBody.append(
                    $('<p>').text(`No results found for "${searchQuery}"`)
                );
            } else {
                results.forEach((r) => {
                    const doc = resultDetails.get(r.ref);
                    const href =
                        $searchInput.data('offline-search-base-href') +
                        r.ref.replace(/^\//, '');

                    const $entry = $('<div>').addClass('mt-4');

                    // Show path/section
                    if (doc.section) {
                        $entry.append(
                            $('<small>')
                                .addClass('d-block text-muted')
                                .text(doc.section + ' / ' + r.ref)
                        );
                    } else {
                        $entry.append(
                            $('<small>')
                                .addClass('d-block text-muted')
                                .text(r.ref)
                        );
                    }

                    // Title with link
                    $entry.append(
                        $('<a>')
                            .addClass('d-block')
                            .css({ fontSize: '1.2rem', fontWeight: 'bold' })
                            .attr('href', href)
                            .text(doc.title)
                    );

                    // Description/excerpt
                    if (doc.excerpt) {
                        $entry.append($('<p>').text(doc.excerpt));
                    }

                    // Tags/categories
                    if (doc.tags && doc.tags.length > 0) {
                        const $tags = $('<div>').addClass('mt-2');
                        doc.tags.forEach(tag => {
                            $tags.append(
                                $('<span>')
                                    .addClass('badge badge-secondary mr-1')
                                    .text(tag)
                            );
                        });
                        $entry.append($tags);
                    }

                    $searchResultBody.append($entry);
                });
            }

            $targetSearchInput.on('shown.bs.popover', () => {
                $('.search-result-close-button').on('click', () => {
                    $targetSearchInput.val('');
                    $targetSearchInput.trigger('change');
                });
            });

            $targetSearchInput
                .data('content', $html[0].outerHTML)
                .popover('show');
        };
    });
})(jQuery);

